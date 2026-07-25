import "server-only";
import sourceJson from "@/data/corepunk-quest-chains.json";
import translationJson from "@/data/corepunk-quest-chains-ru.json";
import type {
  CorepunkQuest,
  CorepunkQuestDataset,
  LocalizedQuest,
  LocalizedQuestChain,
  LocalizedQuestChainNode,
  LocalizedQuestGoal,
  LocalizedQuestRecipeRewardStat,
  LocalizedQuestRewardItemStat,
  LocalizedQuestRewardStats,
  LocalizedQuestRewards,
  LocalizedRewardItem,
  QuestCatalog,
  QuestChainNode,
  QuestDirectory,
  QuestLink,
  QuestRecipeRewardStat,
  QuestRewardItemStat,
  QuestRewardItem,
} from "@/lib/corepunk-quest-data";

const dataset = sourceJson as unknown as CorepunkQuestDataset;
const translations = (translationJson as { translations: Record<string, string> }).translations;
const questBySlug = new Map(dataset.quests.map((quest) => [quest.slug, quest]));
const questAssetBase = "https://d2fwno52vggyhx.cloudfront.net";

function translate(value: string | null | undefined) {
  if (!value) return "";
  return translations[value] ?? translations[value.trim()] ?? value.trim();
}

function humanizeSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function rewardAssetSlug(slug: string) {
  return slug
    .replace(/^br(?=implant-)/, "")
    .replace(/^m(?=(?:implant|weapon)-)/, "")
    .replace(/^implant-implant-/, "implant-");
}

function rewardItemPresentation(itemSlug: string, itemType: string) {
  const related = dataset.items[itemSlug];
  const nameEn = related?.name ?? humanizeSlug(itemSlug);
  const assetType = related?.type ?? itemType;
  const assetSlug = rewardAssetSlug(related?.slug ?? itemSlug);
  return {
    nameEn,
    name: translate(nameEn),
    quality: related?.quality ?? "common",
    tier: related?.tier ?? 0,
    image: `/game-assets/items/${assetType}/${assetSlug}.png`,
    fallbackImage: `${questAssetBase}/items/${assetType}/${assetSlug}.png`,
  };
}

function npcName(slug: string) {
  return dataset.npcs[slug]?.name ?? humanizeSlug(slug);
}

function localizeChainNode(node: QuestChainNode): LocalizedQuestChainNode {
  const giverNameEn = npcName(node.questGiver);
  return {
    ...node,
    nameEn: node.name,
    name: translate(node.name),
    locationEn: node.location,
    location: translate(node.location),
    questGiverNameEn: giverNameEn,
    questGiverName: translate(giverNameEn),
    children: node.children.map(localizeChainNode),
  };
}

function localizeChain(chain: CorepunkQuestDataset["chains"][number]): LocalizedQuestChain {
  return { ...chain, tree: localizeChainNode(chain.tree) };
}

function questLink(slug: string): QuestLink | null {
  const quest = questBySlug.get(slug);
  if (!quest) return null;
  return { slug, name: translate(quest.name), nameEn: quest.name, level: quest.level };
}

function buildUnlockMap() {
  const unlocks = new Map<string, Set<string>>();
  for (const quest of dataset.quests) {
    for (const prerequisite of quest.prerequisiteQuests ?? []) {
      const entries = unlocks.get(prerequisite) ?? new Set<string>();
      entries.add(quest.slug);
      unlocks.set(prerequisite, entries);
    }
  }
  return unlocks;
}

const unlockMap = buildUnlockMap();

function localizeRewardItem(item: QuestRewardItem): LocalizedRewardItem {
  const related = dataset.items[item.item];
  return {
    ...item,
    ...rewardItemPresentation(item.item, item.type),
    description: translate(related?.description ?? ""),
  };
}

function localizeRewards(rewards: CorepunkQuest["rewards"]): LocalizedQuestRewards | null {
  if (!rewards) return null;
  return {
    ...rewards,
    items: rewards.items.map(localizeRewardItem),
    itemGroups: rewards.itemGroups.map((group) => ({
      ...group,
      items: group.items.map(localizeRewardItem),
    })),
  };
}

function localizeGoal(goal: CorepunkQuest["goals"][number]): LocalizedQuestGoal {
  const targetNameEn = goal.target ? npcName(goal.target.slug) : null;
  const itemNameEn = goal.item ? dataset.items[goal.item.slug]?.name ?? humanizeSlug(goal.item.slug) : null;
  return {
    ...goal,
    descriptionEn: goal.description,
    description: translate(goal.description),
    targetNameEn,
    targetName: targetNameEn ? translate(targetNameEn) : null,
    itemNameEn,
    itemName: itemNameEn ? translate(itemNameEn) : null,
  };
}

function localizeQuest(quest: CorepunkQuest): LocalizedQuest {
  const giverNameEn = npcName(quest.questGiver);
  const finisherNameEn = npcName(quest.questFinisher);
  const prerequisites = (quest.prerequisiteQuests ?? []).map(questLink).filter((value): value is QuestLink => Boolean(value));
  const unlocks = [...(unlockMap.get(quest.slug) ?? [])].map(questLink).filter((value): value is QuestLink => Boolean(value));
  return {
    ...quest,
    nameEn: quest.name,
    name: translate(quest.name),
    descriptionEn: quest.description,
    description: translate(quest.description),
    voiceEn: quest.voice,
    voice: translate(quest.voice),
    locationEn: quest.location,
    location: translate(quest.location),
    questGiverNameEn: giverNameEn,
    questGiverName: translate(giverNameEn),
    questFinisherNameEn: finisherNameEn,
    questFinisherName: translate(finisherNameEn),
    goals: quest.goals.map(localizeGoal),
    rewards: localizeRewards(quest.rewards),
    prerequisites,
    unlocks,
  };
}

export function getQuestCatalog(): QuestCatalog {
  const chains = dataset.chains.map(localizeChain);
  const locations = [...new Set(chains.map((chain) => chain.tree.location))].sort((a, b) => a.localeCompare(b, "ru"));
  return {
    chains,
    locations,
    counts: {
      ...dataset.counts,
      quests: chains.reduce((total, chain) => total + chain.size, 0),
    },
    scrapedAt: dataset.source.scrapedAt,
  };
}

export function getQuestBySlug(slug: string) {
  const quest = questBySlug.get(slug);
  return quest ? localizeQuest(quest) : null;
}

export function getQuestDirectory(): QuestDirectory {
  const quests = dataset.quests
    .map(localizeQuest)
    .sort((first, second) => first.level - second.level || first.name.localeCompare(second.name, "ru"));
  return {
    quests,
    locations: [...new Set(quests.map((quest) => quest.location))].sort((first, second) => first.localeCompare(second, "ru")),
    levels: [...new Set(quests.map((quest) => quest.level))].sort((first, second) => first - second),
    questsWithRewards: quests.filter((quest) => quest.rewards).length,
  };
}

function localizeRewardItemStat(item: QuestRewardItemStat): LocalizedQuestRewardItemStat {
  return { ...item, ...rewardItemPresentation(item.item, item.type) };
}

function localizeRecipeRewardStat(item: QuestRecipeRewardStat): LocalizedQuestRecipeRewardStat {
  return { ...item, ...rewardItemPresentation(item.item, item.type) };
}

export function getQuestRewardStatistics(): LocalizedQuestRewardStats {
  return {
    ...dataset.rewardStats,
    topItems: dataset.rewardStats.topItems.map(localizeRewardItemStat),
    recipes: dataset.rewardStats.recipes.map(localizeRecipeRewardStat),
  };
}
