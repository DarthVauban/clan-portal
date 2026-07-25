export type BuilderTalentNode = {
  id: string;
  name: string;
  description: string;
  tier: number;
};

export type BuilderArchetype = {
  id: string;
  name: string;
  accent: string;
  description: string;
  passiveStat: string;
  passivePerRank: number;
  nodes: BuilderTalentNode[];
};

const talentPatterns = [
  ["Точний розрахунок", "Підсилює головну перевагу архетипу."],
  ["Бойовий ритм", "Підтримує темп під час тривалого бою."],
  ["Тактична перевага", "Дає додатковий ефект у вирішальний момент."],
] as const;

function createTalentNodes(archetypeId: string, effect: string): BuilderTalentNode[] {
  return Array.from({ length: 15 }, (_, index) => {
    const tier = Math.floor(index / 3) + 1;
    const pattern = talentPatterns[index % talentPatterns.length];
    return {
      id: `${archetypeId}-${index + 1}`,
      name: tier === 5 ? `${pattern[0]}: вершина` : `${pattern[0]} ${tier}`,
      description: `${pattern[1]} ${effect} Максимум 5 рангів.`,
      tier,
    };
  });
}

const archetypeDefinitions = [
  ["assassin", "Вбивця", "#e0566f", "Вибухова шкода та добивання ослаблених цілей.", "pcc", 2, "Підвищує критичний потенціал."],
  ["sharpshooter", "Стрілець", "#db9f46", "Точність, дистанція та стабільна фізична шкода.", "wd", 2, "Покращує шкоду зброї."],
  ["guardian", "Охоронець", "#5b91d7", "Захист, контроль і витривалість у першій лінії.", "armor", 3, "Посилює броню."],
  ["warlock", "Чаклун", "#9a72d8", "Магічний тиск і тривалі негативні ефекти.", "sp", 2, "Підсилює силу здібностей."],
  ["duelist", "Дуелянт", "#d16f50", "Мобільність, атаки серіями та перевага один на один.", "as", 1.5, "Підвищує швидкість атак."],
  ["medic", "Медик", "#5ebc91", "Лікування, підтримка та стійкість команди.", "health", 8, "Збільшує запас здоров’я."],
  ["trickster", "Трикстер", "#58abc0", "Маневри, перезарядка та контроль простору.", "hasp", 2, "Прискорює здібності."],
  ["berserker", "Берсерк", "#d25d42", "Агресивний розмін здоров’я на постійний тиск.", "pcp", 2, "Підсилює фізичну міць."],
] as const;

export const builderArchetypes: BuilderArchetype[] = archetypeDefinitions.map((definition) => ({
  id: definition[0],
  name: definition[1],
  accent: definition[2],
  description: definition[3],
  passiveStat: definition[4],
  passivePerRank: definition[5],
  nodes: createTalentNodes(definition[0], definition[6]),
}));

export type BuilderMasteryBranch = {
  id: string;
  name: string;
  description: string;
  nodes: Array<{ id: string; name: string; description: string }>;
};

export type BuilderMasteryConfig = {
  classSlug: string;
  branches: BuilderMasteryBranch[];
  finals: Array<{ id: string; name: string; description: string }>;
};

const masteryNames: Record<string, { branches: string[]; finals: string[] }> = {
  legionnary: {
    branches: ["Удар щитом", "Катапульта", "Кидок списа", "Залізна шкіра"],
    finals: ["Майстер метання", "Незламний бастіон"],
  },
  shaman: {
    branches: ["Розірвати", "Тотемна лють", "Удар блискавки", "Стихійна майстерність"],
    finals: ["Злиття духів", "Посилена форма вовка"],
  },
  ranger: {
    branches: ["Влучний постріл", "Капкан", "Шквал", "Мисливський інстинкт"],
    finals: ["Хижак", "Майстер засідок"],
  },
  "blast-medic": {
    branches: ["Імпульс", "Польова терапія", "Реактор", "Захисне поле"],
    finals: ["Бойовий хірург", "Надпровідність"],
  },
  infiltrator: {
    branches: ["Тіньовий крок", "Засідка", "Димова завіса", "Смертельна точність"],
    finals: ["Примарний клинок", "Безшумний вирок"],
  },
  destroyer: {
    branches: ["Силовий удар", "Розлом", "Бойовий клич", "Нестримність"],
    finals: ["Жива зброя", "Руйнівна хвиля"],
  },
  defender: {
    branches: ["Провокація", "Щитова стіна", "Перехоплення", "Непохитність"],
    finals: ["Командир авангарду", "Остання фортеця"],
  },
};

function createMastery(classSlug: string, names: { branches: string[]; finals: string[] }): BuilderMasteryConfig {
  return {
    classSlug,
    branches: names.branches.map((branchName, branchIndex) => ({
      id: `${classSlug}-branch-${branchIndex + 1}`,
      name: branchName,
      description: `Розвиває здібність «${branchName}» та відкриває нові бойові взаємодії.`,
      nodes: Array.from({ length: 6 }, (_, index) => ({
        id: `${classSlug}-mastery-${branchIndex + 1}-${index + 1}`,
        name: ["Потужність", "Темп", "Ефективність", "Контроль", "Синергія", "Майстерність"][index],
        description: `Покращення ${index + 1} для «${branchName}». Перший ранг витрачає очко розподілу, другий — очко рівня.`,
      })),
    })),
    finals: names.finals.map((name, index) => ({
      id: `${classSlug}-final-${index + 1}`,
      name,
      description: "Фінальна спеціалізація класу. Відкривається після 20 очок розподілу майстерності.",
    })),
  };
}

export const builderMasteries = Object.fromEntries(
  Object.entries(masteryNames).map(([classSlug, names]) => [classSlug, createMastery(classSlug, names)]),
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
  { id: "vitality", label: "Виживання", stats: ["health", "mana", "armor", "mr"] },
  { id: "physical", label: "Фізична атака", stats: ["wd", "pcp", "pcc", "ppen", "as"] },
  { id: "magical", label: "Магічна атака", stats: ["sp", "mcp", "mcc", "mpen", "hasp"] },
  { id: "utility", label: "Додаткові", stats: ["ap", "bleed", "fppen", "fmpen"] },
] as const;

export const fallbackStatLabels: Record<string, string> = {
  health: "Здоров’я",
  mana: "Мана",
  armor: "Броня",
  mr: "Магічний опір",
  wd: "Шкода зброї",
  pcp: "Фізична міць",
  pcc: "Шанс фіз. криту",
  ppen: "Фізичне пробиття",
  as: "Швидкість атаки",
  sp: "Сила здібностей",
  mcp: "Магічна міць",
  mcc: "Шанс маг. криту",
  mpen: "Магічне пробиття",
  hasp: "Прискорення здібностей",
  ap: "Сила атаки",
  bleed: "Кровотеча",
  fppen: "Плоске фіз. пробиття",
  fmpen: "Плоске маг. пробиття",
};
