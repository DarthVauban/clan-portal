import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, CheckCircle2, FileText, Newspaper, Sparkles } from "lucide-react";
import styles from "@/app/patch-notes/patch-notes.module.css";

export const metadata: Metadata = {
  title: "Патчноуты",
  description: "Архив обновлений Squirt Squad Portal с подробным описанием и интерактивными примерами.",
};

const releases = [
  {
    id: "july-2026",
    date: "24 июля 2026",
    dateTime: "2026-07-24",
    period: "Обновление 23-24 июля",
    title: "Портал стал точнее, быстрее и удобнее",
    summary: "Пять последовательных обновлений: от исправления счётчика заявок до большого пакета улучшений рабочих сценариев, дашборда и учёта ресурсов.",
    href: "/patch-notes-july-2026.html",
    stats: ["5 релизов", "40 файлов", "1450 добавлений"],
    highlights: [
      "Точный счётчик заявок на вступление",
      "Выбор коллектива при регистрации",
      "Кастомные select-меню во всём портале",
      "Исправленная загрузка разделов",
      "Резервирование ресурсов активными заявками",
      "Новые фильтры, уведомления и журнал учёта",
    ],
  },
];

export default function PatchNotesPage() {
  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <div className="eyebrow">Портал · История изменений</div>
          <h1>Патчноуты</h1>
          <p>Все заметные изменения портала в одном месте: краткое содержание релиза, ключевые нововведения и подробная интерактивная демонстрация.</p>
        </div>
        <div className={styles.latestBadge}>
          <Sparkles size={15} />
          Последнее обновление: 24 июля
        </div>
      </section>

      <section className={styles.releaseSummary} aria-label="Сводка архива обновлений">
        <div>
          <Newspaper size={18} />
          <span>Опубликовано</span>
          <strong>{releases.length}</strong>
        </div>
        <div>
          <CalendarDays size={18} />
          <span>Последний релиз</span>
          <strong>24.07.2026</strong>
        </div>
        <div>
          <FileText size={18} />
          <span>Изменений в релизе</span>
          <strong>5</strong>
        </div>
      </section>

      <section className={styles.releaseSection}>
        <header className={styles.sectionHeading}>
          <div>
            <span>Архив</span>
            <h2>Все обновления</h2>
          </div>
          <small>{releases.length} публикация</small>
        </header>

        <div className={styles.releaseList}>
          {releases.map((release, index) => (
            <article className={styles.releaseCard} key={release.id}>
              <div className={styles.releaseContent}>
                <div className={styles.releaseMeta}>
                  <time dateTime={release.dateTime}><CalendarDays size={13} /> {release.date}</time>
                  {index === 0 && <span>Последнее обновление</span>}
                </div>

                <p className={styles.releasePeriod}>{release.period}</p>
                <h2>{release.title}</h2>
                <p className={styles.releaseDescription}>{release.summary}</p>

                <ul className={styles.highlightList}>
                  {release.highlights.map((highlight) => (
                    <li key={highlight}><CheckCircle2 size={14} /> {highlight}</li>
                  ))}
                </ul>

                <footer className={styles.releaseFooter}>
                  <div className={styles.releaseStats}>
                    {release.stats.map((stat) => <span key={stat}>{stat}</span>)}
                  </div>
                  <Link href={release.href} target="_blank" rel="noreferrer">
                    Открыть патчноут <ArrowUpRight size={15} />
                  </Link>
                </footer>
              </div>

              <div className={styles.releasePreview} aria-hidden="true">
                <div className={styles.previewBrand}>
                  <Image src="/clan-logo.png" alt="" width={68} height={68} />
                  <div><strong>Squirt Squad</strong><span>Portal update</span></div>
                </div>
                <div className={styles.previewCounter}>
                  <div><small>Было</small><strong>11</strong></div>
                  <i>→</i>
                  <div><small>Стало</small><strong>3</strong></div>
                </div>
                <div className={styles.previewLines}>
                  <span><i /> Заявки синхронизированы</span>
                  <span><i /> Ресурсы защищены резервом</span>
                  <span><i /> Разделы загружаются напрямую</span>
                </div>
                <p>Интерактивные примеры внутри</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
