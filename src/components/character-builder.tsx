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
import { useEffect, useMemo, useState } from "react";
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
  builderQualities,
  builderSlotIds,
  createDefaultCharacterBuild,
  type BuilderEquipmentItem,
  type BuilderItemSelection,
  type BuilderQuality,
  type BuilderReferenceItem,
  type BuilderSetId,
  type BuilderSlotId,
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

const DRAFT_KEY = "clan-portal:character-builder-draft:v1";

const slotMeta: Record<BuilderSlotId, { label: string; shortLabel: string; type: BuilderEquipmentItem["type"] }> = {
  "weapon-primary": { label: "Основна зброя", shortLabel: "Основна", type: "weapon" },
  "weapon-secondary": { label: "Додаткова зброя", shortLabel: "Додаткова", type: "weapon" },
  "implant-1": { label: "Імплант 1", shortLabel: "Імплант 1", type: "implant" },
  "implant-2": { label: "Імплант 2", shortLabel: "Імплант 2", type: "implant" },
  "implant-3": { label: "Імплант 3", shortLabel: "Імплант 3", type: "implant" },
  "implant-4": { label: "Імплант 4", shortLabel: "Імплант 4", type: "implant" },
  "implant-5": { label: "Імплант 5", shortLabel: "Імплант 5", type: "implant" },
  "implant-6": { label: "Імплант 6", shortLabel: "Імплант 6", type: "implant" },
  "chip-1": { label: "Чип 1", shortLabel: "Чип 1", type: "chip" },
  "chip-2": { label: "Чип 2", shortLabel: "Чип 2", type: "chip" },
  "chip-3": { label: "Чип 3", shortLabel: "Чип 3", type: "chip" },
  "rune-1": { label: "Руна", shortLabel: "Руна", type: "rune" },
};

const qualityLabels: Record<BuilderQuality, string> = {
  uncommon: "Звичайний",
  rare: "Покращений",
  epic: "Розігнаний",
};

const recipeByQuality: Record<BuilderQuality, "regular" | "upgraded" | "overclocked"> = {
  uncommon: "regular",
  rare: "upgraded",
  epic: "overclocked",
};

const secondaryStatOptions = ["health", "mana", "armor", "mr", "wd", "sp", "as", "hasp", "pcc", "mcc", "ppen", "mpen"];

function formatNumber(value: number) {
  return Number.isInteger(value)
    ? new Intl.NumberFormat("uk-UA").format(value)
    : new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 1 }).format(value);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
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

  for (const setId of setIds) {
    for (const selection of Object.values(state.sets[setId])) {
      if (!selection) continue;
      const item = equipmentMap.get(selection.itemSlug);
      const recipe = item?.recipes.find((entry) => entry.id === recipeByQuality[selection.quality]);
      if (!item || !recipe) continue;
      for (const ingredient of recipe.ingredients) {
        add(direct, ingredient.slug, ingredient.quantity);
        expand(ingredient.slug, ingredient.quantity, new Set([item.slug]));
      }
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
    .sort((left, right) => right.tier - left.tier || left.name.localeCompare(right.name, "uk"));

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
        <strong>Матеріали з’являться після вибору спорядження</strong>
        <span>Калькулятор автоматично підхопить рецепт потрібної якості.</span>
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
              <small>{entry.type === "resource" ? "Базовий ресурс" : `Компонент · тир ${entry.tier || "—"}`}</small>
              {showAvailability && (
                <span className={missing > 0 ? styles.materialShortage : styles.materialReady}>
                  {missing > 0 ? `Бракує ${formatNumber(missing)}` : "Є в банку"}
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
    <section className={styles.panel} id="materials">
      <div className={styles.panelHeading}>
        <div>
          <span className={styles.eyebrow}><Boxes size={16} /> Матеріальна оцінка</span>
          <h2>Вартість у ресурсах</h2>
          <p>Рецепти всього екіпірованого спорядження з урахуванням обраної якості.</p>
        </div>
        <div className={styles.materialSummary}>
          <span>Позицій<strong>{entries.length}</strong></span>
          <span>Покриття банком<strong>{required ? `${Math.round((covered / required) * 100)}%` : "—"}</strong></span>
        </div>
      </div>
      <div className={styles.segmentedRow}>
        <div className={styles.segmented}>
          <button className={view === "total" ? styles.segmentActive : ""} onClick={() => setView("total")} type="button">
            Повна розкладка
          </button>
          <button className={view === "direct" ? styles.segmentActive : ""} onClick={() => setView("direct")} type="button">
            Прямий рецепт
          </button>
        </div>
        <CustomSelect
          value={scope}
          onChange={(value) => setScope(value as "active" | "both")}
          options={[
            { value: "both", label: "Обидві комплектації" },
            { value: "active", label: `Активна комплектація ${state.activeSet === "one" ? "I" : "II"}` },
          ]}
          ariaLabel="Комплектації для розрахунку"
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
    <section className={styles.panel} id="materials">
      <div className={styles.panelHeading}>
        <div>
          <span className={styles.eyebrow}><Boxes size={16} /> Матеріальна оцінка</span>
          <h2>Повна вартість білда</h2>
          <p>Розрахунок для обох комплектів спорядження.</p>
        </div>
      </div>
      <div className={styles.segmented}>
        <button className={view === "total" ? styles.segmentActive : ""} onClick={() => setView("total")} type="button">Повна розкладка</button>
        <button className={view === "direct" ? styles.segmentActive : ""} onClick={() => setView("direct")} type="button">Прямий рецепт</button>
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
        const draft = window.localStorage.getItem(DRAFT_KEY);
        const parsed = draft ? JSON.parse(draft) as CharacterBuildState : null;
        if (parsed?.schemaVersion === 1 && parsed.heroClass) return parsed;
      } catch {
        // A broken local draft should not prevent the builder from opening.
      }
    }
    return createDefaultCharacterBuild(firstClass);
  });
  const [currentBuild, setCurrentBuild] = useState<SavedCharacterBuild | null>(initialBuild);
  const [savedBuilds, setSavedBuilds] = useState<SavedCharacterBuild[]>([]);
  const [activeSection, setActiveSection] = useState<"gear" | "talents" | "mastery" | "materials">("gear");
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
    for (const stat of Object.keys(values)) values[stat] = values[stat] * levelScale;
    for (const selection of Object.values(activeSet)) {
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
  }, [activeSet, equipmentMap, state.heroClass, state.level, state.talentRanks]);

  const talentAllocation = Object.values(state.talentRanks).filter((rank) => rank > 0).length;
  const talentLevelPoints = Object.values(state.talentRanks).reduce((sum, rank) => sum + Math.max(0, rank - 1), 0);
  const masteryAllocation = Object.values(state.masteryRanks).filter((rank) => rank > 0).length;
  const masteryLevelPoints = Object.values(state.masteryRanks).reduce((sum, rank) => sum + Math.max(0, rank - 1), 0);

  const updateSelection = (slotId: BuilderSlotId, selection: BuilderItemSelection | null) => {
    setState((current) => ({
      ...current,
      sets: {
        ...current.sets,
        [current.activeSet]: { ...current.sets[current.activeSet], [slotId]: selection },
      },
    }));
  };

  const updateTalentRank = (nodeId: string, direction: 1 | -1, tier: number) => {
    setState((current) => {
      const rank = current.talentRanks[nodeId] ?? 0;
      const next = clamp(rank + direction, 0, 5);
      const currentAllocation = Object.values(current.talentRanks).filter((value) => value > 0).length;
      const currentLevelPoints = Object.values(current.talentRanks).reduce((sum, value) => sum + Math.max(0, value - 1), 0);
      const archetypeAllocation = selectedArchetypeConfig?.nodes.reduce((sum, node) => sum + ((current.talentRanks[node.id] ?? 0) > 0 ? 1 : 0), 0) ?? 0;
      if (direction > 0 && rank === 0 && (currentAllocation >= 15 || archetypeAllocation < (tier - 1) * 3)) return current;
      if (direction > 0 && rank > 0 && currentLevelPoints >= 12) return current;
      const talentRanks = { ...current.talentRanks, [nodeId]: next };
      if (next === 0) delete talentRanks[nodeId];
      return { ...current, talentRanks };
    });
  };

  const updateMasteryRank = (nodeId: string, direction: 1 | -1, final = false) => {
    setState((current) => {
      const rank = current.masteryRanks[nodeId] ?? 0;
      const next = clamp(rank + direction, 0, 2);
      const allocation = Object.values(current.masteryRanks).filter((value) => value > 0).length;
      const levelPoints = Object.values(current.masteryRanks).reduce((sum, value) => sum + Math.max(0, value - 1), 0);
      if (direction > 0 && rank === 0 && (allocation >= 26 || (final && allocation < 20))) return current;
      if (direction > 0 && rank > 0 && levelPoints >= 2) return current;
      const masteryRanks = { ...current.masteryRanks, [nodeId]: next };
      if (next === 0) delete masteryRanks[nodeId];
      return { ...current, masteryRanks };
    });
  };

  const saveBuild = async () => {
    if (readOnly || busy) return;
    setBusy(true);
    try {
      const response = await fetch(currentBuild ? `/api/character-builds/${currentBuild.buildId}` : "/api/character-builds", {
        method: currentBuild ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ build: state }),
      });
      const payload = await response.json().catch(() => null) as { build?: SavedCharacterBuild; error?: string } | null;
      if (!response.ok || !payload?.build) throw new Error(payload?.error || "Не вдалося зберегти білд.");
      setCurrentBuild(payload.build);
      setSavedBuilds((current) => [
        payload.build!,
        ...current.filter((entry) => entry.buildId !== payload.build!.buildId),
      ]);
      setNotice("Білд збережено у вашому профілі.");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copyShareLink = async () => {
    let build = currentBuild;
    if (!build) {
      await saveBuild();
      const response = await fetch("/api/character-builds", { cache: "no-store" });
      const payload = await response.json().catch(() => null) as { builds?: SavedCharacterBuild[] } | null;
      build = payload?.builds?.[0] ?? null;
      if (build) {
        setCurrentBuild(build);
        setSavedBuilds(payload?.builds ?? []);
      }
    }
    if (!build) return;
    const url = `${window.location.origin}/character-builder/shared/${build.shareSlug}`;
    await navigator.clipboard.writeText(url);
    setNotice("Посилання на білд скопійовано.");
  };

  const resetBuild = () => {
    if (!window.confirm("Очистити поточний білд і почати з нуля?")) return;
    setState(createDefaultCharacterBuild(firstClass));
    setCurrentBuild(null);
    setSelectedArchetype("");
    setNotice("Створено чистий білд.");
  };

  const loadBuild = (build: SavedCharacterBuild) => {
    setState(build.buildData);
    setCurrentBuild(build);
    setShowSaved(false);
    setSelectedArchetype(build.buildData.selectedArchetypes[0] ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
    setNotice(`Відкрито «${build.title}».`);
  };

  const deleteBuild = async (build: SavedCharacterBuild) => {
    if (!window.confirm(`Видалити білд «${build.title}»?`)) return;
    const response = await fetch(`/api/character-builds/${build.buildId}`, { method: "DELETE" });
    if (!response.ok) {
      setNotice("Не вдалося видалити білд.");
      return;
    }
    setSavedBuilds((current) => current.filter((entry) => entry.buildId !== build.buildId));
    if (currentBuild?.buildId === build.buildId) setCurrentBuild(null);
    setNotice("Білд видалено.");
  };

  const pickerItems = useMemo(() => {
    if (!pickerSlot) return [];
    const target = slotMeta[pickerSlot];
    const normalizedSearch = pickerSearch.trim().toLocaleLowerCase("uk");
    return dataset.equipment.filter((item) => {
      if (item.type !== target.type) return false;
      if (item.type === "weapon") {
        const secondary = pickerSlot === "weapon-secondary";
        if (secondary && item.slot !== "secondary-weapon") return false;
        if (!secondary && item.slot === "secondary-weapon") return false;
        if (item.mastery && item.mastery !== state.heroClass) return false;
      }
      if (pickerTier !== "all" && String(item.tier) !== pickerTier) return false;
      if (!item.variations.some((variation) => variation.quality === pickerQuality)) return false;
      return !normalizedSearch
        || item.name.toLocaleLowerCase("uk").includes(normalizedSearch)
        || item.englishName.toLocaleLowerCase("en").includes(normalizedSearch);
    }).slice(0, 80);
  }, [dataset.equipment, pickerQuality, pickerSearch, pickerSlot, pickerTier, state.heroClass]);

  const sections = [
    { id: "gear" as const, label: "Спорядження", icon: Swords },
    { id: "talents" as const, label: "Таланти", icon: Sparkles },
    { id: "mastery" as const, label: "Майстерність", icon: BookOpenCheck },
    { id: "materials" as const, label: "Матеріали", icon: Boxes },
  ];

  return (
    <div className={`${styles.builder}${readOnly ? ` ${styles.readOnly}` : ""}`}>
      {notice && <div className={styles.toast} role="status"><Check size={18} />{notice}</div>}

      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroMain}>
          <span className={styles.kicker}><Sparkles size={16} /> Character Builder</span>
          {readOnly ? (
            <>
              <h1>{state.title}</h1>
              <p>Готовий білд від {initialBuild?.ownerName || "гравця порталу"} — спорядження, таланти, майстерність і повна вартість.</p>
            </>
          ) : (
            <>
              <input
                className={styles.titleInput}
                value={state.title}
                onChange={(event) => setState((current) => ({ ...current, title: event.target.value.slice(0, 80) }))}
                aria-label="Назва білда"
              />
              <p>Зберіть героя, порівняйте комплекти та одразу побачте повну потребу в ресурсах.</p>
            </>
          )}
        </div>
        {!readOnly && (
          <div className={styles.heroActions}>
            <button className={styles.secondaryButton} type="button" onClick={() => setShowSaved(true)}>
              <Database size={18} /> Мої білди <span>{savedBuilds.length}</span>
            </button>
            <button className={styles.secondaryButton} type="button" onClick={copyShareLink}>
              <Link2 size={18} /> Поділитися
            </button>
            <button className={styles.primaryButton} type="button" onClick={saveBuild} disabled={busy}>
              <Save size={18} /> {busy ? "Зберігаємо…" : currentBuild ? "Зберегти зміни" : "Зберегти білд"}
            </button>
          </div>
        )}
        {readOnly && (
          <a className={styles.primaryButton} href="/character-builder">
            <Sparkles size={18} /> Створити власний білд
          </a>
        )}
      </section>

      <section className={styles.identityBar}>
        <div className={styles.classIdentity}>
          <span className={styles.classPortrait}>
            {selectedClass?.image ? <LoadableImage src={selectedClass.image} alt={selectedClass.name} width={60} height={60} /> : <UserRound size={30} />}
          </span>
          <span>
            <small>Клас героя</small>
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
                  one: {
                    ...current.sets.one,
                    "weapon-primary": null,
                    "weapon-secondary": null,
                  },
                  two: {
                    ...current.sets.two,
                    "weapon-primary": null,
                    "weapon-secondary": null,
                  },
                },
              }))}
              options={dataset.classes.map((entry) => ({ value: entry.slug, label: entry.name }))}
              ariaLabel="Клас героя"
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
              options={Array.from({ length: 20 }, (_, index) => ({ value: String(index + 1), label: `Рівень ${index + 1}` }))}
              ariaLabel="Рівень героя"
              startIcon={<Zap size={17} />}
              size="regular"
            />
            <button className={styles.resetButton} type="button" onClick={resetBuild}>
              <RefreshCcw size={17} /> Почати заново
            </button>
          </>
        ) : (
          <span className={styles.levelBadge}>Рівень {state.level}</span>
        )}
      </section>

      <nav className={styles.sectionNav} aria-label="Розділи білдера">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <button
              key={section.id}
              type="button"
              className={activeSection === section.id ? styles.sectionNavActive : ""}
              onClick={() => {
                setActiveSection(section.id);
                document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              <Icon size={19} /> {section.label}
            </button>
          );
        })}
      </nav>

      <section className={styles.builderGrid} id="gear">
        <div className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}><Layers3 size={16} /> Комплектація</span>
              <h2>Спорядження героя</h2>
              <p>Два незалежні набори для швидкого порівняння характеристик.</p>
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
                  <Copy size={16} /> Скопіювати в {state.activeSet === "one" ? "II" : "I"}
                </button>
              )}
            </div>
          </div>
          <div className={styles.slotGrid}>
            {builderSlotIds.map((slotId) => {
              const selection = activeSet[slotId];
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
                    <strong>{item?.name || "Обрати предмет"}</strong>
                    {selection && <em>{qualityLabels[selection.quality]} · {selection.roll}% характеристик</em>}
                  </span>
                  {!readOnly && <ChevronRight size={18} />}
                </button>
              );
            })}
          </div>
        </div>

        <aside className={`${styles.panel} ${styles.statsPanel}`}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}><Zap size={16} /> Живий розрахунок</span>
              <h2>Характеристики</h2>
              <p>Комплект {state.activeSet === "one" ? "I" : "II"} · рол обраних предметів враховано.</p>
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

      <section className={styles.panel} id="talents">
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}><Sparkles size={16} /> Розвиток героя</span>
            <h2>Таланти архетипів</h2>
            <p>На рівні {state.level} доступно архетипів: {allowedArchetypes}. Перший ранг витрачає очко розподілу, наступні — очки рівня.</p>
          </div>
          <div className={styles.points}>
            <span>Розподіл<strong>{talentAllocation} / 15</strong></span>
            <span>Очки рівня<strong>{talentLevelPoints} / 12</strong></span>
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
                style={{ "--archetype-accent": archetype.accent } as React.CSSProperties}
                onClick={() => {
                  setSelectedArchetype(archetype.id);
                  if (readOnly || selected) return;
                  if (state.selectedArchetypes.length >= allowedArchetypes) {
                    setNotice(`На цьому рівні можна обрати лише ${allowedArchetypes} архетипи.`);
                    return;
                  }
                  setState((current) => ({ ...current, selectedArchetypes: [...current.selectedArchetypes, archetype.id] }));
                }}
              >
                <span className={styles.archetypeIcon}><Sparkles size={22} /></span>
                <span><strong>{archetype.name}</strong><small>{archetype.description}</small></span>
                {selected && <Check size={18} />}
              </button>
            );
          })}
        </div>
        {selectedArchetypeConfig && state.selectedArchetypes.includes(selectedArchetypeConfig.id) ? (
          <div className={styles.talentTree}>
            <div className={styles.subheading}>
              <div>
                <h3>{selectedArchetypeConfig.name}</h3>
                <p>{selectedArchetypeConfig.description}</p>
              </div>
              {!readOnly && (
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() => setState((current) => ({
                    ...current,
                    selectedArchetypes: current.selectedArchetypes.filter((id) => id !== selectedArchetypeConfig.id),
                    talentRanks: Object.fromEntries(Object.entries(current.talentRanks).filter(([id]) => !id.startsWith(`${selectedArchetypeConfig.id}-`))),
                  }))}
                >
                  <Trash2 size={16} /> Прибрати архетип
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
                            <span className={styles.nodeIcon}><Sparkles size={20} /></span>
                            <div><strong>{node.name}</strong><p>{node.description}</p></div>
                            <div className={styles.rankControl}>
                              {!readOnly && <button type="button" aria-label={`Зменшити ранг: ${node.name}`} onClick={() => updateTalentRank(node.id, -1, tier)} disabled={rank === 0}><Minus size={15} /></button>}
                              <span>{rank} / 5</span>
                              {!readOnly && <button type="button" aria-label={`Підвищити ранг: ${node.name}`} onClick={() => updateTalentRank(node.id, 1, tier)} disabled={rank === 5}><Plus size={15} /></button>}
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
            <strong>{readOnly ? "Архетипи не розподілено" : "Оберіть архетип для налаштування"}</strong>
            <span>Дерево талантів відкриється тут.</span>
          </div>
        )}
      </section>

      <section className={styles.panel} id="mastery">
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}><BookOpenCheck size={16} /> Класова спеціалізація</span>
            <h2>Майстерність {selectedClass?.name}</h2>
            <p>Покращуйте ключові здібності та відкрийте одну з фінальних спеціалізацій.</p>
          </div>
          <div className={styles.points}>
            <span>Розподіл<strong>{masteryAllocation} / 26</strong></span>
            <span>Очки рівня<strong>{masteryLevelPoints} / 2</strong></span>
          </div>
        </div>
        <div className={styles.masteryGrid}>
          {mastery.branches.map((branch) => (
            <article className={styles.masteryBranch} key={branch.id}>
              <header><span><Zap size={21} /></span><div><h3>{branch.name}</h3><p>{branch.description}</p></div></header>
              <div className={styles.masteryNodes}>
                {branch.nodes.map((node) => {
                  const rank = state.masteryRanks[node.id] ?? 0;
                  return (
                    <div className={`${styles.masteryNode}${rank ? ` ${styles.masteryNodeActive}` : ""}`} key={node.id} title={node.description}>
                      <span><strong>{node.name}</strong><small>{node.description}</small></span>
                      <div className={styles.rankControl}>
                        {!readOnly && <button type="button" aria-label={`Зменшити ранг: ${branch.name} — ${node.name}`} onClick={() => updateMasteryRank(node.id, -1)} disabled={rank === 0}><Minus size={14} /></button>}
                        <b>{rank}/2</b>
                        {!readOnly && <button type="button" aria-label={`Підвищити ранг: ${branch.name} — ${node.name}`} onClick={() => updateMasteryRank(node.id, 1)} disabled={rank === 2}><Plus size={14} /></button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
        <div className={styles.finalMasteries}>
          <span className={styles.tierLabel}>Фінальна майстерність · потрібно 20 очок</span>
          <div>
            {mastery.finals.map((node) => {
              const rank = state.masteryRanks[node.id] ?? 0;
              return (
                <article className={`${styles.finalMastery}${rank ? ` ${styles.finalMasteryActive}` : ""}`} key={node.id}>
                  <span className={styles.nodeIcon}><Gem size={22} /></span>
                  <div><strong>{node.name}</strong><p>{node.description}</p></div>
                  <div className={styles.rankControl}>
                    {!readOnly && <button type="button" aria-label={`Зменшити ранг: ${node.name}`} onClick={() => updateMasteryRank(node.id, -1, true)} disabled={rank === 0}><Minus size={15} /></button>}
                    <span>{rank} / 2</span>
                    {!readOnly && <button type="button" aria-label={`Підвищити ранг: ${node.name}`} onClick={() => updateMasteryRank(node.id, 1, true)} disabled={rank === 2 || (rank === 0 && masteryAllocation < 20)}><Plus size={15} /></button>}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {readOnly
        ? <ReadOnlyMaterialPanel state={state} dataset={dataset} />
        : <EditableMaterialPanel state={state} dataset={dataset} />}

      <section className={styles.notesPanel}>
        <div>
          <span className={styles.eyebrow}><Clipboard size={16} /> Нотатки</span>
          <h2>Як грати цим білдом</h2>
        </div>
        {readOnly ? (
          <p>{state.notes || "Автор не залишив додаткових пояснень."}</p>
        ) : (
          <textarea
            value={state.notes}
            onChange={(event) => setState((current) => ({ ...current, notes: event.target.value.slice(0, 1200) }))}
            placeholder="Опишіть ротацію, роль у групі, сильні сторони або ситуативні заміни…"
            maxLength={1200}
          />
        )}
      </section>

      {pickerSlot && !readOnly && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => setPickerSlot(null)}>
          <section className={styles.pickerModal} role="dialog" aria-modal="true" aria-label={`Вибір: ${slotMeta[pickerSlot].label}`} onMouseDown={(event) => event.stopPropagation()}>
            <header className={styles.modalHeader}>
              <div><span className={styles.eyebrow}>Вибір спорядження</span><h2>{slotMeta[pickerSlot].label}</h2></div>
              <button type="button" onClick={() => setPickerSlot(null)} aria-label="Закрити"><X size={22} /></button>
            </header>
            <div className={styles.pickerFilters}>
              <label className={styles.searchField}>
                <Search size={18} />
                <input value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} placeholder="Пошук за назвою…" autoFocus />
              </label>
              <CustomSelect
                value={pickerQuality}
                onChange={(value) => setPickerQuality(value as BuilderQuality)}
                options={builderQualities.map((quality) => ({ value: quality, label: qualityLabels[quality] }))}
                ariaLabel="Якість предмета"
                startIcon={<Gem size={16} />}
                size="regular"
              />
              <CustomSelect
                value={pickerTier}
                onChange={setPickerTier}
                options={[
                  { value: "all", label: "Усі тири" },
                  ...[1, 2, 3, 4, 5].map((tier) => ({ value: String(tier), label: `Тир ${tier}` })),
                ]}
                ariaLabel="Тир предмета"
                startIcon={<Layers3 size={16} />}
                size="regular"
              />
            </div>
            <div className={styles.pickerResultHeader}>
              <span>Знайдено: <strong>{pickerItems.length}{pickerItems.length === 80 ? "+" : ""}</strong></span>
              {activeSet[pickerSlot] && (
                <button className={styles.textButton} type="button" onClick={() => {
                  updateSelection(pickerSlot, null);
                  setPickerSlot(null);
                }}>
                  <Trash2 size={16} /> Зняти предмет
                </button>
              )}
            </div>
            <div className={styles.pickerItems}>
              {pickerItems.map((item) => {
                const variation = getVariation(item, pickerQuality);
                const equipped = activeSet[pickerSlot]?.itemSlug === item.slug;
                return (
                  <button
                    className={`${styles.pickerItem}${equipped ? ` ${styles.pickerItemEquipped}` : ""}`}
                    type="button"
                    key={item.slug}
                    onClick={() => {
                      updateSelection(pickerSlot, {
                        itemSlug: item.slug,
                        quality: pickerQuality,
                        roll: activeSet[pickerSlot]?.itemSlug === item.slug ? activeSet[pickerSlot]?.roll ?? 100 : 100,
                        secondaryStats: activeSet[pickerSlot]?.itemSlug === item.slug ? activeSet[pickerSlot]?.secondaryStats ?? [] : [],
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
              {pickerItems.length === 0 && <div className={styles.emptyState}><Search size={28} /><strong>Нічого не знайдено</strong><span>Змініть запит або фільтри.</span></div>}
            </div>
            {activeSet[pickerSlot] && (
              <>
                {slotMeta[pickerSlot].type === "implant" && (
                  <div className={styles.secondaryStatPicker}>
                    <div>
                      <strong>Додаткові характеристики</strong>
                      <span>Оберіть до трьох бонусів для імпланта</span>
                    </div>
                    <div>
                      {secondaryStatOptions.map((stat) => {
                        const selection = activeSet[pickerSlot];
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
                  <span>Якість характеристик</span>
                  <strong>{activeSet[pickerSlot]?.roll}%</strong>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={activeSet[pickerSlot]?.roll ?? 100}
                  onChange={(event) => {
                    const selection = activeSet[pickerSlot];
                    if (selection) updateSelection(pickerSlot, { ...selection, roll: Number(event.target.value) });
                  }}
                  aria-label="Відсоток характеристик предмета"
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
          <section className={`${styles.pickerModal} ${styles.savedModal}`} role="dialog" aria-modal="true" aria-label="Мої білди" onMouseDown={(event) => event.stopPropagation()}>
            <header className={styles.modalHeader}>
              <div><span className={styles.eyebrow}>Профіль гравця</span><h2>Мої збережені білди</h2></div>
              <button type="button" onClick={() => setShowSaved(false)} aria-label="Закрити"><X size={22} /></button>
            </header>
            <div className={styles.savedList}>
              {savedBuilds.map((build) => {
                const classEntry = dataset.classes.find((entry) => entry.slug === build.heroClass);
                return (
                  <article className={styles.savedBuild} key={build.buildId}>
                    <span className={styles.savedClass}>
                      {classEntry?.image ? <LoadableImage src={classEntry.image} alt="" width={46} height={46} /> : <UserRound size={24} />}
                    </span>
                    <div><strong>{build.title}</strong><span>{classEntry?.name || build.heroClass} · рівень {build.level}</span><small>Оновлено {new Date(build.updatedAt).toLocaleString("uk-UA")}</small></div>
                    <button type="button" onClick={() => loadBuild(build)}>Відкрити</button>
                    <button type="button" className={styles.iconButton} onClick={async () => {
                      await navigator.clipboard.writeText(`${window.location.origin}/character-builder/shared/${build.shareSlug}`);
                      setNotice("Посилання скопійовано.");
                    }} aria-label={`Копіювати посилання на ${build.title}`}><Copy size={18} /></button>
                    <button type="button" className={styles.iconButtonDanger} onClick={() => deleteBuild(build)} aria-label={`Видалити ${build.title}`}><Trash2 size={18} /></button>
                  </article>
                );
              })}
              {savedBuilds.length === 0 && <div className={styles.emptyState}><Database size={30} /><strong>Збережених білдів ще немає</strong><span>Перший білд з’явиться тут після збереження.</span></div>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
