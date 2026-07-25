import type { Metadata } from "next";
import { QuestUpdateShowcase } from "@/components/quest-update-showcase";
import {
  getQuestCatalog,
  getQuestDirectory,
  getQuestRewardStatistics,
} from "@/lib/corepunk-quest-repository";

export const metadata: Metadata = {
  title: "Квестовый центр — обновление 25 июля 2026",
  description: "Интерактивный патчноут нового квестового раздела Squirt Squad Portal.",
};

export const dynamic = "force-dynamic";

function flattenChain(
  node: ReturnType<typeof getQuestCatalog>["chains"][number]["tree"],
  limit = 7,
) {
  const result: Array<{ slug: string; name: string; nameEn: string; level: number }> = [];
  function visit(current: typeof node) {
    if (result.length >= limit) return;
    result.push({
      slug: current.slug,
      name: current.name,
      nameEn: current.nameEn,
      level: current.level,
    });
    for (const child of current.children) visit(child);
  }
  visit(node);
  return result;
}

export default async function QuestUpdatePatchNotePage() {
  const catalog = getQuestCatalog();
  const directory = getQuestDirectory();
  const rewardStats = await getQuestRewardStatistics();
  const featuredChains = [...catalog.chains]
    .sort((first, second) => second.size - first.size)
    .slice(0, 4)
    .map((chain) => ({
      slug: chain.rootSlug,
      name: chain.tree.name,
      nameEn: chain.tree.nameEn,
      size: chain.size,
      minLevel: chain.minLevel,
      maxLevel: chain.maxLevel,
      location: chain.tree.location,
      nodes: flattenChain(chain.tree),
    }));
  const featuredQuests = directory.quests
    .filter((quest) => quest.description.trim())
    .slice(0, 18)
    .map((quest) => ({
      slug: quest.slug,
      name: quest.name,
      nameEn: quest.nameEn,
      level: quest.level,
      location: quest.location,
      questGiver: quest.questGiverName,
      goals: quest.goals.length,
    }));
  const rewardSamples = rewardStats.topItems
    .filter((item, index, items) => items.slice(0, index).filter((candidate) => candidate.type === item.type).length < 4)
    .slice(0, 12)
    .map((item) => ({
    slug: item.item,
    name: item.name,
    nameEn: item.nameEn,
    type: item.type,
    tier: item.tier,
    questCount: item.questCount,
    image: item.image,
    fallbackImage: item.fallbackImage,
    }));
  const recipeSamples = Object.values(
    rewardStats.recipes.reduce<Record<string, typeof rewardStats.recipes>>((groups, item) => {
      groups[item.recipe] ??= [];
      if (groups[item.recipe].length < 5) groups[item.recipe].push(item);
      return groups;
    }, {}),
  ).flat().map((item) => ({
    slug: item.item,
    name: item.name,
    nameEn: item.nameEn,
    type: item.type,
    tier: item.tier,
    profession: item.recipe,
    questCount: item.questCount,
    image: item.image,
    fallbackImage: item.fallbackImage,
  }));

  return (
    <QuestUpdateShowcase
      metrics={{
        quests: directory.quests.length,
        chains: catalog.chains.length,
        rewardEntries: rewardStats.summary.totalRewardEntries,
        uniqueItems: rewardStats.summary.uniqueItems,
      }}
      quests={featuredQuests}
      chains={featuredChains}
      rewards={rewardSamples}
      recipes={recipeSamples}
    />
  );
}
