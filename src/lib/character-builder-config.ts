export type BuilderTalentNode = {
  id: string;
  name: string;
  description: string;
  tier: number;
  icon: string;
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

const talentPatterns = [
  ["Точный расчёт", "Усиливает ключевое преимущество ветки."],
  ["Боевой ритм", "Помогает поддерживать темп в затяжном сражении."],
  ["Тактическое превосходство", "Даёт дополнительный эффект в решающий момент."],
] as const;

function createTalentNodes(archetypeId: string, prefix: string, effect: string): BuilderTalentNode[] {
  return Array.from({ length: 15 }, (_, index) => {
    const tier = Math.floor(index / 3) + 1;
    const variant = index % 3 + 1;
    const pattern = talentPatterns[index % talentPatterns.length];
    return {
      id: `${archetypeId}-${index + 1}`,
      name: tier === 5 ? `${pattern[0]}: вершина` : `${pattern[0]} ${tier}.${variant}`,
      description: `${pattern[1]} ${effect} Максимум 5 рангов.`,
      tier,
      icon: `/corepunk/builder/talents/${archetypeId}/${prefix}${tier}v${variant}.png`,
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
  nodes: createTalentNodes(definition[0], definition[8], definition[7]),
}));

export type BuilderMasteryNode = {
  id: string;
  name: string;
  description: string;
  icon: string;
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
  branches: string[];
  finals: string[];
};

const masteryDefinitions: Record<string, MasteryDefinition> = {
  legionnary: {
    prefix: "WAR_S1",
    branches: ["Удар щитом", "Катапульта", "Бросок копья", "Железная кожа"],
    finals: ["Стойкая жизненная сила", "Защитная жертва"],
  },
  shaman: {
    prefix: "WAR_S3",
    branches: ["Растерзать", "Тотемная ярость", "Удар молнии", "Стихийное мастерство"],
    finals: ["Зов дикой природы", "Духовное единение"],
  },
  "blast-medic": {
    prefix: "BOM_S1",
    branches: ["Прыгающая бомба", "Генератор щита", "Голографический двойник", "Адаптивное усиление"],
    finals: ["Многофункциональный дрон", "Полевой хирург"],
  },
  infiltrator: {
    prefix: "BOM_S3",
    branches: ["Камуфляж", "Бросок мины", "Ковровая бомбардировка", "Грань убийцы"],
    finals: ["Уличное насилие", "Беззвучный приговор"],
  },
  ranger: {
    prefix: "CHA_S2",
    branches: ["Выстрел сетью", "Град стрел", "Стойка охотника", "Гарпунные стрелы"],
    finals: ["Сальтация", "Идеальная засада"],
  },
  destroyer: {
    prefix: "CHA_S1",
    branches: ["Рывок", "Круговой удар", "Боевой клич", "Боевое безумие"],
    finals: ["Сокрушающий прыжок", "Живая машина"],
  },
  defender: {
    prefix: "CHA_S3",
    branches: ["Удар чемпиона", "Бросок щита", "Штурм", "Авангард"],
    finals: ["Встаньте за мной", "Последняя крепость"],
  },
};

const masteryNodeNames = ["Мощь", "Темп", "Эффективность", "Контроль", "Синергия"];
const masteryKeys = ["Q", "W", "E", "T"] as const;

function createMastery(classSlug: string, definition: MasteryDefinition): BuilderMasteryConfig {
  const assetRoot = "/corepunk/builder/masteries";
  return {
    classSlug,
    icon: `${assetRoot}/${definition.prefix}.png`,
    branches: definition.branches.map((branchName, branchIndex) => {
      const key = masteryKeys[branchIndex];
      return {
        id: `${classSlug}-branch-${branchIndex + 1}`,
        rootId: `${classSlug}-branch-${branchIndex + 1}-root`,
        name: branchName,
        description: `Развивает способность «${branchName}» и открывает новые боевые взаимодействия.`,
        icon: `${assetRoot}/${definition.prefix}_${key}.png`,
        nodes: masteryNodeNames.map((name, index) => ({
          id: `${classSlug}-mastery-${branchIndex + 1}-${index + 1}`,
          name,
          description: `Улучшение ${index + 1} для способности «${branchName}».`,
          icon: `${assetRoot}/${definition.prefix}_${key}${index + 1}.png`,
        })),
      };
    }),
    finals: definition.finals.map((name, index) => ({
      id: `${classSlug}-final-${index + 1}`,
      name,
      description: "Финальная специализация класса. Открывается после 20 очков распределения мастерства.",
      icon: `${assetRoot}/${definition.prefix}_R${index + 1}.png`,
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
