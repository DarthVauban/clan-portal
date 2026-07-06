import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Boxes, Database, ScrollText, UsersRound } from "lucide-react";

const stats = [
  { label: "Коллективы", value: "3", meta: "до 24 участников", icon: UsersRound },
  { label: "Участники", value: "—", meta: "появятся после подключения", icon: UsersRound },
  { label: "Виды ресурсов", value: "—", meta: "после импорта базы", icon: Boxes },
  { label: "Активные заявки", value: "—", meta: "единая очередь клана", icon: ScrollText },
];

const modules = [
  { title: "Коллективы", text: "Составы клана, участники и роли", href: "/collectives", icon: UsersRound },
  { title: "База предметов", text: "Предметы, вариации и рецепты", href: "/items", icon: Database },
  { title: "Ресурсы", text: "Остатки отдельно и суммарно", href: "/resources", icon: Boxes },
];

export default function DashboardPage() {
  return (
    <div className="page-stack">
      <section className="dashboard-hero">
        <div className="hero-copy">
          <div className="eyebrow">Центр управления кланом!</div>
          <h1>Всё важное для клана<br /><span>в одном пространстве.</span></h1>
          <p>Единая точка для составов клана, ресурсов, предметов, заявок и совместного крафта.</p>
          <div className="hero-actions">
            <Link className="primary-button" href="/collectives">Перейти к коллективам <ArrowRight size={17} /></Link>
            <Link className="secondary-button" href="/items">Открыть базу предметов</Link>
          </div>
        </div>
        <div className="hero-emblem" aria-hidden="true">
          <div className="hero-ring" />
          <Image src="/clan-logo.png" alt="" width={580} height={680} priority />
        </div>
      </section>

      <section className="stats-grid" aria-label="Сводка">
        {stats.map(({ label, value, meta, icon: Icon }) => (
          <article className="stat-card" key={label}>
            <div className="stat-icon"><Icon size={19} /></div>
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
            <div className="stat-meta">{meta}</div>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <div className="surface-card">
          <div className="surface-heading">
            <div><span className="surface-kicker">Быстрый доступ</span><h2>Основные разделы</h2></div>
            <span className="ready-label"><span /> Навигация готова</span>
          </div>
          <div className="module-links">
            {modules.map(({ title, text, href, icon: Icon }) => (
              <Link className="module-link" href={href} key={href}>
                <span className="module-link-icon"><Icon size={21} /></span>
                <span><strong>{title}</strong><small>{text}</small></span>
                <ArrowRight size={17} />
              </Link>
            ))}
          </div>
        </div>

        <div className="surface-card phase-card">
          <span className="surface-kicker">Текущий этап</span>
          <h2>Фундамент версии 1.0</h2>
          <div className="progress-track"><span /></div>
          <div className="phase-row"><span>Структура и навигация</span><strong>Готово</strong></div>
          <div className="phase-row"><span>Авторизация и роли</span><em>Далее</em></div>
          <div className="phase-row"><span>База предметов</span><em>Запланировано</em></div>
          <p>Комнаты активностей не входят в версию 1.0 и не перегружают интерфейс.</p>
        </div>
      </section>
    </div>
  );
}
