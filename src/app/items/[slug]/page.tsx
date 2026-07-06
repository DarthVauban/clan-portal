import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CorepunkItemDetail } from "@/components/corepunk-item-detail";
import { baseItemSlugs, getBaseItem, getItemDetailDataset, knowledgeSearchItems } from "@/lib/corepunk-item-data";

export const dynamicParams = false;

export function generateStaticParams() {
  return baseItemSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const item = getBaseItem(slug);
  return { title: item ? item.name : "Предмет не найден" };
}

export default async function ItemDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dataset = getItemDetailDataset(slug);
  if (!dataset) notFound();
  return <CorepunkItemDetail dataset={dataset} searchItems={knowledgeSearchItems} />;
}
