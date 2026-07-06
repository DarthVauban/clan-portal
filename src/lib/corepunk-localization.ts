import russianLocalizationJson from "@/data/corepunk-items-ru.json";
import glossaryJson from "@/localization/corepunk-glossary.json";
import type { CorepunkItem, MediaAsset } from "@/lib/corepunk-item-data";

type RussianLocalization = {
  translations: Record<string, string>;
};

type Glossary = {
  entries: Array<{ source: string; target: string }>;
};

const russianLocalization = russianLocalizationJson as RussianLocalization;
const glossary = glossaryJson as Glossary;
const exactTerms = new Map(glossary.entries.map((entry) => [entry.source.toLocaleLowerCase("en"), entry.target]));

const professionLabels: Record<string, string> = {
  alchemy: "Алхимия",
  butchery: "Разделка",
  construction: "Конструирование",
  cooking: "Кулинария",
  herbalism: "Травничество",
  logging: "Лесозаготовка",
  mining: "Горное дело",
  mysticism: "Мистицизм",
  other: "Другое",
  weaponsmithing: "Оружейное дело",
};

const professionLevelLabels: Record<string, string> = {
  newbie: "Новичок",
  journeyman: "Подмастерье",
  craftsman: "Мастер",
};

const slotLabels: Record<string, string> = {
  artifact: "Артефакт",
  "primary-weapon": "Основное оружие",
  "secondary-weapon": "Дополнительное оружие",
};

const modificationLabels: Record<string, string> = {
  upgraded: "Улучшенный",
  overclocked: "Разогнанный",
  corrupted: "Искажённый",
};

const priceTypeLabels: Record<string, string> = { gold: "Золото" };

export function translateCorepunkText(value: string | null | undefined) {
  if (!value) return value ?? "";
  return russianLocalization.translations[value] ?? exactTerms.get(value.toLocaleLowerCase("en")) ?? value;
}

export function localizeCorepunkItem(item: CorepunkItem): CorepunkItem {
  const englishName = item.englishName ?? item.name;
  return {
    ...item,
    englishName,
    name: translateCorepunkText(englishName),
    description: translateCorepunkText(item.description),
    descriptionEffect: translateCorepunkText(item.descriptionEffect),
    modifications: item.modifications?.map((modification) => ({
      ...modification,
      effect: translateCorepunkText(modification.effect),
    })),
    specialEffect: item.specialEffect ? {
      ...item.specialEffect,
      title: translateCorepunkText(item.specialEffect.title),
      descriptionEffect: translateCorepunkText(item.specialEffect.descriptionEffect),
    } : null,
    recipes: item.recipes.map((recipe) => ({ ...recipe, name: translateCorepunkText(recipe.name) })),
  };
}

export function localizeStatAssets(stats: Record<string, MediaAsset>) {
  return Object.fromEntries(Object.entries(stats).map(([key, asset]) => [key, {
    ...asset,
    label: translateCorepunkText(asset.label),
  }]));
}

export function professionLabel(value: string | null | undefined) {
  if (!value) return "—";
  return professionLabels[value] ?? translateCorepunkText(value);
}

export function professionLevelLabel(value: string | null | undefined) {
  if (!value) return "—";
  return professionLevelLabels[value] ?? translateCorepunkText(value);
}

export function slotLabel(value: string | null | undefined) {
  if (!value) return "—";
  return slotLabels[value] ?? translateCorepunkText(value);
}

export function modificationLabel(value: string) {
  return modificationLabels[value] ?? translateCorepunkText(value);
}

export function priceTypeLabel(value: string | null | undefined) {
  if (!value) return "";
  return priceTypeLabels[value] ?? translateCorepunkText(value);
}
