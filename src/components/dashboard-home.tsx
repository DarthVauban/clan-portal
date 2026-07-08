"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bell, Boxes, Crown, Database, Hammer, HandCoins, ScrollText, ShieldCheck, UsersRound } from "lucide-react";
import { findMembership, getPlayerDirectory, getPortalRole, useCollectiveStore, type DirectoryPlayer } from "@/lib/collective-store";
import { LOCAL_PLAYER_ID, useLocalProfile } from "@/lib/profile-store";
import { useRequestStore, type CraftRequest, type ResourceRequest } from "@/lib/request-store";
import { useResourceStore } from "@/lib/resource-store";

const numberFormatter = new Intl.NumberFormat("ru-RU");
const activeResourceStatuses = new Set<ResourceRequest["status"]>(["pending", "approved", "issued"]);
const activeCraftStatuses = new Set<CraftRequest["status"]>(["pending", "approved", "in-progress", "issued"]);

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function playerDisplayName(player: DirectoryPlayer) {
  const mainCharacter = player.characters.find((character) => character.id === player.mainCharacterId) ?? player.characters[0];
  return player.displayName.trim() || mainCharacter?.name || "Игрок";
}

function pluralize(value: number, one: string, few: string, many: string) {
  const abs = Math.abs(value) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

export function DashboardHome() {
  const { profile } = useLocalProfile();
  const { state: collectiveState } = useCollectiveStore();
  const { state: requestState } = useRequestStore();
  const { state: resourceState } = useResourceStore();

  const directory = getPlayerDirectory(profile, collectiveState);
  const playerById = new Map(directory.map((player) => [player.id, player]));
  const localMembership = findMembership(collectiveState, LOCAL_PLAYER_ID);
  const totalCollectives = collectiveState.collectives.length;
  const totalMembers = collectiveState.collectives.reduce((sum, collective) => sum + collective.members.length, 0);
  const occupiedCollectives = collectiveState.collectives.filter((collective) => collective.members.length > 0).length;
  const activeResourceRequests = requestState.resourceRequests.filter((request) => activeResourceStatuses.has(request.status)).length;
  const activeCraftRequests = requestState.craftRequests.filter((request) => activeCraftStatuses.has(request.status)).length;
  const clanCraftApprovals = requestState.craftRequests.filter((request) => request.funding === "clan" && request.clanApprovalStatus === "pending").length;
  const activeRequests = activeResourceRequests + activeCraftRequests;
  const myRequests = [
    ...requestState.resourceRequests.filter((request) => request.requester.id === LOCAL_PLAYER_ID || request.issuer?.id === LOCAL_PLAYER_ID),
    ...requestState.craftRequests.filter((request) => request.requester.id === LOCAL_PLAYER_ID || request.executor?.id === LOCAL_PLAYER_ID),
  ].filter((request) => request.status !== "completed" && request.status !== "rejected" && request.status !== "cancelled").length;
  const resourceUnits = Object.values(resourceState.balances).reduce((sum, balance) => (
    sum + Object.values(balance.resources).reduce((resourceSum, amount) => resourceSum + amount, 0)
  ), 0);
  const resourceKinds = new Set(Object.values(resourceState.balances).flatMap((balance) => (
    Object.entries(balance.resources).filter(([, amount]) => amount > 0).map(([slug]) => slug)
  ))).size;
  const ancientCoins = Object.values(resourceState.balances).reduce((sum, balance) => sum + balance.ancientCoin, 0);
  const recentOperations = resourceState.operations.length;

  const admins = directory
    .filter((player) => getPortalRole(collectiveState, player.id) === "administrator")
    .map(playerDisplayName);
  const clanLeaders = directory
    .filter((player) => getPortalRole(collectiveState, player.id) === "clan-leader")
    .map(playerDisplayName);
  const collectiveLeaders = collectiveState.collectives.flatMap((collective) => (
    collective.members
      .filter((member) => member.role === "leader")
      .map((member) => ({
        id: `${collective.id}-${member.playerId}`,
        name: playerById.get(member.playerId) ? playerDisplayName(playerById.get(member.playerId)!) : "Игрок",
        collective: collective.name,
      }))
  ));

  const stats = [
    {
      label: "Коллективы",
      value: totalCollectives > 0 ? formatNumber(totalCollectives) : "0",
      meta: `${formatNumber(occupiedCollectives)} ${pluralize(occupiedCollectives, "активный состав", "активных состава", "активных составов")}`,
      icon: UsersRound,
    },
    {
      label: "Участники",
      value: formatNumber(totalMembers),
      meta: localMembership ? `Вы в составе: ${localMembership.collective.name}` : "суммарно по всем составам",
      icon: ShieldCheck,
    },
    {
      label: "Банк клана",
      value: formatNumber(resourceUnits),
      meta: `${formatNumber(resourceKinds)} ${pluralize(resourceKinds, "вид ресурса", "вида ресурсов", "видов ресурсов")} / ${formatNumber(ancientCoins)} монет`,
      icon: Boxes,
    },
    {
      label: "Активные заявки",
      value: formatNumber(activeRequests),
      meta: `${formatNumber(activeResourceRequests)} на ресурсы / ${formatNumber(activeCraftRequests)} на крафт`,
      icon: ScrollText,
    },
  ];

  const modules = [
    {
      title: "Коллективы",
      text: "Составы, роли и участники",
      href: "/collectives",
      icon: UsersRound,
      value: `${formatNumber(totalMembers)} игроков`,
    },
    {
      title: "База предметов",
      text: "Предметы, рецепты и компоненты",
      href: "/items",
      icon: Database,
      value: "Каталог",
    },
    {
      title: "Ресурсы",
      text: "Общий банк и история движений",
      href: "/resources",
      icon: Boxes,
      value: `${formatNumber(resourceUnits)} ед.`,
    },
    {
      title: "Заявки на ресурсы",
      text: "Очередь выдачи ресурсов и валюты",
      href: "/requests/resources",
      icon: HandCoins,
      value: formatNumber(activeResourceRequests),
    },
    {
      title: "Заявки на крафт",
      text: "Очередь крафта и согласований",
      href: "/requests/crafting",
      icon: Hammer,
      value: formatNumber(activeCraftRequests),
    },
    {
      title: "Мои заявки",
      text: "Личные заявки как заказчик и исполнитель",
      href: "/requests/my-crafting",
      icon: Bell,
      value: formatNumber(myRequests),
    },
  ];

  return (
    <div className="page-stack">
      <section className="dashboard-hero">
        <div className="hero-copy">
          <div className="eyebrow">Центр управления кланом</div>
          <h1>Живая сводка<br /><span>по клану и заявкам.</span></h1>
          <p>Главная страница показывает текущие составы, общий банк, активные заявки и быстрый переход к разделам, где сейчас нужна реакция.</p>
          <div className="hero-actions">
            <Link className="primary-button" href="/requests/my-crafting">Мои заявки <ArrowRight size={17} /></Link>
            <Link className="secondary-button" href="/requests/crafting">Очередь крафта</Link>
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
            <div><span className="surface-kicker">Быстрый доступ</span><h2>Рабочие разделы</h2></div>
            <span className="ready-label"><span /> Данные обновляются</span>
          </div>
          <div className="module-links">
            {modules.map(({ title, text, href, value, icon: Icon }) => (
              <Link className="module-link" href={href} key={href}>
                <span className="module-link-icon"><Icon size={21} /></span>
                <span className="module-link-copy"><strong>{title}</strong><small>{text}</small></span>
                <span className="module-link-value">{value}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="surface-card phase-card leadership-card">
          <span className="surface-kicker">Руководство портала</span>
          <h2>Ответственные роли</h2>
          <div className="leadership-list">
            <div className="leadership-row">
              <span className="leadership-icon"><ShieldCheck size={17} /></span>
              <div><strong>Администратор</strong><small>Полное управление порталом</small></div>
              <em>{admins.length > 0 ? admins.join(", ") : "Не назначен"}</em>
            </div>
            <div className="leadership-row">
              <span className="leadership-icon"><Crown size={17} /></span>
              <div><strong>Руководитель клана</strong><small>Клановые решения и доступы</small></div>
              <em>{clanLeaders.length > 0 ? clanLeaders.join(", ") : "Не назначен"}</em>
            </div>
            <div className="leadership-row leadership-row--stacked">
              <span className="leadership-icon"><UsersRound size={17} /></span>
              <div><strong>Руководители составов</strong><small>Лидеры отдельных коллективов</small></div>
              <div className="leader-chip-list">
                {collectiveLeaders.length > 0 ? collectiveLeaders.map((leader) => (
                  <span className="leader-chip" key={leader.id}>
                    <strong>{leader.name}</strong>
                    <small>{leader.collective}</small>
                  </span>
                )) : <em>Не назначены</em>}
              </div>
            </div>
          </div>
          <div className="dashboard-signal-row">
            <span><strong>{formatNumber(clanCraftApprovals)}</strong> заявок ждут решения по банку</span>
            <span><strong>{formatNumber(recentOperations)}</strong> операций в журнале ресурсов</span>
          </div>
        </div>
      </section>
    </div>
  );
}
