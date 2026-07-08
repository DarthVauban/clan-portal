"use client";

import { History, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useCollectiveStore } from "@/lib/collective-store";
import { useResourceStore } from "@/lib/resource-store";
import { useRequestStore } from "@/lib/request-store";
import styles from "@/app/requests/requests.module.css";

const numberFormatter = new Intl.NumberFormat("ru-RU");

type AuditTab = "all" | "resources" | "requests";
type AuditRow = {
  id: string;
  tab: Exclude<AuditTab, "all">;
  collectiveId: string;
  collectiveName: string;
  title: string;
  body: string;
  actor: string;
  createdAt: string;
  searchText: string;
};

function formatAmount(value: number) {
  return numberFormatter.format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function AuditLogManager() {
  const { state: collectiveState } = useCollectiveStore();
  const { state: resourceState } = useResourceStore();
  const { state: requestState } = useRequestStore();
  const [tab, setTab] = useState<AuditTab>("all");
  const [collectiveId, setCollectiveId] = useState("all");
  const [query, setQuery] = useState("");

  const rows = useMemo<AuditRow[]>(() => {
    const resourceRows = resourceState.operations.map((operation) => {
      const action = operation.delta >= 0 ? "Пополнение" : "Списание";
      const title = `${action}: ${operation.resourceName}`;
      const body = `${operation.collectiveName || operation.collectiveId} · ${formatAmount(Math.abs(operation.delta))} · ${formatAmount(operation.balanceBefore)} → ${formatAmount(operation.balance)}`;
      const actor = operation.actor?.name || "Не указано";
      return {
        id: operation.id,
        tab: "resources",
        collectiveId: operation.collectiveId,
        collectiveName: operation.collectiveName,
        title,
        body,
        actor,
        createdAt: operation.createdAt,
        searchText: `${title} ${body} ${actor} ${operation.note}`.toLocaleLowerCase("ru"),
      } satisfies AuditRow;
    });

    const resourceRequestRows = requestState.resourceRequests.flatMap((request) => request.history.map((entry) => {
      const title = `Заявка на ресурсы: ${entry.label || request.resourceName}`;
      const body = `${request.resourceName} · ${formatAmount(request.amount)} · заказчик ${request.requester.name}`;
      const actor = entry.actor?.name ?? "Система";
      return {
        id: `${request.id}-${entry.id}`,
        tab: "requests",
        collectiveId: request.collectiveId,
        collectiveName: request.collectiveName,
        title,
        body,
        actor,
        createdAt: entry.createdAt,
        searchText: `${title} ${body} ${actor} ${entry.note}`.toLocaleLowerCase("ru"),
      } satisfies AuditRow;
    }));

    const craftRequestRows = requestState.craftRequests.flatMap((request) => request.history.map((entry) => {
      const title = `Заявка на крафт: ${entry.label || request.itemName}`;
      const body = `${request.itemName} x${formatAmount(request.quantity)} · заказчик ${request.requester.name} · исполнитель ${request.executor?.name ?? "не назначен"}`;
      const actor = entry.actor?.name ?? "Система";
      return {
        id: `${request.id}-${entry.id}`,
        tab: "requests",
        collectiveId: "all",
        collectiveName: "Крафт",
        title,
        body,
        actor,
        createdAt: entry.createdAt,
        searchText: `${title} ${body} ${actor} ${entry.note}`.toLocaleLowerCase("ru"),
      } satisfies AuditRow;
    }));

    return [...resourceRows, ...resourceRequestRows, ...craftRequestRows]
      .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())
      .slice(0, 500);
  }, [resourceState.operations, requestState.resourceRequests, requestState.craftRequests]);

  const normalizedQuery = query.trim().toLocaleLowerCase("ru");
  const visibleRows = rows.filter((row) => (
    (tab === "all" || row.tab === tab)
    && (collectiveId === "all" || row.collectiveId === collectiveId)
    && (!normalizedQuery || row.searchText.includes(normalizedQuery))
  ));

  return (
    <div className={styles.requestWorkspace}>
      <section className={styles.summaryBar}>
        <div><small>Всего событий</small><strong>{rows.length}</strong></div>
        <div><small>Операции ресурсов</small><strong>{rows.filter((row) => row.tab === "resources").length}</strong></div>
        <div><small>Статусы заявок</small><strong>{rows.filter((row) => row.tab === "requests").length}</strong></div>
      </section>

      <section className={styles.requestList}>
        <header>
          <span>Аудит</span>
          <h2>Журнал учета</h2>
          <label className={styles.searchField}>
            <Search size={15} />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по журналу..." />
          </label>
          <div className={styles.inlineTabs}>
            <button type="button" className={tab === "all" ? styles.inlineTabActive : ""} onClick={() => setTab("all")}>Все</button>
            <button type="button" className={tab === "resources" ? styles.inlineTabActive : ""} onClick={() => setTab("resources")}>Ресурсы и валюта</button>
            <button type="button" className={tab === "requests" ? styles.inlineTabActive : ""} onClick={() => setTab("requests")}>Заявки</button>
          </div>
          <div className={styles.inlineTabs}>
            <button type="button" className={collectiveId === "all" ? styles.inlineTabActive : ""} onClick={() => setCollectiveId("all")}>Все коллективы</button>
            {collectiveState.collectives.map((collective) => (
              <button type="button" className={collectiveId === collective.id ? styles.inlineTabActive : ""} onClick={() => setCollectiveId(collective.id)} key={collective.id}>{collective.name}</button>
            ))}
          </div>
        </header>

        {visibleRows.length > 0 ? visibleRows.map((row) => (
          <article className={styles.requestCard} key={row.id}>
            <div className={styles.requestIcon}><History size={22} /></div>
            <div className={styles.requestBody}>
              <div className={styles.requestTitle}>
                <strong>{row.title}</strong>
                <span>{row.tab === "resources" ? "Ресурсы" : "Заявки"}</span>
              </div>
              <p>{row.body}</p>
              <small>{formatDate(row.createdAt)} · выполнил: {row.actor}</small>
            </div>
          </article>
        )) : (
          <div className={styles.emptyQueue}>
            <History size={24} />
            <strong>Записей пока нет</strong>
            <p>Новые операции и смены статусов будут появляться здесь автоматически.</p>
          </div>
        )}
      </section>
    </div>
  );
}
