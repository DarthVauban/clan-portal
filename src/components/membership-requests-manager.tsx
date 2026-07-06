"use client";

import Image from "next/image";
import Link from "next/link";
import { Check, Clock3, ExternalLink, Search, UserPlus, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { corepunkClassesBySlug } from "@/lib/corepunk-classes";
import {
  COLLECTIVE_LIMIT,
  findMembership,
  getMainCharacter,
  getPlayerDirectory,
  hasAbsolutePortalRights,
  todayIso,
  useCollectiveStore,
} from "@/lib/collective-store";
import { LOCAL_PLAYER_ID, useLocalProfile } from "@/lib/profile-store";
import styles from "@/app/requests/membership/membership.module.css";

const assigningRoles = new Set(["leader", "officer", "recruiter"]);

export function MembershipRequestsManager() {
  const { profile } = useLocalProfile();
  const { state, updateState } = useCollectiveStore();
  const [query, setQuery] = useState("");
  const [targets, setTargets] = useState<Record<string, string>>({});
  const players = useMemo(() => getPlayerDirectory(profile, state), [profile, state]);
  const assignedIds = useMemo(() => new Set(state.collectives.flatMap((collective) => collective.members.map((member) => member.playerId))), [state.collectives]);
  const applicants = players.filter((player) => !assignedIds.has(player.id));
  const membership = findMembership(state, LOCAL_PLAYER_ID);
  const absoluteRights = hasAbsolutePortalRights(state, LOCAL_PLAYER_ID);
  const canAssignToOwnCollective = Boolean(membership && assigningRoles.has(membership.member.role));
  const manageableCollectives = state.collectives.filter((collective) => collective.members.length < COLLECTIVE_LIMIT
    && (absoluteRights || (canAssignToOwnCollective && collective.id === membership?.collective.id)));
  const normalizedQuery = query.trim().toLocaleLowerCase("ru");
  const filteredApplicants = applicants.filter((player) => {
    const mainCharacter = getMainCharacter(player);
    return !normalizedQuery || [player.displayName, player.discordNickname ?? "", mainCharacter?.name ?? ""]
      .some((value) => value.toLocaleLowerCase("ru").includes(normalizedQuery));
  });

  const assignPlayer = (playerId: string) => {
    const targetId = targets[playerId] || manageableCollectives[0]?.id;
    if (!targetId || assignedIds.has(playerId)) return;
    updateState((current) => ({
      ...current,
      collectives: current.collectives.map((collective) => collective.id === targetId && collective.members.length < COLLECTIVE_LIMIT
        ? {
          ...collective,
          members: [...collective.members, {
            playerId,
            role: collective.members.length === 0 ? "leader" : "member",
            joinedAt: todayIso(),
          }],
        }
        : collective),
    }));
  };

  return (
    <div className={styles.requestsLayout}>
      <section className={styles.summaryBar}>
        <div><span><UserPlus size={17} /></span><small>Ожидают распределения</small><strong>{applicants.length}</strong></div>
        <div><span><UsersRound size={17} /></span><small>Доступно коллективов</small><strong>{manageableCollectives.length}</strong></div>
        <div><span><Clock3 size={17} /></span><small>Статус очереди</small><strong>{applicants.length > 0 ? "Есть заявки" : "Очередь пуста"}</strong></div>
      </section>

      <section className={styles.requestsPanel}>
        <header>
          <div><span>Новые участники</span><h2>Заявки на вступление</h2><p>Игроки без назначенного коллектива автоматически появляются в этом списке.</p></div>
          <label><Search size={15} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти игрока или персонажа..." /></label>
        </header>

        {filteredApplicants.length > 0 ? (
          <div className={styles.requestList}>
            {filteredApplicants.map((player) => {
              const mainCharacter = getMainCharacter(player);
              const heroClass = mainCharacter ? corepunkClassesBySlug.get(mainCharacter.classSlug) : undefined;
              const selectedTarget = targets[player.id] || manageableCollectives[0]?.id || "";
              return (
                <article className={styles.requestCard} data-testid={`membership-request-${player.id}`} key={player.id}>
                  <span className={styles.playerIcon}>{heroClass ? <Image src={heroClass.image} alt="" width={48} height={48} /> : <UsersRound size={20} />}</span>
                  <div className={styles.playerIdentity}>
                    <div><strong>{player.displayName}</strong><em>Новый игрок</em></div>
                    <small>{mainCharacter ? `${mainCharacter.name} · ${heroClass?.name ?? mainCharacter.classSlug}` : "Основной персонаж не указан"}</small>
                    <p>{player.discordNickname ? `Discord: ${player.discordNickname}` : "Discord будет подключён после авторизации"}</p>
                  </div>
                  <div className={styles.requestStatus}><Clock3 size={13} /><span>Ожидает распределения</span></div>
                  <div className={styles.requestActions}>
                    <Link href={player.local ? "/profile" : `/profile/${player.id}`}><ExternalLink size={13} /> Профиль</Link>
                    {manageableCollectives.length > 0 && (
                      <>
                        <select value={selectedTarget} onChange={(event) => setTargets((current) => ({ ...current, [player.id]: event.target.value }))} aria-label={`Коллектив для ${player.displayName}`}>
                          {manageableCollectives.map((collective) => <option value={collective.id} key={collective.id}>{collective.name} · {collective.members.length}/{COLLECTIVE_LIMIT}</option>)}
                        </select>
                        <button type="button" onClick={() => assignPlayer(player.id)} data-testid={`approve-membership-${player.id}`}><Check size={14} /> Принять</button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyRequests}><span><UserPlus size={26} /></span><h3>Новых заявок пока нет</h3><p>{applicants.length === 0 ? "Все зарегистрированные игроки уже распределены по коллективам." : "По вашему запросу игроки не найдены."}</p></div>
        )}

        {!absoluteRights && !canAssignToOwnCollective && applicants.length > 0 && <div className={styles.readonlyNote}>Список доступен для просмотра. Распределять игроков могут администратор, лидер клана, лидер, офицер или рекрутер коллектива.</div>}
        {state.collectives.length === 0 && applicants.length > 0 && <div className={styles.readonlyNote}>Сначала необходимо <Link href="/collectives">создать коллектив</Link>.</div>}
      </section>
    </div>
  );
}
