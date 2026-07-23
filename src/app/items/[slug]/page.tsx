import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CorepunkItemDetail } from "@/components/corepunk-item-detail";
import { getBaseItem, getItemDetailDataset, getKnowledgeSearchItems } from "@/lib/corepunk-item-repository";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const item = await getBaseItem(slug);
  return { title: item ? item.name : "Предмет не найден" };
}

export default async function ItemDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [dataset, searchItems] = await Promise.all([getItemDetailDataset(slug), getKnowledgeSearchItems()]);
  if (!dataset) notFound();
  return <CorepunkItemDetail dataset={dataset} searchItems={searchItems} />;
}
