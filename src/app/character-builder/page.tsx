import type { Metadata } from "next";
import { CharacterBuilder } from "@/components/character-builder";
import { getCharacterBuilderDataset } from "@/lib/character-builder-dataset";

export const metadata: Metadata = {
  title: "Конструктор персонажа",
  description: "Полный конструктор героя Corepunk с экипировкой, талантами, мастерством, характеристиками и оценкой материалов.",
};

export const dynamic = "force-dynamic";

export default async function CharacterBuilderPage() {
  const dataset = await getCharacterBuilderDataset();
  return <CharacterBuilder dataset={dataset} />;
}
