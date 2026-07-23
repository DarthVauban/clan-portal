import { AuditLogManager } from "@/components/audit-log-manager";

export default function AuditLogPage() {
  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <div className="eyebrow">Учет · Аудит</div>
          <h1>Журнал учета</h1>
          <p>Единая история операций с ресурсами, валютой и заявками с указанием исполнителей и изменений баланса.</p>
        </div>
      </section>
      <AuditLogManager />
    </div>
  );
}
