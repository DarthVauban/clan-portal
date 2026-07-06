"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightLeft,
  Crown,
  ExternalLink,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { corepunkClassesBySlug } from "@/lib/corepunk-classes";
import {
  COLLECTIVE_LIMIT,
  collectiveRoleLabels,
  collectiveRoles,
  findMembership,
  formatCollectiveDate,
  getMainCharacter,
  getPortalRole,
  getPlayerDirectory,
  hasAbsolutePortalRights,
  portalRoleLabels,
  portalRoles,
  todayIso,
  type Collective,
  type CollectiveRole,
  type DirectoryPlayer,
  type PortalRole,
  useCollectiveStore,
} from "@/lib/collective-store";
import { LOCAL_PLAYER_ID, useLocalProfile } from "@/lib/profile-store";
import styles from "@/app/collectives/collectives.module.css";

const managerRoles = new Set<CollectiveRole>(["leader", "officer", "recruiter"]);

function makeCollectiveId() {
  return `collective-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function roleClass(role: CollectiveRole) {
  return styles[`role_${role.replace("-", "_")}`] ?? "";
}

function PlayerIdentity({ player, portalRole }: { player: DirectoryPlayer; portalRole: PortalRole }) {
  const mainCharacter = getMainCharacter(player);
  const heroClass = mainCharacter ? corepunkClassesBySlug.get(mainCharacter.classSlug) : undefined;
  return (
    <div className={styles.playerIdentity}>
      <span className={styles.playerClassIcon}>
        {heroClass ? <Image src={heroClass.image} alt="" width={46} height={46} /> : <UsersRound size={19} />}
      </span>
      <div>
        <strong>{player.displayName}</strong>
        <small>{mainCharacter ? `${mainCharacter.name} · ${heroClass?.name ?? mainCharacter.classSlug}` : "Основной персонаж не указан"}</small>
      </div>
      {(portalRole !== "member" || player.local) && <em>{portalRole !== "member" ? portalRoleLabels[portalRole] : "Вы"}{portalRole !== "member" && player.local ? " · Вы" : ""}</em>}
    </div>
  );
}

export function CollectivesManager() {
  const { profile } = useLocalProfile();
  const { state, updateState } = useCollectiveStore();
  const players = useMemo(() => getPlayerDirectory(profile, state), [profile, state]);
  const playersById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const [selectedCollectiveId, setSelectedCollectiveId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [transferPlayerId, setTransferPlayerId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newTag, setNewTag] = useState("");
  const [playerQuery, setPlayerQuery] = useState("");
  const [targetCollectiveId, setTargetCollectiveId] = useState("");
  const [confirmation, setConfirmation] = useState<null | { kind: "remove-member" | "delete-collective" | "revoke-player"; id: string }>(null);

  const activeCollective = state.collectives.find((collective) => collective.id === selectedCollectiveId)
    ?? state.collectives[0]
    ?? null;
  const currentMembership = activeCollective?.members.find((member) => member.playerId === LOCAL_PLAYER_ID);
  const currentRole = currentMembership?.role;
  const currentPortalRole = getPortalRole(state, LOCAL_PLAYER_ID);
  const hasAbsoluteRights = hasAbsolutePortalRights(state, LOCAL_PLAYER_ID);
  const canAddMembers = Boolean(activeCollective && (hasAbsoluteRights || activeCollective.members.length === 0 || (currentRole && managerRoles.has(currentRole))));
  const canManageRoles = hasAbsoluteRights || currentRole === "leader";
  const canTransfer = hasAbsoluteRights || currentRole === "leader";
  const assignedPlayerIds = useMemo(() => new Set(state.collectives.flatMap((collective) => collective.members.map((member) => member.playerId))), [state.collectives]);
  const unassignedPlayers = players.filter((player) => !assignedPlayerIds.has(player.id));
  const normalizedPlayerQuery = playerQuery.trim().toLocaleLowerCase("ru");
  const filteredUnassignedPlayers = unassignedPlayers.filter((player) => {
    const mainCharacter = getMainCharacter(player);
    return !normalizedPlayerQuery || [player.displayName, player.discordNickname ?? "", mainCharacter?.name ?? ""]
      .some((value) => value.toLocaleLowerCase("ru").includes(normalizedPlayerQuery));
  });
  const totalMembers = state.collectives.reduce((total, collective) => total + collective.members.length, 0);

  const createCollective = () => {
    const name = newName.trim();
    if (!name) return;
    const id = makeCollectiveId();
    const localMembership = findMembership(state, LOCAL_PLAYER_ID);
    const collective: Collective = {
      id,
      name,
      tag: newTag.trim().slice(0, 6).toLocaleUpperCase("ru"),
      createdAt: todayIso(),
      members: localMembership ? [] : [{ playerId: LOCAL_PLAYER_ID, role: "leader", joinedAt: todayIso() }],
    };
    updateState((current) => ({ ...current, collectives: [...current.collectives, collective] }));
    setSelectedCollectiveId(id);
    setNewName("");
    setNewTag("");
    setCreateOpen(false);
  };

  const addPlayer = (playerId: string) => {
    if (!activeCollective || activeCollective.members.length >= COLLECTIVE_LIMIT || assignedPlayerIds.has(playerId)) return;
    updateState((current) => ({
      ...current,
      collectives: current.collectives.map((collective) => collective.id === activeCollective.id
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

  const changeRole = (playerId: string, nextRole: CollectiveRole) => {
    if (!activeCollective || !canManageRoles) return;
    if (nextRole === "leader" && !hasAbsoluteRights) return;
    updateState((current) => ({
      ...current,
      collectives: current.collectives.map((collective) => collective.id === activeCollective.id
        ? {
          ...collective,
          members: collective.members.map((member) => {
            if (nextRole === "leader" && member.role === "leader" && member.playerId !== playerId) return { ...member, role: "member" };
            return member.playerId === playerId ? { ...member, role: nextRole } : member;
          }),
        }
        : collective),
    }));
  };

  const changePortalRole = (playerId: string, nextRole: PortalRole) => {
    if (!hasAbsoluteRights || playerId === LOCAL_PLAYER_ID) return;
    updateState((current) => ({
      ...current,
      portalRoles: { ...current.portalRoles, [playerId]: nextRole },
    }));
  };

  const openTransfer = (playerId: string) => {
    setTransferPlayerId(playerId);
    const firstTarget = state.collectives.find((collective) => collective.id !== activeCollective?.id && collective.members.length < COLLECTIVE_LIMIT);
    setTargetCollectiveId(firstTarget?.id ?? "");
  };

  const transferPlayer = () => {
    if (!activeCollective || !transferPlayerId || !targetCollectiveId || !canTransfer) return;
    const target = state.collectives.find((collective) => collective.id === targetCollectiveId);
    const member = activeCollective.members.find((entry) => entry.playerId === transferPlayerId);
    if (!target || !member || member.role === "leader" || target.members.length >= COLLECTIVE_LIMIT) return;
    updateState((current) => ({
      ...current,
      collectives: current.collectives.map((collective) => {
        if (collective.id === activeCollective.id) return { ...collective, members: collective.members.filter((entry) => entry.playerId !== transferPlayerId) };
        if (collective.id === targetCollectiveId) return {
          ...collective,
          members: [...collective.members, {
            playerId: transferPlayerId,
            role: collective.members.length === 0 ? "leader" : "member",
            joinedAt: todayIso(),
          }],
        };
        return collective;
      }),
    }));
    setTransferPlayerId(null);
    setTargetCollectiveId("");
  };

  const confirmDestructiveAction = () => {
    if (!confirmation) return;
    if (confirmation.kind === "delete-collective") {
      if (!hasAbsoluteRights) return;
      updateState((current) => ({ ...current, collectives: current.collectives.filter((collective) => collective.id !== confirmation.id) }));
      setSelectedCollectiveId(null);
    }
    if (confirmation.kind === "remove-member") {
      if (!activeCollective || (!hasAbsoluteRights && currentRole !== "leader")) return;
      const member = activeCollective.members.find((entry) => entry.playerId === confirmation.id);
      if (!member || member.role === "leader") return;
      updateState((current) => ({
        ...current,
        collectives: current.collectives.map((collective) => collective.id === activeCollective.id
          ? { ...collective, members: collective.members.filter((entry) => entry.playerId !== confirmation.id) }
          : collective),
      }));
    }
    if (confirmation.kind === "revoke-player") {
      const membership = findMembership(state, confirmation.id);
      const portalRole = getPortalRole(state, confirmation.id);
      if (!hasAbsoluteRights || membership || portalRole !== "member" || confirmation.id === LOCAL_PLAYER_ID) return;
      updateState((current) => ({
        ...current,
        revokedPlayerIds: [...new Set([...current.revokedPlayerIds, confirmation.id])],
      }));
    }
    setConfirmation(null);
  };

  const transferTargets = state.collectives.filter((collective) => collective.id !== activeCollective?.id && collective.members.length < COLLECTIVE_LIMIT);
  const transferPlayerData = transferPlayerId ? playersById.get(transferPlayerId) : undefined;
  const confirmationPlayer = confirmation && confirmation.kind !== "delete-collective" ? playersById.get(confirmation.id) : undefined;
  const confirmationCollective = confirmation?.kind === "delete-collective" ? state.collectives.find((collective) => collective.id === confirmation.id) : undefined;
  const confirmationTitle = confirmation?.kind === "delete-collective"
    ? "Удалить коллектив?"
    : confirmation?.kind === "remove-member"
      ? "Исключить игрока?"
      : "Удалить игрока с портала?";
  const confirmationText = confirmation?.kind === "delete-collective"
    ? `Коллектив «${confirmationCollective?.name ?? ""}» будет удалён. Все его участники перейдут в список свободных игроков.`
    : confirmation?.kind === "remove-member"
      ? `${confirmationPlayer?.displayName ?? "Игрок"} будет исключён из коллектива и останется свободным игроком с доступом к порталу.`
      : `${confirmationPlayer?.displayName ?? "Игрок"} будет удалён из списка свободных игроков и потеряет доступ к порталу.`;

  return (
    <div className={styles.collectivesLayout}>
      <section className={styles.overviewBar}>
        <div><span>Коллективов</span><strong>{state.collectives.length}</strong></div>
        <div><span>Участников</span><strong>{totalMembers}</strong></div>
        <div><span>Свободных игроков</span><strong>{unassignedPlayers.length}</strong></div>
        <button type="button" onClick={() => setCreateOpen(true)} disabled={!hasAbsoluteRights} data-testid="create-collective"><Plus size={16} /> Создать коллектив</button>
      </section>

      {state.collectives.length === 0 ? (
        <section className={styles.emptyCollectives}>
          <span><UsersRound size={28} /></span>
          <h2>Коллективов пока нет</h2>
          <p>Создайте первый игровой состав. Ваш профиль автоматически получит роль лидера.</p>
          <button type="button" onClick={() => setCreateOpen(true)} disabled={!hasAbsoluteRights}><Plus size={15} /> Создать первый коллектив</button>
        </section>
      ) : (
        <div className={styles.workspace}>
          <aside className={styles.collectiveSidebar}>
            <header><div><span>Структура клана</span><strong>Коллективы</strong></div><button type="button" onClick={() => setCreateOpen(true)} disabled={!hasAbsoluteRights} aria-label="Создать коллектив"><Plus size={15} /></button></header>
            <div className={styles.collectiveList}>
              {state.collectives.map((collective, index) => (
                <button
                  type="button"
                  className={`${styles.collectiveTab} ${activeCollective?.id === collective.id ? styles.collectiveTabActive : ""}`}
                  onClick={() => setSelectedCollectiveId(collective.id)}
                  data-testid={`collective-tab-${collective.id}`}
                  key={collective.id}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{collective.name}</strong><small>{collective.tag || "Без тега"}</small></div>
                  <em>{collective.members.length}/{COLLECTIVE_LIMIT}</em>
                </button>
              ))}
            </div>
          </aside>

          {activeCollective && (
            <section className={styles.collectivePanel} data-testid={`collective-panel-${activeCollective.id}`}>
              <header className={styles.collectiveHeader}>
                <div className={styles.collectiveMark}>{activeCollective.tag?.slice(0, 2) || activeCollective.name.slice(0, 2).toLocaleUpperCase("ru")}</div>
                <div><span>Коллектив · создан {formatCollectiveDate(activeCollective.createdAt)}</span><h2>{activeCollective.name}</h2><p>{activeCollective.tag ? `[${activeCollective.tag}] · ` : ""}{activeCollective.members.length} из {COLLECTIVE_LIMIT} участников</p></div>
                <div className={styles.headerActions}>
                  <div className={styles.capacityRing}><strong>{activeCollective.members.length}</strong><span>/ 24</span></div>
                  <button type="button" onClick={() => setAddMembersOpen(true)} disabled={!canAddMembers || activeCollective.members.length >= COLLECTIVE_LIMIT} data-testid="open-add-members"><UserPlus size={15} /> Добавить</button>
                  {hasAbsoluteRights && <button type="button" className={styles.deleteCollective} onClick={() => setConfirmation({ kind: "delete-collective", id: activeCollective.id })} data-testid="delete-collective"><Trash2 size={15} /> Удалить</button>}
                </div>
              </header>

              <div className={styles.permissionNote}>
                <><ShieldCheck size={14} /> Роль портала: <strong>{portalRoleLabels[currentPortalRole]}</strong></>
                {currentRole && <span className={styles.collectivePermission}>В коллективе: {collectiveRoleLabels[currentRole]}</span>}
                {canTransfer && <span><Crown size={12} /> Переводы доступны</span>}
              </div>

              {activeCollective.members.length === 0 ? (
                <div className={styles.emptyRoster}><UsersRound size={25} /><strong>Состав ещё не сформирован</strong><p>Добавьте первого игрока — он автоматически станет лидером.</p></div>
              ) : (
                <div className={styles.roster}>
                  <div className={styles.rosterHeading}><span>Участник</span><span>Роль</span><span>В составе с</span><span>Действия</span></div>
                  {activeCollective.members.map((member) => {
                    const player = playersById.get(member.playerId);
                    if (!player) return null;
                    const playerProfileHref = player.local ? "/profile" : `/profile/${player.id}`;
                    return (
                      <article className={styles.memberRow} data-testid={`member-${member.playerId}`} key={member.playerId}>
                        <PlayerIdentity player={player} portalRole={getPortalRole(state, player.id)} />
                        <div className={styles.roleCell}>
                          <select
                            value={member.role}
                            onChange={(event) => changeRole(member.playerId, event.target.value as CollectiveRole)}
                            disabled={!canManageRoles || member.role === "leader"}
                            className={roleClass(member.role)}
                            aria-label={`Роль игрока ${player.displayName}`}
                          >
                            {collectiveRoles.map((role) => <option value={role.value} disabled={role.value === "leader" && !hasAbsoluteRights} key={role.value}>{role.label}</option>)}
                          </select>
                          <select
                            value={getPortalRole(state, player.id)}
                            onChange={(event) => changePortalRole(player.id, event.target.value as PortalRole)}
                            disabled={!hasAbsoluteRights || player.id === LOCAL_PLAYER_ID}
                            aria-label={`Роль портала игрока ${player.displayName}`}
                            data-testid={`portal-role-${player.id}`}
                          >
                            {portalRoles.map((role) => <option value={role.value} key={role.value}>{role.label}</option>)}
                          </select>
                        </div>
                        <time>{formatCollectiveDate(member.joinedAt)}</time>
                        <div className={styles.memberActions}>
                          <Link href={playerProfileHref} data-testid={`open-profile-${player.id}`}><ExternalLink size={14} /> Профиль</Link>
                          {canTransfer && member.role !== "leader" && transferTargets.length > 0 && (
                            <button type="button" onClick={() => openTransfer(member.playerId)} data-testid={`transfer-${player.id}`}><ArrowRightLeft size={14} /> Перевести</button>
                          )}
                          {(hasAbsoluteRights || currentRole === "leader") && member.role !== "leader" && (
                            <button type="button" className={styles.dangerAction} onClick={() => setConfirmation({ kind: "remove-member", id: member.playerId })} data-testid={`remove-member-${player.id}`}><Trash2 size={14} /> Исключить</button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {createOpen && (
        <div className={styles.modalBackdrop} role="presentation">
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="create-collective-title" data-testid="create-collective-modal">
            <header><div><span>Новый состав</span><h2 id="create-collective-title">Создание коллектива</h2></div><button type="button" onClick={() => setCreateOpen(false)} aria-label="Закрыть"><X size={17} /></button></header>
            <label><span>Название коллектива</span><input type="text" value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={48} placeholder="Например: Основной состав" data-testid="collective-name" /></label>
            <label><span>Короткий тег</span><input type="text" value={newTag} onChange={(event) => setNewTag(event.target.value)} maxLength={6} placeholder="MAIN" data-testid="collective-tag" /></label>
            <div className={styles.modalHint}><Crown size={15} /><span>{findMembership(state, LOCAL_PLAYER_ID) ? "Коллектив будет создан без состава. Первый добавленный игрок станет лидером." : "Ваш профиль будет автоматически добавлен как лидер коллектива."}</span></div>
            <footer><button type="button" className={styles.secondaryButton} onClick={() => setCreateOpen(false)}>Отмена</button><button type="button" className={styles.primaryButton} onClick={createCollective} disabled={!newName.trim()} data-testid="confirm-create-collective">Создать коллектив</button></footer>
          </section>
        </div>
      )}

      {addMembersOpen && activeCollective && (
        <div className={styles.modalBackdrop} role="presentation">
          <section className={`${styles.modal} ${styles.playerModal}`} role="dialog" aria-modal="true" aria-labelledby="add-members-title" data-testid="add-members-modal">
            <header><div><span>{activeCollective.name}</span><h2 id="add-members-title">Добавление участников</h2></div><button type="button" onClick={() => setAddMembersOpen(false)} aria-label="Закрыть"><X size={17} /></button></header>
            <label className={styles.playerSearch}><Search size={15} /><input type="search" value={playerQuery} onChange={(event) => setPlayerQuery(event.target.value)} placeholder="Найти игрока или персонажа..." data-testid="available-player-search" /></label>
            <div className={styles.availablePlayers}>
              {filteredUnassignedPlayers.length > 0 ? filteredUnassignedPlayers.map((player) => (
                <div className={styles.availablePlayer} data-testid={`available-player-${player.id}`} key={player.id}>
                  <PlayerIdentity player={player} portalRole={getPortalRole(state, player.id)} />
                  {hasAbsoluteRights && (
                    <select value={getPortalRole(state, player.id)} onChange={(event) => changePortalRole(player.id, event.target.value as PortalRole)} disabled={player.id === LOCAL_PLAYER_ID} aria-label={`Роль портала игрока ${player.displayName}`}>
                      {portalRoles.map((role) => <option value={role.value} key={role.value}>{role.label}</option>)}
                    </select>
                  )}
                  <div className={styles.availablePlayerActions}>
                    <button type="button" onClick={() => addPlayer(player.id)} disabled={activeCollective.members.length >= COLLECTIVE_LIMIT}><UserPlus size={14} /> Добавить</button>
                    {hasAbsoluteRights && getPortalRole(state, player.id) === "member" && player.id !== LOCAL_PLAYER_ID && (
                      <button type="button" className={styles.dangerAction} onClick={() => setConfirmation({ kind: "revoke-player", id: player.id })} data-testid={`revoke-player-${player.id}`}><Trash2 size={14} /> Удалить</button>
                    )}
                  </div>
                </div>
              )) : <div className={styles.noAvailablePlayers}>Нет свободных игроков, соответствующих поиску.</div>}
            </div>
            <footer><span>Свободно мест: {COLLECTIVE_LIMIT - activeCollective.members.length}</span><button type="button" className={styles.primaryButton} onClick={() => setAddMembersOpen(false)}>Готово</button></footer>
          </section>
        </div>
      )}

      {transferPlayerId && activeCollective && (
        <div className={styles.modalBackdrop} role="presentation">
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="transfer-player-title" data-testid="transfer-player-modal">
            <header><div><span>Перевод между коллективами</span><h2 id="transfer-player-title">Перевести игрока</h2></div><button type="button" onClick={() => setTransferPlayerId(null)} aria-label="Закрыть"><X size={17} /></button></header>
            {transferPlayerData && <div className={styles.transferPlayer}><PlayerIdentity player={transferPlayerData} portalRole={getPortalRole(state, transferPlayerData.id)} /></div>}
            <label><span>Новый коллектив</span><select value={targetCollectiveId} onChange={(event) => setTargetCollectiveId(event.target.value)} data-testid="transfer-target"><option value="">Выберите коллектив</option>{transferTargets.map((collective) => <option value={collective.id} key={collective.id}>{collective.name} · {collective.members.length}/{COLLECTIVE_LIMIT}</option>)}</select></label>
            <div className={styles.modalHint}><ArrowRightLeft size={15} /><span>После перевода роль будет изменена на «Участник», а дата вступления обновится автоматически.</span></div>
            <footer><button type="button" className={styles.secondaryButton} onClick={() => setTransferPlayerId(null)}>Отмена</button><button type="button" className={styles.primaryButton} onClick={transferPlayer} disabled={!targetCollectiveId} data-testid="confirm-transfer">Перевести <ArrowRightLeft size={14} /></button></footer>
          </section>
        </div>
      )}

      {confirmation && (
        <div className={styles.modalBackdrop} role="presentation">
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="destructive-action-title" data-testid="destructive-confirmation-modal">
            <header><div><span>Подтверждение действия</span><h2 id="destructive-action-title">{confirmationTitle}</h2></div><button type="button" onClick={() => setConfirmation(null)} aria-label="Закрыть"><X size={17} /></button></header>
            <div className={`${styles.modalHint} ${styles.dangerHint}`}><Trash2 size={15} /><span>{confirmationText}</span></div>
            <footer><button type="button" className={styles.secondaryButton} onClick={() => setConfirmation(null)}>Отмена</button><button type="button" className={`${styles.primaryButton} ${styles.dangerButton}`} onClick={confirmDestructiveAction} data-testid="confirm-destructive-action">Подтвердить удаление</button></footer>
          </section>
        </div>
      )}
    </div>
  );
}
