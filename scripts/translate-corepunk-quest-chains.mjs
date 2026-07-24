import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve();
const sourcePath = path.join(projectRoot, "src", "data", "corepunk-quest-chains.json");
const glossaryPath = path.join(projectRoot, "src", "localization", "corepunk-glossary.json");
const outputPath = path.join(projectRoot, "src", "data", "corepunk-quest-chains-ru.json");
const cachePath = path.join(projectRoot, "scripts", ".cache", "corepunk-quest-translations-ru.json");
const TRANSLATE_URL = "https://translate.googleapis.com/translate_a/single";
const CONCURRENCY = 4;
const refresh = process.argv.includes("--refresh");

const manualTranslations = {
  "Goldenfield Town": "Голденфилд",
  "Westwind Woods": "Леса Вествинда",
  "Windreach Woods": "Леса Виндрича",
  "Westwind Sawmill": "Лесопилка Вествинда",
  "Dusktide Forest": "Сумеречный лес",
  "To the Moon, via the Fields": "На Луну — через поля",
  "Rat-ical Blockchain Solutions": "Крыси-кальные блокчейн-решения",
  "Brave New World - Welcome to Kwalat": "Дивный новый мир — добро пожаловать в Квалат",
  "Brave New World - Welfare Program": "Дивный новый мир — программа поддержки",
  "Brave New World - Baking independence": "Дивный новый мир — выпечка самостоятельности",
  "Brave New World - Crafting Proficiency": "Дивный новый мир — основы ремесла",
  "Brave New World: Hearts and Minds": "Дивный новый мир — сердца и умы",
  "Brave New World - The Final Test": "Дивный новый мир — финальное испытание",
  "Mission Imp-possible": "Миссия «Бес-возможна»",
  "Breaking the Chains": "Разрывая цепи",
  "A Spark in the Dark": "Искра во тьме",
};

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
    if (typeof value === "string" && value.trim()) strings.add(value.trim());
  };

  function addTree(node) {
    add(node.name);
    add(node.location);
    for (const child of node.children ?? []) addTree(child);
  }

  for (const chain of database.chains ?? []) addTree(chain.tree);
  for (const quest of database.quests ?? []) {
    add(quest.name);
    add(quest.description);
    add(quest.voice);
    add(quest.location);
    for (const goal of quest.goals ?? []) add(goal.description);
  }
  for (const npc of Object.values(database.npcs ?? {})) {
    add(npc.name);
    add(npc.title);
    add(npc.description);
  }
  for (const item of Object.values(database.items ?? {})) {
    add(item.name);
    add(item.description);
    add(item.descriptionEffect);
    add(item.specialEffect?.title);
    add(item.specialEffect?.descriptionEffect);
  }

  return [...strings];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    .replace(/https?:\/\/\S+/gi, (value) => reserve(value))
    .replace(/<br\s*\/?>/gi, (value) => reserve(value))
    .replace(/\[+[^\]]+\]+/g, (value) => reserve(value));

  for (const entry of glossaryEntries) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(entry.source)}(?![\\p{L}\\p{N}])`, "giu");
    protectedText = protectedText.replace(pattern, () => reserve(entry.target));
  }

  return { protectedText, placeholders };
}

function restoreText(text, placeholders) {
  let restored = text;
  for (const [placeholder, value] of placeholders) restored = restored.replaceAll(placeholder, value);
  return restored
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

async function requestTranslation(text) {
  const params = new URLSearchParams({ client: "gtx", sl: "en", tl: "ru", dt: "t", q: text });
  const url = `${TRANSLATE_URL}?${params}`;

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await fetch(url, {
      headers: { "user-agent": "ClanPortalQuestLocalization/1.0" },
    }).catch(() => null);
    if (response?.ok) {
      const payload = await response.json();
      const translated = (payload[0] ?? []).map((segment) => segment?.[0] ?? "").join("").trim();
      if (translated) return translated;
    }
    if (attempt === 6) throw new Error(`Translation failed after ${attempt} attempts`);
    await wait(attempt * 800);
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

function tokenSignature(text) {
  return [...text.matchAll(/\[+[^\]]+\]+|https?:\/\/\S+/g)].map((match) => match[0]).sort();
}

function validateTranslation(source, translated) {
  if (!translated.trim()) return "empty translation";
  if (/QZX[A-Z0-9]+XZQ/i.test(translated)) return "unrestored placeholder";
  if (JSON.stringify(tokenSignature(source)) !== JSON.stringify(tokenSignature(translated))) return "token mismatch";
  return null;
}

async function main() {
  const database = await readJson(sourcePath);
  const glossary = await readJson(glossaryPath, { entries: [] });
  if (!database) throw new Error(`Source database is missing: ${sourcePath}`);

  const glossaryEntries = [...(glossary.entries ?? [])].sort((a, b) => b.source.length - a.source.length);
  const sourceStrings = collectStrings(database);
  const cache = refresh ? {} : await readJson(cachePath, {});
  Object.assign(cache, manualTranslations);
  let completed = 0;

  await mkdir(path.dirname(cachePath), { recursive: true });
  await mapLimit(sourceStrings, CONCURRENCY, async (source) => {
    if (!cache[source]) {
      const exact = glossaryEntries.find((entry) => entry.source.toLocaleLowerCase("en") === source.toLocaleLowerCase("en"));
      if (exact) {
        cache[source] = exact.target;
      } else {
        const { protectedText, placeholders } = protectText(source, glossaryEntries);
        cache[source] = restoreText(await requestTranslation(protectedText), placeholders);
        await wait(90);
      }
    }

    completed += 1;
    if (completed % 25 === 0 || completed === sourceStrings.length) {
      await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
      console.log(`[translate] ${completed}/${sourceStrings.length}`);
    }
  });

  const validationErrors = sourceStrings.flatMap((source) => {
    const translated = cache[source] ?? "";
    const issue = validateTranslation(source, translated);
    return issue ? [{ source, translated, issue }] : [];
  });
  if (validationErrors.length) {
    await writeFile(
      path.join(projectRoot, "scripts", ".cache", "corepunk-quest-translation-errors.json"),
      `${JSON.stringify(validationErrors, null, 2)}\n`,
      "utf8",
    );
    throw new Error(`${validationErrors.length} translations failed validation`);
  }

  const payload = {
    schemaVersion: 1,
    language: "ru",
    sourceLanguage: "en",
    sourceScrapedAt: database.source.scrapedAt,
    translatedAt: new Date().toISOString(),
    translationMethod: "machine-assisted-with-glossary-and-manual-overrides",
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
