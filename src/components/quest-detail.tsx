import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Coins,
  Gift,
  MapPin,
  MessageSquareQuote,
  Sparkles,
  Star,
  UserCheck,
  UserRound,
} from "lucide-react";
import { QuestRewardImage } from "@/components/quest-reward-image";
import { QuestSectionNav } from "@/components/quest-section-nav";
import type { LocalizedQuest, LocalizedRewardItem } from "@/lib/corepunk-quest-data";
import styles from "@/app/quests/quests.module.css";

const linkableItemTypes = new Set(["weapon", "implant", "chip", "rune", "consumable", "resource"]);

const goalTypeLabels: Record<string, string> = {
  collect: "Собрать",
  talk: "Поговорить",
  kill: "Уничтожить",
  interact: "Взаимодействовать",
  explore: "Исследовать",
  use: "Использовать",
  escort: "Сопроводить",
};

const rewardTypeLabels: Record<string, string> = {
  weapon: "Оружие",
  implant: "Имплант",
  chip: "Чип",
  rune: "Руна",
  consumable: "Расходник",
  resource: "Ресурс",
  skin: "Облик",
  "quest-item": "Квестовый предмет",
  recipe: "Рецепт",
};

function RewardItem({ item }: { item: LocalizedRewardItem }) {
  const content = (
    <>
      <span className={styles.rewardItemIcon}>
        <QuestRewardImage image={item.image} fallbackImage={item.fallbackImage} alt="" />
      </span>
      <span className={styles.rewardItemCopy}>
        <strong>{item.name}</strong>
        {item.name !== item.nameEn && <small>{item.nameEn}</small>}
        <em>{rewardTypeLabels[item.type] ?? item.type}{item.tier > 0 ? ` · тир ${item.tier}` : ""}</em>
      </span>
      {item.quantity > 1 && <span className={styles.rewardQuantity}>×{item.quantity}</span>}
    </>
  );

  return linkableItemTypes.has(item.type)
    ? <Link className={styles.rewardItem} href={`/items/${item.item}`}>{content}</Link>
    : <div className={styles.rewardItem}>{content}</div>;
}

function QuestLinks({ title, empty, links, direction }: {
  title: string;
  empty: string;
  links: LocalizedQuest["prerequisites"];
  direction: "back" | "forward";
}) {
  return (
    <section className={`${styles.relationCard} ${direction === "back" ? styles.relationCardBack : styles.relationCardForward}`}>
      <header>
        {direction === "back" ? <ArrowLeft size={17} /> : <ArrowRight size={17} />}
        <strong>{title}</strong>
      </header>
      {links.length > 0 ? (
        <div>
          {links.map((link) => (
            <Link className={styles.relationLink} href={`/quests/${link.slug}`} key={link.slug}>
              <span className={styles.relationLevel}>ур. {link.level}</span>
              <div><strong>{link.name}</strong>{link.name !== link.nameEn && <small>{link.nameEn}</small>}</div>
              <span className={styles.relationAction}>
                Открыть
                {direction === "back" ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}
              </span>
            </Link>
          ))}
        </div>
      ) : <p>{empty}</p>}
    </section>
  );
}

export function QuestDetail({ quest }: { quest: LocalizedQuest }) {
  const rewardCount = (quest.rewards?.items.length ?? 0)
    + (quest.rewards?.itemGroups.reduce((total, group) => total + group.items.length, 0) ?? 0);

  return (
    <div className="page-stack">
      <div className={styles.detailBackRow}>
        <Link href="/quests/chains"><ArrowLeft size={14} /> Все цепочки</Link>
        <span>Квест · уровень {quest.level}</span>
      </div>

      <section className={`${styles.questHero} page-hero`}>
        <div>
          <div className="eyebrow">Цепочка заданий · {quest.location}</div>
          <h1>{quest.name}</h1>
          {quest.name !== quest.nameEn && <p className={styles.englishTitle}>{quest.nameEn}</p>}
        </div>
        <div className={styles.levelSeal}><span>Уровень</span><strong>{quest.level}</strong></div>
      </section>

      <QuestSectionNav />

      <section className={styles.questMetaGrid}>
        <div><span><MapPin size={16} /></span><small>Локация</small><strong>{quest.location}</strong></div>
        <div><span><UserRound size={16} /></span><small>Начало</small><strong>{quest.questGiverName}</strong></div>
        <div><span><UserCheck size={16} /></span><small>Завершение</small><strong>{quest.questFinisherName}</strong></div>
        <div><span><Gift size={16} /></span><small>Вариантов наград</small><strong>{rewardCount}</strong></div>
      </section>

      <div className={styles.detailGrid}>
        <main className={styles.detailMain}>
          {quest.description && (
            <section className={styles.detailSection}>
              <header><span>Брифинг</span><h2>Описание задания</h2></header>
              <div className={styles.questDescription}>
                {quest.description.split(/\n{2,}/).map((paragraph) => <p key={paragraph}>{paragraph.replace(/\n/g, " ")}</p>)}
              </div>
            </section>
          )}

          <section className={styles.detailSection}>
            <header><span>Маршрут</span><h2>Цели квеста</h2><small>{quest.goals.length} этапов</small></header>
            {quest.goals.length > 0 ? (
              <ol className={styles.objectiveList}>
                {quest.goals.map((goal, index) => (
                  <li key={goal.id}>
                    <span className={styles.objectiveIndex}>{String(index + 1).padStart(2, "0")}</span>
                    <span className={styles.objectiveMarker}><CheckCircle2 size={16} /></span>
                    <div>
                      <em>{goalTypeLabels[goal.type] ?? "Задача"}{goal.quantity > 1 ? ` · ${goal.quantity} шт.` : ""}</em>
                      <strong>{goal.description}</strong>
                      {goal.description !== goal.descriptionEn && <small>{goal.descriptionEn}</small>}
                      {(goal.itemName || goal.targetName) && (
                        <p><CircleDot size={11} /> {goal.itemName ?? goal.targetName}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            ) : <p className={styles.emptyCopy}>Подробный список целей пока не заполнен.</p>}
          </section>

          {quest.voice && (
            <section className={`${styles.detailSection} ${styles.dialogueSection}`}>
              <header><span>Реплика NPC</span><h2>Подсказка по прохождению</h2></header>
              <blockquote><MessageSquareQuote size={21} /><p>{quest.voice}</p></blockquote>
            </section>
          )}

          <section className={styles.detailSection}>
            <header><span>Завершение</span><h2>Награды</h2><small>{rewardCount > 0 ? `${rewardCount} вариантов` : "Нет данных"}</small></header>
            {quest.rewards && (quest.rewards.gold > 0 || quest.rewards.xp > 0) && (
              <div className={styles.currencyRewards}>
                {quest.rewards.gold > 0 && <div><Coins size={17} /><span>Золото</span><strong>{quest.rewards.gold.toLocaleString("ru-RU")}</strong></div>}
                {quest.rewards.xp > 0 && <div><Star size={17} /><span>Опыт</span><strong>{quest.rewards.xp.toLocaleString("ru-RU")}</strong></div>}
              </div>
            )}

            {quest.rewards?.items.length ? (
              <div className={styles.rewardBlock}>
                <div className={styles.rewardBlockTitle}><Sparkles size={14} /><strong>Гарантированные награды</strong></div>
                <div className={styles.rewardGrid}>{quest.rewards.items.map((item) => <RewardItem item={item} key={item.id} />)}</div>
              </div>
            ) : null}

            {quest.rewards?.itemGroups.map((group, index) => (
              <div className={styles.rewardBlock} key={group.id}>
                <div className={styles.rewardBlockTitle}>
                  <Gift size={14} />
                  <strong>{group.pickOne ? "Выберите одну награду" : "Набор наград"} {quest.rewards!.itemGroups.length > 1 ? `· ${index + 1}` : ""}</strong>
                </div>
                <div className={styles.rewardGrid}>{group.items.map((item) => <RewardItem item={item} key={item.id} />)}</div>
              </div>
            ))}

            {!quest.rewards || (!rewardCount && !quest.rewards.gold && !quest.rewards.xp)
              ? <p className={styles.emptyCopy}>Информация о наградах пока не заполнена.</p>
              : null}
          </section>
        </main>

        <aside className={styles.detailAside}>
          <QuestLinks
            title="Требуется перед началом"
            empty="Этот квест начинает отдельную цепочку."
            links={quest.prerequisites}
            direction="back"
          />
          <QuestLinks
            title="Открывает дальше"
            empty="Это финальная точка текущей ветки."
            links={quest.unlocks}
            direction="forward"
          />
        </aside>
      </div>
    </div>
  );
}
