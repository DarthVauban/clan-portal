export type CorepunkClass = {
  slug: string;
  name: string;
  family: string;
  image: string;
  available: boolean;
};

export const corepunkClasses: CorepunkClass[] = [
  { slug: "legionnary", name: "Легионер", family: "Вармонгер", image: "/game-assets/classes/legionnary.png", available: true },
  { slug: "shaman", name: "Шаман", family: "Вармонгер", image: "/game-assets/classes/shaman.png", available: true },
  { slug: "commando", name: "Коммандос", family: "Вармонгер", image: "/game-assets/classes/commando.png", available: false },
  { slug: "blast-medic", name: "Взрывной медик", family: "Бомбер", image: "/game-assets/classes/blast-medic.png", available: true },
  { slug: "infiltrator", name: "Инфильтратор", family: "Бомбер", image: "/game-assets/classes/infiltrator.png", available: true },
  { slug: "grenadier", name: "Гренадер", family: "Бомбер", image: "/game-assets/classes/grenadier.png", available: false },
  { slug: "ranger", name: "Рейнджер", family: "Чемпион", image: "/game-assets/classes/ranger.png", available: true },
  { slug: "destroyer", name: "Разрушитель", family: "Чемпион", image: "/game-assets/classes/destroyer.png", available: true },
  { slug: "defender", name: "Защитник", family: "Чемпион", image: "/game-assets/classes/defender.png", available: true },
  { slug: "hand-of-the-light", name: "Длань света", family: "Паладин", image: "/game-assets/classes/hand-of-the-light.png", available: false },
  { slug: "cleric", name: "Клирик", family: "Паладин", image: "/game-assets/classes/cleric.png", available: false },
  { slug: "crusader", name: "Крестоносец", family: "Паладин", image: "/game-assets/classes/crusader.png", available: false },
  { slug: "sniper", name: "Снайпер", family: "Наёмник", image: "/game-assets/classes/sniper.png", available: false },
  { slug: "berserk", name: "Берсерк", family: "Наёмник", image: "/game-assets/classes/berserk.png", available: false },
  { slug: "engineer", name: "Инженер", family: "Наёмник", image: "/game-assets/classes/engineer.png", available: false },
  { slug: "pyromancer", name: "Пиромант", family: "Жнец боли", image: "/game-assets/classes/pyromancer.png", available: false },
  { slug: "soul-eater", name: "Пожиратель душ", family: "Жнец боли", image: "/game-assets/classes/soul-eater.png", available: false },
  { slug: "warlock", name: "Чернокнижник", family: "Жнец боли", image: "/game-assets/classes/warlock.png", available: false },
];

export const corepunkClassesBySlug = new Map(corepunkClasses.map((heroClass) => [heroClass.slug, heroClass]));
