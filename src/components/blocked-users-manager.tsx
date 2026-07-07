"use client";

import Image from "next/image";
import { ShieldX, Unlock, UserRoundX, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { corepunkClassesBySlug } from "@/lib/corepunk-classes";
import { getMainCharacter, type DirectoryPlayer } from "@/lib/collective-store";
import styles from "@/app/blocked-users/blocked-users.module.css";

type BlockedUser = DirectoryPlayer & {
  discordId: string;
  blockedAt: string | null;
};

function normalizeBlockedUsers(value: unknown): BlockedUser[] {
  if (!value || typeof value !== "object") return [];
  const users = (value as { users?: unknown }).users;
  if (!Array.isArray(users)) return [];
  return users.flatMap((user) => {
    if (!user || typeof user !== "object") return [];
    const item = user as Partial<BlockedUser>;
    if (typeof item.id !== "string" || typeof item.displayName !== "string" || typeof item.discordId !== "string") return [];
    const characters = Array.isArray(item.characters)
      ? item.characters.flatMap((character) => {
        if (!character || typeof character !== "object") return [];
        const entry = character as { id?: unknown; name?: unknown; classSlug?: unknown };
        return typeof entry.id === "string" && typeof entry.name === "string" && typeof entry.classSlug === "string"
          ? [{ id: entry.id, name: entry.name, classSlug: entry.classSlug }]
          : [];
      })
      : [];
    return [{
      id: item.id,
      displayName: item.displayName,
      discordNickname: typeof item.discordNickname === "string" ? item.discordNickname : null,
      discordId: item.discordId,
      blockedAt: typeof item.blockedAt === "string" ? item.blockedAt : null,
      characters,
      mainCharacterId: typeof item.mainCharacterId === "string" ? item.mainCharacterId : characters[0]?.id ?? null,
      local: false,
    }];
  });
}

function formatDate(value: string | null) {
  if (!value) return "Дата неизвестна";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Дата неизвестна";
  return new Intl.DateTimeFormat("ru", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function BlockedUsersManager() {
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const blockedCount = useMemo(() => users.length, [users]);

  useEffect(() => {
    let cancelled = false;
    async function loadUsers() {
      setLoading(true);
      try {
        const response = await fetch("/api/blocked-users", {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Failed to load blocked users.");
        const nextUsers = normalizeBlockedUsers(await response.json());
        if (!cancelled) {
          setUsers(nextUsers);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Не удалось загрузить список заблокированных пользователей.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadUsers();
    return () => {
      cancelled = true;
    };
  }, []);

  const unblockUser = async (playerId: string) => {
    const response = await fetch("/api/blocked-users", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "unblock", playerId }),
    }).catch(() => null);
    if (!response?.ok) {
      setError("Не удалось снять блокировку.");
      return;
    }
    setUsers((current) => current.filter((user) => user.id !== playerId));
    setError(null);
  };

  return (
    <div className={styles.blockedLayout}>
      <section className={styles.summaryBar}>
        <div><span><ShieldX size={17} /></span><small>Заблокировано</small><strong>{blockedCount}</strong></div>
        <div><span><Unlock size={17} /></span><small>После разблокировки</small><strong>Заявка</strong></div>
      </section>

      <section className={styles.blockedPanel}>
        <header>
          <div><span>Доступ · Discord</span><h2>Список заблокированных пользователей</h2><p>Блокировка запрещает повторный вход по Discord ID. Разблокированный профиль вернётся в очередь заявок.</p></div>
        </header>

        {error && <div className={styles.notice}>{error}</div>}

        {loading ? (
          <div className={styles.emptyState}><UserRoundX size={26} /><h3>Загружаем список</h3><p>Проверяем активные блокировки.</p></div>
        ) : users.length > 0 ? (
          <div className={styles.blockedList}>
            {users.map((user) => {
              const mainCharacter = getMainCharacter(user);
              const heroClass = mainCharacter ? corepunkClassesBySlug.get(mainCharacter.classSlug) : undefined;
              return (
                <article className={styles.blockedCard} key={user.id}>
                  <span className={styles.playerIcon}>{heroClass ? <Image src={heroClass.image} alt="" width={48} height={48} /> : <UsersRound size={20} />}</span>
                  <div className={styles.playerIdentity}>
                    <strong>{user.displayName}</strong>
                    <small>{mainCharacter ? `${mainCharacter.name} · ${heroClass?.name ?? mainCharacter.classSlug}` : "Основной персонаж не указан"}</small>
                    <p>Discord ID: {user.discordId}</p>
                  </div>
                  <div className={styles.blockedMeta}><ShieldX size={13} /><span>{formatDate(user.blockedAt)}</span></div>
                  <button type="button" onClick={() => unblockUser(user.id)} data-testid={`unblock-${user.id}`}><Unlock size={14} /> Снять блокировку</button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyState}><UserRoundX size={26} /><h3>Заблокированных нет</h3><p>Сейчас ни один Discord ID не находится в блокировке.</p></div>
        )}
      </section>
    </div>
  );
}
