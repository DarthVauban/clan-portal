import { ModulePage } from "@/components/module-page";
import { Boxes, Layers3, WalletCards } from "lucide-react";

export default function ResourcesPage() {
  return (
    <ModulePage
      eyebrow="Экономика · Активы"
      title="Управление ресурсами"
      description="Точный учёт валюты и материалов каждого коллектива с возможностью видеть общий баланс всего клана."
      features={["Баланс каждого коллектива", "Суммарный баланс клана", "Поступления и списания", "История операций и ответственные", "Изображения и названия из базы предметов"]}
    >
      <div className="resource-preview">
        <div className="resource-summary"><Layers3 size={20} /><span>Все коллективы</span><strong>Сводный баланс</strong></div>
        <div className="resource-tiles">
          <div><span><WalletCards size={18} /></span><small>Валюта</small><strong>—</strong></div>
          <div><span><Boxes size={18} /></span><small>Ресурсы</small><strong>—</strong></div>
        </div>
      </div>
    </ModulePage>
  );
}
