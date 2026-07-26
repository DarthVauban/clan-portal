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
  legionnary: { ap: 10, sp: 0, health: 3583, mana: 875, armor: 60, mr: 40, wd: 0, as: 0.7, hasp: 0, ms: 3.9 },
  shaman: { ap: 10, sp: 0, health: 3527, mana: 927, armor: 60, mr: 45, wd: 0, as: 1.5, hasp: 0, ms: 3.9 },
  ranger: { ap: 10, sp: 0, health: 3198, mana: 875, armor: 40, mr: 40, wd: 0, as: 0.7, hasp: 0, ms: 3.9 },
  "blast-medic": { ap: 10, sp: 0, health: 3171, mana: 1029, armor: 40, mr: 50, wd: 0, as: 0.6, hasp: 0, ms: 3.9 },
  infiltrator: { ap: 10, sp: 0, health: 3477, mana: 927, armor: 55, mr: 40, wd: 0, as: 1.1, hasp: 0, ms: 3.9 },
  destroyer: { ap: 10, sp: 0, health: 3328, mana: 875, armor: 50, mr: 50, wd: 0, as: 0.5, hasp: 0, ms: 3.9 },
  defender: { ap: 10, sp: 0, health: 3530, mana: 875, armor: 55, mr: 45, wd: 0, as: 0.7, hasp: 0, ms: 3.9 },
};

export const builderStatGroups = [
  {
    id: "physical",
    label: "Физическая атака",
    icon: "ap",
    stats: ["wd", "ap", "as", "asrating", "pcc", "pcp", "fppen", "ppen", "increase", "bleed"],
  },
  {
    id: "magical",
    label: "Магическая атака",
    icon: "sp",
    stats: ["sp", "cast", "mcc", "mcp", "fmpen", "mpen", "corruption"],
  },
  {
    id: "protective",
    label: "Защита",
    icon: "armor",
    stats: ["armor", "mr", "slowres", "ccres", "pdecrease", "mdecrease"],
  },
  {
    id: "main",
    label: "Основные параметры",
    icon: "health",
    stats: ["health", "mana", "ms", "cd", "costred"],
  },
  {
    id: "treatment",
    label: "Исцеление",
    icon: "hasp",
    stats: ["hasp", "lifesteal", "abilitysteal", "haspincrease", "hregen", "mregen"],
  },
  {
    id: "resources",
    label: "Особые параметры",
    icon: "sbc",
    stats: ["sbc", "sbp", "mdr", "madr", "vr"],
  },
] as const;

export const fallbackStatLabels: Record<string, string> = {
  health: "Здоровье",
  mana: "Мана",
  armor: "Броня",
  mr: "Маг. Защ",
  wd: "Урон оружия",
  pcp: "Сила физического критического удара",
  pcc: "Шанс физического критического удара",
  ppen: "Физическое пробивание",
  as: "Скорость атаки",
  asrating: "Очки скорости атаки",
  sp: "Сила умений",
  mcp: "Сила магического критического удара",
  mcc: "Шанс магического критического удара",
  mpen: "Магическое пробивание",
  hasp: "Сила лечения и щитов",
  ap: "Сила атаки",
  bleed: "Шанс кровотечения",
  fppen: "Фиксированное физическое пробивание",
  fmpen: "Фиксированное магическое пробивание",
  cast: "Скорость применения способностей",
  increase: "Увеличение исходящего урона",
  corruption: "Шанс порчи",
  slowres: "Сопротивление замедлению",
  ccres: "Стойкость",
  pdecrease: "Снижение физического урона",
  mdecrease: "Снижение магического урона",
  ms: "Скорость передвижения",
  cd: "Сокращение перезарядки",
  costred: "Снижение стоимости способностей",
  lifesteal: "Вампиризм",
  abilitysteal: "Вампиризм способностей",
  haspincrease: "Усиление лечения и щитов",
  hregen: "Регенерация здоровья",
  mregen: "Регенерация маны",
  sbc: "Шанс блока щитом",
  sbp: "Сила блока щитом",
  mdr: "Поглощение магического урона",
  madr: "Снижение урона основной атаки",
  vr: "Дальность обзора",
  aggro: "Генерация угрозы",
  acpc: "Шанс дополнительной основной атаки",
  ccd: "Длительность эффектов контроля",
  mchc: "Очки шанса магического критического удара",
};
