import "server-only";

import type { PortalSession } from "@/lib/auth-session";
import { isPortalAdminDiscordId } from "@/lib/auth-session";
import { getDatabasePool } from "@/lib/database";
import { emitPortalNotificationChange } from "@/lib/portal-notification-events";

export type PortalNotification = {
  id: string;
  recipientPlayerId: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  actor: { id: string; name: string } | null;
  entityType: string;
  entityId: string;
  readAt: string | null;
  createdAt: string;
};

export type PortalNotificationInput = Omit<PortalNotification, "readAt" | "createdAt"> & {
  createdAt?: string;
};

const PORTAL_NOTIFICATION_ACCESS_SQL = `
  SELECT p.player_id
  FROM portal_players p
  WHERE p.discord_id = $1
    AND p.application_status NOT IN ('revoked', 'blocked')
  LIMIT 1
`;

function currentPlayerId(session: PortalSession) {
  return `player-${session.discordUser.id}`;
}

function normalizeText(value: unknown, fallback: string, maxLength: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : fallback;
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : typeof value === "string" ? new Date(value).toISOString() : new Date().toISOString();
}

async function getNotificationPlayerId(session: PortalSession) {
  if (isPortalAdminDiscordId(session.discordUser.id)) return currentPlayerId(session);
  const pool = getDatabasePool();
  const result = await pool.query(PORTAL_NOTIFICATION_ACCESS_SQL, [session.discordUser.id]);
  return typeof result.rows[0]?.player_id === "string" ? String(result.rows[0].player_id) : null;
}

export async function hasPortalNotificationAccess(session: PortalSession) {
  return Boolean(await getNotificationPlayerId(session));
}

export async function listPortalNotifications(session: PortalSession) {
  const playerId = await getNotificationPlayerId(session);
  if (!playerId) return null;
  const pool = getDatabasePool();
  const result = await pool.query(
    `
      SELECT notification_id, recipient_player_id, kind, title, body, href,
        actor_player_id, actor_name, entity_type, entity_id, read_at, created_at
      FROM portal_notifications
      WHERE recipient_player_id = $1
      ORDER BY created_at DESC
      LIMIT 40
    `,
    [playerId],
  );
  return result.rows.map((row) => ({
    id: String(row.notification_id),
    recipientPlayerId: String(row.recipient_player_id),
    kind: String(row.kind),
    title: String(row.title),
    body: String(row.body ?? ""),
    href: String(row.href ?? ""),
    actor: row.actor_player_id ? { id: String(row.actor_player_id), name: String(row.actor_name ?? "Игрок") } : null,
    entityType: String(row.entity_type ?? ""),
    entityId: String(row.entity_id ?? ""),
    readAt: row.read_at ? toIso(row.read_at) : null,
    createdAt: toIso(row.created_at),
  } satisfies PortalNotification));
}

export async function createPortalNotifications(session: PortalSession, rawNotifications: unknown) {
  const actorFallbackId = currentPlayerId(session);
  const notifications = Array.isArray(rawNotifications) ? rawNotifications : [];
  const normalized = notifications.flatMap((notification) => {
    if (!notification || typeof notification !== "object") return [];
    const item = notification as Partial<PortalNotificationInput>;
    if (typeof item.id !== "string" || typeof item.recipientPlayerId !== "string" || typeof item.kind !== "string" || typeof item.title !== "string") return [];
    const actor = item.actor && typeof item.actor === "object"
      ? { id: normalizeText(item.actor.id, actorFallbackId, 100), name: normalizeText(item.actor.name, "Игрок", 80) }
      : null;
    if (actor?.id === item.recipientPlayerId) return [];
    return [{
      id: item.id.slice(0, 120),
      recipientPlayerId: item.recipientPlayerId.slice(0, 100),
      kind: item.kind.slice(0, 80),
      title: item.title.trim().slice(0, 120),
      body: typeof item.body === "string" ? item.body.trim().slice(0, 280) : "",
      href: typeof item.href === "string" ? item.href.trim().slice(0, 240) : "",
      actor,
      entityType: typeof item.entityType === "string" ? item.entityType.trim().slice(0, 80) : "",
      entityId: typeof item.entityId === "string" ? item.entityId.trim().slice(0, 120) : "",
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
    } satisfies PortalNotificationInput];
  }).slice(0, 40);

  if (normalized.length === 0) return listPortalNotifications(session);

  const pool = getDatabasePool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const notification of normalized) {
      await client.query(
        `
          INSERT INTO portal_notifications (
            notification_id, recipient_player_id, kind, title, body, href, actor_player_id, actor_name,
            entity_type, entity_id, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz)
          ON CONFLICT (notification_id) DO NOTHING
        `,
        [
          notification.id,
          notification.recipientPlayerId,
          notification.kind,
          notification.title,
          notification.body,
          notification.href,
          notification.actor?.id ?? null,
          notification.actor?.name ?? null,
          notification.entityType,
          notification.entityId,
          notification.createdAt,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  emitPortalNotificationChange();
  return listPortalNotifications(session);
}

export async function markPortalNotificationsRead(session: PortalSession, rawIds: unknown, markAll = false) {
  const playerId = await getNotificationPlayerId(session);
  if (!playerId) return null;
  const pool = getDatabasePool();
  if (markAll) {
    await pool.query(
      "UPDATE portal_notifications SET read_at = NOW() WHERE recipient_player_id = $1 AND read_at IS NULL",
      [playerId],
    );
  } else {
    const ids = Array.isArray(rawIds) ? rawIds.filter((id): id is string => typeof id === "string").slice(0, 40) : [];
    if (ids.length > 0) {
      await pool.query(
        "UPDATE portal_notifications SET read_at = NOW() WHERE recipient_player_id = $1 AND notification_id = ANY($2::text[])",
        [playerId, ids],
      );
    }
  }
  emitPortalNotificationChange();
  return listPortalNotifications(session);
}
