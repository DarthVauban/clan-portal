import { ResourcesManager, type ResourceCatalogItem } from "@/components/resources-manager";
import { catalogDataset } from "@/lib/corepunk-item-data";

export default function ResourcesPage() {
  const resources: ResourceCatalogItem[] = catalogDataset.items
    .filter((item) => item.type === "resource")
    .map((item) => ({
      slug: item.slug,
      name: item.name,
      englishName: item.englishName,
      tier: item.tier,
      quality: item.quality,
      qualities: [...new Set(item.variations.map((variation) => variation.quality))],
      profession: item.profession,
      image: item.variations[0]?.image ?? null,
    }));

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <div className="eyebrow">Экономика · Активы</div>
          <h1>Управление ресурсами</h1>
          <p>Баланс валюты и материалов каждого коллектива с автоматической сводкой по всему клану.</p>
        </div>
      </section>
      <ResourcesManager resources={resources} />
    </div>
  );
}
