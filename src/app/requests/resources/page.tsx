import { ResourceRequestsManager } from "@/components/resource-requests-manager";
import type { ResourceCatalogItem } from "@/components/resources-manager";
import { getCatalogDataset } from "@/lib/corepunk-item-repository";

export const dynamic = "force-dynamic";

export default async function ResourceRequestsPage() {
  const catalogDataset = await getCatalogDataset();
  const resources: ResourceCatalogItem[] = catalogDataset.items
    .filter((item) => item.type === "resource" && item.slug !== "ancient-coin")
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
          <div className="eyebrow">Заявки · Ресурсы</div>
          <h1>Получение ресурсов</h1>
          <p>Игроки подают заявки на материалы из банка коллектива, а ответственные роли подтверждают и фиксируют выдачу.</p>
        </div>
      </section>
      <ResourceRequestsManager resources={resources} />
    </div>
  );
}
