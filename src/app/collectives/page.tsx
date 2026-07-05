import { ModulePage } from "@/components/module-page";

const collectives = ["Основной состав", "Второй состав", "Третий состав"];

export default function CollectivesPage() {
  return (
    <ModulePage
      eyebrow="Клан · Структура"
      title="Коллективы и участники"
      description="Управляйте всеми игровыми составами как частями одного клана — без искусственного разделения сообщества."
      features={["Создание и редактирование коллективов", "Список участников с лимитом 24", "Роли и права доступа", "Перевод между коллективами", "Общий список всего клана"]}
    >
      <div className="collective-preview">
        {collectives.map((name, index) => (
          <div className="collective-card" key={name}>
            <span className="collective-index">{String(index + 1).padStart(2, "0")}</span>
            <div><strong>{name}</strong><small>Состав ещё не заполнен</small></div>
            <span className="capacity">0 / 24</span>
          </div>
        ))}
      </div>
    </ModulePage>
  );
}
