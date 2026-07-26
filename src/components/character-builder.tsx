"use client";

import {
  BookOpenCheck,
  Boxes,
  Camera,
  Check,
  ChevronRight,
  Clipboard,
  Copy,
  Database,
  Gem,
  Layers3,
  Link2,
  Maximize2,
  Minus,
  Minimize2,
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
import { toPng } from "html-to-image";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CustomSelect } from "@/components/custom-select";
import { LoadableImage } from "@/components/loadable-image";
import {
  baseClassStats,
  builderArchetypes,
  builderMasteries,
  builderStatGroups,
  fallbackStatLabels,
  type BuilderMasteryConfig,
  type BuilderMasteryNode,
  type BuilderProgressionScale,
} from "@/lib/character-builder-config";
import {
  calculateCharacterStats,
  COREPUNK_CALCULATOR_VERSION,
  getArtifactSecondaryRange,
  percentageStatIds,
  updateWeaponPrimaryStatValues,
} from "@/lib/character-stat-calculator";
import {
  builderArtifactSlotIds,
  builderArtifactSecondaryStats,
  builderQualities,
  builderWeaponSlotIds,
  createDefaultCharacterBuild,
  getSecondaryStatSlotKey,
  getSecondaryStatValue,
  normalizeCharacterBuildState,
  type BuilderArtifactSlotId,
  type BuilderEquipmentItem,
  type BuilderItemEffect,
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

const DRAFT_KEY = "clan-portal:character-builder-draft:v5";
const LEGACY_DRAFT_KEYS = [
  "clan-portal:character-builder-draft:v4",
  "clan-portal:character-builder-draft:v3",
  "clan-portal:character-builder-draft:v2",
  "clan-portal:character-builder-draft:v1",
];

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

const primaryOverviewStats = ["ap", "sp", "health", "mana", "armor", "mr"] as const;
const artifactSecondaryStatOptions = builderArtifactSecondaryStats;

const sections: Array<{ id: BuilderSection; label: string; icon: typeof Swords }> = [
  { id: "gear", label: "Экипировка", icon: Swords },
  { id: "talents", label: "Таланты", icon: Sparkles },
  { id: "mastery", label: "Мастерство", icon: BookOpenCheck },
  { id: "materials", label: "Материалы", icon: Boxes },
];

function formatNumber(value: number) {
  return Number.isInteger(value)
    ? new Intl.NumberFormat("ru-RU").format(value)
    : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function getStatImage(dataset: CharacterBuilderDataset, stat: string) {
  const assetStat = stat === "asrating" ? "as" : stat;
  return dataset.stats[assetStat]?.image || `/game-assets/stats/${assetStat}.png`;
}

function getSecondaryStatLimit(item: BuilderEquipmentItem | null, quality: BuilderQuality) {
  if (!item || item.type !== "implant") return 0;
  if (item.tier >= 3) return 3;
  if (quality === "epic") return 5;
  if (quality === "rare") return 4;
  return 3;
}

function createPrimaryStatValues(item: BuilderEquipmentItem, quality: BuilderQuality, roll = 100) {
  const variation = getVariation(item, quality);
  const values = Object.fromEntries((variation?.stats ?? []).map((stat) => [
    stat.type,
    Math.round((stat.min + (stat.max - stat.min) * (roll / 100)) * 1000) / 1000,
  ]));
  if (item.type !== "weapon" || values.wd === undefined || !variation) return values;
  return updateWeaponPrimaryStatValues(variation.stats, values, "wd", values.wd);
}

function createEffectValues(item: BuilderEquipmentItem, quality: BuilderQuality, roll = 100) {
  const variation = getVariation(item, quality);
  return Object.fromEntries((variation?.effects ?? []).map((effect) => [
    effect.id,
    Math.round((effect.min + (effect.max - effect.min) * (roll / 100)) * 1000) / 1000,
  ]));
}

function getDiamondCount(value: number, minimum: number, maximum: number) {
  if (value <= 0) return 0;
  const safeMaximum = maximum > minimum ? maximum : Math.max(1, value);
  const progress = maximum > minimum
    ? (value - minimum) / (safeMaximum - minimum)
    : value / safeMaximum;
  return clamp(Math.ceil(progress * 5), 1, 5);
}

function StatDiamonds({
  value,
  minimum = 0,
  maximum = 100,
}: {
  value: number;
  minimum?: number;
  maximum?: number;
}) {
  const filled = getDiamondCount(value, minimum, maximum);
  return (
    <span className={styles.statDiamonds} aria-label={`Заполнено отметок: ${filled} из 5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <i key={index} className={index < filled ? styles.statDiamondFilled : ""} />
      ))}
    </span>
  );
}

type MasteryGridNode = BuilderMasteryNode & {
  row: number;
  column: number;
};

type MasteryEdge = {
  id: string;
  start: MasteryGridNode;
  end: MasteryGridNode;
};

const MASTERY_ALLOCATION_LIMIT = 26;
const MASTERY_LEVEL_LIMIT = 2;
const MASTERY_BOARD_WIDTH = 1540;
const MASTERY_BOARD_HEIGHT = 830;
const MASTERY_ROOT_X = 92;
const MASTERY_NODE_X = [280, 510, 740, 970, 1200];
const MASTERY_ROW_Y = [112, 314, 516, 718];
const MASTERY_FINAL_X = 1440;
const MASTERY_FINAL_Y = [270, 560];

const progressionTokenLabels: Record<string, string> = {
  aggro: "угроза",
  ap: "сила атаки",
  armor: "броня",
  armorpntr: "пробивание брони",
  as: "скорость атаки",
  bld: "кровотечение",
  blind: "ослепление",
  blinded: "ослеплён",
  blinding: "ослепляет",
  bmac: "магический модификатор",
  cd: "перезарядка",
  cc: "контроль",
  ccres: "сопротивление контролю",
  crippled: "искалечен",
  crit: "критический удар",
  critdmg: "критический урон",
  dash: "рывок",
  debuff: "негативный эффект",
  detonate: "детонация",
  disarm: "обезоруживание",
  disarmed: "обезоружен",
  disarms: "обезоруживает",
  dmg: "урон",
  ee: "энергетический эффект",
  et: "энергетическая цель",
  explode: "взрыв",
  explodes: "взрывается",
  explosion: "взрыв",
  explosionr: "радиус взрыва",
  fe: "огненный эффект",
  fear: "страх",
  fire: "огонь",
  fmpen: "пробивание магической защиты",
  fppen: "пробивание физической защиты",
  ft: "огненная цель",
  grounded: "приземлён",
  hasp: "сила лечения и щитов",
  hc: "жёсткий контроль",
  heal: "лечение",
  healing: "лечение",
  healred: "снижение лечения",
  heals: "лечит",
  health: "здоровье",
  healthrest: "восстановление здоровья",
  hregen: "восстановление здоровья",
  hypnosis: "гипноз",
  ignite: "поджог",
  immobilization: "обездвиживание",
  immobilized: "обездвижен",
  immobilizes: "обездвиживает",
  increase: "увеличение урона",
  inheal: "входящее лечение",
  interrupt: "прерывание",
  interrupts: "прерывает",
  knockback: "отбрасывание",
  knockedback: "отброшен",
  knocksthemback: "отбрасывает",
  lb: "заряд молнии",
  lifesteal: "вампиризм",
  mana: "мана",
  marks: "метки",
  mcc: "шанс магического крита",
  mcp: "сила магического крита",
  md: "магический урон",
  mpen: "магическое пробивание",
  mr: "магическое сопротивление",
  mregen: "восстановление маны",
  ms: "скорость передвижения",
  pcc: "шанс физического крита",
  pcp: "сила физического крита",
  pd: "физический урон",
  poison: "яд",
  ppen: "физическое пробивание",
  pstance: "защитная стойка",
  pushed: "оттеснён",
  root: "укоренение",
  rooted: "укоренён",
  rooting: "укореняет",
  roots: "укореняет",
  sbp: "сила щита",
  sc: "заряд щита",
  shield: "щит",
  silence: "безмолвие",
  silenced: "лишён возможности применять способности",
  sleep: "сон",
  slow: "замедление",
  slowdown: "замедление",
  slowed: "замедлён",
  slowing: "замедляет",
  slowres: "сопротивление замедлению",
  slows: "замедляет",
  sp: "сила заклинаний",
  specability: "специальная способность",
  stun: "оглушение",
  stunned: "оглушён",
  stunning: "оглушает",
  stuns: "оглушает",
  taunt: "провокация",
  taunted: "спровоцирован",
  taunts: "провоцирует",
  tenacity: "стойкость",
  threat: "угроза",
  vr: "радиус обзора",
  wd: "урон оружия",
  we: "эффект оружия",
  weakened: "ослаблен",
  wt: "цель оружия",
};

function normalizeProgressionText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\[([^\]]+)\]/g, (_, token: string) => progressionTokenLabels[token.toLowerCase()] ?? token)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanProgressionText(value: string, scale?: BuilderProgressionScale[]) {
  const valuesByKey = new Map<string, string>();
  for (const entry of scale ?? []) {
    for (const [key, entryValue] of Object.entries(entry)) {
      const current = valuesByKey.get(key);
      valuesByKey.set(key, current ? `${current} / ${entryValue}` : entryValue);
    }
  }
  return normalizeProgressionText(value)
    .replace(/\{([^}]+)\}/g, (_, key: string) => valuesByKey.get(key) ?? `{${key}}`)
    .trim();
}

function ProgressionDescription({
  value,
  scale,
  rank,
}: {
  value: string;
  scale?: BuilderProgressionScale[];
  rank: number;
}) {
  if (!scale?.length) return cleanProgressionText(value);
  const template = normalizeProgressionText(value);
  const parts: Array<string | ReactNode> = [];
  const placeholderPattern = /\{([^}]+)\}/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = placeholderPattern.exec(template))) {
    parts.push(template.slice(cursor, match.index));
    const key = match[1];
    const values = scale.map((entry) => entry[key]).filter((entry): entry is string => entry !== undefined);
    if (values.length === 0) {
      parts.push(match[0]);
    } else {
      parts.push(
        <span className={styles.progressionValueSequence} key={`${key}-${match.index}`}>
          {values.map((entry, index) => (
            <span key={`${entry}-${index}`}>
              {index > 0 && <i>/</i>}
              <b className={rank === index + 1 ? styles.progressionValueActive : undefined}>{entry}</b>
            </span>
          ))}
        </span>,
      );
    }
    cursor = match.index + match[0].length;
  }
  parts.push(template.slice(cursor));
  return <>{parts}</>;
}

function ProgressionRankValues({
  values,
  rank,
}: {
  values: Array<string | number>;
  rank: number;
}) {
  return (
    <strong className={styles.progressionRankValues}>
      {values.map((value, index) => (
        <span key={`${value}-${index}`}>
          {index > 0 && <i>/</i>}
          <b className={rank === index + 1 ? styles.progressionValueActive : undefined}>{value}</b>
        </span>
      ))}
    </strong>
  );
}

function ProgressionTooltip({
  node,
  rank,
  maxRank,
  scale,
  position = "below",
  badgeLabel,
  footerText = "ЛКМ — изучить или улучшить · ПКМ — отменить",
}: {
  node: BuilderMasteryNode | { name: string; description: string; rankDetails?: BuilderMasteryNode["rankDetails"]; rankThreeBonus?: string | null };
  rank: number;
  maxRank: number;
  scale?: BuilderProgressionScale[];
  position?: "above" | "below" | "left" | "right" | "rightAbove";
  badgeLabel?: string;
  footerText?: string;
}) {
  return (
    <div className={`${styles.progressionTooltip} ${styles[`progressionTooltip${position[0].toUpperCase()}${position.slice(1)}`]}`} role="tooltip">
      <header>
        <strong>{node.name}</strong>
        <span>{badgeLabel ?? (rank ? `Ранг ${rank} / ${maxRank}` : `До ${maxRank} ранга`)}</span>
      </header>
      <p><ProgressionDescription value={node.description} scale={scale} rank={rank} /></p>
      {node.rankDetails?.map((detail, index) => (
        <div className={styles.progressionScale} key={`${detail.description}-${index}`}>
          <span>{cleanProgressionText(detail.description)}</span>
          <ProgressionRankValues values={detail.values} rank={rank} />
        </div>
      ))}
      {node.rankThreeBonus && (
        <div className={styles.progressionBonus}>
          <span>Бонус 3 ранга</span>
          <p>{cleanProgressionText(node.rankThreeBonus)}</p>
        </div>
      )}
      <footer>{footerText}</footer>
    </div>
  );
}

function sanitizeImageName(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("ru")
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "билд";
}

async function waitForCaptureAssets(element: HTMLElement) {
  if ("fonts" in document) await document.fonts.ready;
  await Promise.all(Array.from(element.querySelectorAll("img")).map(async (image) => {
    if (!image.complete) {
      await new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    }
    try {
      await image.decode();
    } catch {
      // Повреждённая иконка не должна блокировать экспорт всего дерева.
    }
  }));
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function getMasteryGridNodes(mastery: BuilderMasteryConfig): MasteryGridNode[] {
  return mastery.branches.flatMap((branch, row) => (
    branch.nodes.map((node, column) => ({ ...node, row, column }))
  ));
}

function getMasteryEdgeId(classSlug: string, start: MasteryGridNode, end: MasteryGridNode) {
  return `${classSlug}-mastery-link-r${start.row + 1}c${start.column + 1}-r${end.row + 1}c${end.column + 1}`;
}

function getMasteryBoostId(edge: MasteryEdge, step: 1 | 2) {
  return `${edge.id}-boost-${step}`;
}

function getMasteryEdges(mastery: BuilderMasteryConfig): MasteryEdge[] {
  const matrix = mastery.branches.map((branch, row) => (
    branch.nodes.map((node, column) => ({ ...node, row, column }))
  ));
  const edges: MasteryEdge[] = [];
  const addEdge = (start: MasteryGridNode, end: MasteryGridNode) => {
    edges.push({ id: getMasteryEdgeId(mastery.classSlug, start, end), start, end });
  };

  for (let column = 0; column < 5; column += 1) {
    for (let row = 0; row < 3; row += 1) addEdge(matrix[row][column], matrix[row + 1][column]);
  }
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) addEdge(matrix[row][column], matrix[row][column + 1]);
    for (let row = 0; row < 3; row += 1) {
      addEdge(matrix[row][column], matrix[row + 1][column + 1]);
      addEdge(matrix[row + 1][column], matrix[row][column + 1]);
    }
  }
  return edges;
}

function getMasteryAllocation(ranks: Record<string, number>) {
  return Object.values(ranks).filter((rank) => rank > 0).length;
}

function getMasteryLevelPoints(ranks: Record<string, number>) {
  return Object.values(ranks).reduce((sum, rank) => sum + Math.max(0, rank - 1), 0);
}

function isMasteryNodeUnlockable(
  node: MasteryGridNode,
  ranks: Record<string, number>,
  edges: MasteryEdge[],
) {
  if (node.column === 0) return true;
  return edges.some((edge) => {
    const other = edge.start.id === node.id
      ? edge.end
      : edge.end.id === node.id
        ? edge.start
        : null;
    return Boolean(
      other
      && ranks[other.id]
      && ranks[getMasteryBoostId(edge, 1)]
      && ranks[getMasteryBoostId(edge, 2)],
    );
  });
}

function hasMasteryFinalAccess(mastery: BuilderMasteryConfig, ranks: Record<string, number>) {
  return mastery.branches.some((branch) => Boolean(ranks[branch.nodes.at(-1)?.id ?? ""]));
}

type MasteryPath = {
  nodes: MasteryGridNode[];
  edges: MasteryEdge[];
  cost: number;
};

function findShortestMasteryPath(
  targetId: string,
  ranks: Record<string, number>,
  nodes: MasteryGridNode[],
  edges: MasteryEdge[],
): MasteryPath | null {
  const adjacency = new Map<string, Array<{ node: MasteryGridNode; edge: MasteryEdge }>>();
  for (const node of nodes) adjacency.set(node.id, []);
  for (const edge of edges) {
    adjacency.get(edge.start.id)?.push({ node: edge.end, edge });
    adjacency.get(edge.end.id)?.push({ node: edge.start, edge });
  }

  const best = new Map<string, MasteryPath>();
  const queue: Array<{ node: MasteryGridNode; path: MasteryPath }> = [];
  for (const node of nodes) {
    if (ranks[node.id]) {
      const path = { nodes: [], edges: [], cost: 0 };
      best.set(node.id, path);
      queue.push({ node, path });
    } else if (node.column === 0) {
      const path = { nodes: [node], edges: [], cost: 1 };
      const current = best.get(node.id);
      if (!current || path.cost < current.cost) {
        best.set(node.id, path);
        queue.push({ node, path });
      }
    }
  }

  while (queue.length > 0) {
    queue.sort((left, right) => left.path.cost - right.path.cost || left.path.edges.length - right.path.edges.length);
    const current = queue.shift()!;
    if (best.get(current.node.id) !== current.path) continue;
    if (current.node.id === targetId) return current.path;

    for (const adjacent of adjacency.get(current.node.id) ?? []) {
      const missingBoosts = ([1, 2] as const)
        .filter((step) => !ranks[getMasteryBoostId(adjacent.edge, step)])
        .length;
      const missingNode = ranks[adjacent.node.id] ? 0 : 1;
      const nextPath: MasteryPath = {
        nodes: missingNode ? [...current.path.nodes, adjacent.node] : current.path.nodes,
        edges: [...current.path.edges, adjacent.edge],
        cost: current.path.cost + missingBoosts + missingNode,
      };
      const previous = best.get(adjacent.node.id);
      if (
        previous
        && (previous.cost < nextPath.cost
          || (previous.cost === nextPath.cost && previous.edges.length <= nextPath.edges.length))
      ) continue;
      best.set(adjacent.node.id, nextPath);
      queue.push({ node: adjacent.node, path: nextPath });
    }
  }
  return null;
}

function pruneMasteryRanks(mastery: BuilderMasteryConfig, candidate: Record<string, number>) {
  const ranks = { ...candidate };
  const nodes = getMasteryGridNodes(mastery);
  const edges = getMasteryEdges(mastery);
  const activeNodeIds = new Set(nodes.filter((node) => ranks[node.id]).map((node) => node.id));
  const reachable = new Set(nodes.filter((node) => node.column === 0 && activeNodeIds.has(node.id)).map((node) => node.id));

  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      if (!ranks[getMasteryBoostId(edge, 1)] || !ranks[getMasteryBoostId(edge, 2)]) continue;
      if (reachable.has(edge.start.id) && activeNodeIds.has(edge.end.id) && !reachable.has(edge.end.id)) {
        reachable.add(edge.end.id);
        changed = true;
      }
      if (reachable.has(edge.end.id) && activeNodeIds.has(edge.start.id) && !reachable.has(edge.start.id)) {
        reachable.add(edge.start.id);
        changed = true;
      }
    }
  }

  for (const node of nodes) {
    if (ranks[node.id] && !reachable.has(node.id)) delete ranks[node.id];
  }
  for (const edge of edges) {
    if (!reachable.has(edge.start.id) && !reachable.has(edge.end.id)) {
      delete ranks[getMasteryBoostId(edge, 1)];
      delete ranks[getMasteryBoostId(edge, 2)];
    }
  }

  if (!hasMasteryFinalAccess(mastery, ranks)) {
    mastery.finals.forEach((final) => delete ranks[final.id]);
  }
  return ranks;
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
        <LoadableImage src={getStatImage(dataset, stat)} alt="" width={22} height={22} />
        <span>{fallbackStatLabels[stat] || asset?.label || stat.toUpperCase()}</span>
      </span>
      <strong>{formatNumber(value)}{percentageStatIds.has(stat) ? "%" : ""}</strong>
    </div>
  );
}

function StatValueEditor({
  dataset,
  stat,
  value,
  minimum = 0,
  maximum = 100,
  onChange,
}: {
  dataset: CharacterBuilderDataset;
  stat: string;
  value: number;
  minimum?: number;
  maximum?: number;
  onChange: (value: number) => void;
}) {
  const asset = dataset.stats[stat];
  const safeValue = clamp(Number.isFinite(value) ? value : 0, 0, maximum);
  return (
    <label className={styles.statValueEditor}>
      <span className={styles.statEditorIdentity}>
        <LoadableImage src={getStatImage(dataset, stat)} alt="" width={25} height={25} />
        <span>
          <strong>{fallbackStatLabels[stat] || asset?.label || stat.toUpperCase()}</strong>
          {maximum > minimum && <small>Ориентир предмета: {formatNumber(minimum)}–{formatNumber(maximum)}</small>}
        </span>
      </span>
      <StatDiamonds value={safeValue} minimum={minimum} maximum={maximum} />
      <span className={styles.statNumberInput}>
        <input
          type="number"
          min={0}
          max={maximum}
          step="any"
          value={safeValue}
          onChange={(event) => onChange(clamp(Number(event.target.value) || 0, 0, maximum))}
          aria-label={`Значение: ${fallbackStatLabels[stat] || asset?.label || stat}`}
        />
      </span>
    </label>
  );
}

function ChipEffectText({
  dataset,
  text,
  value,
}: {
  dataset: CharacterBuilderDataset;
  text: string;
  value: number;
}) {
  const lines = text.split(/<br\s*\/?>/gi);
  return (
    <div className={styles.chipEffectDescription}>
      {lines.map((line, lineIndex) => (
        <p key={`${line}-${lineIndex}`}>
          {line.split(/(\[scale\]|\[[a-z][a-z0-9_-]*\])/gi).map((part, partIndex) => {
            if (part.toLowerCase() === "[scale]") {
              return <strong key={`${part}-${partIndex}`}>{formatNumber(value)}</strong>;
            }
            const tokenMatch = part.match(/^\[([a-z][a-z0-9_-]*)\]$/i);
            if (!tokenMatch) return <span key={`${part}-${partIndex}`}>{part}</span>;
            const token = tokenMatch[1].toLowerCase();
            return (
              <span className={styles.chipEffectToken} key={`${token}-${partIndex}`}>
                <LoadableImage src={getStatImage(dataset, token)} alt="" width={17} height={17} />
                {fallbackStatLabels[token] || dataset.stats[token]?.label || token.toUpperCase()}
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
}

function ChipEffectEditor({
  dataset,
  effect,
  value,
  onChange,
}: {
  dataset: CharacterBuilderDataset;
  effect: BuilderItemEffect;
  value: number;
  onChange: (value: number) => void;
}) {
  const statLabel = effect.statType
    ? fallbackStatLabels[effect.statType] || dataset.stats[effect.statType]?.label || effect.statType.toUpperCase()
    : null;
  const safeValue = clamp(Number.isFinite(value) ? value : 0, 0, effect.max);
  return (
    <article className={styles.chipEffectCard}>
      <div className={styles.chipEffectHeading}>
        <span className={styles.chipEffectIcon}>
          {effect.statType
            ? <LoadableImage src={getStatImage(dataset, effect.statType)} alt="" width={30} height={30} />
            : <Sparkles size={24} />}
        </span>
        <span>
          <small>{effect.statType ? "Бонус к характеристике" : "Уникальное свойство"}</small>
          <strong>{statLabel ?? "Эффект чипа"}</strong>
        </span>
      </div>
      <ChipEffectText dataset={dataset} text={effect.description} value={safeValue} />
      <div className={styles.chipEffectControls}>
        <span>
          <small>Диапазон качества</small>
          <StatDiamonds value={safeValue} minimum={effect.min} maximum={effect.max} />
        </span>
        <label className={styles.chipEffectInput}>
          <span>Фактическое значение</span>
          <span>
            <input
              type="number"
              min={0}
              max={effect.max}
              step="any"
              value={safeValue}
              onChange={(event) => onChange(clamp(Number(event.target.value) || 0, 0, effect.max))}
            />
            {effect.suffix && <em>{effect.suffix}</em>}
          </span>
        </label>
      </div>
    </article>
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
        const draft = window.localStorage.getItem(DRAFT_KEY)
          ?? LEGACY_DRAFT_KEYS.map((key) => window.localStorage.getItem(key)).find(Boolean)
          ?? null;
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
  const [equipmentEditorSlot, setEquipmentEditorSlot] = useState<BuilderSlotId | null>(null);
  const [activeStatGroup, setActiveStatGroup] = useState<(typeof builderStatGroups)[number]["id"]>("physical");
  const [showSaved, setShowSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [captureTarget, setCaptureTarget] = useState<"talents" | "mastery" | null>(null);
  const [masteryFullscreen, setMasteryFullscreen] = useState(false);
  const [masteryFullscreenScale, setMasteryFullscreenScale] = useState(1);
  const talentTreeRef = useRef<HTMLDivElement>(null);
  const masteryBoardRef = useRef<HTMLDivElement>(null);
  const masteryFullscreenRef = useRef<HTMLDivElement>(null);
  const masteryViewportRef = useRef<HTMLDivElement>(null);
  const equipmentMap = useMemo(() => new Map(dataset.equipment.map((item) => [item.slug, item])), [dataset.equipment]);

  useEffect(() => {
    if (readOnly) return;
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
    LEGACY_DRAFT_KEYS.forEach((key) => window.localStorage.removeItem(key));
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

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreen = document.fullscreenElement === masteryFullscreenRef.current;
      setMasteryFullscreen(isFullscreen);
      if (!isFullscreen) setMasteryFullscreenScale(1);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!masteryFullscreen) return;
    const viewport = masteryViewportRef.current;
    if (!viewport) return;
    const updateScale = () => {
      const widthScale = Math.max(1, viewport.clientWidth - 24) / MASTERY_BOARD_WIDTH;
      const heightScale = Math.max(1, viewport.clientHeight - 24) / MASTERY_BOARD_HEIGHT;
      setMasteryFullscreenScale(clamp(Math.min(widthScale, heightScale), 0.55, 1.6));
    };
    const frame = window.requestAnimationFrame(updateScale);
    const observer = new ResizeObserver(updateScale);
    observer.observe(viewport);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [masteryFullscreen]);

  const exportTreeImage = async (
    element: HTMLDivElement | null,
    target: "talents" | "mastery",
    fileSuffix: string,
  ) => {
    if (!element || captureTarget) return;
    setCaptureTarget(target);
    element.dataset.exporting = "true";
    try {
      await waitForCaptureAssets(element);
      const width = Math.ceil(element.scrollWidth);
      const height = Math.ceil(element.scrollHeight);
      const image = await toPng(element, {
        width,
        height,
        pixelRatio: 2,
        cacheBust: true,
        includeQueryParams: true,
        skipAutoScale: true,
        backgroundColor: "#090e13",
        filter: (node) => {
          if (!(node instanceof HTMLElement)) return true;
          return node.dataset.exportIgnore !== "true"
            && !node.classList.contains(styles.progressionTooltip);
        },
      });
      const download = document.createElement("a");
      download.href = image;
      download.download = `${sanitizeImageName(state.title)}-${fileSuffix}.png`;
      download.click();
      setNotice("Изображение в высоком качестве загружено на компьютер.");
    } catch {
      setNotice("Не удалось создать изображение. Повторите попытку после загрузки всех иконок.");
    } finally {
      delete element.dataset.exporting;
      setCaptureTarget(null);
    }
  };

  const toggleMasteryFullscreen = async () => {
    const element = masteryFullscreenRef.current;
    if (!element) return;
    try {
      if (document.fullscreenElement === element) await document.exitFullscreen();
      else await element.requestFullscreen();
    } catch {
      setNotice("Браузер не разрешил открыть дерево на весь экран.");
    }
  };

  const activeSet = state.sets[state.activeSet];
  const selectedClass = dataset.classes.find((entry) => entry.slug === state.heroClass) ?? dataset.classes[0];
  const mastery = builderMasteries[state.heroClass] ?? builderMasteries.legionnary;
  const allowedArchetypes = 3;
  const selectedTalentBranches = builderArchetypes.filter((entry) => state.selectedArchetypes.includes(entry.id));
  const masteryGridNodes = useMemo(() => getMasteryGridNodes(mastery), [mastery]);
  const masteryEdges = useMemo(() => getMasteryEdges(mastery), [mastery]);

  const stats = useMemo(() => {
    const selections = [...Object.values(activeSet), ...Object.values(state.artifacts)].flatMap((selection) => {
      if (!selection) return [];
      const item = equipmentMap.get(selection.itemSlug);
      return item ? [{ item, selection }] : [];
    });
    return calculateCharacterStats({
      intrinsicStats: baseClassStats[state.heroClass] ?? baseClassStats.legionnary,
      selections,
      selectedArchetypes: state.selectedArchetypes,
    }).values;
  }, [
    activeSet,
    equipmentMap,
    state.artifacts,
    state.heroClass,
    state.selectedArchetypes,
  ]);

  const talentAllocation = Object.values(state.talentRanks).filter((rank) => rank > 0).length;
  const talentLevelPoints = Object.values(state.talentRanks).reduce((sum, rank) => sum + Math.max(0, rank - 1), 0);
  const masteryAllocation = getMasteryAllocation(state.masteryRanks);
  const masteryLevelPoints = getMasteryLevelPoints(state.masteryRanks);
  const pickerSelection = pickerSlot ? getSelection(state, pickerSlot) : null;
  const equipmentEditorSelection = equipmentEditorSlot ? getSelection(state, equipmentEditorSlot) : null;
  const equipmentEditorItem = equipmentEditorSelection
    ? equipmentMap.get(equipmentEditorSelection.itemSlug) ?? null
    : null;
  const equipmentEditorVariation = equipmentEditorItem && equipmentEditorSelection
    ? getVariation(equipmentEditorItem, equipmentEditorSelection.quality)
    : null;
  const equipmentEditorPrimaryValues = equipmentEditorVariation && equipmentEditorSelection
    ? (() => {
      const values = Object.fromEntries(equipmentEditorVariation.stats.map((stat) => [
        stat.type,
        equipmentEditorSelection.primaryStatValues[stat.type]
          ?? stat.min + (stat.max - stat.min) * (equipmentEditorSelection.roll / 100),
      ]));
      return equipmentEditorItem?.type === "weapon" && values.wd !== undefined
        ? updateWeaponPrimaryStatValues(equipmentEditorVariation.stats, values, "wd", values.wd)
        : values;
    })()
    : {};
  const artifactSecondaryLimit = getSecondaryStatLimit(
    equipmentEditorItem,
    equipmentEditorSelection?.quality ?? "uncommon",
  );
  const activeStats = builderStatGroups.find((group) => group.id === activeStatGroup)?.stats ?? builderStatGroups[0].stats;
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

  const updateArtifactSecondaryStat = (index: number, nextStat: string) => {
    if (
      !equipmentEditorSlot
      || !isArtifactSlot(equipmentEditorSlot)
      || !equipmentEditorSelection
      || equipmentEditorItem?.type !== "implant"
    ) return;
    const slots = Array.from(
      { length: artifactSecondaryLimit },
      (_, slotIndex) => equipmentEditorSelection.secondaryStats[slotIndex] ?? "",
    );
    const previousStat = slots[index] ?? "";
    slots[index] = nextStat;
    const secondaryStats = (nextStat ? slots : slots.slice(0, index))
      .filter(Boolean)
      .slice(0, artifactSecondaryLimit);
    const secondaryStatValues = Object.fromEntries(secondaryStats.map((_, slotIndex) => [
      getSecondaryStatSlotKey(slotIndex),
      slotIndex === index && previousStat !== nextStat
        ? 0
        : getSecondaryStatValue(equipmentEditorSelection, slotIndex),
    ]));
    updateSelection(equipmentEditorSlot, {
      ...equipmentEditorSelection,
      secondaryStats,
      secondaryStatValues,
    });
  };

  const updateTalentRank = (nodeId: string, direction: 1 | -1) => {
    setState((current) => {
      const archetype = builderArchetypes.find((entry) => entry.nodes.some((node) => node.id === nodeId));
      const targetNode = archetype?.nodes.find((node) => node.id === nodeId);
      if (!archetype || !targetNode || !current.selectedArchetypes.includes(archetype.id)) return current;
      const rank = current.talentRanks[nodeId] ?? 0;
      const next = clamp(rank + direction, 0, 5);
      const currentAllocation = Object.values(current.talentRanks).filter((value) => value > 0).length;
      const currentLevelPoints = Object.values(current.talentRanks).reduce((sum, value) => sum + Math.max(0, value - 1), 0);
      const rowHasAnotherTalent = archetype.nodes.some((node) => (
        node.tier === targetNode.tier
        && node.id !== nodeId
        && (current.talentRanks[node.id] ?? 0) > 0
      ));
      if (direction > 0 && rank === 0 && rowHasAnotherTalent) {
        setNotice("В одном ряду можно выбрать только один талант.");
        return current;
      }
      if (direction > 0 && rank === 0 && currentAllocation >= 15) {
        setNotice("Все 15 базовых очков талантов уже распределены.");
        return current;
      }
      if (direction > 0 && rank > 0 && currentLevelPoints >= 12) {
        setNotice("Все 12 очков улучшения талантов уже распределены.");
        return current;
      }
      const talentRanks = { ...current.talentRanks, [nodeId]: next };
      if (next === 0) delete talentRanks[nodeId];
      return { ...current, talentRanks };
    });
  };

  const learnMasteryPath = (nodeId: string) => {
    setState((current) => {
      const path = findShortestMasteryPath(nodeId, current.masteryRanks, masteryGridNodes, masteryEdges);
      if (!path) {
        setNotice("Не удалось построить путь к выбранному таланту.");
        return current;
      }
      const allocation = getMasteryAllocation(current.masteryRanks);
      if (allocation + path.cost > MASTERY_ALLOCATION_LIMIT) {
        setNotice(`Для этого пути нужно ещё ${path.cost} очк., доступно ${MASTERY_ALLOCATION_LIMIT - allocation}.`);
        return current;
      }
      const masteryRanks = { ...current.masteryRanks };
      path.nodes.forEach((node) => {
        if (!masteryRanks[node.id]) masteryRanks[node.id] = 1;
      });
      path.edges.forEach((edge) => {
        masteryRanks[getMasteryBoostId(edge, 1)] = 1;
        masteryRanks[getMasteryBoostId(edge, 2)] = 1;
      });
      setNotice(path.cost > 1
        ? `Кратчайший путь построен автоматически: распределено ${path.cost} очк.`
        : "Талант изучен.");
      return { ...current, masteryRanks };
    });
  };

  const updateMasteryRank = (
    nodeId: string,
    direction: 1 | -1,
    isFinal = false,
  ) => {
    setState((current) => {
      const rank = current.masteryRanks[nodeId] ?? 0;
      const next = clamp(rank + direction, 0, 3);
      const allocation = getMasteryAllocation(current.masteryRanks);
      const levelPoints = getMasteryLevelPoints(current.masteryRanks);
      if (direction > 0 && rank === 0 && allocation >= MASTERY_ALLOCATION_LIMIT) {
        setNotice("Все 26 очков мастерства уже распределены.");
        return current;
      }
      if (direction > 0 && rank === 0 && isFinal) {
        if (!hasMasteryFinalAccess(mastery, current.masteryRanks)) {
          setNotice("Финальные таланты откроются после изучения последнего таланта любой ветки.");
          return current;
        }
      }
      if (direction > 0 && rank === 0 && !isFinal) {
        const node = masteryGridNodes.find((entry) => entry.id === nodeId);
        if (!node || !isMasteryNodeUnlockable(node, current.masteryRanks, masteryEdges)) {
          setNotice("Используйте автоматическое изучение, чтобы проложить кратчайший путь.");
          return current;
        }
      }
      if (direction > 0 && rank > 0 && levelPoints >= MASTERY_LEVEL_LIMIT) {
        setNotice("Доступно только 2 очка дополнительного улучшения мастерства.");
        return current;
      }
      const masteryRanks = { ...current.masteryRanks, [nodeId]: next };
      if (next === 0) delete masteryRanks[nodeId];
      return {
        ...current,
        masteryRanks: next === 0 ? pruneMasteryRanks(mastery, masteryRanks) : masteryRanks,
      };
    });
  };

  const updateMasteryBoost = (edge: MasteryEdge, step: 1 | 2, direction: 1 | -1) => {
    setState((current) => {
      const boostId = getMasteryBoostId(edge, step);
      const selected = Boolean(current.masteryRanks[boostId]);
      if (direction > 0 && selected) return current;
      if (direction < 0 && !selected) return current;
      if (direction > 0 && getMasteryAllocation(current.masteryRanks) >= MASTERY_ALLOCATION_LIMIT) {
        setNotice("Все 26 очков мастерства уже распределены.");
        return current;
      }
      if (direction > 0) {
        const adjacentNodeId = step === 1 ? edge.start.id : edge.end.id;
        const otherBoostId = getMasteryBoostId(edge, step === 1 ? 2 : 1);
        if (!current.masteryRanks[adjacentNodeId] && !current.masteryRanks[otherBoostId]) {
          setNotice("Начните улучшать связь со стороны уже изученного таланта.");
          return current;
        }
      }
      const masteryRanks = { ...current.masteryRanks };
      if (direction > 0) masteryRanks[boostId] = 1;
      else delete masteryRanks[boostId];
      return { ...current, masteryRanks: pruneMasteryRanks(mastery, masteryRanks) };
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
    setNotice("Создан новый чистый билд.");
  };

  const loadBuild = (build: SavedCharacterBuild) => {
    const normalized = normalizeCharacterBuildState(build.buildData);
    if (!normalized) return;
    setState(normalized);
    setCurrentBuild({ ...build, buildData: normalized });
    setShowSaved(false);
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
      if (item.tier < 1 || item.tier > 3) return false;
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
            if (selection) {
              setEquipmentEditorSlot(slotId);
              return;
            }
            setPickerSlot(slotId);
            setPickerQuality("epic");
          }
        }}
      >
        <span className={styles.slotImage}>
          {item ? <ItemImage src={variation?.image} alt={item.name} size={54} /> : <Plus size={24} />}
        </span>
        <span className={styles.slotText}>
          <small>{slotMeta[slotId].label}</small>
          <strong>{item?.name || "Выбрать предмет"}</strong>
          {selection && (
            <em>
              {qualityLabels[selection.quality]}
              {item?.type === "implant" ? ` · ${selection.secondaryStats.length} доп. хар.` : ""}
            </em>
          )}
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
            <button className={styles.resetButton} type="button" onClick={resetBuild}>
              <RefreshCcw size={17} /> Начать заново
            </button>
          </>
        ) : null}
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
                  <p>
                    Комплект {state.activeSet === "one" ? "I" : "II"} + артефакты · расчёт v{COREPUNK_CALCULATOR_VERSION}.
                  </p>
                </div>
              </div>
              <div className={styles.statsOverview}>
                {primaryOverviewStats.map((stat) => (
                  <StatValue key={stat} stat={stat} value={stats[stat] ?? 0} dataset={dataset} />
                ))}
              </div>
              <div className={styles.statGroupTabs} role="tablist" aria-label="Группы характеристик">
                {builderStatGroups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    role="tab"
                    aria-selected={activeStatGroup === group.id}
                    className={activeStatGroup === group.id ? styles.statGroupTabActive : ""}
                    onClick={() => setActiveStatGroup(group.id)}
                  >
                    <LoadableImage src={getStatImage(dataset, group.icon)} alt="" width={21} height={21} />
                    <span>{group.label}</span>
                  </button>
                ))}
              </div>
              <div className={styles.statsGroups} role="tabpanel">
                <div className={styles.statGroup}>
                  <h3>{builderStatGroups.find((group) => group.id === activeStatGroup)?.label}</h3>
                  {activeStats.map((stat) => (
                    <StatValue key={stat} stat={stat} value={stats[stat] ?? 0} dataset={dataset} />
                  ))}
                </div>
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
        <section className={styles.panel} onContextMenu={(event) => event.preventDefault()}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}><Sparkles size={16} /> Развитие героя</span>
              <h2>Ветки талантов</h2>
              <p>Доступно веток: {allowedArchetypes}. Первый ранг расходует очко распределения, следующие — очки уровня.</p>
            </div>
            <div className={styles.panelControls}>
              <div className={styles.points}>
                <span>Распределение<strong>{talentAllocation} / 15</strong></span>
                <span>Очки уровня<strong>{talentLevelPoints} / 12</strong></span>
              </div>
              <button
                className={styles.treeActionButton}
                type="button"
                disabled={selectedTalentBranches.length === 0 || captureTarget !== null}
                onClick={() => void exportTreeImage(talentTreeRef.current, "talents", "таланты")}
              >
                <Camera size={17} />
                {captureTarget === "talents" ? "Создаём PNG…" : "Скачать дерево PNG"}
              </button>
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
                    if (readOnly || selected) return;
                    if (state.selectedArchetypes.length >= allowedArchetypes) {
                      setNotice(`Можно выбрать только ${allowedArchetypes} ветки.`);
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
          {selectedTalentBranches.length > 0 ? (
            <div className={styles.selectedTalentGrid} ref={talentTreeRef}>
              {selectedTalentBranches.map((archetype) => (
                <article
                  className={styles.selectedTalentBranch}
                  style={{ "--archetype-accent": archetype.accent } as CSSProperties}
                  key={archetype.id}
                >
                  <header className={styles.selectedTalentHeader}>
                    <LoadableImage src={archetype.simplifiedIcon} alt="" width={58} height={58} />
                    <div><h3>{archetype.name}</h3><p>{archetype.bonus}</p></div>
                    {!readOnly && (
                      <button
                        type="button"
                        data-export-ignore="true"
                        onClick={() => setState((current) => ({
                          ...current,
                          selectedArchetypes: current.selectedArchetypes.filter((id) => id !== archetype.id),
                          talentRanks: Object.fromEntries(
                            Object.entries(current.talentRanks).filter(([id]) => !id.startsWith(`${archetype.id}-`)),
                          ),
                        }))}
                        aria-label={`Удалить ветку ${archetype.name}`}
                      >
                        <X size={17} />
                      </button>
                    )}
                  </header>
                  <div className={styles.selectedTalentRows}>
                    {Array.from({ length: 5 }, (_, rowIndex) => {
                      const row = rowIndex + 1;
                      const rowNodes = archetype.nodes.filter((node) => node.tier === row);
                      const selectedInRow = rowNodes.find((node) => (state.talentRanks[node.id] ?? 0) > 0);
                      return (
                        <div className={styles.selectedTalentRow} key={row}>
                          <span>Ряд {row}</span>
                          <div>
                            {rowNodes.map((node) => {
                              const rank = state.talentRanks[node.id] ?? 0;
                              const blockedByRow = Boolean(selectedInRow && selectedInRow.id !== node.id);
                              return (
                                <article
                                  className={`${styles.talentTile}${rank ? ` ${styles.talentTileActive}` : ""}${blockedByRow ? ` ${styles.talentTileBlocked}` : ""}`}
                                  key={node.id}
                                  onContextMenu={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    if (!readOnly && rank > 0) updateTalentRank(node.id, -1);
                                  }}
                                >
                                  <button
                                    className={styles.talentTileMain}
                                    type="button"
                                    disabled={readOnly || blockedByRow || rank >= 5}
                                    onClick={() => updateTalentRank(node.id, 1)}
                                    aria-label={`${rank ? "Повысить" : "Изучить"} талант ${node.name}`}
                                  >
                                    <span className={styles.talentTileImage}>
                                      <LoadableImage src={node.icon} alt="" width={96} height={96} />
                                    </span>
                                    {rank > 0 && <span className={styles.talentRankBadge}>{rank}/5</span>}
                                  </button>
                                  {rank > 0 && !readOnly && (
                                    <div className={styles.talentTileActions} data-export-ignore="true">
                                      <button type="button" onClick={() => updateTalentRank(node.id, -1)} aria-label={`Уменьшить ранг: ${node.name}`}><Minus size={13} /></button>
                                      <button type="button" onClick={() => updateTalentRank(node.id, 1)} disabled={rank >= 5} aria-label={`Повысить ранг: ${node.name}`}><Plus size={13} /></button>
                                    </div>
                                  )}
                                  <ProgressionTooltip
                                    node={node}
                                    rank={rank}
                                    maxRank={5}
                                    scale={node.scale}
                                    position={rowIndex >= 3 ? "above" : "below"}
                                  />
                                </article>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))}
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
        <section className={`${styles.panel} ${styles.masteryPanel}`} onContextMenu={(event) => event.preventDefault()}>
          <div className={styles.panelHeading}>
            <div className={styles.masteryHeading}>
              <LoadableImage src={mastery.icon} alt="" width={72} height={72} />
              <div>
                <span className={styles.eyebrow}><BookOpenCheck size={16} /> Классовая специализация</span>
                <h2>Мастерство: {selectedClass?.name}</h2>
                <p>Базовые способности изучены сразу. Клик по удалённому таланту автоматически построит самый короткий путь по горизонтали, вертикали или диагонали и распределит оба усиления каждой связи.</p>
              </div>
            </div>
            <div className={styles.points}>
              <span>Распределение<strong>{masteryAllocation} / 26</strong></span>
              <span>Очки уровня<strong>{masteryLevelPoints} / 2</strong></span>
            </div>
          </div>

          <div className={styles.masteryLegend}>
            <span><Check size={15} /> 4 стандартные способности изучены</span>
            <span><Plus size={15} /> каждое звено даёт 1 очко характеристик способности</span>
            <span>Любой талант: 1 / 3 · глобально на улучшения: 2 очка</span>
            <span>ПКМ · отменить последнее изучение</span>
          </div>

          <div className={styles.masteryFullscreenShell} ref={masteryFullscreenRef}>
            <div className={styles.treeToolbar} data-export-ignore="true">
              <div>
                <strong>Интерактивное дерево мастерства</strong>
                <span>Прокручивайте дерево горизонтально или откройте его на весь экран.</span>
              </div>
              <div>
                <button
                  className={styles.treeActionButton}
                  type="button"
                  disabled={captureTarget !== null}
                  onClick={() => void exportTreeImage(masteryBoardRef.current, "mastery", "мастерство")}
                >
                  <Camera size={17} />
                  {captureTarget === "mastery" ? "Создаём PNG…" : "Скачать PNG"}
                </button>
                <button
                  className={styles.treeActionButton}
                  type="button"
                  aria-pressed={masteryFullscreen}
                  onClick={() => void toggleMasteryFullscreen()}
                >
                  {masteryFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                  {masteryFullscreen ? "Свернуть" : "На весь экран"}
                </button>
              </div>
            </div>
            <div className={styles.masteryViewport} ref={masteryViewportRef}>
              <div
                className={styles.masteryStage}
                style={{
                  width: masteryFullscreen ? MASTERY_BOARD_WIDTH * masteryFullscreenScale : MASTERY_BOARD_WIDTH,
                  height: masteryFullscreen ? MASTERY_BOARD_HEIGHT * masteryFullscreenScale : MASTERY_BOARD_HEIGHT,
                }}
              >
                <div
                  className={styles.masteryBoard}
                  ref={masteryBoardRef}
                  style={{
                    width: MASTERY_BOARD_WIDTH,
                    height: MASTERY_BOARD_HEIGHT,
                    transform: masteryFullscreen ? `scale(${masteryFullscreenScale})` : undefined,
                  }}
                >
              <svg
                className={styles.masteryConnections}
                viewBox={`0 0 ${MASTERY_BOARD_WIDTH} ${MASTERY_BOARD_HEIGHT}`}
                aria-hidden="true"
              >
                {mastery.branches.map((branch, row) => (
                  <line
                    className={state.masteryRanks[branch.nodes[0].id] ? styles.masteryConnectionActive : ""}
                    key={`${branch.id}-root-line`}
                    x1={MASTERY_ROOT_X}
                    y1={MASTERY_ROW_Y[row]}
                    x2={MASTERY_NODE_X[0]}
                    y2={MASTERY_ROW_Y[row]}
                    stroke={state.masteryRanks[branch.nodes[0].id] ? "#d79b50" : "#2b353e"}
                    strokeWidth={state.masteryRanks[branch.nodes[0].id] ? 2.5 : 2}
                    strokeLinecap="round"
                  />
                ))}
                {masteryEdges.map((edge) => {
                  const active = Boolean(
                    state.masteryRanks[getMasteryBoostId(edge, 1)]
                    && state.masteryRanks[getMasteryBoostId(edge, 2)],
                  );
                  return (
                    <line
                      className={active ? styles.masteryConnectionActive : ""}
                      key={`${edge.id}-line`}
                      x1={MASTERY_NODE_X[edge.start.column]}
                      y1={MASTERY_ROW_Y[edge.start.row]}
                      x2={MASTERY_NODE_X[edge.end.column]}
                      y2={MASTERY_ROW_Y[edge.end.row]}
                      stroke={active ? "#d79b50" : "#2b353e"}
                      strokeWidth={active ? 2.5 : 2}
                      strokeLinecap="round"
                    />
                  );
                })}
              </svg>

              {masteryEdges.flatMap((edge) => ([1, 2] as const).map((step) => {
                const selected = Boolean(state.masteryRanks[getMasteryBoostId(edge, step)]);
                const ratio = step === 1 ? 0.42 : 0.58;
                const left = MASTERY_NODE_X[edge.start.column]
                  + (MASTERY_NODE_X[edge.end.column] - MASTERY_NODE_X[edge.start.column]) * ratio;
                const top = MASTERY_ROW_Y[edge.start.row]
                  + (MASTERY_ROW_Y[edge.end.row] - MASTERY_ROW_Y[edge.start.row]) * ratio;
                return (
                  <button
                    className={`${styles.masteryBoost}${selected ? ` ${styles.masteryBoostActive}` : ""}`}
                    style={{ left, top }}
                    type="button"
                    key={getMasteryBoostId(edge, step)}
                    disabled={readOnly}
                    onClick={() => updateMasteryBoost(edge, step, selected ? -1 : 1)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (!readOnly && selected) updateMasteryBoost(edge, step, -1);
                    }}
                    title={`Улучшение связи: ${edge.start.name} → ${edge.end.name}`}
                    aria-label={`${selected ? "Убрать" : "Добавить"} улучшение связи`}
                  >
                    {selected ? <Check size={12} /> : <Plus size={12} />}
                  </button>
                );
              }))}

              {mastery.branches.map((branch, row) => (
                <article
                  className={styles.masteryRoot}
                  style={{ left: MASTERY_ROOT_X, top: MASTERY_ROW_Y[row] }}
                  key={branch.id}
                  tabIndex={0}
                >
                  <span className={`${styles.masteryIconButton} ${styles.masteryRootIcon}`}>
                    <LoadableImage src={branch.icon} alt="" width={104} height={104} />
                    <span className={styles.masteryRankBadge}><Check size={15} /></span>
                  </span>
                  <strong>{branch.name}</strong>
                  <small>Базовая способность</small>
                  <ProgressionTooltip
                    node={branch}
                    rank={0}
                    maxRank={1}
                    position={row >= 2 ? "rightAbove" : "right"}
                    badgeLabel="Стандартная"
                    footerText="Способность изучена по умолчанию"
                  />
                </article>
              ))}

              {masteryGridNodes.map((node) => {
                const rank = state.masteryRanks[node.id] ?? 0;
                const unlockable = isMasteryNodeUnlockable(node, state.masteryRanks, masteryEdges);
                return (
                  <article
                    className={`${styles.masteryBoardNode}${rank ? ` ${styles.masteryBoardNodeActive}` : ""}${!unlockable && !rank ? ` ${styles.masteryBoardNodeSmart}` : ""}`}
                    style={{ left: MASTERY_NODE_X[node.column], top: MASTERY_ROW_Y[node.row] }}
                    key={node.id}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (!readOnly && rank > 0) updateMasteryRank(node.id, -1);
                    }}
                  >
                    <button
                      type="button"
                      className={styles.masteryIconButton}
                      disabled={readOnly || rank >= 3}
                      onClick={() => rank > 0 ? updateMasteryRank(node.id, 1) : learnMasteryPath(node.id)}
                      aria-label={`${rank ? "Повысить" : "Изучить"} улучшение ${node.name}`}
                    >
                      <LoadableImage src={node.icon} alt="" width={78} height={78} />
                      <span className={styles.masteryRankBadge}>{rank ? `${rank}/3` : <Plus size={13} />}</span>
                    </button>
                    <strong className={styles.masteryNodeLabel}>{node.name}</strong>
                    {rank > 0 && !readOnly && (
                      <div className={styles.masteryRankActions} data-export-ignore="true">
                        <button type="button" onClick={() => updateMasteryRank(node.id, -1)} aria-label={`Уменьшить ранг: ${node.name}`}><Minus size={13} /></button>
                        <button type="button" onClick={() => updateMasteryRank(node.id, 1)} disabled={rank >= 3} aria-label={`Повысить ранг: ${node.name}`}><Plus size={13} /></button>
                      </div>
                    )}
                    <ProgressionTooltip
                      node={node}
                      rank={rank}
                      maxRank={3}
                      position={node.row >= 2 ? "above" : "below"}
                    />
                  </article>
                );
              })}

              {mastery.finals.map((node, finalIndex) => {
                const rank = state.masteryRanks[node.id] ?? 0;
                const unlockable = hasMasteryFinalAccess(mastery, state.masteryRanks);
                return (
                  <article
                    className={`${styles.masteryBoardNode} ${styles.masteryFinalNode}${rank ? ` ${styles.masteryBoardNodeActive}` : ""}${!unlockable && !rank ? ` ${styles.masteryBoardNodeLocked}` : ""}`}
                    style={{ left: MASTERY_FINAL_X, top: MASTERY_FINAL_Y[finalIndex] }}
                    key={node.id}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (!readOnly && rank > 0) updateMasteryRank(node.id, -1, true);
                    }}
                  >
                    <button
                      type="button"
                      className={`${styles.masteryIconButton} ${styles.masteryFinalIcon}`}
                      disabled={readOnly || (!unlockable && rank === 0) || rank >= 3}
                      onClick={() => updateMasteryRank(node.id, 1, true)}
                      aria-label={`${rank ? "Повысить" : "Изучить"} финальную специализацию ${node.name}`}
                    >
                      <LoadableImage src={node.icon} alt="" width={88} height={88} />
                      <span className={styles.masteryRankBadge}>{rank ? `${rank}/3` : <Plus size={13} />}</span>
                    </button>
                    <strong className={styles.masteryNodeLabel}>{node.name}</strong>
                    <small>Финал · открывается последним талантом ветки</small>
                    {rank > 0 && !readOnly && (
                      <div className={styles.masteryRankActions} data-export-ignore="true">
                        <button type="button" onClick={() => updateMasteryRank(node.id, -1, true)} aria-label={`Уменьшить ранг: ${node.name}`}><Minus size={13} /></button>
                        <button type="button" onClick={() => updateMasteryRank(node.id, 1, true)} disabled={rank >= 3} aria-label={`Повысить ранг: ${node.name}`}><Plus size={13} /></button>
                      </div>
                    )}
                    <ProgressionTooltip node={node} rank={rank} maxRank={3} position="left" />
                  </article>
                );
              })}
                </div>
              </div>
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
                  ...[1, 2, 3].map((tier) => ({ value: String(tier), label: `Тир ${tier}` })),
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
                      const sameVariation = equipped && pickerSelection?.quality === pickerQuality;
                      const secondaryLimit = getSecondaryStatLimit(item, pickerQuality);
                      const secondaryStats = equipped
                        ? (pickerSelection?.secondaryStats ?? []).slice(0, secondaryLimit || 5)
                        : [];
                      const nextSelection: BuilderItemSelection = {
                        itemSlug: item.slug,
                        quality: pickerQuality,
                        roll: equipped ? pickerSelection?.roll ?? 100 : 100,
                        secondaryStats,
                        primaryStatValues: sameVariation
                          ? pickerSelection?.primaryStatValues ?? createPrimaryStatValues(item, pickerQuality)
                          : createPrimaryStatValues(item, pickerQuality),
                        secondaryStatValues: equipped
                          ? Object.fromEntries(secondaryStats.map((_, index) => [
                            getSecondaryStatSlotKey(index),
                            pickerSelection ? getSecondaryStatValue(pickerSelection, index) : 0,
                          ]))
                          : {},
                        effectValues: sameVariation
                          ? pickerSelection?.effectValues ?? createEffectValues(item, pickerQuality)
                          : createEffectValues(item, pickerQuality),
                      };
                      updateSelection(pickerSlot, nextSelection);
                      setEquipmentEditorSlot(pickerSlot);
                      setPickerSlot(null);
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
          </section>
        </div>
      )}

      {equipmentEditorSlot && equipmentEditorSelection && equipmentEditorItem && !readOnly && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => setEquipmentEditorSlot(null)}>
          <section
            className={styles.artifactConfigModal}
            role="dialog"
            aria-modal="true"
            aria-label={`Настройка: ${equipmentEditorItem.name}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className={styles.artifactConfigHeader}>
              <div className={styles.artifactConfigIdentity}>
                <span className={styles.artifactConfigImage}>
                  <ItemImage src={equipmentEditorVariation?.image} alt={equipmentEditorItem.name} size={68} />
                </span>
                <span>
                  <small>
                    {equipmentEditorItem.type === "weapon"
                      ? "Настройка оружия"
                      : equipmentEditorItem.type === "chip"
                        ? "Настройка чипа"
                        : "Настройка артефакта"} · {slotMeta[equipmentEditorSlot].label}
                  </small>
                  <strong>{equipmentEditorItem.name}</strong>
                  <em>Тир {equipmentEditorItem.tier} · {qualityLabels[equipmentEditorSelection.quality]}</em>
                </span>
              </div>
              <button type="button" onClick={() => setEquipmentEditorSlot(null)} aria-label="Закрыть">
                <X size={22} />
              </button>
            </header>

            <div className={styles.artifactConfigBody}>
              {((equipmentEditorVariation?.stats.length ?? 0) > 0 || equipmentEditorItem.type !== "chip") && (
                <section className={styles.artifactPrimarySection}>
                  <div className={styles.artifactSectionHeading}>
                    <div>
                      <span className={styles.artifactSectionNumber}>01</span>
                      <span>
                        <strong>Основные характеристики</strong>
                        <small>Постоянные параметры выбранного предмета</small>
                      </span>
                    </div>
                    <p>Введите фактические значения — изменения сразу попадут в живой расчёт.</p>
                  </div>
                  <div className={styles.artifactPrimaryGrid}>
                    {(equipmentEditorVariation?.stats ?? []).map((stat) => (
                      <StatValueEditor
                        key={stat.type}
                        dataset={dataset}
                        stat={stat.type}
                        value={equipmentEditorPrimaryValues[stat.type]
                          ?? stat.min + (stat.max - stat.min) * (equipmentEditorSelection.roll / 100)}
                        minimum={stat.min}
                        maximum={stat.max}
                        onChange={(value) => updateSelection(equipmentEditorSlot, {
                          ...equipmentEditorSelection,
                          primaryStatValues: equipmentEditorItem.type === "weapon"
                            ? updateWeaponPrimaryStatValues(
                              equipmentEditorVariation?.stats ?? [],
                              equipmentEditorSelection.primaryStatValues,
                              stat.type,
                              value,
                            )
                            : {
                              ...equipmentEditorSelection.primaryStatValues,
                              [stat.type]: value,
                            },
                        })}
                      />
                    ))}
                    {(equipmentEditorVariation?.stats.length ?? 0) === 0 && (
                      <div className={styles.statEditorEmpty}>
                        У выбранной версии предмета нет основных характеристик.
                      </div>
                    )}
                  </div>
                </section>
              )}

              {equipmentEditorItem.type === "chip" && (
                <section className={styles.artifactSecondarySection}>
                  <div className={styles.artifactSectionHeading}>
                    <div>
                      <span className={styles.artifactSectionNumber}>
                        {(equipmentEditorVariation?.stats.length ?? 0) > 0 ? "02" : "01"}
                      </span>
                      <span>
                        <strong>Свойство чипа</strong>
                        <small>Эффект и диапазон для выбранного качества</small>
                      </span>
                    </div>
                    <p>Значение сохраняется вместе с билдом. Бонусы к характеристикам участвуют в живом расчёте.</p>
                  </div>
                  <div className={styles.chipEffectList}>
                    {(equipmentEditorVariation?.effects ?? []).map((effect) => (
                      <ChipEffectEditor
                        key={effect.id}
                        dataset={dataset}
                        effect={effect}
                        value={equipmentEditorSelection.effectValues[effect.id]
                          ?? effect.min + (effect.max - effect.min) * (equipmentEditorSelection.roll / 100)}
                        onChange={(value) => updateSelection(equipmentEditorSlot, {
                          ...equipmentEditorSelection,
                          effectValues: {
                            ...equipmentEditorSelection.effectValues,
                            [effect.id]: value,
                          },
                        })}
                      />
                    ))}
                    {(equipmentEditorVariation?.effects.length ?? 0) === 0 && (
                      <div className={styles.statEditorEmpty}>
                        Для выбранной версии чипа не найдено числового диапазона свойства.
                      </div>
                    )}
                  </div>
                </section>
              )}

              {equipmentEditorItem.type === "implant" && (
                <section className={styles.artifactSecondarySection}>
                  <div className={styles.artifactSectionHeading}>
                    <div>
                      <span className={styles.artifactSectionNumber}>02</span>
                      <span>
                        <strong>Дополнительные характеристики</strong>
                        <small>{artifactSecondaryLimit} слота для этого тира и качества</small>
                      </span>
                    </div>
                    <p>
                      {equipmentEditorItem.tier === 3
                        ? "Для артефактов 3-го тира доступно не более трёх вторичных характеристик."
                        : `${qualityLabels[equipmentEditorSelection.quality]} артефакт ${equipmentEditorItem.tier}-го тира: доступно ${artifactSecondaryLimit}.`}
                    </p>
                  </div>

                  <div className={styles.artifactSecondarySlots}>
                    {Array.from({ length: artifactSecondaryLimit }, (_, index) => {
                      const selectedStat = equipmentEditorSelection.secondaryStats[index] ?? "";
                      const options = [
                        ...(selectedStat ? [{ value: "", label: "Не выбрано" }] : []),
                        ...artifactSecondaryStatOptions
                          .map((stat) => ({
                            value: stat,
                            label: fallbackStatLabels[stat] || dataset.stats[stat]?.label || stat.toUpperCase(),
                            icon: <LoadableImage src={getStatImage(dataset, stat)} alt="" width={20} height={20} />,
                          })),
                      ];
                      const range = selectedStat ? getArtifactSecondaryRange(selectedStat) : null;
                      return (
                        <article className={styles.artifactSecondarySlot} key={index}>
                          <div className={styles.artifactSecondarySelect}>
                            <span>Доп. характеристика {index + 1}</span>
                            <CustomSelect
                              value={selectedStat}
                              options={options}
                              onChange={(value) => updateArtifactSecondaryStat(index, value)}
                              placeholder="Выберите характеристику"
                              ariaLabel={`Дополнительная характеристика ${index + 1}`}
                              disabled={index > 0 && !equipmentEditorSelection.secondaryStats[index - 1]}
                              size="regular"
                            />
                          </div>
                          {selectedStat ? (
                            <StatValueEditor
                              dataset={dataset}
                              stat={selectedStat}
                              value={getSecondaryStatValue(equipmentEditorSelection, index)}
                              minimum={range?.minimum ?? 0}
                              maximum={range?.maximum ?? 100}
                              onChange={(value) => updateSelection(equipmentEditorSlot, {
                                ...equipmentEditorSelection,
                                secondaryStatValues: {
                                  ...equipmentEditorSelection.secondaryStatValues,
                                  [getSecondaryStatSlotKey(index)]: value,
                                },
                              })}
                            />
                          ) : (
                            <div className={styles.artifactSecondaryPlaceholder}>
                              После выбора характеристики здесь появятся значение и ромбы качества.
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>

            <footer className={styles.artifactConfigFooter}>
              <div>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => {
                    setPickerSlot(equipmentEditorSlot);
                    setPickerQuality(equipmentEditorSelection.quality);
                    setEquipmentEditorSlot(null);
                  }}
                >
                  <RefreshCcw size={17} /> Выбрать другой
                </button>
                <button
                  className={styles.textButton}
                  type="button"
                  onClick={() => {
                    updateSelection(equipmentEditorSlot, null);
                    setEquipmentEditorSlot(null);
                  }}
                >
                  <Trash2 size={16} /> Снять {equipmentEditorItem.type === "weapon" ? "оружие" : equipmentEditorItem.type === "chip" ? "чип" : "артефакт"}
                </button>
              </div>
              <span>Все параметры сохраняются вместе с билдом.</span>
              <button className={styles.primaryButton} type="button" onClick={() => setEquipmentEditorSlot(null)}>
                <Check size={17} /> Готово
              </button>
            </footer>
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
                    <div><strong>{build.title}</strong><span>{classEntry?.name || build.heroClass}</span><small>Обновлено {new Date(build.updatedAt).toLocaleString("ru-RU")}</small></div>
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
