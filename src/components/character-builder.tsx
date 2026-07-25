"use client";

import {
  BookOpenCheck,
  Boxes,
  Check,
  ChevronRight,
  Clipboard,
  Copy,
  Database,
  Gem,
  Layers3,
  Link2,
  Minus,
  PackageCheck,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Shield,
  Sparkles,
  Swords,
  Trash2,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { CustomSelect } from "@/components/custom-select";
import { LoadableImage } from "@/components/loadable-image";
import {
  baseClassStats,
  builderArchetypes,
  builderMasteries,
  builderStatGroups,
  fallbackStatLabels,
} from "@/lib/character-builder-config";
import {
  builderArtifactSlotIds,
  builderQualities,
  builderWeaponSlotIds,
  createDefaultCharacterBuild,
  normalizeCharacterBuildState,
  type BuilderArtifactSlotId,
  type BuilderEquipmentItem,
  type BuilderItemSelection,
  type BuilderQuality,
  type BuilderReferenceItem,
  type BuilderSetId,
  type BuilderSlotId,
  type BuilderWeaponSlotId,
  type CharacterBuilderDataset,
  type CharacterBuildState,
  type SavedCharacterBuild,
} from "@/lib/character-builder";
import { useCollectiveStore } from "@/lib/collective-store";
import { useRequestStore } from "@/lib/request-store";
import { ALL_BANK_ID, getAvailableResourceAmount } from "@/lib/request-reservations";
import { useResourceStore } from "@/lib/resource-store";
import styles from "@/components/character-builder.module.css";

type CharacterBuilderProps = {
  dataset: CharacterBuilderDataset;
  initialBuild?: SavedCharacterBuild | null;
  readOnly?: boolean;
};

type MaterialEntry = BuilderReferenceItem & {
  quantity: number;
};

type BuilderSection = "gear" | "talents" | "mastery" | "materials";

const DRAFT_KEY = "clan-portal:character-builder-draft:v2";
const LEGACY_DRAFT_KEY = "clan-portal:character-builder-draft:v1";

const slotMeta: Record<BuilderSlotId, { label: string; shortLabel: string; type: BuilderEquipmentItem["type"] }> = {
  "weapon-primary": { label: "Оружие", shortLabel: "Оружие", type: "weapon" },
  "chip-1": { label: "Чип 1", shortLabel: "Чип 1", type: "chip" },
  "chip-2": { label: "Чип 2", shortLabel: "Чип 2", type: "chip" },
  "chip-3": { label: "Чип 3", shortLabel: "Чип 3", type: "chip" },
  "implant-1": { label: "Артефакт 1", shortLabel: "Артефакт 1", type: "implant" },
  "implant-2": { label: "Артефакт 2", shortLabel: "Артефакт 2", type: "implant" },
  "implant-3": { label: "Артефакт 3", shortLabel: "Артефакт 3", type: "implant" },
  "implant-4": { label: "Артефакт 4", shortLabel: "Артефакт 4", type: "implant" },
  "implant-5": { label: "Артефакт 5", shortLabel: "Артефакт 5", type: "implant" },
  "implant-6": { label: "Артефакт 6", shortLabel: "Артефакт 6", type: "implant" },
};

const qualityLabels: Record<BuilderQuality, string> = {
  uncommon: "Обычный",
  rare: "Улучшенный",
  epic: "Разогнанный",
};

const recipeByQuality: Record<BuilderQuality, "regular" | "upgraded" | "overclocked"> = {
  uncommon: "regular",
  rare: "upgraded",
  epic: "overclocked",
};

const secondaryStatOptions = ["health", "mana", "armor", "mr", "wd", "sp", "as", "hasp", "pcc", "mcc", "ppen", "mpen"];

const sections: Array<{ id: BuilderSection; label: string; icon: typeof Swords }> = [
  { id: "gear", label: "Экипировка", icon: Swords },
  { id: "talents", label: "Таланты", icon: Sparkles },
  { id: "mastery", label: "Мастерство", icon: BookOpenCheck },
  { id: "materials", label: "Материалы", icon: Boxes },
];

function formatNumber(value: number) {
  return Number.isInteger(value)
    ? new Intl.NumberFormat("ru-RU").format(value)
    : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function isArtifactSlot(slotId: BuilderSlotId): slotId is BuilderArtifactSlotId {
  return builderArtifactSlotIds.includes(slotId as BuilderArtifactSlotId);
}

function getSelection(state: CharacterBuildState, slotId: BuilderSlotId) {
  return isArtifactSlot(slotId)
    ? state.artifacts[slotId]
    : state.sets[state.activeSet][slotId as BuilderWeaponSlotId];
}

function getVariation(item: BuilderEquipmentItem, quality: BuilderQuality) {
  return item.variations.find((variation) => variation.quality === quality)
    ?? item.variations.at(-1)
    ?? null;
}

function buildMaterialTotals(
  state: CharacterBuildState,
  dataset: CharacterBuilderDataset,
  scope: "active" | "both",
) {
  const equipmentMap = new Map(dataset.equipment.map((item) => [item.slug, item]));
  const referenceMap = new Map(dataset.references.map((item) => [item.slug, item]));
  const direct = new Map<string, number>();
  const total = new Map<string, number>();
  const setIds: BuilderSetId[] = scope === "both" ? ["one", "two"] : [state.activeSet];

  const add = (target: Map<string, number>, slug: string, quantity: number) => {
    target.set(slug, (target.get(slug) ?? 0) + quantity);
  };

  const expand = (slug: string, quantity: number, path: Set<string>) => {
    const reference = referenceMap.get(slug);
    if (!reference || path.has(slug)) {
      add(total, slug, quantity);
      return;
    }
    const ingredients = reference.ingredients.length > 0
      ? reference.ingredients
      : reference.recipes[0]?.ingredients ?? [];
    if (ingredients.length === 0 || reference.type === "resource") {
      add(total, slug, quantity);
      return;
    }
    const nextPath = new Set(path);
    nextPath.add(slug);
    for (const ingredient of ingredients) expand(ingredient.slug, ingredient.quantity * quantity, nextPath);
  };

  const selections = [
    ...setIds.flatMap((setId) => Object.values(state.sets[setId])),
    ...Object.values(state.artifacts),
  ];

  for (const selection of selections) {
    if (!selection) continue;
    const item = equipmentMap.get(selection.itemSlug);
    const recipe = item?.recipes.find((entry) => entry.id === recipeByQuality[selection.quality]);
    if (!item || !recipe) continue;
    for (const ingredient of recipe.ingredients) {
      add(direct, ingredient.slug, ingredient.quantity);
      expand(ingredient.slug, ingredient.quantity, new Set([item.slug]));
    }
  }

  const materialize = (entries: Map<string, number>) => [...entries.entries()]
    .map(([slug, quantity]) => {
      const reference = referenceMap.get(slug);
      if (!reference) {
        return {
          slug,
          name: slug,
          englishName: slug,
          type: "resource",
          tier: 0,
          quality: "common",
          baseSlug: null,
          image: null,
          ingredients: [],
          recipes: [],
          quantity,
        } satisfies MaterialEntry;
      }
      return { ...reference, quantity } satisfies MaterialEntry;
    })
    .sort((left, right) => right.tier - left.tier || left.name.localeCompare(right.name, "ru"));

  return { direct: materialize(direct), total: materialize(total) };
}

function ItemImage({
  src,
  alt,
  size = 52,
}: {
  src: string | null | undefined;
  alt: string;
  size?: number;
}) {
  if (!src) return <PackageCheck size={Math.max(20, size / 2)} aria-hidden="true" />;
  return <LoadableImage src={src} alt={alt} width={size} height={size} />;
}

function StatValue({
  stat,
  value,
  dataset,
}: {
  stat: string;
  value: number;
  dataset: CharacterBuilderDataset;
}) {
  const asset = dataset.stats[stat];
  return (
    <div className={styles.statRow}>
      <span className={styles.statIdentity}>
        {asset?.image ? <LoadableImage src={asset.image} alt="" width={22} height={22} /> : <Zap size={18} />}
        <span>{asset?.label || fallbackStatLabels[stat] || stat.toUpperCase()}</span>
      </span>
      <strong>{formatNumber(value)}</strong>
    </div>
  );
}

function MaterialsTable({
  entries,
  availability,
  showAvailability,
}: {
  entries: MaterialEntry[];
  availability?: Record<string, number>;
  showAvailability?: boolean;
}) {
  if (entries.length === 0) {
    return (
      <div className={styles.emptyState}>
        <Boxes size={28} />
        <strong>Материалы появятся после выбора экипировки</strong>
        <span>Калькулятор автоматически подхватит рецепт выбранного качества.</span>
      </div>
    );
  }
  return (
    <div className={styles.materialGrid}>
      {entries.map((entry) => {
        const available = availability?.[entry.slug] ?? 0;
        const missing = Math.max(0, entry.quantity - available);
        return (
          <div className={styles.materialCard} key={entry.slug}>
            <span className={styles.materialImage}>
              <ItemImage src={entry.image} alt={entry.name} size={44} />
            </span>
            <span className={styles.materialInfo}>
              <strong>{entry.name}</strong>
              <small>{entry.type === "resource" ? "Базовый ресурс" : `Компонент · тир ${entry.tier || "—"}`}</small>
              {showAvailability && (
                <span className={missing > 0 ? styles.materialShortage : styles.materialReady}>
                  {missing > 0 ? `Не хватает ${formatNumber(missing)}` : "Есть в банке"}
                </span>
              )}
            </span>
            <span className={styles.materialAmount}>
              <strong>{formatNumber(entry.quantity)}</strong>
              {showAvailability && <small>банк: {formatNumber(available)}</small>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function EditableMaterialPanel({
  state,
  dataset,
}: {
  state: CharacterBuildState;
  dataset: CharacterBuilderDataset;
}) {
  const [scope, setScope] = useState<"active" | "both">("both");
  const [view, setView] = useState<"direct" | "total">("total");
  const { state: collectiveState } = useCollectiveStore();
  const { state: resourceState } = useResourceStore();
  const { state: requestState } = useRequestStore();
  const materials = useMemo(() => buildMaterialTotals(state, dataset, scope), [dataset, scope, state]);
  const entries = materials[view];
  const availability = useMemo(() => Object.fromEntries(entries.map((entry) => [
    entry.slug,
    getAvailableResourceAmount(
      resourceState,
      requestState,
      collectiveState,
      ALL_BANK_ID,
      entry.slug,
    ),
  ])), [collectiveState, entries, requestState, resourceState]);
  const covered = entries.reduce((sum, entry) => sum + Math.min(entry.quantity, availability[entry.slug] ?? 0), 0);
  const required = entries.reduce((sum, entry) => sum + entry.quantity, 0);

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeading}>
        <div>
          <span className={styles.eyebrow}><Boxes size={16} /> Материальная оценка</span>
          <h2>Стоимость билда в ресурсах</h2>
          <p>Рецепты оружия, чипов и общего набора артефактов с учётом выбранного качества.</p>
        </div>
        <div className={styles.materialSummary}>
          <span>Позиций<strong>{entries.length}</strong></span>
          <span>Покрытие банком<strong>{required ? `${Math.round((covered / required) * 100)}%` : "—"}</strong></span>
        </div>
      </div>
      <div className={styles.segmentedRow}>
        <div className={styles.segmented}>
          <button className={view === "total" ? styles.segmentActive : ""} onClick={() => setView("total")} type="button">
            Полная раскладка
          </button>
          <button className={view === "direct" ? styles.segmentActive : ""} onClick={() => setView("direct")} type="button">
            Прямой рецепт
          </button>
        </div>
        <CustomSelect
          value={scope}
          onChange={(value) => setScope(value as "active" | "both")}
          options={[
            { value: "both", label: "Оба оружейных комплекта + артефакты" },
            { value: "active", label: `Комплект ${state.activeSet === "one" ? "I" : "II"} + артефакты` },
          ]}
          ariaLabel="Комплекты для расчёта"
          startIcon={<Layers3 size={16} />}
          layout="inline"
          size="regular"
        />
      </div>
      <MaterialsTable entries={entries} availability={availability} showAvailability />
    </section>
  );
}

function ReadOnlyMaterialPanel({
  state,
  dataset,
}: {
  state: CharacterBuildState;
  dataset: CharacterBuilderDataset;
}) {
  const [view, setView] = useState<"direct" | "total">("total");
  const materials = useMemo(() => buildMaterialTotals(state, dataset, "both"), [dataset, state]);
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeading}>
        <div>
          <span className={styles.eyebrow}><Boxes size={16} /> Материальная оценка</span>
          <h2>Полная стоимость билда</h2>
          <p>Расчёт двух оружейных комплектов и единого набора артефактов.</p>
        </div>
      </div>
      <div className={styles.segmented}>
        <button className={view === "total" ? styles.segmentActive : ""} onClick={() => setView("total")} type="button">Полная раскладка</button>
        <button className={view === "direct" ? styles.segmentActive : ""} onClick={() => setView("direct")} type="button">Прямой рецепт</button>
      </div>
      <MaterialsTable entries={materials[view]} />
    </section>
  );
}

export function CharacterBuilder({
  dataset,
  initialBuild = null,
  readOnly = false,
}: CharacterBuilderProps) {
  const firstClass = dataset.classes[0]?.slug || "legionnary";
  const [state, setState] = useState<CharacterBuildState>(() => {
    if (initialBuild?.buildData) return initialBuild.buildData;
    if (!readOnly && typeof window !== "undefined") {
      try {
        const draft = window.localStorage.getItem(DRAFT_KEY) ?? window.localStorage.getItem(LEGACY_DRAFT_KEY);
        const normalized = draft ? normalizeCharacterBuildState(JSON.parse(draft)) : null;
        if (normalized) return normalized;
      } catch {
        // Повреждённый локальный черновик не должен мешать открытию конструктора.
      }
    }
    return createDefaultCharacterBuild(firstClass);
  });
  const [currentBuild, setCurrentBuild] = useState<SavedCharacterBuild | null>(initialBuild);
  const [savedBuilds, setSavedBuilds] = useState<SavedCharacterBuild[]>([]);
  const [activeSection, setActiveSection] = useState<BuilderSection>("gear");
  const [pickerSlot, setPickerSlot] = useState<BuilderSlotId | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerTier, setPickerTier] = useState("all");
  const [pickerQuality, setPickerQuality] = useState<BuilderQuality>("epic");
  const [selectedArchetype, setSelectedArchetype] = useState("");
  const [showSaved, setShowSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const equipmentMap = useMemo(() => new Map(dataset.equipment.map((item) => [item.slug, item])), [dataset.equipment]);

  useEffect(() => {
    if (readOnly) return;
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
    window.localStorage.removeItem(LEGACY_DRAFT_KEY);
  }, [readOnly, state]);

  useEffect(() => {
    if (readOnly) return;
    void fetch("/api/character-builds", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload: { builds?: SavedCharacterBuild[] } | null) => {
        if (payload?.builds) setSavedBuilds(payload.builds);
      })
      .catch(() => undefined);
  }, [readOnly]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const activeSet = state.sets[state.activeSet];
  const selectedClass = dataset.classes.find((entry) => entry.slug === state.heroClass) ?? dataset.classes[0];
  const mastery = builderMasteries[state.heroClass] ?? builderMasteries.legionnary;
  const allowedArchetypes = state.level >= 15 ? 3 : state.level >= 10 ? 2 : 1;
  const selectedArchetypeConfig = builderArchetypes.find((entry) => entry.id === selectedArchetype)
    ?? builderArchetypes.find((entry) => state.selectedArchetypes.includes(entry.id))
    ?? null;

  const stats = useMemo(() => {
    const values: Record<string, number> = { ...(baseClassStats[state.heroClass] ?? baseClassStats.legionnary) };
    const levelScale = 0.7 + state.level * 0.03;
    for (const stat of Object.keys(values)) values[stat] *= levelScale;
    const selections = [...Object.values(activeSet), ...Object.values(state.artifacts)];
    for (const selection of selections) {
      if (!selection) continue;
      const item = equipmentMap.get(selection.itemSlug);
      const variation = item ? getVariation(item, selection.quality) : null;
      for (const stat of variation?.stats ?? []) {
        const value = stat.min + (stat.max - stat.min) * (selection.roll / 100);
        values[stat.type] = (values[stat.type] ?? 0) + value;
      }
      for (const secondary of selection.secondaryStats) values[secondary] = (values[secondary] ?? 0) + 3;
    }
    for (const archetype of builderArchetypes) {
      const ranks = archetype.nodes.reduce((sum, node) => sum + (state.talentRanks[node.id] ?? 0), 0);
      values[archetype.passiveStat] = (values[archetype.passiveStat] ?? 0) + ranks * archetype.passivePerRank;
    }
    return values;
  }, [activeSet, equipmentMap, state.artifacts, state.heroClass, state.level, state.talentRanks]);

  const talentAllocation = Object.values(state.talentRanks).filter((rank) => rank > 0).length;
  const talentLevelPoints = Object.values(state.talentRanks).reduce((sum, rank) => sum + Math.max(0, rank - 1), 0);
  const masteryAllocation = Object.values(state.masteryRanks).filter((rank) => rank > 0).length;
  const masteryLevelPoints = Object.values(state.masteryRanks).reduce((sum, rank) => sum + Math.max(0, rank - 1), 0);
  const pickerSelection = pickerSlot ? getSelection(state, pickerSlot) : null;

  const updateSelection = (slotId: BuilderSlotId, selection: BuilderItemSelection | null) => {
    setState((current) => {
      if (isArtifactSlot(slotId)) {
        return { ...current, artifacts: { ...current.artifacts, [slotId]: selection } };
      }
      return {
        ...current,
        sets: {
          ...current.sets,
          [current.activeSet]: {
            ...current.sets[current.activeSet],
            [slotId as BuilderWeaponSlotId]: selection,
          },
        },
      };
    });
  };

  const updateTalentRank = (nodeId: string, direction: 1 | -1, tier: number) => {
    setState((current) => {
      const rank = current.talentRanks[nodeId] ?? 0;
      const next = clamp(rank + direction, 0, 5);
      const currentAllocation = Object.values(current.talentRanks).filter((value) => value > 0).length;
      const currentLevelPoints = Object.values(current.talentRanks).reduce((sum, value) => sum + Math.max(0, value - 1), 0);
      const archetypeAllocation = selectedArchetypeConfig?.nodes.reduce(
        (sum, node) => sum + ((current.talentRanks[node.id] ?? 0) > 0 ? 1 : 0),
        0,
      ) ?? 0;
      if (direction > 0 && rank === 0 && (currentAllocation >= 15 || archetypeAllocation < (tier - 1) * 3)) return current;
      if (direction > 0 && rank > 0 && currentLevelPoints >= 12) return current;
      const talentRanks = { ...current.talentRanks, [nodeId]: next };
      if (next === 0) delete talentRanks[nodeId];
      return { ...current, talentRanks };
    });
  };

  const updateMasteryRank = (
    nodeId: string,
    direction: 1 | -1,
    options: { final?: boolean; maxRank?: number; prerequisite?: string } = {},
  ) => {
    setState((current) => {
      const rank = current.masteryRanks[nodeId] ?? 0;
      const maxRank = options.maxRank ?? 2;
      const next = clamp(rank + direction, 0, maxRank);
      const allocation = Object.values(current.masteryRanks).filter((value) => value > 0).length;
      const levelPoints = Object.values(current.masteryRanks).reduce((sum, value) => sum + Math.max(0, value - 1), 0);
      if (direction > 0 && rank === 0 && allocation >= 26) return current;
      if (direction > 0 && rank === 0 && options.final && allocation < 20) return current;
      if (direction > 0 && rank === 0 && options.prerequisite && !current.masteryRanks[options.prerequisite]) return current;
      if (direction > 0 && rank > 0 && levelPoints >= 2) return current;
      const masteryRanks = { ...current.masteryRanks, [nodeId]: next };
      if (next === 0) delete masteryRanks[nodeId];
      return { ...current, masteryRanks };
    });
  };

  const saveBuild = async (): Promise<SavedCharacterBuild | null> => {
    if (readOnly || busy) return null;
    setBusy(true);
    try {
      const response = await fetch(currentBuild ? `/api/character-builds/${currentBuild.buildId}` : "/api/character-builds", {
        method: currentBuild ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ build: state }),
      });
      const payload = await response.json().catch(() => null) as { build?: SavedCharacterBuild; error?: string } | null;
      if (!response.ok || !payload?.build) throw new Error(payload?.error || "Не удалось сохранить билд.");
      setCurrentBuild(payload.build);
      setSavedBuilds((current) => [
        payload.build!,
        ...current.filter((entry) => entry.buildId !== payload.build!.buildId),
      ]);
      setNotice("Билд сохранён в вашем профиле.");
      return payload.build;
    } catch (error) {
      setNotice((error as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const copyShareLink = async () => {
    const build = currentBuild ?? await saveBuild();
    if (!build) return;
    const url = `${window.location.origin}/character-builder/shared/${build.shareSlug}`;
    await navigator.clipboard.writeText(url);
    setNotice("Ссылка на билд скопирована.");
  };

  const resetBuild = () => {
    if (!window.confirm("Очистить текущий билд и начать с нуля?")) return;
    setState(createDefaultCharacterBuild(firstClass));
    setCurrentBuild(null);
    setSelectedArchetype("");
    setNotice("Создан новый чистый билд.");
  };

  const loadBuild = (build: SavedCharacterBuild) => {
    const normalized = normalizeCharacterBuildState(build.buildData);
    if (!normalized) return;
    setState(normalized);
    setCurrentBuild({ ...build, buildData: normalized });
    setShowSaved(false);
    setSelectedArchetype(normalized.selectedArchetypes[0] ?? "");
    setNotice(`Открыт билд «${build.title}».`);
  };

  const deleteBuild = async (build: SavedCharacterBuild) => {
    if (!window.confirm(`Удалить билд «${build.title}»?`)) return;
    const response = await fetch(`/api/character-builds/${build.buildId}`, { method: "DELETE" });
    if (!response.ok) {
      setNotice("Не удалось удалить билд.");
      return;
    }
    setSavedBuilds((current) => current.filter((entry) => entry.buildId !== build.buildId));
    if (currentBuild?.buildId === build.buildId) setCurrentBuild(null);
    setNotice("Билд удалён.");
  };

  const pickerItems = useMemo(() => {
    if (!pickerSlot) return [];
    const target = slotMeta[pickerSlot];
    const normalizedSearch = pickerSearch.trim().toLocaleLowerCase("ru");
    return dataset.equipment.filter((item) => {
      if (item.type !== target.type) return false;
      if (item.type === "weapon") {
        if (item.slot === "secondary-weapon") return false;
        if (item.mastery && item.mastery !== state.heroClass) return false;
      }
      if (pickerTier !== "all" && String(item.tier) !== pickerTier) return false;
      if (!item.variations.some((variation) => variation.quality === pickerQuality)) return false;
      return !normalizedSearch
        || item.name.toLocaleLowerCase("ru").includes(normalizedSearch)
        || item.englishName.toLocaleLowerCase("en").includes(normalizedSearch);
    }).slice(0, 80);
  }, [dataset.equipment, pickerQuality, pickerSearch, pickerSlot, pickerTier, state.heroClass]);

  const renderGearSlot = (slotId: BuilderSlotId) => {
    const selection = getSelection(state, slotId);
    const item = selection ? equipmentMap.get(selection.itemSlug) : null;
    const variation = item && selection ? getVariation(item, selection.quality) : null;
    return (
      <button
        className={`${styles.gearSlot}${selection ? ` ${styles.gearSlotFilled}` : ""}`}
        type="button"
        key={slotId}
        disabled={readOnly}
        onClick={() => {
          if (!readOnly) {
            setPickerSlot(slotId);
            setPickerQuality(selection?.quality ?? "epic");
          }
        }}
      >
        <span className={styles.slotImage}>
          {item ? <ItemImage src={variation?.image} alt={item.name} size={54} /> : <Plus size={24} />}
        </span>
        <span className={styles.slotText}>
          <small>{slotMeta[slotId].label}</small>
          <strong>{item?.name || "Выбрать предмет"}</strong>
          {selection && <em>{qualityLabels[selection.quality]} · {selection.roll}% характеристик</em>}
        </span>
        {!readOnly && <ChevronRight size={18} />}
      </button>
    );
  };

  return (
    <div className={`${styles.builder}${readOnly ? ` ${styles.readOnly}` : ""}`}>
      {notice && <div className={styles.toast} role="status"><Check size={18} />{notice}</div>}

      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroMain}>
          <span className={styles.kicker}><Sparkles size={16} /> Конструктор персонажа</span>
          {readOnly ? (
            <>
              <h1>{state.title}</h1>
              <p>Готовый билд от {initialBuild?.ownerName || "игрока портала"} — экипировка, таланты, мастерство и полная стоимость.</p>
            </>
          ) : (
            <>
              <input
                className={styles.titleInput}
                value={state.title}
                onChange={(event) => setState((current) => ({ ...current, title: event.target.value.slice(0, 80) }))}
                aria-label="Название билда"
              />
              <p>Соберите героя, сравните оружейные комплекты и сразу увидьте полную потребность в ресурсах.</p>
            </>
          )}
        </div>
        {!readOnly && (
          <div className={styles.heroActions}>
            <button className={styles.secondaryButton} type="button" onClick={() => setShowSaved(true)}>
              <Database size={18} /> Мои билды <span>{savedBuilds.length}</span>
            </button>
            <button className={styles.secondaryButton} type="button" onClick={copyShareLink}>
              <Link2 size={18} /> Поделиться
            </button>
            <button className={`${styles.primaryButton} ${styles.saveBuildButton}`} type="button" onClick={saveBuild} disabled={busy}>
              <Save size={18} /> {busy ? "Сохраняем…" : currentBuild ? "Сохранить изменения" : "Сохранить билд"}
            </button>
          </div>
        )}
        {readOnly && (
          <a className={styles.primaryButton} href="/character-builder">
            <Sparkles size={18} /> Создать свой билд
          </a>
        )}
      </section>

      <section className={styles.identityBar}>
        <div className={styles.classIdentity}>
          <span className={styles.classPortrait}>
            {selectedClass?.image ? <LoadableImage src={selectedClass.image} alt={selectedClass.name} width={60} height={60} /> : <UserRound size={30} />}
          </span>
          <span>
            <small>Класс героя</small>
            <strong>{selectedClass?.name || state.heroClass}</strong>
            <em>{selectedClass?.family}</em>
          </span>
        </div>
        {!readOnly ? (
          <>
            <CustomSelect
              value={state.heroClass}
              onChange={(heroClass) => setState((current) => ({
                ...current,
                heroClass,
                masteryRanks: {},
                sets: {
                  one: { ...current.sets.one, "weapon-primary": null },
                  two: { ...current.sets.two, "weapon-primary": null },
                },
              }))}
              options={dataset.classes.map((entry) => ({ value: entry.slug, label: entry.name }))}
              ariaLabel="Класс героя"
              startIcon={<Shield size={17} />}
              size="regular"
            />
            <CustomSelect
              value={String(state.level)}
              onChange={(value) => setState((current) => {
                const level = Number(value);
                const archetypeLimit = level >= 15 ? 3 : level >= 10 ? 2 : 1;
                const selectedArchetypes = current.selectedArchetypes.slice(0, archetypeLimit);
                const selectedSet = new Set(selectedArchetypes);
                const talentRanks = Object.fromEntries(
                  Object.entries(current.talentRanks).filter(([nodeId]) => (
                    builderArchetypes.some((archetype) => selectedSet.has(archetype.id) && nodeId.startsWith(`${archetype.id}-`))
                  )),
                );
                return { ...current, level, selectedArchetypes, talentRanks };
              })}
              options={Array.from({ length: 20 }, (_, index) => ({ value: String(index + 1), label: `Уровень ${index + 1}` }))}
              ariaLabel="Уровень героя"
              startIcon={<Zap size={17} />}
              size="regular"
            />
            <button className={styles.resetButton} type="button" onClick={resetBuild}>
              <RefreshCcw size={17} /> Начать заново
            </button>
          </>
        ) : (
          <span className={styles.levelBadge}>Уровень {state.level}</span>
        )}
      </section>

      <nav className={styles.sectionNav} aria-label="Разделы конструктора">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              type="button"
              className={activeSection === section.id ? styles.sectionNavActive : ""}
              onClick={() => setActiveSection(section.id)}
              aria-pressed={activeSection === section.id}
            >
              <Icon size={19} /> {section.label}
            </button>
          );
        })}
      </nav>

      {activeSection === "gear" && (
        <>
          <section className={styles.builderGrid}>
            <div className={styles.panel}>
              <div className={styles.panelHeading}>
                <div>
                  <span className={styles.eyebrow}><Layers3 size={16} /> Экипировка</span>
                  <h2>Снаряжение героя</h2>
                  <p>Оружие и чипы переключаются комплектами. Артефакты всегда остаются общими.</p>
                </div>
              </div>

              <div className={styles.gearCategory}>
                <div className={styles.gearCategoryHeader}>
                  <div>
                    <span className={styles.gearCategoryIcon}><Swords size={20} /></span>
                    <span><strong>Оружие и чипы</strong><small>Два оружейных комплекта для быстрого переключения</small></span>
                  </div>
                  <div className={styles.setControls}>
                    <div className={styles.setSwitch}>
                      {(["one", "two"] as BuilderSetId[]).map((setId) => (
                        <button
                          key={setId}
                          type="button"
                          className={state.activeSet === setId ? styles.setSwitchActive : ""}
                          onClick={() => setState((current) => ({ ...current, activeSet: setId }))}
                        >
                          Комплект {setId === "one" ? "I" : "II"}
                        </button>
                      ))}
                    </div>
                    {!readOnly && (
                      <button
                        className={styles.copySetButton}
                        type="button"
                        onClick={() => setState((current) => {
                          const targetSet: BuilderSetId = current.activeSet === "one" ? "two" : "one";
                          return {
                            ...current,
                            sets: {
                              ...current.sets,
                              [targetSet]: { ...current.sets[current.activeSet] },
                            },
                          };
                        })}
                      >
                        <Copy size={16} /> Копировать в {state.activeSet === "one" ? "II" : "I"}
                      </button>
                    )}
                  </div>
                </div>
                <div className={`${styles.slotGrid} ${styles.weaponSlotGrid}`}>
                  {builderWeaponSlotIds.map(renderGearSlot)}
                </div>
              </div>

              <div className={`${styles.gearCategory} ${styles.artifactCategory}`}>
                <div className={styles.gearCategoryHeader}>
                  <div>
                    <span className={styles.gearCategoryIcon}><Gem size={20} /></span>
                    <span><strong>Артефакты</strong><small>Единый набор для обоих оружейных комплектов</small></span>
                  </div>
                  <span className={styles.singleSetBadge}>Общий комплект</span>
                </div>
                <div className={`${styles.slotGrid} ${styles.artifactSlotGrid}`}>
                  {builderArtifactSlotIds.map(renderGearSlot)}
                </div>
              </div>
            </div>

            <aside className={`${styles.panel} ${styles.statsPanel}`}>
              <div className={styles.panelHeading}>
                <div>
                  <span className={styles.eyebrow}><Zap size={16} /> Живой расчёт</span>
                  <h2>Характеристики</h2>
                  <p>Оружейный комплект {state.activeSet === "one" ? "I" : "II"} + общий набор артефактов.</p>
                </div>
              </div>
              <div className={styles.statsGroups}>
                {builderStatGroups.map((group) => {
                  const visibleStats = group.stats.filter((stat) => Math.abs(stats[stat] ?? 0) > 0.01);
                  if (visibleStats.length === 0) return null;
                  return (
                    <div className={styles.statGroup} key={group.id}>
                      <h3>{group.label}</h3>
                      {visibleStats.map((stat) => <StatValue key={stat} stat={stat} value={stats[stat] ?? 0} dataset={dataset} />)}
                    </div>
                  );
                })}
              </div>
            </aside>
          </section>

          <section className={styles.notesPanel}>
            <div>
              <span className={styles.eyebrow}><Clipboard size={16} /> Заметки</span>
              <h2>Как играть этим билдом</h2>
            </div>
            {readOnly ? (
              <p>{state.notes || "Автор не оставил дополнительных пояснений."}</p>
            ) : (
              <textarea
                value={state.notes}
                onChange={(event) => setState((current) => ({ ...current, notes: event.target.value.slice(0, 1200) }))}
                placeholder="Опишите ротацию, роль в группе, сильные стороны или ситуативные замены…"
                maxLength={1200}
              />
            )}
          </section>
        </>
      )}

      {activeSection === "talents" && (
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}><Sparkles size={16} /> Развитие героя</span>
              <h2>Ветки талантов</h2>
              <p>На уровне {state.level} доступно веток: {allowedArchetypes}. Первый ранг расходует очко распределения, следующие — очки уровня.</p>
            </div>
            <div className={styles.points}>
              <span>Распределение<strong>{talentAllocation} / 15</strong></span>
              <span>Очки уровня<strong>{talentLevelPoints} / 12</strong></span>
            </div>
          </div>
          <div className={styles.archetypeGrid}>
            {builderArchetypes.map((archetype) => {
              const selected = state.selectedArchetypes.includes(archetype.id);
              return (
                <button
                  key={archetype.id}
                  type="button"
                  className={`${styles.archetypeCard}${selected ? ` ${styles.archetypeSelected}` : ""}`}
                  style={{ "--archetype-accent": archetype.accent } as CSSProperties}
                  onClick={() => {
                    setSelectedArchetype(archetype.id);
                    if (readOnly || selected) return;
                    if (state.selectedArchetypes.length >= allowedArchetypes) {
                      setNotice(`На этом уровне можно выбрать только ${allowedArchetypes} ветки.`);
                      return;
                    }
                    setState((current) => ({ ...current, selectedArchetypes: [...current.selectedArchetypes, archetype.id] }));
                  }}
                >
                  <span className={styles.archetypeIcon}>
                    <LoadableImage src={archetype.icon} alt="" width={54} height={54} />
                  </span>
                  <span><strong>{archetype.name}</strong><small>{archetype.description}</small><em>{archetype.bonus}</em></span>
                  {selected && <Check size={18} />}
                </button>
              );
            })}
          </div>
          {selectedArchetypeConfig && state.selectedArchetypes.includes(selectedArchetypeConfig.id) ? (
            <div
              className={styles.talentTree}
              style={{ "--archetype-accent": selectedArchetypeConfig.accent } as CSSProperties}
            >
              <div className={styles.subheading}>
                <div className={styles.talentBranchTitle}>
                  <LoadableImage src={selectedArchetypeConfig.simplifiedIcon} alt="" width={64} height={64} />
                  <div><h3>{selectedArchetypeConfig.name}</h3><p>{selectedArchetypeConfig.bonus}</p></div>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    className={styles.textButton}
                    onClick={() => setState((current) => ({
                      ...current,
                      selectedArchetypes: current.selectedArchetypes.filter((id) => id !== selectedArchetypeConfig.id),
                      talentRanks: Object.fromEntries(
                        Object.entries(current.talentRanks).filter(([id]) => !id.startsWith(`${selectedArchetypeConfig.id}-`)),
                      ),
                    }))}
                  >
                    <Trash2 size={16} /> Удалить ветку
                  </button>
                )}
              </div>
              <div className={styles.talentTiers}>
                {Array.from({ length: 5 }, (_, tierIndex) => {
                  const tier = tierIndex + 1;
                  return (
                    <div className={styles.talentTier} key={tier}>
                      <span className={styles.tierLabel}>Ряд {tier}</span>
                      <div>
                        {selectedArchetypeConfig.nodes.filter((node) => node.tier === tier).map((node) => {
                          const rank = state.talentRanks[node.id] ?? 0;
                          return (
                            <article className={`${styles.talentNode}${rank ? ` ${styles.talentNodeActive}` : ""}`} key={node.id}>
                              <span className={styles.nodeIcon}>
                                <LoadableImage src={node.icon} alt="" width={48} height={48} />
                              </span>
                              <div><strong>{node.name}</strong><p>{node.description}</p></div>
                              <div className={styles.rankControl}>
                                {!readOnly && <button type="button" aria-label={`Уменьшить ранг: ${node.name}`} onClick={() => updateTalentRank(node.id, -1, tier)} disabled={rank === 0}><Minus size={15} /></button>}
                                <span>{rank} / 5</span>
                                {!readOnly && <button type="button" aria-label={`Повысить ранг: ${node.name}`} onClick={() => updateTalentRank(node.id, 1, tier)} disabled={rank === 5}><Plus size={15} /></button>}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <Sparkles size={30} />
              <strong>{readOnly ? "Ветки талантов не распределены" : "Выберите ветку для настройки"}</strong>
              <span>Дерево талантов откроется здесь.</span>
            </div>
          )}
        </section>
      )}

      {activeSection === "mastery" && (
        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div className={styles.masteryHeading}>
              <LoadableImage src={mastery.icon} alt="" width={72} height={72} />
              <div>
                <span className={styles.eyebrow}><BookOpenCheck size={16} /> Классовая специализация</span>
                <h2>Мастерство: {selectedClass?.name}</h2>
                <p>Развивайте способности по связанным веткам и откройте финальную специализацию.</p>
              </div>
            </div>
            <div className={styles.points}>
              <span>Распределение<strong>{masteryAllocation} / 26</strong></span>
              <span>Очки уровня<strong>{masteryLevelPoints} / 2</strong></span>
            </div>
          </div>

          <div className={styles.masteryTree}>
            {mastery.branches.map((branch) => {
              const rootRank = state.masteryRanks[branch.rootId] ?? 0;
              return (
                <article className={styles.masteryColumn} key={branch.id}>
                  <header className={`${styles.masteryAbility}${rootRank ? ` ${styles.masteryNodeActive}` : ""}`}>
                    <button
                      type="button"
                      className={styles.masteryIconButton}
                      disabled={readOnly}
                      onClick={() => !readOnly && updateMasteryRank(branch.rootId, rootRank ? -1 : 1, { maxRank: 1 })}
                      aria-label={`${rootRank ? "Снять" : "Выбрать"} способность ${branch.name}`}
                    >
                      <LoadableImage src={branch.icon} alt="" width={66} height={66} />
                      <span className={styles.masteryRankBadge}>{rootRank ? <Check size={15} /> : <Plus size={15} />}</span>
                    </button>
                    <div><h3>{branch.name}</h3><p>{branch.description}</p></div>
                  </header>
                  <div className={styles.masteryPath}>
                    {branch.nodes.map((node, nodeIndex) => {
                      const rank = state.masteryRanks[node.id] ?? 0;
                      const prerequisite = nodeIndex === 0 ? branch.rootId : branch.nodes[nodeIndex - 1].id;
                      const unlocked = Boolean(state.masteryRanks[prerequisite]);
                      return (
                        <div
                          className={`${styles.masteryTreeNode}${rank ? ` ${styles.masteryNodeActive}` : ""}${!unlocked ? ` ${styles.masteryNodeLocked}` : ""}`}
                          key={node.id}
                        >
                          <button
                            type="button"
                            className={styles.masteryIconButton}
                            disabled={readOnly || (!unlocked && rank === 0)}
                            onClick={() => !readOnly && updateMasteryRank(node.id, rank ? -1 : 1, { prerequisite })}
                            title={node.description}
                            aria-label={`${rank ? "Снять" : "Выбрать"} улучшение ${node.name}`}
                          >
                            <LoadableImage src={node.icon} alt="" width={54} height={54} />
                            <span className={styles.masteryRankBadge}>{rank}/2</span>
                          </button>
                          <strong>{node.name}</strong>
                          {rank > 0 && !readOnly && (
                            <div className={styles.masteryRankActions}>
                              <button type="button" onClick={() => updateMasteryRank(node.id, -1)} aria-label={`Уменьшить ранг: ${node.name}`}><Minus size={13} /></button>
                              <button type="button" onClick={() => updateMasteryRank(node.id, 1)} disabled={rank >= 2} aria-label={`Повысить ранг: ${node.name}`}><Plus size={13} /></button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>

          <div className={styles.finalMasteries}>
            <span className={styles.tierLabel}>Финальная специализация · требуется 20 очков</span>
            <div>
              {mastery.finals.map((node) => {
                const rank = state.masteryRanks[node.id] ?? 0;
                return (
                  <article className={`${styles.finalMastery}${rank ? ` ${styles.finalMasteryActive}` : ""}`} key={node.id}>
                    <span className={styles.nodeIcon}><LoadableImage src={node.icon} alt="" width={58} height={58} /></span>
                    <div><strong>{node.name}</strong><p>{node.description}</p></div>
                    <div className={styles.rankControl}>
                      {!readOnly && <button type="button" aria-label={`Уменьшить ранг: ${node.name}`} onClick={() => updateMasteryRank(node.id, -1, { final: true })} disabled={rank === 0}><Minus size={15} /></button>}
                      <span>{rank} / 2</span>
                      {!readOnly && <button type="button" aria-label={`Повысить ранг: ${node.name}`} onClick={() => updateMasteryRank(node.id, 1, { final: true })} disabled={rank === 2 || (rank === 0 && masteryAllocation < 20)}><Plus size={15} /></button>}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {activeSection === "materials" && (
        readOnly
          ? <ReadOnlyMaterialPanel state={state} dataset={dataset} />
          : <EditableMaterialPanel state={state} dataset={dataset} />
      )}

      {pickerSlot && !readOnly && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => setPickerSlot(null)}>
          <section className={styles.pickerModal} role="dialog" aria-modal="true" aria-label={`Выбор: ${slotMeta[pickerSlot].label}`} onMouseDown={(event) => event.stopPropagation()}>
            <header className={styles.modalHeader}>
              <div><span className={styles.eyebrow}>Выбор экипировки</span><h2>{slotMeta[pickerSlot].label}</h2></div>
              <button type="button" onClick={() => setPickerSlot(null)} aria-label="Закрыть"><X size={22} /></button>
            </header>
            <div className={styles.pickerFilters}>
              <label className={styles.searchField}>
                <Search size={18} />
                <input value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} placeholder="Поиск по названию…" autoFocus />
              </label>
              <CustomSelect
                value={pickerQuality}
                onChange={(value) => setPickerQuality(value as BuilderQuality)}
                options={builderQualities.map((quality) => ({ value: quality, label: qualityLabels[quality] }))}
                ariaLabel="Качество предмета"
                startIcon={<Gem size={16} />}
                size="regular"
              />
              <CustomSelect
                value={pickerTier}
                onChange={setPickerTier}
                options={[
                  { value: "all", label: "Все тиры" },
                  ...[1, 2, 3, 4, 5].map((tier) => ({ value: String(tier), label: `Тир ${tier}` })),
                ]}
                ariaLabel="Тир предмета"
                startIcon={<Layers3 size={16} />}
                size="regular"
              />
            </div>
            <div className={styles.pickerResultHeader}>
              <span>Найдено: <strong>{pickerItems.length}{pickerItems.length === 80 ? "+" : ""}</strong></span>
              {pickerSelection && (
                <button className={styles.textButton} type="button" onClick={() => {
                  updateSelection(pickerSlot, null);
                  setPickerSlot(null);
                }}>
                  <Trash2 size={16} /> Снять предмет
                </button>
              )}
            </div>
            <div className={styles.pickerItems}>
              {pickerItems.map((item) => {
                const variation = getVariation(item, pickerQuality);
                const equipped = pickerSelection?.itemSlug === item.slug;
                return (
                  <button
                    className={`${styles.pickerItem}${equipped ? ` ${styles.pickerItemEquipped}` : ""}`}
                    type="button"
                    key={item.slug}
                    onClick={() => {
                      updateSelection(pickerSlot, {
                        itemSlug: item.slug,
                        quality: pickerQuality,
                        roll: equipped ? pickerSelection?.roll ?? 100 : 100,
                        secondaryStats: equipped ? pickerSelection?.secondaryStats ?? [] : [],
                      });
                    }}
                  >
                    <span className={styles.pickerItemImage}><ItemImage src={variation?.image} alt={item.name} size={58} /></span>
                    <span className={styles.pickerItemText}>
                      <strong>{item.name}</strong>
                      <small>{item.englishName}</small>
                      <em>Тир {item.tier} · {qualityLabels[pickerQuality]}</em>
                    </span>
                    {equipped ? <Check size={19} /> : <Plus size={19} />}
                  </button>
                );
              })}
              {pickerItems.length === 0 && <div className={styles.emptyState}><Search size={28} /><strong>Ничего не найдено</strong><span>Измените запрос или фильтры.</span></div>}
            </div>
            {pickerSelection && (
              <>
                {slotMeta[pickerSlot].type === "implant" && (
                  <div className={styles.secondaryStatPicker}>
                    <div>
                      <strong>Дополнительные характеристики</strong>
                      <span>Выберите до трёх бонусов для артефакта</span>
                    </div>
                    <div>
                      {secondaryStatOptions.map((stat) => {
                        const selection = getSelection(state, pickerSlot);
                        const selected = selection?.secondaryStats.includes(stat) ?? false;
                        const asset = dataset.stats[stat];
                        return (
                          <button
                            type="button"
                            className={selected ? styles.secondaryStatActive : ""}
                            key={stat}
                            onClick={() => {
                              if (!selection) return;
                              const secondaryStats = selected
                                ? selection.secondaryStats.filter((entry) => entry !== stat)
                                : selection.secondaryStats.length < 3
                                  ? [...selection.secondaryStats, stat]
                                  : selection.secondaryStats;
                              updateSelection(pickerSlot, { ...selection, secondaryStats });
                            }}
                          >
                            {asset?.image ? <LoadableImage src={asset.image} alt="" width={20} height={20} /> : <Zap size={16} />}
                            {asset?.label || fallbackStatLabels[stat] || stat.toUpperCase()}
                            {selected && <Check size={15} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <footer className={styles.pickerInspector}>
                  <div>
                    <span>Качество характеристик</span>
                    <strong>{pickerSelection.roll}%</strong>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={pickerSelection.roll}
                    onChange={(event) => {
                      const selection = getSelection(state, pickerSlot);
                      if (selection) updateSelection(pickerSlot, { ...selection, roll: Number(event.target.value) });
                    }}
                    aria-label="Процент характеристик предмета"
                  />
                  <button className={styles.primaryButton} type="button" onClick={() => setPickerSlot(null)}>
                    <Check size={17} /> Готово
                  </button>
                </footer>
              </>
            )}
          </section>
        </div>
      )}

      {showSaved && !readOnly && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => setShowSaved(false)}>
          <section className={`${styles.pickerModal} ${styles.savedModal}`} role="dialog" aria-modal="true" aria-label="Мои билды" onMouseDown={(event) => event.stopPropagation()}>
            <header className={styles.modalHeader}>
              <div><span className={styles.eyebrow}>Профиль игрока</span><h2>Мои сохранённые билды</h2></div>
              <button type="button" onClick={() => setShowSaved(false)} aria-label="Закрыть"><X size={22} /></button>
            </header>
            <div className={styles.savedList}>
              {savedBuilds.map((build) => {
                const classEntry = dataset.classes.find((entry) => entry.slug === build.heroClass);
                return (
                  <article className={styles.savedBuild} key={build.buildId}>
                    <span className={styles.savedClass}>
                      {classEntry?.image ? <LoadableImage src={classEntry.image} alt="" width={46} height={46} /> : <UserRound size={24} />}
                    </span>
                    <div><strong>{build.title}</strong><span>{classEntry?.name || build.heroClass} · уровень {build.level}</span><small>Обновлено {new Date(build.updatedAt).toLocaleString("ru-RU")}</small></div>
                    <button type="button" onClick={() => loadBuild(build)}>Открыть</button>
                    <button type="button" className={styles.iconButton} onClick={async () => {
                      await navigator.clipboard.writeText(`${window.location.origin}/character-builder/shared/${build.shareSlug}`);
                      setNotice("Ссылка скопирована.");
                    }} aria-label={`Копировать ссылку на ${build.title}`}><Copy size={18} /></button>
                    <button type="button" className={styles.iconButtonDanger} onClick={() => deleteBuild(build)} aria-label={`Удалить ${build.title}`}><Trash2 size={18} /></button>
                  </article>
                );
              })}
              {savedBuilds.length === 0 && <div className={styles.emptyState}><Database size={30} /><strong>Сохранённых билдов пока нет</strong><span>Первый билд появится здесь после сохранения.</span></div>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
