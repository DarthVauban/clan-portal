export type QuestChainNode = {
  slug: string;
  name: string;
  level: number;
  questGiver: string;
  location: string;
  isShared: boolean;
  children: QuestChainNode[];
};

export type QuestChain = {
  rootSlug: string;
  size: number;
  maxDepth: number;
  minLevel: number;
  maxLevel: number;
  tree: QuestChainNode;
};

export type QuestGoalReference = {
  id: number;
  slug: string;
  type: string;
};

export type QuestGoal = {
  id: number;
  type: string;
  quantity: number;
  description: string;
  target: QuestGoalReference | null;
  item: QuestGoalReference | null;
};

export type QuestRewardItem = {
  id: number;
  quantity: number;
  guaranteed: boolean;
  dropChance: number;
  item: string;
  type: string;
  recipe: string | null;
};

export type QuestRewardGroup = {
  id: number;
  pickOne: boolean;
  items: QuestRewardItem[];
};

export type QuestRewards = {
  id: number;
  gold: number;
  xp: number;
  itemGroups: QuestRewardGroup[];
  items: QuestRewardItem[];
};

export type QuestRewardStatsSummary = {
  questsWithRewards: number;
  totalRewardEntries: number;
  uniqueItems: number;
  guaranteedCount: number;
  chanceCount: number;
  totalGold: number;
  totalXp: number;
  hasEconomyData: boolean;
};

export type QuestRewardTypeStat = {
  type: string;
  uniqueItems: number;
  entryCount: number;
};

export type QuestRewardItemStat = {
  item: string;
  type: string;
  questCount: number;
  totalQuantity: number;
};

export type QuestRecipeRewardStat = {
  item: string;
  type: string;
  recipe: string;
  questCount: number;
};

export type QuestRewardStats = {
  summary: QuestRewardStatsSummary;
  topItems: QuestRewardItemStat[];
  byType: QuestRewardTypeStat[];
  recipes: QuestRecipeRewardStat[];
};

export type CorepunkQuest = {
  id: number;
  documentId: string;
  name: string;
  slug: string;
  level: number;
  description: string;
  voice: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  prerequisiteQuests: string[];
  questGiver: string;
  questFinisher: string;
  location: string;
  goals: QuestGoal[];
  rewards: QuestRewards | null;
};

export type RelatedNpc = {
  id: number;
  name: string;
  slug: string;
  title: string | null;
  description: string | null;
  location: string | null;
  position: number[] | null;
};

export type RelatedItem = {
  id: number;
  name: string;
  slug: string;
  quality: string;
  type: string;
  level: number;
  tier: number;
  description: string;
  descriptionEffect: string;
};

export type CorepunkQuestDataset = {
  schemaVersion: number;
  source: {
    page: string;
    chainsApi: string;
    catalogApi: string;
    questApi: string;
    rewardStatsApi: string;
    npcApi: string;
    itemApi: string;
    scrapedAt: string;
    language: string;
  };
  counts: {
    chains: number;
    quests: number;
    npcs: number;
    items: number;
    unresolvedNpcs: number;
    unresolvedItems: number;
  };
  chains: QuestChain[];
  quests: CorepunkQuest[];
  rewardStats: QuestRewardStats;
  npcs: Record<string, RelatedNpc>;
  items: Record<string, RelatedItem>;
};

export type LocalizedQuestChainNode = Omit<QuestChainNode, "children"> & {
  nameEn: string;
  locationEn: string;
  questGiverName: string;
  questGiverNameEn: string;
  children: LocalizedQuestChainNode[];
};

export type LocalizedQuestChain = Omit<QuestChain, "tree"> & {
  tree: LocalizedQuestChainNode;
};

export type LocalizedQuestGoal = QuestGoal & {
  descriptionEn: string;
  targetName: string | null;
  targetNameEn: string | null;
  itemName: string | null;
  itemNameEn: string | null;
};

export type LocalizedRewardItem = QuestRewardItem & {
  name: string;
  nameEn: string;
  description: string;
  quality: string;
  tier: number;
  image: string;
  fallbackImage: string;
};

export type LocalizedRewardGroup = Omit<QuestRewardGroup, "items"> & {
  items: LocalizedRewardItem[];
};

export type LocalizedQuestRewards = Omit<QuestRewards, "itemGroups" | "items"> & {
  itemGroups: LocalizedRewardGroup[];
  items: LocalizedRewardItem[];
};

export type QuestLink = {
  slug: string;
  name: string;
  nameEn: string;
  level: number;
};

export type LocalizedQuest = Omit<CorepunkQuest, "goals" | "rewards" | "name" | "description" | "voice" | "location"> & {
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  voice: string;
  voiceEn: string;
  location: string;
  locationEn: string;
  questGiverName: string;
  questGiverNameEn: string;
  questFinisherName: string;
  questFinisherNameEn: string;
  goals: LocalizedQuestGoal[];
  rewards: LocalizedQuestRewards | null;
  prerequisites: QuestLink[];
  unlocks: QuestLink[];
};

export type QuestDirectory = {
  quests: LocalizedQuest[];
  locations: string[];
  levels: number[];
  questsWithRewards: number;
};

export type LocalizedQuestRewardItemStat = QuestRewardItemStat & {
  name: string;
  nameEn: string;
  quality: string;
  tier: number;
  mastery: string | null;
  profession: string | null;
  statTypes: string[];
  image: string;
  fallbackImage: string;
};

export type LocalizedQuestRecipeRewardStat = QuestRecipeRewardStat & {
  name: string;
  nameEn: string;
  quality: string;
  tier: number;
  mastery: string | null;
  profession: string | null;
  statTypes: string[];
  image: string;
  fallbackImage: string;
};

export type LocalizedQuestRewardStats = Omit<QuestRewardStats, "topItems" | "recipes"> & {
  topItems: LocalizedQuestRewardItemStat[];
  recipes: LocalizedQuestRecipeRewardStat[];
  statAssets: Record<string, { label: string; image: string }>;
};

export type QuestCatalog = {
  chains: LocalizedQuestChain[];
  locations: string[];
  counts: CorepunkQuestDataset["counts"];
  scrapedAt: string;
};
