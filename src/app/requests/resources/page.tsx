import { ModulePage } from "@/components/module-page";

export default function ResourceRequestsPage() {
  return (
    <ModulePage
      eyebrow="Заявки · Ресурсы"
      title="Получение ресурсов"
      description="Прозрачный процесс запроса материалов из банка клана: от создания заявки до фактической выдачи."
      features={["Заявка с предметом и количеством", "Цель использования и комментарий", "Проверка доступного остатка", "Одобрение ответственной ролью", "Статусы, история и уведомления"]}
    >
      <div className="request-pipeline">
        {[["01", "Создано"], ["02", "На рассмотрении"], ["03", "Одобрено"], ["04", "Выдано"]].map(([n, label], i) => (
          <div className={i === 0 ? "pipeline-step pipeline-step--active" : "pipeline-step"} key={n}><span>{n}</span><strong>{label}</strong></div>
        ))}
      </div>
    </ModulePage>
  );
}
