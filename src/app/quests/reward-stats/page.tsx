import type { Metadata } from "next";
import { QuestPlaceholder } from "@/components/quest-placeholder";

export const metadata: Metadata = {
  title: "Статистика наград",
  description: "Статистика наград за задания Corepunk.",
};

export default function QuestRewardStatsPage() {
  return <QuestPlaceholder kind="rewards" />;
}
