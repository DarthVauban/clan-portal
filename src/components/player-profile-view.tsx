"use client";

import { LoadableImage } from "@/components/loadable-image";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Crown, MessageCircle, Star, UsersRound } from "lucide-react";
import { corepunkClassesBySlug } from "@/lib/corepunk-classes";
import { collectiveRoleLabels, findMembership, formatCollectiveDate, getMainCharacter, getPlayerDirectory, getPortalRole, portalRoleLabels, useCollectiveStore } from "@/lib/collective-store";
import { isGlobalPortalRole } from "@/lib/portal-permissions";
import { useLocalProfile } from "@/lib/profile-store";
import styles from "@/app/profile/player-profile.module.css";

export function PlayerProfileView({ playerId }: { playerId: string }) {
  const { profile } = useLocalProfile();
  const { state } = useCollectiveStore();
  const player = getPlayerDirectory(profile, state).find((candidate) => candidate.id === playerId);

  if (!player) {
    return (
      <div className={styles.notFound}>
        <UsersRound size={28} />
        <h1>Игрок не найден</h1>
        <p>Возможно, профиль был удалён из локального каталога.</p>
        <Link href="/collectives"><ArrowLeft size={14} /> Вернуться к коллективам</Link>
      </div>
    );
  }

  const membership = findMembership(state, player.id);
  const portalRole = getPortalRole(state, player.id);
  const hasGlobalRights = isGlobalPortalRole(portalRole);
  const mainCharacter = getMainCharacter(player);
  const initials = player.displayName.slice(0, 2).toLocaleUpperCase("ru");

  return (
    <div className={styles.profilePage}>
      <Link className={styles.backLink} href="/collectives"><ArrowLeft size={14} /> Назад к коллективу</Link>
      <section className={styles.hero}>
        <div className={styles.avatar}>{initials}</div>
        <div><span>Профиль участника</span><h1>{player.displayName}</h1><p>{mainCharacter ? `Основной персонаж: ${mainCharacter.name}` : "Основной персонаж не указан"}</p></div>
        <div className={styles.roleBadge}><Crown size={14} /> {portalRole !== "member" ? portalRoleLabels[portalRole] : membership ? collectiveRoleLabels[membership.member.role] : portalRoleLabels.member}</div>
      </section>

      <section className={styles.infoGrid}>
        <div><span><Crown size={14} /> Роль портала</span><strong>{portalRoleLabels[portalRole]}</strong><small>{hasGlobalRights ? "Абсолютные права доступа" : "Стандартные права игрока"}</small></div>
        <div><span><MessageCircle size={14} /> Discord</span><strong>{player.discordNickname ?? "Не подключён"}</strong><small>Имя пользователя Discord</small></div>
        <div><span><UsersRound size={14} /> Коллектив</span><strong>{membership?.collective.name ?? "Не назначен"}</strong><small>{membership ? collectiveRoleLabels[membership.member.role] : "Игрок свободен"}</small></div>
        <div><span><CalendarDays size={14} /> Дата вступления</span><strong>{membership ? formatCollectiveDate(membership.member.joinedAt) : "—"}</strong><small>Назначается автоматически</small></div>
      </section>

      <section className={styles.characters}>
        <header><div><span>Игровые данные</span><h2>Персонажи</h2></div><em>{player.characters.length}</em></header>
        {player.characters.length > 0 ? (
          <div className={styles.characterGrid}>
            {player.characters.map((character) => {
              const heroClass = corepunkClassesBySlug.get(character.classSlug);
              const isMain = character.id === player.mainCharacterId;
              return (
                <article className={`${styles.characterCard} ${isMain ? styles.mainCharacter : ""}`} key={character.id}>
                  <span className={styles.classIcon}>{heroClass && <LoadableImage src={heroClass.image} alt="" width={58} height={58} />}</span>
                  <div><span>{isMain ? <><Star size={9} /> Основной персонаж</> : "Персонаж"}</span><strong>{character.name}</strong><small>{heroClass?.name ?? character.classSlug} · {heroClass?.family}</small></div>
                </article>
              );
            })}
          </div>
        ) : <div className={styles.emptyCharacters}>Персонажи ещё не добавлены.</div>}
      </section>
    </div>
  );
}
