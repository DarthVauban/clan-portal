import { ArrowUpRight, CheckCircle2, Clock3 } from "lucide-react";

export function ModulePage({
  eyebrow,
  title,
  description,
  features,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  features: string[];
  children?: React.ReactNode;
}) {
  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="build-badge"><Clock3 size={15} /> Запланировано для 1.0</div>
      </section>

      <div className="module-layout">
        <section className="surface-card module-preview">
          <div className="surface-heading">
            <div>
              <span className="surface-kicker">Предварительный вид</span>
              <h2>Модуль уже на своём месте</h2>
            </div>
            <ArrowUpRight size={20} className="muted-icon" />
          </div>
          {children ?? (
            <div className="empty-state">
              <div className="empty-state-icon"><Clock3 size={24} /></div>
              <strong>Функционал в разработке</strong>
              <span>Навигация готова. Данные и рабочие сценарии подключим на следующих этапах.</span>
            </div>
          )}
        </section>

        <aside className="surface-card scope-card">
          <span className="surface-kicker">Что будет внутри</span>
          <h2>Состав модуля</h2>
          <ul className="feature-list">
            {features.map((feature) => (
              <li key={feature}><CheckCircle2 size={17} /> <span>{feature}</span></li>
            ))}
          </ul>
          <div className="scope-note">
            <span className="scope-note-dot" />
            Реализация будет поэтапной, без изменения привычной навигации.
          </div>
        </aside>
      </div>
    </div>
  );
}
