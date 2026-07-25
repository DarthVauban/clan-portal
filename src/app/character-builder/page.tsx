import type { Metadata } from "next";
import { CharacterBuilder } from "@/components/character-builder";
import { getCharacterBuilderDataset } from "@/lib/character-builder-dataset";

export const metadata: Metadata = {
  title: "Character Builder",
  description: "Повний конструктор героя Corepunk зі спорядженням, талантами, майстерністю, характеристиками та оцінкою матеріалів.",
};

export const dynamic = "force-dynamic";

export default async function CharacterBuilderPage() {
  const dataset = await getCharacterBuilderDataset();
  return <CharacterBuilder dataset={dataset} />;
}
