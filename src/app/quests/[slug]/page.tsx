import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { QuestDetail } from "@/components/quest-detail";
import { getQuestBySlug, getQuestSourceUpdatedAt } from "@/lib/corepunk-quest-repository";

export function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return params.then(({ slug }) => {
    const quest = getQuestBySlug(slug);
    return {
      title: quest?.name ?? "Задание не найдено",
      description: quest ? `${quest.name}: цели, порядок прохождения, связанные задания и награды.` : undefined,
    };
  });
}

export default async function QuestDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const quest = getQuestBySlug(slug);
  if (!quest) notFound();
  return <QuestDetail quest={quest} sourceUpdatedAt={getQuestSourceUpdatedAt()} />;
}
