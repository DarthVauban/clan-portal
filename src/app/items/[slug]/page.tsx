import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CorepunkItemDetail } from "@/components/corepunk-item-detail";
import { getItem, itemDataset } from "@/lib/corepunk-item-data";

export function generateStaticParams() {
  return [{ slug: itemDataset.rootSlug }];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const item = getItem(slug);
  return { title: item ? item.name : "Предмет не найден" };
}

export default async function ItemDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug !== itemDataset.rootSlug) notFound();
  return <CorepunkItemDetail dataset={itemDataset} />;
}
