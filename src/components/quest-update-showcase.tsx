"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Eye,
  Gift,
  GitBranch,
  Layers3,
  ListChecks,
  MapPin,
  MousePointer2,
  Search,
  SlidersHorizontal,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { CustomSelect } from "@/components/custom-select";
import { QuestRewardImage } from "@/components/quest-reward-image";
import styles from "@/app/patch-notes/quests-july-2026/quest-update.module.css";

type QuestSample = {
  slug: string;
  name: string;
  nameEn: string;
  level: number;
  location: string;
  questGiver: string;
  goals: number;
};

type ChainSample = {
  slug: string;
  name: string;
  nameEn: string;
  size: number;
  minLevel: number;
  maxLevel: number;
  location: string;
  nodes: Array<{ slug: string; name: string; nameEn: string; level: number }>;
};

type RewardSample = {
  slug: string;
  name: string;
  nameEn: string;
  type: string;
  tier: number;
  questCount: number;
  image: string;
  fallbackImage: string;
};

type RecipeSample = RewardSample & {
  profession: string;
};

type QuestUpdateShowcaseProps = {
  metrics: {
    quests: number;
    chains: number;
    rewardEntries: number;
    uniqueItems: number;
  };
  quests: QuestSample[];
  chains: ChainSample[];
  rewards: RewardSample[];
  recipes: RecipeSample[];
};

const typeLabels: Record<string, string> = {
  resource: "Ресурс",
  consumable: "Расходник",
  implant: "Артефакт",
  chip: "Чип",
  weapon: "Оружие",
  rune: "Руна",
};

const professionLabels: Record<string, string> = {
  construction: "Конструирование",
  weaponsmithing: "Оружейное дело",
  mysticism: "Мистика",
  alchemy: "Алхимия",
  cooking: "Кулинария",
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("ru");
}

export function QuestUpdateShowcase({
  metrics,
  quests,
  chains,
  rewards,
  recipes,
}: QuestUpdateShowcaseProps) {
  const levels = useMemo(() => [...new Set(quests.map((quest) => quest.level))].sort((first, second) => first - second), [quests]);
  const [questQuery, setQuestQuery] = useState("");
  const [questLevel, setQuestLevel] = useState("all");
  const [activeChainSlug, setActiveChainSlug] = useState(chains[0]?.slug ?? "");
  const [expandedChain, setExpandedChain] = useState(false);
  const [rewardMode, setRewardMode] = useState<"frequent" | "recipes">("frequent");
  const [rewardType, setRewardType] = useState("all");
  const recipeProfessions = useMemo(() => [...new Set(recipes.map((item) => item.profession))], [recipes]);
  const [profession, setProfession] = useState(recipeProfessions[0] ?? "");
  const [readability, setReadability] = useState<"before" | "after">("after");
  const levelOptions = useMemo(
    () => [
      { value: "all", label: "Все уровни" },
      ...levels.map((level) => ({ value: String(level), label: `Уровень ${level}` })),
    ],
    [levels],
  );
  const filteredQuests = useMemo(() => {
    const query = normalize(questQuery);
    return quests.filter((quest) => (
      (!query || normalize(`${quest.name} ${quest.nameEn} ${quest.location} ${quest.questGiver}`).includes(query))
      && (questLevel === "all" || quest.level === Number(questLevel))
    ));
  }, [questLevel, questQuery, quests]);
  const activeChain = chains.find((chain) => chain.slug === activeChainSlug) ?? chains[0];
  const rewardTypes = useMemo(() => [...new Set(rewards.map((item) => item.type))], [rewards]);
  const visibleRewards = rewards.filter((item) => rewardType === "all" || item.type === rewardType);
  const visibleRecipes = recipes.filter((item) => item.profession === profession);

  return (
    <article className={styles.release}>
      <header className={styles.hero} id="overview">
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.topLine}>
          <Link href="/patch-notes">← Все патчноуты</Link>
          <time dateTime="2026-07-25"><CalendarDays size={14} /> 25 июля 2026</time>
        </div>

        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}><Sparkles size={14} /> Большое обновление знаний</div>
            <h1>Квестовый центр<br /><em>уже в портале</em></h1>
            <p>
              Полный каталог заданий, интерактивные цепочки, подробные страницы квестов и
              аналитика наград теперь работают как единая система.
            </p>
            <div className={styles.heroActions}>
              <Link href="/quests/tasks">Открыть задания <ArrowRight size={16} /></Link>
              <a href="#live-demo">Посмотреть демонстрации <MousePointer2 size={15} /></a>
            </div>
          </div>

          <div className={styles.heroVisual} aria-label="Предпросмотр квестового центра">
            <div className={styles.visualTopbar}>
              <span><BookOpenCheck size={15} /> Квесты</span>
              <i>LIVE</i>
            </div>
            <div className={styles.visualTabs}>
              <span>Задания</span>
              <span className={styles.visualTabActive}>Цепочки</span>
              <span>Награды</span>
            </div>
            <div className={styles.visualChain}>
              <span className={styles.visualIndex}>01</span>
              <div><strong>Дивный новый мир</strong><small>84 связанных задания</small></div>
              <GitBranch size={18} />
            </div>
            <div className={styles.visualNodes}>
              <span><i>1</i> Добро пожаловать в Квалат</span>
              <span><i>2</i> Программа поддержки</span>
              <span><i>3</i> Основы ремесла</span>
            </div>
            <div className={styles.visualRewards}>
              {rewards.slice(0, 4).map((item) => (
                <span key={item.slug} title={item.name}>
                  <QuestRewardImage image={item.image} fallbackImage={item.fallbackImage} alt="" size={38} />
                </span>
              ))}
              <strong>+{metrics.uniqueItems}</strong>
            </div>
          </div>
        </div>
      </header>

      <section className={styles.metrics} aria-label="Масштаб обновления">
        <div><BookOpenCheck size={19} /><span>Заданий</span><strong>{metrics.quests}</strong></div>
        <div><GitBranch size={19} /><span>Цепочек</span><strong>{metrics.chains}</strong></div>
        <div><Gift size={19} /><span>Записей наград</span><strong>{metrics.rewardEntries.toLocaleString("ru-RU")}</strong></div>
        <div><Layers3 size={19} /><span>Уникальных предметов</span><strong>{metrics.uniqueItems}</strong></div>
      </section>

      <nav className={styles.releaseNav} aria-label="Навигация по патчноуту">
        <a href="#overview">Обзор</a>
        <a href="#quest-catalog">Каталог</a>
        <a href="#quest-chains">Цепочки</a>
        <a href="#reward-intelligence">Награды</a>
        <a href="#readability">Читаемость</a>
      </nav>

      <section className={styles.intro}>
        <div>
          <span>Что изменилось</span>
          <h2>Три раздела — один понятный маршрут</h2>
        </div>
        <p>
          Квестовый модуль построен вокруг реальных игровых сценариев: найти нужное задание,
          увидеть его место в цепочке, проверить цели и заранее изучить возможные награды.
        </p>
      </section>

      <section className={styles.featureGrid}>
        <Link href="/quests/tasks">
          <span><BookOpenCheck size={22} /></span>
          <small>01 · Каталог</small>
          <h3>Задания</h3>
          <p>Поиск по названию, NPC, цели или награде. Фильтры по локации и уровню.</p>
          <em>Открыть раздел <ArrowRight size={14} /></em>
        </Link>
        <Link href="/quests/chains">
          <span><GitBranch size={22} /></span>
          <small>02 · Маршрут</small>
          <h3>Цепочки заданий</h3>
          <p>Полная последовательность прохождения с уровнями, стартовой точкой и развилками.</p>
          <em>Открыть раздел <ArrowRight size={14} /></em>
        </Link>
        <Link href="/quests/reward-stats">
          <span><BarChart3 size={22} /></span>
          <small>03 · Аналитика</small>
          <h3>Статистика наград</h3>
          <p>Частые награды, распределение по типам и рецепты для каждой профессии.</p>
          <em>Открыть раздел <ArrowRight size={14} /></em>
        </Link>
      </section>

      <div className={styles.demoLabel} id="live-demo">
        <MousePointer2 size={15} />
        Все примеры ниже интерактивны
      </div>

      <section className={styles.releaseBlock} id="quest-catalog">
        <header className={styles.blockHeader}>
          <div className={styles.blockNumber}>01</div>
          <div>
            <span>Быстрый доступ</span>
            <h2>Каталог из {metrics.quests} заданий</h2>
            <p>Попробуйте поиск или выберите уровень — карточки обновятся сразу.</p>
          </div>
          <Link href="/quests/tasks">Перейти в каталог <ExternalLink size={15} /></Link>
        </header>

        <div className={styles.catalogDemo}>
          <div className={styles.demoToolbar}>
            <label>
              <Search size={17} />
              <input
                type="search"
                value={questQuery}
                onChange={(event) => setQuestQuery(event.target.value)}
                placeholder="Название, NPC или локация..."
              />
            </label>
            <CustomSelect
              value={questLevel}
              options={levelOptions}
              onChange={setQuestLevel}
              ariaLabel="Уровень задания в демонстрации"
              size="regular"
              startIcon={<SlidersHorizontal size={16} />}
            />
          </div>
          <div className={styles.demoResultLine}>
            <strong>Найдено: {filteredQuests.length}</strong>
            <span>Показано до 6 карточек</span>
          </div>
          {filteredQuests.length > 0 ? (
            <div className={styles.questCards}>
              {filteredQuests.slice(0, 6).map((quest) => (
                <Link href={`/quests/${quest.slug}`} key={quest.slug}>
                  <span className={styles.questLevel}><small>ур.</small>{quest.level}</span>
                  <div>
                    <strong>{quest.name}</strong>
                    <small>{quest.nameEn}</small>
                    <p><MapPin size={12} /> {quest.location}<span>·</span><UserRound size={12} /> {quest.questGiver}</p>
                  </div>
                  <em><ListChecks size={13} /> {quest.goals}</em>
                </Link>
              ))}
            </div>
          ) : (
            <div className={styles.demoEmpty}><Search size={22} /> Измените запрос или уровень задания.</div>
          )}
        </div>
      </section>

      <section className={styles.releaseBlock} id="quest-chains">
        <header className={styles.blockHeader}>
          <div className={styles.blockNumber}>02</div>
          <div>
            <span>Порядок прохождения</span>
            <h2>Цепочки, которые помнят ваш выбор</h2>
            <p>Выберите цепочку и разверните маршрут — ровно так работает основной раздел.</p>
          </div>
          <Link href="/quests/chains">Открыть цепочки <ExternalLink size={15} /></Link>
        </header>

        <div className={styles.chainDemo}>
          <div className={styles.chainSelector}>
            {chains.map((chain, index) => (
              <button
                type="button"
                className={activeChain?.slug === chain.slug ? styles.chainButtonActive : undefined}
                onClick={() => {
                  setActiveChainSlug(chain.slug);
                  setExpandedChain(false);
                }}
                key={chain.slug}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{chain.name}</strong><small>{chain.location}</small></div>
                <em>{chain.size}</em>
              </button>
            ))}
          </div>

          {activeChain && (
            <div className={styles.chainRoute}>
              <div className={styles.chainRouteHeader}>
                <div>
                  <span>Уровни {activeChain.minLevel}–{activeChain.maxLevel}</span>
                  <h3>{activeChain.name}</h3>
                  <p>{activeChain.nameEn}</p>
                </div>
                <strong>{activeChain.size}<small>квестов</small></strong>
              </div>
              <div className={styles.chainNodes}>
                {activeChain.nodes.slice(0, expandedChain ? activeChain.nodes.length : 4).map((node, index) => (
                  <Link href={`/quests/${node.slug}`} key={node.slug}>
                    <i>{index + 1}</i>
                    <div><strong>{node.name}</strong><small>{node.nameEn}</small></div>
                    <span>ур. {node.level}</span>
                  </Link>
                ))}
              </div>
              {activeChain.nodes.length > 4 && (
                <button className={styles.expandButton} type="button" onClick={() => setExpandedChain((current) => !current)}>
                  {expandedChain ? "Свернуть маршрут" : `Показать ещё ${activeChain.nodes.length - 4}`}
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      <section className={styles.releaseBlock} id="reward-intelligence">
        <header className={styles.blockHeader}>
          <div className={styles.blockNumber}>03</div>
          <div>
            <span>Предметы и профессии</span>
            <h2>Награды стали наглядными</h2>
            <p>Иконки предметов, частота выдачи и отдельные наборы рецептов для каждой профессии.</p>
          </div>
          <Link href="/quests/reward-stats">Открыть статистику <ExternalLink size={15} /></Link>
        </header>

        <div className={styles.rewardDemo}>
          <div className={styles.segmented}>
            <button type="button" data-active={rewardMode === "frequent"} onClick={() => setRewardMode("frequent")}>
              <BarChart3 size={15} /> Частые награды
            </button>
            <button type="button" data-active={rewardMode === "recipes"} onClick={() => setRewardMode("recipes")}>
              <Gift size={15} /> Рецепты
            </button>
          </div>

          {rewardMode === "frequent" ? (
            <>
              <div className={styles.filterChips}>
                <button type="button" data-active={rewardType === "all"} onClick={() => setRewardType("all")}>Все</button>
                {rewardTypes.map((itemType) => (
                  <button type="button" data-active={rewardType === itemType} onClick={() => setRewardType(itemType)} key={itemType}>
                    {typeLabels[itemType] ?? itemType}
                  </button>
                ))}
              </div>
              <div className={styles.rewardGrid}>
                {visibleRewards.slice(0, 8).map((item, index) => (
                  <Link href={`/items/${item.slug}`} key={item.slug}>
                    <small>{String(index + 1).padStart(2, "0")}</small>
                    <span><QuestRewardImage image={item.image} fallbackImage={item.fallbackImage} alt="" size={46} /></span>
                    <div><strong>{item.name}</strong><em>{typeLabels[item.type] ?? item.type} · T{item.tier}</em></div>
                    <b>{item.questCount}<i>квестов</i></b>
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className={styles.professionTabs}>
                {recipeProfessions.map((recipeProfession) => (
                  <button
                    type="button"
                    data-active={profession === recipeProfession}
                    onClick={() => setProfession(recipeProfession)}
                    key={recipeProfession}
                  >
                    {professionLabels[recipeProfession] ?? recipeProfession}
                    <small>{recipes.filter((item) => item.profession === recipeProfession).length}</small>
                  </button>
                ))}
              </div>
              <div className={styles.recipeGrid}>
                {visibleRecipes.map((item) => (
                  <Link href={`/items/${item.slug}`} key={`${item.profession}-${item.slug}`}>
                    <span><QuestRewardImage image={item.image} fallbackImage={item.fallbackImage} alt="" size={48} /></span>
                    <div><strong>{item.name}</strong><small>{item.nameEn}</small><em>T{item.tier} · {typeLabels[item.type] ?? item.type}</em></div>
                    <b>{item.questCount}</b>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <section className={styles.releaseBlock} id="readability">
        <header className={styles.blockHeader}>
          <div className={styles.blockNumber}>04</div>
          <div>
            <span>Комфорт чтения</span>
            <h2>Крупнее шрифт, яснее навигация</h2>
            <p>Переключите режим и сравните, как изменились описание, цели и переходы между квестами.</p>
          </div>
          <span className={styles.headerIcon}><Eye size={20} /></span>
        </header>

        <div className={styles.readabilityDemo}>
          <div className={styles.segmented}>
            <button type="button" data-active={readability === "before"} onClick={() => setReadability("before")}>Было</button>
            <button type="button" data-active={readability === "after"} onClick={() => setReadability("after")}>Стало</button>
          </div>
          <div className={`${styles.detailPreview} ${readability === "after" ? styles.detailPreviewReadable : styles.detailPreviewBefore}`}>
            <div className={styles.detailMain}>
              <span>Брифинг</span>
              <h3>Описание задания</h3>
              <p>Поговорите со специалистом по приёму инопланетян. Он должен быть на виду. Следуйте по дороге на север к дому Зикка.</p>
              <div className={styles.previewGoal}>
                <i><CheckCircle2 size={15} /></i>
                <div><small>Поговорить</small><strong>Поговорите со специалистом по приёму</strong><span>Зикк Кланквисти</span></div>
              </div>
            </div>
            <aside>
              <small>Открывает дальше</small>
              <strong>Дивный новый мир — программа поддержки</strong>
              <ArrowRight size={16} />
            </aside>
          </div>
        </div>
      </section>

      <section className={styles.finish}>
        <div>
          <span><CheckCircle2 size={18} /></span>
          <div><small>Обновление доступно</small><h2>Исследуйте квестовый центр прямо сейчас</h2></div>
        </div>
        <ul>
          <li><CheckCircle2 size={14} /> Реальные иконки предметов</li>
          <li><CheckCircle2 size={14} /> Фирменные элементы управления</li>
          <li><CheckCircle2 size={14} /> Сохранение выбранной цепочки</li>
          <li><CheckCircle2 size={14} /> Адаптивные фильтры профессий</li>
        </ul>
        <div className={styles.finishActions}>
          <Link href="/quests">Открыть раздел квестов <ArrowRight size={16} /></Link>
          <Link href="/patch-notes">Вернуться к патчноутам</Link>
        </div>
      </section>
    </article>
  );
}
