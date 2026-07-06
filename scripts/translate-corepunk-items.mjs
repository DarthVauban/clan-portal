import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve();
const sourcePath = path.join(projectRoot, "src", "data", "corepunk-items.json");
const glossaryPath = path.join(projectRoot, "src", "localization", "corepunk-glossary.json");
const outputPath = path.join(projectRoot, "src", "data", "corepunk-items-ru.json");
const cachePath = path.join(projectRoot, "scripts", ".cache", "corepunk-translations-ru.json");
const TRANSLATE_URL = "https://translate.googleapis.com/translate_a/single";
const CONCURRENCY = 3;
const refresh = process.argv.includes("--refresh");

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function collectStrings(database) {
  const strings = new Set();
  const add = (value) => {
    if (typeof value === "string" && value.trim()) strings.add(value);
  };

  for (const item of database.records.filter((record) => !record.synthesizedQualityVariant)) {
    add(item.name);
    add(item.description);
    add(item.descriptionEffect);
    add(item.specialEffect?.title);
    add(item.specialEffect?.descriptionEffect);
    for (const modification of item.modifications ?? []) add(modification.effect);
    for (const recipe of item.recipes ?? []) add(recipe.name);
  }

  return [...strings];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function preserveCase(source, target) {
  if (!source || source[0] === source[0].toUpperCase()) return target;
  return target.charAt(0).toLowerCase() + target.slice(1);
}

function protectText(text, glossaryEntries) {
  const placeholders = new Map();
  let index = 0;
  const reserve = (value) => {
    const key = `QZX${index.toString(36).toUpperCase().padStart(4, "0")}XZQ`;
    index += 1;
    placeholders.set(key, value);
    return key;
  };

  let protectedText = text
    .replace(/<br\s*\/?>/gi, (value) => reserve(value))
    .replace(/\[+[^\]]+\]+/g, (value) => reserve(value));

  for (const entry of glossaryEntries) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(entry.source)}(?![\\p{L}\\p{N}])`, "giu");
    protectedText = protectedText.replace(pattern, (matched) => reserve(preserveCase(matched, entry.target)));
  }

  return { protectedText, placeholders };
}

function restoreText(text, placeholders) {
  let restored = text;
  for (const [placeholder, value] of placeholders) {
    restored = restored.replaceAll(placeholder, value);
  }
  return restored.replace(/\s+([,.!?;:])/g, "$1").trim();
}

function normalizeTranslatedText(text, glossaryEntries) {
  const protectedTokens = [];
  let normalized = text.replace(/\[+[^\]]+\]+/g, (token) => {
    const placeholder = `\uE000${protectedTokens.length}\uE001`;
    protectedTokens.push(token);
    return placeholder;
  });
  const protectedTargets = [];
  const targets = [...new Set(glossaryEntries.map((entry) => entry.target))].sort((a, b) => b.length - a.length);
  for (const target of targets) {
    normalized = normalized.replace(new RegExp(escapeRegExp(target), "g"), (matched, offset, fullText) => {
      const placeholder = `\uE100${protectedTargets.length}\uE101`;
      protectedTargets.push(matched);
      const before = fullText[offset - 1] ?? "";
      const after = fullText[offset + matched.length] ?? "";
      const leadingSpace = /[\p{L}\p{N}]/u.test(before) ? " " : "";
      const trailingSpace = /[\p{L}\p{N}]/u.test(after) ? " " : "";
      return `${leadingSpace}${placeholder}${trailingSpace}`;
    });
  }

  normalized = normalized
    .replace(/([а-яё])([А-ЯЁ])/g, "$1 $2")
    .replace(/([\p{L}])(\d)/gu, "$1 $2")
    .replace(/(\d)([\p{L}])/gu, "$1 $2")
    .replace(/([,;:])(?=[А-Яа-яЁё])/g, "$1 ")
    .replace(/[ \t]{2,}/g, " ");

  normalized = normalized.replace(/\uE000(\d+)\uE001/g, (_, index) => protectedTokens[Number(index)] ?? "");
  normalized = normalized.replace(/\uE100(\d+)\uE101/g, (_, index) => protectedTargets[Number(index)] ?? "");
  return normalized
    .replace(/([\p{L}\p{N}])(\[)/gu, "$1 $2")
    .replace(/(\])([\p{L}\p{N}])/gu, "$1 $2")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/<br\s*\/?>\s*/gi, "<br>")
    .replace(/(за|пои|исто|та) щит/gi, "$1щит")
    .replace(/(зар|снар|разр|нар|подр) яд/gi, "$1яд")
    .replace(/пер сон/gi, "персон")
    .replace(/мастер ство/gi, "мастерство")
    .replace(/руна ми/gi, "рунами")
    .replace(/чип ов/gi, "чипов")
    .replace(/не обыч/gi, "необыч")
    .trim();
}

function legacyPlaceholderValues(text, glossaryEntries) {
  const values = [];
  const reserve = (value) => {
    values.push(value);
    return `__CPX${String(values.length - 1).padStart(4, "0")}__`;
  };

  let protectedText = text
    .replace(/<br\s*\/?>/gi, (value) => reserve(value))
    .replace(/\[+[^\]]+\]+/g, (value) => reserve(value));

  for (const entry of glossaryEntries) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(entry.source)}(?![\\p{L}\\p{N}])`, "giu");
    protectedText = protectedText.replace(pattern, (matched) => reserve(preserveCase(matched, entry.target)));
  }

  return values;
}

function repairLegacyTranslation(source, translated, glossaryEntries) {
  if (!/CPX/i.test(translated)) return translated;
  const values = legacyPlaceholderValues(source, glossaryEntries);
  const letterOrNumber = /[\p{L}\p{N}]/u;

  return translated.replace(/_*CPX0*(\d+)_*/gi, (placeholder, rawIndex, offset, fullText) => {
    const value = values[Number(rawIndex)];
    if (value === undefined) return placeholder;
    const before = fullText[offset - 1] ?? "";
    const after = fullText[offset + placeholder.length] ?? "";
    const leadingSpace = letterOrNumber.test(before) && (letterOrNumber.test(value[0]) || value.startsWith("[")) ? " " : "";
    const trailingSpace = letterOrNumber.test(after) && (letterOrNumber.test(value.at(-1) ?? "") || value.endsWith("]")) ? " " : "";
    return `${leadingSpace}${value}${trailingSpace}`;
  });
}

async function requestTranslation(text) {
  const params = new URLSearchParams({ client: "gtx", sl: "en", tl: "ru", dt: "t", q: text });
  const url = `${TRANSLATE_URL}?${params}`;

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await fetch(url, { headers: { "user-agent": "ClanPortalLocalization/1.0" } }).catch(() => null);
    if (response?.ok) {
      const payload = await response.json();
      const translated = (payload[0] ?? []).map((segment) => segment?.[0] ?? "").join("").trim();
      if (translated) return translated;
    }
    if (attempt === 6) throw new Error(`Translation failed after ${attempt} attempts`);
    await wait(attempt * 900);
  }

  throw new Error("Translation failed");
}

async function mapLimit(values, concurrency, worker) {
  const results = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
  return results;
}

function tokens(text) {
  return [...text.matchAll(/\[+[^\]]+\]+/g)].map((match) => match[0]).sort();
}

function validateTranslation(source, translated) {
  if (!translated.trim()) return "empty translation";
  if (/QZX[A-Z0-9]+XZQ/i.test(translated)) return "unrestored placeholder";
  if (JSON.stringify(tokens(source)) !== JSON.stringify(tokens(translated))) return "token mismatch";
  const sourceBreaks = (source.match(/<br\s*\/?>/gi) ?? []).length;
  const translatedBreaks = (translated.match(/<br\s*\/?>/gi) ?? []).length;
  if (sourceBreaks !== translatedBreaks) return "line break mismatch";
  return null;
}

async function main() {
  const database = await readJson(sourcePath);
  const glossary = await readJson(glossaryPath);
  if (!database || !glossary) throw new Error("Source database or glossary is missing");

  const glossaryEntries = [...glossary.entries].sort((a, b) => b.source.length - a.source.length);
  const sourceStrings = collectStrings(database);
  const cache = refresh ? {} : await readJson(cachePath, {});
  let repairedLegacyStrings = 0;
  let normalizedCachedStrings = 0;
  for (const source of sourceStrings) {
    if (!cache[source]) continue;
    const repaired = repairLegacyTranslation(source, cache[source], glossaryEntries);
    const normalized = normalizeTranslatedText(repaired, glossaryEntries);
    if (repaired !== cache[source]) repairedLegacyStrings += 1;
    if (normalized !== cache[source]) normalizedCachedStrings += 1;
    cache[source] = normalized;
  }
  if (repairedLegacyStrings) console.log(`[repair] ${repairedLegacyStrings} legacy placeholder translations`);
  if (normalizedCachedStrings) console.log(`[normalize] ${normalizedCachedStrings} cached translations`);
  let completed = 0;

  await mkdir(path.dirname(cachePath), { recursive: true });
  await mapLimit(sourceStrings, CONCURRENCY, async (source) => {
    if (cache[source]) {
      completed += 1;
      return;
    }

    const exact = glossaryEntries.find((entry) => entry.source.toLocaleLowerCase("en") === source.toLocaleLowerCase("en"));
    if (exact) {
      cache[source] = preserveCase(source, exact.target);
    } else {
      const { protectedText, placeholders } = protectText(source, glossaryEntries);
      const machineTranslation = await requestTranslation(protectedText);
      cache[source] = normalizeTranslatedText(restoreText(machineTranslation, placeholders), glossaryEntries);
      await wait(120);
    }

    completed += 1;
    if (completed % 20 === 0 || completed === sourceStrings.length) {
      await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
      console.log(`[translate] ${completed}/${sourceStrings.length}`);
    }
  });

  const validationErrors = [];
  for (const source of sourceStrings) {
    const issue = validateTranslation(source, cache[source] ?? "");
    if (issue) validationErrors.push({ source, translated: cache[source] ?? "", issue });
  }

  if (validationErrors.length) {
    await writeFile(path.join(projectRoot, "scripts", ".cache", "corepunk-translation-errors.json"), `${JSON.stringify(validationErrors, null, 2)}\n`, "utf8");
    throw new Error(`${validationErrors.length} translations failed validation`);
  }

  const payload = {
    schemaVersion: 1,
    language: "ru",
    sourceLanguage: "en",
    sourceScrapedAt: database.source.scrapedAt,
    glossaryVersion: glossary.version,
    translatedAt: new Date().toISOString(),
    translationMethod: "machine-assisted-with-protected-glossary",
    stringCount: sourceStrings.length,
    translations: Object.fromEntries(sourceStrings.map((source) => [source, cache[source]])),
  };

  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  console.log(`[done] ${sourceStrings.length} strings saved to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
