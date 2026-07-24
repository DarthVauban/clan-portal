import type { Metadata } from "next";
import { QuestPlaceholder } from "@/components/quest-placeholder";

export const metadata: Metadata = {
  title: "Задания",
  description: "Каталог заданий Corepunk.",
};

export default function QuestTasksPage() {
  return <QuestPlaceholder kind="tasks" />;
}
