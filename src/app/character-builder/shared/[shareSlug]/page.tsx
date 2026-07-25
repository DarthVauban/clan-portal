import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CharacterBuilder } from "@/components/character-builder";
import { getCharacterBuilderDataset } from "@/lib/character-builder-dataset";
import { getPublicCharacterBuild } from "@/lib/character-builder-repository";

export const dynamic = "force-dynamic";

type SharedBuildPageProps = {
  params: Promise<{ shareSlug: string }>;
};

export async function generateMetadata({ params }: SharedBuildPageProps): Promise<Metadata> {
  const { shareSlug } = await params;
  const build = await getPublicCharacterBuild(shareSlug);
  if (!build) return { title: "Білд не знайдено" };
  return {
    title: `${build.title} · Character Builder`,
    description: `Білд ${build.ownerName || "гравця"} для класу ${build.heroClass}, рівень ${build.level}.`,
  };
}

export default async function SharedCharacterBuildPage({ params }: SharedBuildPageProps) {
  const { shareSlug } = await params;
  const [dataset, build] = await Promise.all([
    getCharacterBuilderDataset(),
    getPublicCharacterBuild(shareSlug),
  ]);
  if (!build) notFound();
  return <CharacterBuilder dataset={dataset} initialBuild={build} readOnly />;
}
