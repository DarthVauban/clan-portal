"use client";

import Link from "next/link";
import {
  ArrowDownAZ,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  GitBranch,
  Layers3,
  MapPin,
  Search,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { LocalizedQuestChain, LocalizedQuestChainNode } from "@/lib/corepunk-quest-data";
import styles from "@/app/quests/quests.module.css";

type SortMode = "size" | "level" | "name";

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("ru");
}

function chainSearchText(chain: LocalizedQuestChain) {
  const parts: string[] = [];
  function visit(node: LocalizedQuestChainNode) {
    parts.push(node.name, node.nameEn, node.location, node.locationEn, node.questGiverName, node.questGiverNameEn);
    node.children.forEach(visit);
  }
  visit(chain.tree);
  return normalize(parts.join(" "));
}

function QuestTreeNode({ node, depth, expandAll }: { node: LocalizedQuestChainNode; depth: number; expandAll: boolean }) {
  const hasChildren = node.children.length > 0;
  const content = (
    <div className={styles.treeNodeCard}>
      <span className={styles.levelBadge}>ур. {node.level}</span>
      <div className={styles.treeNodeCopy}>
        <Link href={`/quests/${node.slug}`}>{node.name}</Link>
        {node.name !== node.nameEn && <small>{node.nameEn}</small>}
        <p><UserRound size={12} /> {node.questGiverName}<span>·</span><MapPin size={12} /> {node.location}</p>
      </div>
      {node.isShared && <em>Общий</em>}
      {hasChildren && <span className={styles.childCount}>{node.children.length}</span>}
    </div>
  );

  if (!hasChildren) return <li className={styles.treeNode}>{content}</li>;

  return (
    <li className={styles.treeNode}>
      <details key={`${node.slug}-${expandAll}`} open={expandAll || depth < 2}>
        <summary>
          {content}
          <ChevronDown className={styles.branchChevron} size={15} />
        </summary>
        <ul className={styles.treeChildren}>
          {node.children.map((child) => <QuestTreeNode key={child.slug} node={child} depth={depth + 1} expandAll={expandAll} />)}
        </ul>
      </details>
    </li>
  );
}

export function QuestChainExplorer({ chains, locations }: { chains: LocalizedQuestChain[]; locations: string[] }) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("all");
  const [sort, setSort] = useState<SortMode>("size");
  const [selectedRoot, setSelectedRoot] = useState(chains[0]?.rootSlug ?? "");
  const [expandAll, setExpandAll] = useState(false);
  const indexedChains = useMemo(() => new Map(chains.map((chain) => [chain.rootSlug, chainSearchText(chain)])), [chains]);
  const filteredChains = useMemo(() => {
    const normalizedQuery = normalize(query);
    return chains
      .filter((chain) => {
        const matchesQuery = !normalizedQuery || indexedChains.get(chain.rootSlug)?.includes(normalizedQuery);
        const matchesLocation = location === "all" || chain.tree.location === location;
        return matchesQuery && matchesLocation;
      })
      .sort((first, second) => {
        if (sort === "name") return first.tree.name.localeCompare(second.tree.name, "ru");
        if (sort === "level") return first.minLevel - second.minLevel || second.size - first.size;
        return second.size - first.size || first.minLevel - second.minLevel;
      });
  }, [chains, indexedChains, location, query, sort]);
  const activeChain = filteredChains.find((chain) => chain.rootSlug === selectedRoot) ?? filteredChains[0] ?? null;

  return (
    <section className={styles.explorer}>
      <header className={styles.explorerToolbar}>
        <label className={styles.searchField}>
          <Search size={16} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Название, NPC или локация..."
          />
          <kbd>{filteredChains.length}</kbd>
        </label>
        <label className={styles.selectField}>
          <MapPin size={15} />
          <select value={location} onChange={(event) => setLocation(event.target.value)}>
            <option value="all">Все локации</option>
            {locations.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
        </label>
        <label className={styles.selectField}>
          <ArrowDownAZ size={15} />
          <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
            <option value="size">Сначала крупные</option>
            <option value="level">По уровню старта</option>
            <option value="name">По названию</option>
          </select>
        </label>
      </header>

      {activeChain ? (
        <div className={styles.explorerGrid}>
          <aside className={styles.chainSidebar}>
            <div className={styles.sidebarHeading}>
              <div><span>Доступные деревья</span><strong>{filteredChains.length} цепочек</strong></div>
              <GitBranch size={17} />
            </div>
            <div className={styles.chainList}>
              {filteredChains.map((chain, index) => (
                <button
                  className={chain.rootSlug === activeChain.rootSlug ? styles.chainCardActive : styles.chainCard}
                  type="button"
                  key={chain.rootSlug}
                  onClick={() => {
                    setSelectedRoot(chain.rootSlug);
                    setExpandAll(false);
                  }}
                >
                  <span className={styles.chainIndex}>{String(index + 1).padStart(2, "0")}</span>
                  <span className={styles.chainCardCopy}>
                    <strong>{chain.tree.name}</strong>
                    {chain.tree.name !== chain.tree.nameEn && <small>{chain.tree.nameEn}</small>}
                    <em><MapPin size={11} /> {chain.tree.location}</em>
                  </span>
                  <span className={styles.chainSize}>{chain.size}<small>квестов</small></span>
                </button>
              ))}
            </div>
          </aside>

          <article className={styles.treePanel}>
            <header className={styles.treeHeading}>
              <div>
                <span className={styles.treeKicker}>Стартовая точка · уровень {activeChain.minLevel}</span>
                <h2>{activeChain.tree.name}</h2>
                {activeChain.tree.name !== activeChain.tree.nameEn && <p>{activeChain.tree.nameEn}</p>}
              </div>
              <button type="button" onClick={() => setExpandAll((current) => !current)}>
                {expandAll ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}
                {expandAll ? "Свернуть ветви" : "Развернуть всё"}
              </button>
            </header>

            <div className={styles.treeStats}>
              <div><GitBranch size={16} /><span>Квестов</span><strong>{activeChain.size}</strong></div>
              <div><Layers3 size={16} /><span>Глубина</span><strong>{activeChain.maxDepth}</strong></div>
              <div><MapPin size={16} /><span>Старт</span><strong>{activeChain.tree.location}</strong></div>
              <div><span className={styles.levelIcon}>L</span><span>Диапазон</span><strong>{activeChain.minLevel}–{activeChain.maxLevel}</strong></div>
            </div>

            <div className={styles.treeScroll}>
              <ul className={styles.questTree} key={`${activeChain.rootSlug}-${expandAll}`}>
                <QuestTreeNode node={activeChain.tree} depth={0} expandAll={expandAll} />
              </ul>
            </div>
          </article>
        </div>
      ) : (
        <div className={styles.noResults}>
          <Search size={24} />
          <strong>Цепочки не найдены</strong>
          <span>Попробуйте изменить запрос или выбрать другую локацию.</span>
          <button type="button" onClick={() => { setQuery(""); setLocation("all"); }}>Сбросить фильтры</button>
        </div>
      )}
    </section>
  );
}
