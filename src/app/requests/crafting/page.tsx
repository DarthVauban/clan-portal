import { ModulePage } from "@/components/module-page";

export default function CraftRequestsPage() {
  return (
    <ModulePage
      eyebrow="Заявки · Крафт"
      title="Крафт предметов"
      description="Заявки на изготовление предметов объединяют заказчика, ресурсы клана и доступных крафтеров в одном процессе."
      features={["Выбор предмета из базы", "Автоматический расчёт рецепта", "Учёт собственных материалов", "Назначение крафтера", "Статусы выполнения и результат"]}
    >
      <div className="craft-request-preview">
        <div className="craft-request-item"><span>?</span><div><small>Предмет для крафта</small><strong>Выберите предмет из базы</strong></div></div>
        <div className="craft-request-line"><span>Необходимые материалы</span><strong>Рассчитаются автоматически</strong></div>
        <button disabled>Создать заявку</button>
      </div>
    </ModulePage>
  );
}
