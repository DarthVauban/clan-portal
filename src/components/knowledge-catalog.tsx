"use client";

import { LoadableImage } from "@/components/loadable-image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Boxes,
  Cpu,
  FlaskConical,
  Gem,
  Hexagon,
  RotateCcw,
  Swords,
} from "lucide-react";
import { useMemo, useState } from "react";
import { KnowledgeSearch } from "@/components/knowledge-search";
import { ItemNameLanguageToggle } from "@/components/item-name-language-toggle";
import { type CorepunkCatalogDataset } from "@/lib/corepunk-item-data";
import { useItemNameLanguage } from "@/lib/use-item-name-language";
import styles from "@/app/items/item-card.module.css";

const categories = [
  { id: "weapons", type: "weapon", label: "Оружие", description: "Клинки, огнестрельное и магическое оружие", icon: Swords },
  { id: "artifacts", type: "implant", label: "Артефакты", description: "Импланты и экипируемые артефакты", icon: Gem },
  { id: "chips", type: "chip", label: "Чипы", description: "Боевые и вспомогательные чипы", icon: Cpu },
  { id: "runes", type: "rune", label: "Руны", description: "Руны усиления и модификации", icon: Hexagon },
  { id: "consumables", type: "consumable", label: "Расходные материалы", description: "Еда, зелья, рецепты и расходники", icon: FlaskConical },
  { id: "resources", type: "resource", label: "Ресурсы", description: "Сырьё и материалы для крафта", icon: Boxes },
] as const;

const tiers = [1, 2, 3] as const;
const qualities = ["common", "uncommon", "rare", "epic"] as const;
const weaponClasses = [
  { value: "legionnary", label: "Легионер" },
  { value: "shaman", label: "Шаман" },
  { value: "ranger", label: "Рейнджер" },
  { value: "destroyer", label: "Разрушитель" },
  { value: "defender", label: "Защитник" },
  { value: "blast-medic", label: "Взрывной медик" },
  { value: "infiltrator", label: "Инфильтратор" },
] as const;
const consumableProfessions = [
  { value: "cooking", label: "Кулинария" },
  { value: "alchemy", label: "Алхимия" },
  { value: "mysticism", label: "Мистицизм" },
] as const;
const resourceProfessions = [
  { value: "mining", label: "Горное дело" },
  { value: "herbalism", label: "Травничество" },
  { value: "logging", label: "Лесозаготовка" },
  { value: "butchery", label: "Разделка" },
  { value: "other", label: "Другое" },
] as const;
const primaryResourceProfessions: ReadonlySet<string> = new Set(resourceProfessions.filter(({ value }) => value !== "other").map(({ value }) => value));
const weaponClassLabels = Object.fromEntries(weaponClasses.map((weaponClass) => [weaponClass.value, weaponClass.label]));
const qualityLabels: Record<string, string> = {
  common: "Обычный",
  uncommon: "Необычный",
  rare: "Редкий",
  epic: "Эпический",
};
const typeLabels: Record<string, string> = {
  weapon: "Оружие",
  implant: "Артефакт",
  chip: "Чип",
  rune: "Руна",
  consumable: "Расходный материал",
  resource: "Ресурс",
};
const PAGE_SIZE = 60;

type CategoryId = (typeof categories)[number]["id"];
type CatalogState = {
  category: CategoryId;
  tier: number | "all";
  quality: string | "all";
  weaponClass: string | "all";
  profession: string | "all";
  query: string;
};

const categoryIds = new Set<CategoryId>(categories.map(({ id }) => id));
const validQualities = new Set<string>(qualities);
const validWeaponClasses = new Set<string>(weaponClasses.map(({ value }) => value));
const validProfessions = new Set<string>([
  ...consumableProfessions.map(({ value }) => value),
  ...resourceProfessions.map(({ value }) => value),
]);

function readCatalogState(searchParams: URLSearchParams | Readonly<URLSearchParams>): CatalogState {
  const categoryValue = searchParams.get("category") as CategoryId | null;
  const category = categoryValue && categoryIds.has(categoryValue) ? categoryValue : "weapons";
  const tierValue = Number(searchParams.get("tier"));
  const qualityValue = searchParams.get("quality");
  const classValue = searchParams.get("class");
  const professionValue = searchParams.get("profession");
  const professionOptions = category === "consumables"
    ? new Set<string>(consumableProfessions.map(({ value }) => value))
    : category === "resources"
      ? new Set<string>(resourceProfessions.map(({ value }) => value))
      : new Set<string>();
  return {
    category,
    tier: tiers.includes(tierValue as (typeof tiers)[number]) ? tierValue : "all",
    quality: qualityValue && validQualities.has(qualityValue) ? qualityValue : "all",
    weaponClass: classValue && validWeaponClasses.has(classValue) ? classValue : "all",
    profession: professionValue && validProfessions.has(professionValue) && professionOptions.has(professionValue) ? professionValue : "all",
    query: searchParams.get("q") ?? "",
  };
}

function writeCatalogState(currentParams: string, state: CatalogState) {
  const params = new URLSearchParams(currentParams);
  const values: Array<[string, string | null]> = [
    ["category", state.category === "weapons" ? null : state.category],
    ["tier", state.tier === "all" ? null : String(state.tier)],
    ["quality", state.quality === "all" ? null : state.quality],
    ["class", state.category === "weapons" && state.weaponClass !== "all" ? state.weaponClass : null],
    ["profession", ["consumables", "resources"].includes(state.category) && state.profession !== "all" ? state.profession : null],
    ["q", state.query.trim() || null],
  ];
  for (const [key, value] of values) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  return params.toString();
}

function pluralItems(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} предметов`;
  if (last === 1) return `${count} предмет`;
  if (last >= 2 && last <= 4) return `${count} предмета`;
  return `${count} предметов`;
}

export function KnowledgeCatalog({ dataset }: { dataset: CorepunkCatalogDataset }) {
  const { showEnglishNames, setShowEnglishNames } = useItemNameLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const serializedSearchParams = searchParams.toString();
  const [catalogState, setCatalogState] = useState<CatalogState>(() => readCatalogState(searchParams));
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const {
    category: activeCategory,
    tier: activeTier,
    quality: activeQuality,
    weaponClass: activeWeaponClass,
    profession: activeProfession,
    query,
  } = catalogState;

  const updateCatalogState = (updates: Partial<CatalogState>) => {
    const nextState = { ...catalogState, ...updates };
    setCatalogState(nextState);
    setVisibleLimit(PAGE_SIZE);
    const nextSearchParams = writeCatalogState(serializedSearchParams, nextState);
    router.replace(`${pathname}${nextSearchParams ? `?${nextSearchParams}` : ""}`, { scroll: false });
  };

  const activeCategoryData = categories.find((category) => category.id === activeCategory)!;
  const ActiveIcon = activeCategoryData.icon;
  const categoryCounts = useMemo(() => Object.fromEntries(
    categories.map((category) => [category.id, dataset.items.filter((item) => item.type === category.type).length]),
  ), [dataset.items]);
  const weaponClassCounts = useMemo(() => Object.fromEntries(
    weaponClasses.map((weaponClass) => [weaponClass.value, dataset.items.filter((item) => item.type === "weapon" && item.mastery === weaponClass.value).length]),
  ), [dataset.items]);
  const consumableProfessionCounts = useMemo(() => Object.fromEntries(
    consumableProfessions.map((profession) => [profession.value, dataset.items.filter((item) => item.type === "consumable" && item.profession === profession.value).length]),
  ), [dataset.items]);
  const resourceProfessionCounts = useMemo(() => Object.fromEntries(
    resourceProfessions.map((profession) => [profession.value, dataset.items.filter((item) => {
      if (item.type !== "resource") return false;
      if (profession.value === "other") return !primaryResourceProfessions.has(item.profession ?? "");
      return item.profession === profession.value;
    }).length]),
  ), [dataset.items]);

  const searchItems = useMemo(() => dataset.items.map((item) => ({
    name: showEnglishNames ? item.englishName : item.name,
    englishName: item.englishName,
    slug: item.slug,
    meta: `${typeLabels[item.type] ?? item.type} · Тир ${item.tier}${item.type === "weapon" && item.mastery ? ` · ${weaponClassLabels[item.mastery] ?? item.mastery}` : ""}`,
    image: item.variations[0]?.image,
    aliases: [item.name, item.englishName],
  })), [dataset.items, showEnglishNames]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ru");
    return dataset.items.filter((item) => {
      const matchesCategory = item.type === activeCategoryData.type;
      const matchesTier = activeTier === "all" || item.tier === activeTier;
      const matchesQuality = activeQuality === "all" || item.variations.some((variation) => variation.quality === activeQuality);
      const matchesWeaponClass = activeCategoryData.type !== "weapon" || activeWeaponClass === "all" || item.mastery === activeWeaponClass;
      const matchesProfession = activeProfession === "all"
        || (activeCategoryData.type === "consumable" && item.profession === activeProfession)
        || (activeCategoryData.type === "resource" && (
          activeProfession === "other"
            ? !primaryResourceProfessions.has(item.profession ?? "")
            : item.profession === activeProfession
        ))
        || !["consumable", "resource"].includes(activeCategoryData.type);
      const matchesQuery = !normalizedQuery || [item.name, item.englishName].some((name) => name.toLocaleLowerCase("ru").includes(normalizedQuery));
      return matchesCategory && matchesTier && matchesQuality && matchesWeaponClass && matchesProfession && matchesQuery;
    });
  }, [activeCategoryData.type, activeProfession, activeQuality, activeTier, activeWeaponClass, dataset.items, query]);

  const resetFilters = () => {
    updateCatalogState({ tier: "all", quality: "all", weaponClass: "all", profession: "all", query: "" });
  };

  const updateQuery = (value: string) => {
    updateCatalogState({ query: value });
  };

  return (
    <div className={styles.catalogLayout}>
      <div className={styles.knowledgeTools}>
        <KnowledgeSearch items={searchItems} value={query} onChange={updateQuery} />
        <ItemNameLanguageToggle showEnglishNames={showEnglishNames} onChange={setShowEnglishNames} />
      </div>

      <nav className={styles.categoryNav} aria-label="Разделы базы предметов">
        {categories.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            className={`${styles.categoryButton} ${activeCategory === id ? styles.categoryButtonActive : ""}`}
            onClick={() => updateCatalogState({ category: id, weaponClass: "all", profession: "all" })}
            aria-pressed={activeCategory === id}
            data-testid={`category-${id}`}
            key={id}
          >
            <Icon size={19} />
            <span>{label}</span>
            <small>{categoryCounts[id]}</small>
          </button>
        ))}
      </nav>

      <section className={styles.catalogSection}>
        <header className={styles.categoryHeader}>
          <div className={styles.categoryIdentity}>
            <span><ActiveIcon size={22} /></span>
            <div><h2>{activeCategoryData.label}</h2><p>{activeCategoryData.description}</p></div>
          </div>
          <div className={styles.categoryCount}>{pluralItems(categoryCounts[activeCategory])}</div>
        </header>

        <div className={styles.filtersPanel}>
          <div className={styles.filterGroup}>
            <span>Тир</span>
            <div>
              <button type="button" className={activeTier === "all" ? styles.filterActive : ""} onClick={() => updateCatalogState({ tier: "all" })}>Все</button>
              {tiers.map((tier) => <button type="button" className={activeTier === tier ? styles.filterActive : ""} onClick={() => updateCatalogState({ tier })} key={tier}>T{tier}</button>)}
            </div>
          </div>

          <div className={styles.filterGroup}>
            <span>Качество</span>
            <div>
              <button type="button" className={activeQuality === "all" ? styles.filterActive : ""} onClick={() => updateCatalogState({ quality: "all" })}>Все</button>
              {qualities.map((quality) => (
                <button type="button" className={`${activeQuality === quality ? styles.filterActive : ""} ${styles.qualityFilter}`} onClick={() => updateCatalogState({ quality })} key={quality} data-testid={`filter-quality-${quality}`}>
                  <i className={styles[quality]} /> {qualityLabels[quality]}
                </button>
              ))}
            </div>
          </div>

          <button type="button" className={styles.resetFilters} onClick={resetFilters}><RotateCcw size={14} /> Сбросить</button>

          {activeCategory === "weapons" && (
            <div className={`${styles.filterGroup} ${styles.classFilterGroup}`} data-testid="weapon-class-filter">
              <span>Класс</span>
              <div>
                <button type="button" className={activeWeaponClass === "all" ? styles.filterActive : ""} onClick={() => updateCatalogState({ weaponClass: "all" })} data-testid="filter-class-all">Все <small>{categoryCounts.weapons}</small></button>
                {weaponClasses.map((weaponClass) => (
                  <button
                    type="button"
                    className={activeWeaponClass === weaponClass.value ? styles.filterActive : ""}
                    onClick={() => updateCatalogState({ weaponClass: weaponClass.value })}
                    data-testid={`filter-class-${weaponClass.value}`}
                    key={weaponClass.value}
                  >
                    {weaponClass.label} <small>{weaponClassCounts[weaponClass.value]}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeCategory === "consumables" && (
            <div className={`${styles.filterGroup} ${styles.classFilterGroup}`} data-testid="consumable-profession-filter">
              <span>Профессия</span>
              <div>
                <button type="button" className={activeProfession === "all" ? styles.filterActive : ""} onClick={() => updateCatalogState({ profession: "all" })} data-testid="filter-profession-all">Все <small>{categoryCounts.consumables}</small></button>
                {consumableProfessions.map((profession) => (
                  <button
                    type="button"
                    className={activeProfession === profession.value ? styles.filterActive : ""}
                    onClick={() => updateCatalogState({ profession: profession.value })}
                    data-testid={`filter-profession-${profession.value}`}
                    key={profession.value}
                  >
                    {profession.label} <small>{consumableProfessionCounts[profession.value]}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeCategory === "resources" && (
            <div className={`${styles.filterGroup} ${styles.classFilterGroup}`} data-testid="resource-profession-filter">
              <span>Профессия</span>
              <div>
                <button type="button" className={activeProfession === "all" ? styles.filterActive : ""} onClick={() => updateCatalogState({ profession: "all" })} data-testid="filter-profession-all">Все <small>{categoryCounts.resources}</small></button>
                {resourceProfessions.map((profession) => (
                  <button
                    type="button"
                    className={activeProfession === profession.value ? styles.filterActive : ""}
                    onClick={() => updateCatalogState({ profession: profession.value })}
                    data-testid={`filter-profession-${profession.value}`}
                    key={profession.value}
                  >
                    {profession.label} <small>{resourceProfessionCounts[profession.value]}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={styles.catalogResults}>
          {visibleItems.length > 0 ? (
            <>
              <div className={styles.catalogResultMeta}>Найдено: {pluralItems(visibleItems.length)}</div>
              <div className={styles.catalogGrid}>
                {visibleItems.slice(0, visibleLimit).map((item) => {
                  const selectedVariation = activeQuality === "all"
                    ? item.variations.find((variation) => variation.quality === item.quality) ?? item.variations[0]
                    : item.variations.find((variation) => variation.quality === activeQuality) ?? item.variations[0];
                  return (
                    <Link className={styles.catalogCard} href={`/items/${item.slug}`} data-testid={`catalog-item-${item.slug}`} key={item.slug}>
                      <div className={styles.catalogImage}>
                        {selectedVariation?.image && <LoadableImage src={selectedVariation.image} alt={`${showEnglishNames ? item.englishName : item.name} ${selectedVariation.quality}`} width={128} height={128} />}
                        <span className={`${styles.qualityDot} ${styles[selectedVariation?.quality ?? item.quality]}`} />
                      </div>
                      <div className={styles.catalogBody}>
                        <div className={styles.cardEyebrow}>{typeLabels[item.type] ?? item.type} · Тир {item.tier}{item.type === "weapon" && item.mastery ? ` · ${weaponClassLabels[item.mastery] ?? item.mastery}` : ""}</div>
                        <h2>{showEnglishNames ? item.englishName : item.name}</h2>
                        <div className={styles.itemAvailability}>
                          {item.variations.map((variation) => <span className={styles[variation.quality]} key={variation.quality}>{qualityLabels[variation.quality] ?? variation.quality}</span>)}
                        </div>
                        {item.stats.length > 0 && (
                          <div className={styles.compactStats}>
                            {item.stats.slice(0, 3).map((stat) => {
                              const asset = dataset.stats[stat.type];
                              return <span key={stat.type}>{asset?.downloaded && <LoadableImage src={asset.local} alt="" width={18} height={18} />}[{stat.min}–{stat.max}] {asset?.label ?? stat.type}</span>;
                            })}
                          </div>
                        )}
                        <div className={styles.openCard}>Открыть полную карточку <ArrowRight size={16} /></div>
                      </div>
                    </Link>
                  );
                })}
              </div>
              {visibleLimit < visibleItems.length && (
                <button type="button" className={styles.loadMore} onClick={() => setVisibleLimit((value) => value + PAGE_SIZE)}>
                  Показать ещё {Math.min(PAGE_SIZE, visibleItems.length - visibleLimit)}
                </button>
              )}
            </>
          ) : (
            <div className={styles.categoryEmpty}>
              <span><ActiveIcon size={25} /></span>
              <strong>Нет предметов с выбранными фильтрами</strong>
              <p>Измените тир, качество или поисковый запрос.</p>
              <button type="button" onClick={resetFilters}>Сбросить фильтры</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
