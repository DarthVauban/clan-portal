import progressionSource from "@/data/character-builder-progression.ru.json";

export type BuilderProgressionScale = Record<string, string>;

export type BuilderTalentNode = {
  id: string;
  name: string;
  description: string;
  tier: number;
  icon: string;
  scale: BuilderProgressionScale[];
};

export type BuilderArchetype = {
  id: string;
  name: string;
  accent: string;
  description: string;
  bonus: string;
  icon: string;
  simplifiedIcon: string;
  passiveStat: string;
  passivePerRank: number;
  nodes: BuilderTalentNode[];
};

type RawTalent = {
  id: string;
  name: string;
  description: string;
  category: string;
  scale: Array<Record<string, string>>;
};

type RawMasteryUpgrade = {
  description: string;
  values: Array<string | number>;
};

type RawMasteryNode = {
  name: string;
  description: string;
  upgrades?: {
    half?: RawMasteryUpgrade[];
    full?: RawMasteryUpgrade[];
  };
};

type RawMasterySkill = {
  name: string;
  description: string;
  nodes: RawMasteryNode[];
};

type ProgressionSource = {
  talents: RawTalent[];
  masteries: Record<string, {
    skills: Record<"q" | "w" | "e" | "t" | "r", RawMasterySkill>;
  }>;
};

const progressionData = progressionSource as unknown as ProgressionSource;

function getTalentPosition(id: string) {
  const match = id.match(/(\d+)v(\d+)$/);
  return {
    tier: Number(match?.[1] ?? 1),
    variant: Number(match?.[2] ?? 1),
  };
}

function createTalentNodes(archetypeId: string, prefix: string): BuilderTalentNode[] {
  return progressionData.talents
    .filter((talent) => talent.category === archetypeId)
    .sort((left, right) => {
      const leftPosition = getTalentPosition(left.id);
      const rightPosition = getTalentPosition(right.id);
      return leftPosition.tier - rightPosition.tier || leftPosition.variant - rightPosition.variant;
    })
    .map((talent, index) => {
      const { tier, variant } = getTalentPosition(talent.id);
      return {
        id: `${archetypeId}-${index + 1}`,
        name: talent.name,
        description: talent.description,
        tier,
        icon: `/corepunk/builder/talents/${archetypeId}/${prefix}${tier}v${variant}.png`,
        scale: talent.scale,
      };
    });
}

const archetypeDefinitions = [
  ["warrior", "Воин", "#df5a54", "Прямой урон и уверенное давление в открытом бою.", "+5% к урону", "wd", 1, "Повышает общий урон.", "w"],
  ["tank", "Танк", "#e0ad3f", "Выживаемость, контроль угрозы и защита первой линии.", "+10% здоровья · +50% угрозы", "health", 8, "Увеличивает запас здоровья.", "t"],
  ["mage", "Маг", "#9169d9", "Магический урон, контроль и эффективное использование маны.", "+10% к мане", "mana", 6, "Повышает магический потенциал.", "m"],
  ["assassin", "Убийца", "#5e9adf", "Критические атаки, добивание и снижение собственной угрозы.", "+5% к крит. шансу · −20% угрозы", "pcc", 1, "Повышает критический потенциал.", "as"],
  ["hunter", "Охотник", "#69a849", "Темп стрельбы, дистанция и постоянное давление.", "+10% к скорости атаки", "as", 1, "Ускоряет атаки.", "ar"],
  ["medic", "Медик", "#3bc0ca", "Лечение, щиты и устойчивость всей группы.", "+10% к лечению и силе щитов", "health", 6, "Усиливает поддержку команды.", "h"],
  ["pathfinder", "Следопыт", "#c78b49", "Автономность, восстановление и контроль пространства.", "+2% регенерации здоровья вне группы", "health", 4, "Повышает самостоятельность.", "p"],
  ["support", "Поддержка", "#58c782", "Мобильность, усиление союзников и темп команды.", "+5% к скорости передвижения", "hasp", 1, "Ускоряет боевой цикл.", "s"],
] as const;

export const builderArchetypes: BuilderArchetype[] = archetypeDefinitions.map((definition) => ({
  id: definition[0],
  name: definition[1],
  accent: definition[2],
  description: definition[3],
  bonus: definition[4],
  icon: `/corepunk/builder/talents/icons/${definition[0]}.png`,
  simplifiedIcon: `/corepunk/builder/talents/icons/${definition[0]}_simplified.png`,
  passiveStat: definition[5],
  passivePerRank: definition[6],
  nodes: createTalentNodes(definition[0], definition[8]),
}));

export type BuilderMasteryNode = {
  id: string;
  name: string;
  description: string;
  icon: string;
  rankDetails: RawMasteryUpgrade[];
  rankThreeBonus: string | null;
};

export type BuilderMasteryBranch = {
  id: string;
  rootId: string;
  name: string;
  description: string;
  icon: string;
  nodes: BuilderMasteryNode[];
};

export type BuilderMasteryConfig = {
  classSlug: string;
  icon: string;
  branches: BuilderMasteryBranch[];
  finals: BuilderMasteryNode[];
};

type MasteryDefinition = {
  prefix: string;
};

const masteryDefinitions: Record<string, MasteryDefinition> = {
  legionnary: { prefix: "WAR_S1" },
  shaman: { prefix: "WAR_S3" },
  "blast-medic": { prefix: "BOM_S1" },
  infiltrator: { prefix: "BOM_S3" },
  ranger: { prefix: "CHA_S2" },
  destroyer: { prefix: "CHA_S1" },
  defender: { prefix: "CHA_S3" },
};

const masteryKeys = ["q", "w", "e", "t"] as const;

function createMastery(classSlug: string, definition: MasteryDefinition): BuilderMasteryConfig {
  const assetRoot = "/corepunk/builder/masteries";
  const source = progressionData.masteries[classSlug];
  return {
    classSlug,
    icon: `${assetRoot}/${definition.prefix}.png`,
    branches: masteryKeys.map((sourceKey, branchIndex) => {
      const sourceBranch = source.skills[sourceKey];
      const assetKey = sourceKey.toUpperCase();
      return {
        id: `${classSlug}-branch-${branchIndex + 1}`,
        rootId: `${classSlug}-branch-${branchIndex + 1}-root`,
        name: sourceBranch.name,
        description: sourceBranch.description,
        icon: `${assetRoot}/${definition.prefix}_${assetKey}.png`,
        nodes: sourceBranch.nodes.map((node, index) => ({
          id: `${classSlug}-mastery-${branchIndex + 1}-${index + 1}`,
          name: node.name,
          description: node.description,
          icon: `${assetRoot}/${definition.prefix}_${assetKey}${index + 1}.png`,
          rankDetails: node.upgrades?.half ?? [],
          rankThreeBonus: node.upgrades?.full?.[0]?.description ?? null,
        })),
      };
    }),
    finals: source.skills.r.nodes.map((node, index) => ({
      id: `${classSlug}-final-${index + 1}`,
      name: node.name,
      description: node.description,
      icon: `${assetRoot}/${definition.prefix}_R${index + 1}.png`,
      rankDetails: node.upgrades?.half ?? [],
      rankThreeBonus: node.upgrades?.full?.[0]?.description ?? null,
    })),
  };
}

export const builderMasteries = Object.fromEntries(
  Object.entries(masteryDefinitions).map(([classSlug, definition]) => [classSlug, createMastery(classSlug, definition)]),
) as Record<string, BuilderMasteryConfig>;

export const baseClassStats: Record<string, Record<string, number>> = {
  legionnary: { health: 640, mana: 280, armor: 32, mr: 18, wd: 36, sp: 12, as: 100, hasp: 0 },
  shaman: { health: 500, mana: 480, armor: 15, mr: 28, wd: 24, sp: 38, as: 96, hasp: 0 },
  ranger: { health: 510, mana: 320, armor: 19, mr: 18, wd: 42, sp: 14, as: 106, hasp: 0 },
  "blast-medic": { health: 550, mana: 430, armor: 20, mr: 25, wd: 25, sp: 34, as: 98, hasp: 2 },
  infiltrator: { health: 490, mana: 300, armor: 17, mr: 17, wd: 44, sp: 18, as: 110, hasp: 0 },
  destroyer: { health: 610, mana: 260, armor: 27, mr: 16, wd: 47, sp: 10, as: 96, hasp: 0 },
  defender: { health: 680, mana: 300, armor: 36, mr: 23, wd: 32, sp: 16, as: 94, hasp: 0 },
};

export const builderStatGroups = [
  { id: "vitality", label: "Выживание", stats: ["health", "mana", "armor", "mr"] },
  { id: "physical", label: "Физическая атака", stats: ["wd", "pcp", "pcc", "ppen", "as"] },
  { id: "magical", label: "Магическая атака", stats: ["sp", "mcp", "mcc", "mpen", "hasp"] },
  { id: "utility", label: "Дополнительные", stats: ["ap", "bleed", "fppen", "fmpen"] },
] as const;

export const fallbackStatLabels: Record<string, string> = {
  health: "Здоровье",
  mana: "Мана",
  armor: "Броня",
  mr: "Магическое сопротивление",
  wd: "Урон оружия",
  pcp: "Физическая мощь",
  pcc: "Шанс физ. крита",
  ppen: "Физическое пробитие",
  as: "Скорость атаки",
  sp: "Сила способностей",
  mcp: "Магическая мощь",
  mcc: "Шанс маг. крита",
  mpen: "Магическое пробитие",
  hasp: "Ускорение способностей",
  ap: "Сила атаки",
  bleed: "Кровотечение",
  fppen: "Плоское физ. пробитие",
  fmpen: "Плоское маг. пробитие",
};
