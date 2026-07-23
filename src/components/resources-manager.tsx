"use client";

import { LoadableImage } from "@/components/loadable-image";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  History,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { usePortalAuth } from "@/lib/auth-store";
import { findMembership, hasAbsolutePortalRights, useCollectiveStore } from "@/lib/collective-store";
import { resourceManagerRoles, roleIsIn } from "@/lib/portal-permissions";
import { LOCAL_PLAYER_ID, useLocalProfile } from "@/lib/profile-store";
import { emptyCollectiveBalance, makeResourceOperation, useResourceStore } from "@/lib/resource-store";
import { useRequestStore } from "@/lib/request-store";
import { getAvailableResourceAmount, getReservedResourceAmount } from "@/lib/request-reservations";
import styles from "@/app/resources/resources.module.css";

export type ResourceCatalogItem = {
  slug: string;
  name: string;
  englishName: string;
  tier: number;
  quality: string;
  qualities: string[];
  profession: string | null;
  image: string | null;
};

type ResourceTransaction = {
  slug: string;
  name: string;
  image: string | null;
  kind: "add" | "take";
  currentAmount: number;
  availableAmount: number;
};

const ANCIENT_COIN_SLUG = "ancient-coin";
const ANCIENT_COIN_IMAGE = "/game-assets/items/resource/ancient-coin.png";
const numberFormatter = new Intl.NumberFormat("ru-RU");
const pickerTiers = [1, 2, 3] as const;
const pickerQualities = ["common", "uncommon", "rare", "epic"] as const;
const qualityLabels: Record<(typeof pickerQualities)[number], string> = {
  common: "Обычный",
  uncommon: "Необычный",
  rare: "Редкий",
  epic: "Эпический",
};
const resourceProfessions = [
  { value: "mining", label: "Горное дело" },
  { value: "herbalism", label: "Травничество" },
  { value: "logging", label: "Лесозаготовка" },
  { value: "butchery", label: "Разделка" },
  { value: "other", label: "Другое" },
] as const;
const primaryResourceProfessions = new Set<string>(resourceProfessions.slice(0, -1).map((profession) => profession.value));

function formatAmount(value: number) {
  return numberFormatter.format(value);
}

function formatOperationDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function ResourcesManager({ resources }: { resources: ResourceCatalogItem[] }) {
  const { profile } = useLocalProfile();
  const { auth } = usePortalAuth();
  const { state: collectiveState } = useCollectiveStore();
  const { state, updateState } = useResourceStore();
  const { state: requestState } = useRequestStore();
  const [selectedCollectiveId, setSelectedCollectiveId] = useState<string>("all");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [resourceQuery, setResourceQuery] = useState("");
  const [pickerTier, setPickerTier] = useState<number | "all">("all");
  const [pickerQuality, setPickerQuality] = useState<string | "all">("all");
  const [pickerProfession, setPickerProfession] = useState<string | "all">("all");
  const [transaction, setTransaction] = useState<ResourceTransaction | null>(null);
  const [transactionAmount, setTransactionAmount] = useState("");
  const activeCollective = collectiveState.collectives.find((collective) => collective.id === selectedCollectiveId) ?? null;
  const activeBalance = activeCollective ? state.balances[activeCollective.id] ?? emptyCollectiveBalance() : null;
  const absoluteRights = hasAbsolutePortalRights(collectiveState, LOCAL_PLAYER_ID);
  const activeMembership = activeCollective ? findMembership(collectiveState, LOCAL_PLAYER_ID) : null;
  const canEdit = Boolean(activeCollective && (
    absoluteRights
    || (activeMembership?.collective.id === activeCollective.id && roleIsIn(activeMembership.member.role, resourceManagerRoles))
  ));
  const resourcesBySlug = useMemo(() => new Map(resources.map((resource) => [resource.slug, resource])), [resources]);
  const aggregate = useMemo(() => {
    const result = { ancientCoin: 0, resources: {} as Record<string, number> };
    for (const collective of collectiveState.collectives) {
      const balance = state.balances[collective.id];
      if (!balance) continue;
      result.ancientCoin += balance.ancientCoin;
      for (const [slug, amount] of Object.entries(balance.resources)) result.resources[slug] = (result.resources[slug] ?? 0) + amount;
    }
    return result;
  }, [collectiveState.collectives, state.balances]);
  const totalResourceUnits = Object.values(aggregate.resources).reduce((total, amount) => total + amount, 0);
  const collectivesWithAssets = collectiveState.collectives.filter((collective) => {
    const balance = state.balances[collective.id];
    return balance && (balance.ancientCoin > 0 || Object.values(balance.resources).some((amount) => amount > 0));
  }).length;
  const displayedResources = selectedCollectiveId === "all" ? aggregate.resources : activeBalance?.resources ?? {};
  const displayedResourceEntries = Object.entries(displayedResources)
    .filter(([slug]) => slug !== ANCIENT_COIN_SLUG && resourcesBySlug.has(slug))
    .sort(([, firstAmount], [, secondAmount]) => secondAmount - firstAmount);
  const normalizedQuery = resourceQuery.trim().toLocaleLowerCase("ru");
  const availableResources = resources.filter((resource) => resource.slug !== ANCIENT_COIN_SLUG
    && !Object.hasOwn(activeBalance?.resources ?? {}, resource.slug)
    && (!normalizedQuery || [resource.name, resource.englishName].some((name) => name.toLocaleLowerCase("ru").includes(normalizedQuery)))
    && (pickerTier === "all" || resource.tier === pickerTier)
    && (pickerQuality === "all" || resource.qualities.includes(pickerQuality))
    && (pickerProfession === "all"
      || (pickerProfession === "other"
        ? !primaryResourceProfessions.has(resource.profession ?? "")
        : resource.profession === pickerProfession)));
  const visibleOperations = state.operations.filter((operation) => selectedCollectiveId === "all" || operation.collectiveId === selectedCollectiveId).slice(0, 12);
  const transactionQuantity = Math.max(0, Math.floor(Number(transactionAmount) || 0));
  const transactionValid = Boolean(transaction
    && transactionQuantity > 0
    && (transaction.kind === "add" || transactionQuantity <= transaction.availableAmount));
  const actor = {
    id: auth.discordId ? `player-${auth.discordId}` : LOCAL_PLAYER_ID,
    name: profile.displayName.trim() || auth.discordNickname || "Игрок",
  };

  const setAmount = (collectiveId: string, slug: string, nextAmount: number) => {
    const normalizedAmount = Math.max(0, Math.floor(nextAmount));
    updateState((current) => {
      const previousBalance = current.balances[collectiveId] ?? emptyCollectiveBalance();
      const previousAmount = slug === ANCIENT_COIN_SLUG ? previousBalance.ancientCoin : previousBalance.resources[slug] ?? 0;
      if (previousAmount === normalizedAmount) return current;
      const nextBalance = slug === ANCIENT_COIN_SLUG
        ? { ...previousBalance, ancientCoin: normalizedAmount, updatedAt: new Date().toISOString() }
        : { ...previousBalance, resources: { ...previousBalance.resources, [slug]: normalizedAmount }, updatedAt: new Date().toISOString() };
      return {
        balances: { ...current.balances, [collectiveId]: nextBalance },
        operations: [makeResourceOperation(collectiveId, slug, normalizedAmount - previousAmount, normalizedAmount, {
          actor,
          balanceBefore: previousAmount,
          collectiveName: activeCollective?.name ?? "",
          resourceName: slug === ANCIENT_COIN_SLUG ? "Древняя монета" : resourcesBySlug.get(slug)?.name ?? slug,
          resourceImage: slug === ANCIENT_COIN_SLUG ? ANCIENT_COIN_IMAGE : resourcesBySlug.get(slug)?.image ?? null,
          source: "manual",
        }), ...current.operations].slice(0, 200),
      };
    });
  };

  const addResource = (slug: string) => {
    if (!activeCollective || !canEdit) return;
    updateState((current) => {
      const balance = current.balances[activeCollective.id] ?? emptyCollectiveBalance();
      return {
        ...current,
        balances: {
          ...current.balances,
          [activeCollective.id]: { ...balance, resources: { ...balance.resources, [slug]: 0 }, updatedAt: new Date().toISOString() },
        },
      };
    });
  };

  const removeResource = (slug: string) => {
    if (!activeCollective || !canEdit) return;
    const currentAmount = state.balances[activeCollective.id]?.resources[slug] ?? 0;
    if (getAvailableResourceAmount(state, requestState, collectiveState, activeCollective.id, slug) < currentAmount) return;
    updateState((current) => {
      const balance = current.balances[activeCollective.id] ?? emptyCollectiveBalance();
      const previousAmount = balance.resources[slug] ?? 0;
      const resources = { ...balance.resources };
      delete resources[slug];
      return {
        balances: { ...current.balances, [activeCollective.id]: { ...balance, resources, updatedAt: new Date().toISOString() } },
        operations: previousAmount > 0
          ? [makeResourceOperation(activeCollective.id, slug, -previousAmount, 0, {
            actor,
            balanceBefore: previousAmount,
            collectiveName: activeCollective.name,
            resourceName: resourcesBySlug.get(slug)?.name ?? slug,
            resourceImage: resourcesBySlug.get(slug)?.image ?? null,
            source: "manual",
          }), ...current.operations].slice(0, 200)
          : current.operations,
      };
    });
  };

  const openTransaction = (kind: ResourceTransaction["kind"], resource: Omit<ResourceTransaction, "kind">) => {
    setTransaction({ ...resource, kind });
    setTransactionAmount("");
  };

  const closeTransaction = () => {
    setTransaction(null);
    setTransactionAmount("");
  };

  const confirmTransaction = () => {
    if (!activeCollective || !transaction || !transactionValid) return;
    const latestBalance = state.balances[activeCollective.id] ?? emptyCollectiveBalance();
    const latestAmount = transaction.slug === ANCIENT_COIN_SLUG
      ? latestBalance.ancientCoin
      : latestBalance.resources[transaction.slug] ?? 0;
    if (
      transaction.kind === "take"
      && transactionQuantity > getAvailableResourceAmount(state, requestState, collectiveState, activeCollective.id, transaction.slug)
    ) return;
    const nextAmount = transaction.kind === "add"
      ? latestAmount + transactionQuantity
      : latestAmount - transactionQuantity;
    setAmount(activeCollective.id, transaction.slug, nextAmount);
    closeTransaction();
  };

  if (collectiveState.collectives.length === 0) {
    return (
      <section className={styles.noCollectives}>
        <span><UsersRound size={28} /></span>
        <h2>Сначала создайте коллектив</h2>
        <p>Ресурсы и валюта учитываются отдельно для каждого игрового состава.</p>
        <Link href="/collectives">Перейти к коллективам</Link>
      </section>
    );
  }

  return (
    <div className={styles.resourcesLayout}>
      <section className={styles.summaryBar}>
        <div className={styles.coinSummary}><span><LoadableImage src={ANCIENT_COIN_IMAGE} alt="" width={40} height={40} /></span><div><small>Общий баланс валюты</small><strong>{formatAmount(aggregate.ancientCoin)}</strong><em>Древняя монета</em></div></div>
        <div><span><Boxes size={17} /></span><div><small>Всего единиц ресурсов</small><strong>{formatAmount(totalResourceUnits)}</strong></div></div>
        <div><span><ShieldCheck size={17} /></span><div><small>Коллективов с активами</small><strong>{collectivesWithAssets} / {collectiveState.collectives.length}</strong></div></div>
      </section>

      <section className={styles.accessScope}>
        <ShieldCheck size={16} />
        <div>
          <strong>{absoluteRights ? "Полный доступ к учёту" : "Прозрачный баланс клана"}</strong>
          <span>{absoluteRights ? "Можно изменять балансы всех коллективов. Каждая операция сохраняется с вашим именем." : "Балансы всех коллективов доступны для просмотра. Изменять активы могут руководитель и казначей своего состава."}</span>
        </div>
      </section>

      <div className={styles.resourcesWorkspace}>
        <aside className={styles.collectiveNav}>
          <header><span>Учёт активов</span><strong>Баланс</strong></header>
          <button type="button" className={selectedCollectiveId === "all" ? styles.collectiveNavActive : ""} onClick={() => setSelectedCollectiveId("all")} data-testid="resources-all"><span><UsersRound size={16} /></span><div><strong>Все коллективы</strong><small>Суммарный баланс</small></div></button>
          {collectiveState.collectives.map((collective, index) => {
            const balance = state.balances[collective.id] ?? emptyCollectiveBalance();
            return (
              <button type="button" className={selectedCollectiveId === collective.id ? styles.collectiveNavActive : ""} onClick={() => setSelectedCollectiveId(collective.id)} data-testid={`resources-collective-${collective.id}`} key={collective.id}>
                <span>{String(index + 1).padStart(2, "0")}</span><div><strong>{collective.name}</strong><small>{formatAmount(balance.ancientCoin)} монет</small></div>
              </button>
            );
          })}
        </aside>

        <main className={styles.balancePanel}>
          <header className={styles.balanceHeader}>
            <div><span>{selectedCollectiveId === "all" ? "Клан · Все составы" : "Коллектив · Активы"}</span><h2>{selectedCollectiveId === "all" ? "Суммарный баланс" : activeCollective?.name}</h2><p>{selectedCollectiveId === "all" ? "Автоматическая сумма активов всех коллективов" : canEdit ? "У вас есть права на изменение баланса" : "Баланс доступен только для просмотра"}</p></div>
            {activeBalance && activeBalance.updatedAt !== new Date(0).toISOString() && <time>Обновлено {formatOperationDate(activeBalance.updatedAt)}</time>}
          </header>

          <section className={styles.currencyCard} data-testid="ancient-coin-balance">
            <span className={styles.currencyIcon}><LoadableImage src={ANCIENT_COIN_IMAGE} alt="Древняя монета" width={72} height={72} /></span>
            <div className={styles.currencyIdentity}><small>Игровая валюта</small><h3>Древняя монета</h3><p>Ancient Coin · торговая валюта рынка</p></div>
            <div className={styles.currencyAmount}>
              <span>Количество</span>
              <div className={styles.balanceActions}>
                <strong>{formatAmount(selectedCollectiveId === "all" ? aggregate.ancientCoin : activeBalance?.ancientCoin ?? 0)}</strong>
                {activeCollective && activeBalance && canEdit && (
                  <div className={styles.transactionButtons}>
                    <button type="button" onClick={() => openTransaction("add", { slug: ANCIENT_COIN_SLUG, name: "Древняя монета", image: ANCIENT_COIN_IMAGE, currentAmount: activeBalance.ancientCoin, availableAmount: activeBalance.ancientCoin })}>Добавить</button>
                    <button type="button" onClick={() => {
                      const availableAmount = getAvailableResourceAmount(state, requestState, collectiveState, activeCollective.id, ANCIENT_COIN_SLUG);
                      openTransaction("take", { slug: ANCIENT_COIN_SLUG, name: "Древняя монета", image: ANCIENT_COIN_IMAGE, currentAmount: activeBalance.ancientCoin, availableAmount });
                    }} disabled={getAvailableResourceAmount(state, requestState, collectiveState, activeCollective.id, ANCIENT_COIN_SLUG) === 0}>Забрать</button>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className={styles.resourceSection}>
            <header><div><span>Материальные активы</span><h3>Ресурсы</h3></div><em>{displayedResourceEntries.length} позиций</em>{activeCollective && canEdit && <button type="button" onClick={() => setPickerOpen(true)} data-testid="open-resource-picker"><Plus size={14} /> Добавить ресурс</button>}</header>
            {displayedResourceEntries.length > 0 ? (
              <div className={styles.resourceGrid}>
                {displayedResourceEntries.map(([slug, amount]) => {
                  const resource = resourcesBySlug.get(slug)!;
                  const availableAmount = activeCollective
                    ? getAvailableResourceAmount(state, requestState, collectiveState, activeCollective.id, slug)
                    : amount - getReservedResourceAmount(requestState, slug);
                  const reservedAmount = Math.max(0, amount - availableAmount);
                  return (
                    <article className={styles.resourceCard} data-testid={`resource-balance-${slug}`} key={slug}>
                      <span className={styles.resourceIcon}>{resource.image && <LoadableImage src={resource.image} alt="" width={54} height={54} />}</span>
                      <div className={styles.resourceIdentity}><strong>{resource.name}</strong><small>{resource.englishName} · T{resource.tier}</small></div>
                      <div className={styles.resourceBalanceBlock}>
                        <strong className={styles.readonlyAmount}>{formatAmount(amount)}</strong>
                        {reservedAmount > 0 && <small className={styles.reservedAmount}>В резерве {formatAmount(reservedAmount)}</small>}
                        {activeCollective && canEdit && (
                          <div className={styles.transactionButtons}>
                            <button type="button" onClick={() => openTransaction("add", { slug, name: resource.name, image: resource.image, currentAmount: amount, availableAmount: amount })}>Добавить</button>
                            <button type="button" onClick={() => openTransaction("take", { slug, name: resource.name, image: resource.image, currentAmount: amount, availableAmount })} disabled={availableAmount === 0}>Забрать</button>
                          </div>
                        )}
                      </div>
                      {activeCollective && canEdit && <button type="button" className={styles.removeResource} onClick={() => removeResource(slug)} disabled={reservedAmount > 0} title={reservedAmount > 0 ? "Ресурс зарезервирован активными заявками" : "Удалить ресурс"} aria-label={`Удалить ${resource.name}`}><Trash2 size={13} /></button>}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyResources}><Boxes size={24} /><strong>Ресурсы ещё не добавлены</strong><p>{activeCollective && canEdit ? "Добавьте нужные позиции из базы предметов." : "В выбранном разделе пока нет учтённых ресурсов."}</p></div>
            )}
          </section>

          <section className={styles.historySection}>
            <header><History size={16} /><div><span>Журнал изменений</span><h3>Последние операции</h3></div></header>
            {visibleOperations.length > 0 ? <div className={styles.operationList}>{visibleOperations.map((operation) => {
              const collective = collectiveState.collectives.find((item) => item.id === operation.collectiveId);
              const resource = operation.resourceSlug === ANCIENT_COIN_SLUG ? null : resourcesBySlug.get(operation.resourceSlug);
              return <div className={styles.operation} key={operation.id}><span className={operation.delta >= 0 ? styles.operationPositive : styles.operationNegative}>{operation.delta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} />}</span><div><strong>{resource?.name ?? "Древняя монета"}</strong><small>{collective?.name ?? "Удалённый коллектив"} · {formatOperationDate(operation.createdAt)}</small></div><em className={operation.delta >= 0 ? styles.positive : styles.negative}>{operation.delta >= 0 ? "+" : ""}{formatAmount(operation.delta)}</em><b>{formatAmount(operation.balance)}</b></div>;
            })}</div> : <div className={styles.emptyHistory}>Изменений баланса пока не было.</div>}
          </section>
        </main>
      </div>

      {pickerOpen && activeCollective && (
        <div className={styles.modalBackdrop} role="presentation">
          <section className={styles.resourcePicker} role="dialog" aria-modal="true" aria-labelledby="resource-picker-title" data-testid="resource-picker">
            <header><div><span>{activeCollective.name}</span><h2 id="resource-picker-title">Добавить ресурс</h2></div><button type="button" onClick={() => setPickerOpen(false)} aria-label="Закрыть"><X size={17} /></button></header>
            <label><Search size={15} /><input type="search" value={resourceQuery} onChange={(event) => setResourceQuery(event.target.value)} placeholder="Поиск по названию..." /></label>
            <div className={styles.pickerFilters}>
              <div className={styles.filterGroup}>
                <span>Тир</span>
                <div>
                  <button type="button" className={pickerTier === "all" ? styles.filterActive : ""} onClick={() => setPickerTier("all")}>Все</button>
                  {pickerTiers.map((tier) => <button type="button" className={pickerTier === tier ? styles.filterActive : ""} onClick={() => setPickerTier(tier)} key={tier}>T{tier}</button>)}
                </div>
              </div>
              <div className={styles.filterGroup}>
                <span>Качество</span>
                <div>
                  <button type="button" className={pickerQuality === "all" ? styles.filterActive : ""} onClick={() => setPickerQuality("all")}>Все</button>
                  {pickerQualities.map((quality) => <button type="button" className={pickerQuality === quality ? styles.filterActive : ""} onClick={() => setPickerQuality(quality)} key={quality}><i className={`${styles.qualityDot} ${styles[quality]}`} />{qualityLabels[quality]}</button>)}
                </div>
              </div>
              <div className={styles.filterGroup}>
                <span>Профессия</span>
                <div>
                  <button type="button" className={pickerProfession === "all" ? styles.filterActive : ""} onClick={() => setPickerProfession("all")}>Все</button>
                  {resourceProfessions.map((profession) => <button type="button" className={pickerProfession === profession.value ? styles.filterActive : ""} onClick={() => setPickerProfession(profession.value)} key={profession.value}>{profession.label}</button>)}
                </div>
              </div>
            </div>
            <div className={styles.pickerGrid}>
              {availableResources.slice(0, 100).map((resource) => (
                <button type="button" onClick={() => addResource(resource.slug)} data-testid={`add-resource-${resource.slug}`} key={resource.slug}>
                  <span>{resource.image && <LoadableImage src={resource.image} alt="" width={46} height={46} />}</span><div><strong>{resource.name}</strong><small>{resource.englishName} · T{resource.tier}</small></div><Plus size={14} />
                </button>
              ))}
              {availableResources.length === 0 && <div className={styles.noPickerResults}>Все подходящие ресурсы уже добавлены.</div>}
            </div>
            <footer><span>Найдено: {availableResources.length}</span><button type="button" onClick={() => setPickerOpen(false)}>Готово</button></footer>
          </section>
        </div>
      )}

      {transaction && activeCollective && (
        <div className={styles.modalBackdrop} role="presentation">
          <section className={styles.transactionModal} role="dialog" aria-modal="true" aria-labelledby="transaction-title" data-testid="resource-transaction-modal">
            <header>
              <div><span>{transaction.kind === "add" ? "Пополнение баланса" : "Списание с баланса"}</span><h2 id="transaction-title">{transaction.kind === "add" ? "Добавить ресурс" : "Забрать ресурс"}</h2></div>
              <button type="button" onClick={closeTransaction} aria-label="Закрыть"><X size={17} /></button>
            </header>
            <div className={styles.transactionBody}>
              <div className={styles.transactionResource}>
                <span>{transaction.image && <LoadableImage src={transaction.image} alt="" width={64} height={64} />}</span>
                <div><strong>{transaction.name}</strong><small>Текущий баланс: {formatAmount(transaction.currentAmount)}{transaction.kind === "take" && transaction.availableAmount < transaction.currentAmount ? ` · свободно ${formatAmount(transaction.availableAmount)}` : ""}</small></div>
              </div>
              <label className={styles.transactionInput}>
                <span>Количество</span>
                <input autoFocus type="number" min="1" max={transaction.kind === "take" ? transaction.availableAmount : undefined} step="1" value={transactionAmount} onChange={(event) => setTransactionAmount(event.target.value)} placeholder="Введите количество" data-testid="transaction-amount" />
              </label>
              {transaction.kind === "take" && transactionQuantity > transaction.availableAmount ? (
                <div className={`${styles.transactionAlert} ${styles.transactionAlertError}`}>Недостаточно свободного ресурса. Доступно: {formatAmount(transaction.availableAmount)}; остальное зарезервировано заявками.</div>
              ) : transactionQuantity > 0 ? (
                <div className={styles.transactionAlert}>Будет {transaction.kind === "add" ? "добавлено" : "забрано"} <strong>{formatAmount(transactionQuantity)}</strong> ед. ресурса «{transaction.name}».</div>
              ) : (
                <div className={styles.transactionHint}>Укажите количество для подтверждения операции.</div>
              )}
            </div>
            <footer>
              <button type="button" onClick={closeTransaction}>Отмена</button>
              <button type="button" className={styles.confirmTransaction} onClick={confirmTransaction} disabled={!transactionValid} data-testid="confirm-resource-transaction">Подтвердить</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
