import { ArrowRight, BarChart3, ListTodo, Sparkles } from "lucide-react";
import { QuestSectionNav } from "@/components/quest-section-nav";
import styles from "@/app/quests/quests.module.css";

export function QuestPlaceholder({ kind }: { kind: "tasks" | "rewards" }) {
  const tasks = kind === "tasks";
  const Icon = tasks ? ListTodo : BarChart3;
  const title = tasks ? "Задания" : "Статистика наград";
  const description = tasks
    ? "Единый каталог всех заданий с поиском по уровню, локации, NPC и типу цели."
    : "Сводная аналитика золота, опыта, предметов и наград с выбором по цепочкам.";

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <div className="eyebrow">Знания · Corepunk</div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className={styles.statusBadge}><Sparkles size={15} /> Следующий этап</div>
      </section>
      <QuestSectionNav />
      <section className={styles.placeholder}>
        <span className={styles.placeholderIcon}><Icon size={26} /></span>
        <div>
          <span>Раздел готовится</span>
          <h2>{tasks ? "Каталог уже в очереди" : "Собираем полезные срезы"}</h2>
          <p>
            {tasks
              ? "Данные заданий уже импортированы вместе с цепочками. Здесь появится отдельный каталог с быстрыми фильтрами и карточками квестов."
              : "Награды уже сохранены для каждого квеста. На следующем этапе добавим сравнение цепочек и удобную статистику по типам предметов."}
          </p>
        </div>
        <div className={styles.placeholderSteps} aria-label="План раздела">
          <span><i>01</i> Данные собраны <ArrowRight size={13} /></span>
          <span><i>02</i> Структура готова <ArrowRight size={13} /></span>
          <span className={styles.placeholderStepMuted}><i>03</i> Интерфейс в работе</span>
        </div>
      </section>
    </div>
  );
}
