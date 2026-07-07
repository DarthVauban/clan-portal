import "server-only";

import { corepunkClassesBySlug } from "@/lib/corepunk-classes";
import { getDatabasePool } from "@/lib/database";
import {
  getDiscordAvatarUrl,
  getDiscordDisplayName,
  isPortalAdminDiscordId,
  type PortalSession,
} from "@/lib/auth-session";

export type PortalRegistrationPayload = {
  profileName: string;
  characterName: string;
  classSlug: string;
};

export type PortalApplicationStatus = "pending" | "accepted" | "revoked" | "blocked";

export type PortalDirectoryCharacter = {
  id: string;
  name: string;
  classSlug: string;
};

export type PortalDirectoryPlayer = {
  id: string;
  displayName: string;
  discordNickname: string | null;
  characters: PortalDirectoryCharacter[];
  mainCharacterId: string | null;
  local: false;
};

export type BlockedPortalUser = PortalDirectoryPlayer & {
  discordId: string;
  blockedAt: string | null;
};

const collectiveApplicantManagerRoles = ["leader", "officer", "recruiter"];

function trimText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function getPortalPlayerId(discordId: string) {
  return `player-${discordId}`;
}

function toIsoString(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? new Date(value).toISOString() : null;
}

export async function getExistingPortalRegistration(discordId: string) {
  const pool = getDatabasePool();
  const result = await pool.query(
    `
      SELECT
        p.registered_at,
        p.display_name,
        p.application_status,
        c.name AS character_name,
        c.class_slug
      FROM portal_players p
      LEFT JOIN portal_player_characters c ON c.player_id = p.player_id AND c.is_main = TRUE
      WHERE p.discord_id = $1
      LIMIT 1
    `,
    [discordId],
  );
  const row = result.rows[0];
  const registeredAt = toIsoString(row?.registered_at);
  if (!registeredAt) return null;
  return {
    registeredAt,
    applicationStatus: typeof row.application_status === "string" ? row.application_status as PortalApplicationStatus : null,
    registeredProfile: typeof row.display_name === "string" && typeof row.character_name === "string" && typeof row.class_slug === "string"
      ? {
        displayName: row.display_name,
        characterName: row.character_name,
        classSlug: row.class_slug,
      }
      : null,
  };
}

function normalizeRegistrationPayload(payload: unknown): PortalRegistrationPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as Partial<PortalRegistrationPayload>;
  const profileName = trimText(candidate.profileName, 40);
  const characterName = trimText(candidate.characterName, 40);
  const classSlug = trimText(candidate.classSlug, 80);
  const heroClass = corepunkClassesBySlug.get(classSlug);
  if (!profileName || !characterName || !heroClass?.available) return null;
  return { profileName, characterName, classSlug };
}

export async function upsertPortalRegistration(session: PortalSession, rawPayload: unknown) {
  const payload = normalizeRegistrationPayload(rawPayload);
  if (!payload) return null;

  const pool = getDatabasePool();
  const playerId = getPortalPlayerId(session.discordUser.id);
  const characterId = `${playerId}-main`;
  const portalRole = isPortalAdminDiscordId(session.discordUser.id) ? "administrator" : "member";
  const applicationStatus = portalRole === "administrator" ? "accepted" : "pending";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
        INSERT INTO portal_players (
          player_id,
          discord_id,
          display_name,
          discord_nickname,
          avatar_url,
          portal_role,
          application_status,
          accepted_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $7 = 'accepted' THEN NOW() ELSE NULL END, NOW())
        ON CONFLICT (discord_id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          discord_nickname = EXCLUDED.discord_nickname,
          avatar_url = EXCLUDED.avatar_url,
          portal_role = CASE
            WHEN EXCLUDED.portal_role = 'administrator' THEN 'administrator'
            ELSE portal_players.portal_role
          END,
          application_status = CASE
            WHEN portal_players.application_status IN ('revoked', 'blocked') THEN portal_players.application_status
            WHEN EXCLUDED.application_status = 'accepted' THEN 'accepted'
            ELSE portal_players.application_status
          END,
          accepted_at = CASE
            WHEN EXCLUDED.application_status = 'accepted' AND portal_players.accepted_at IS NULL THEN NOW()
            ELSE portal_players.accepted_at
          END,
          updated_at = NOW()
      `,
      [
        playerId,
        session.discordUser.id,
        payload.profileName,
        getDiscordDisplayName(session.discordUser),
        getDiscordAvatarUrl(session.discordUser),
        portalRole,
        applicationStatus,
      ],
    );
    await client.query("DELETE FROM portal_player_characters WHERE player_id = $1", [playerId]);
    await client.query(
      `
        INSERT INTO portal_player_characters (character_id, player_id, name, class_slug, is_main, updated_at)
        VALUES ($1, $2, $3, $4, TRUE, NOW())
      `,
      [characterId, playerId, payload.characterName, payload.classSlug],
    );
    await client.query("COMMIT");
    return playerId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function hasPortalManagementRights(session: PortalSession) {
  if (isPortalAdminDiscordId(session.discordUser.id)) return true;

  const pool = getDatabasePool();
  const result = await pool.query(
    `
      SELECT portal_role
      FROM portal_players
      WHERE discord_id = $1
        AND application_status NOT IN ('revoked', 'blocked')
      LIMIT 1
    `,
    [session.discordUser.id],
  );
  const role = result.rows[0]?.portal_role;
  return role === "administrator" || role === "clan-leader";
}

export async function canManageMembershipApplicants(session: PortalSession) {
  if (await hasPortalManagementRights(session)) return true;

  const pool = getDatabasePool();
  const result = await pool.query(
    `
      SELECT 1
      FROM portal_players p
      JOIN portal_collective_members m ON m.player_id = p.player_id
      WHERE p.discord_id = $1
        AND p.application_status NOT IN ('revoked', 'blocked')
        AND m.role = ANY($2::text[])
      LIMIT 1
    `,
    [session.discordUser.id, collectiveApplicantManagerRoles],
  );
  return Boolean(result.rowCount);
}

async function canRemovePortalPlayer(session: PortalSession, playerId: string) {
  if (await hasPortalManagementRights(session)) return true;

  const pool = getDatabasePool();
  const result = await pool.query(
    `
      SELECT 1
      FROM portal_players actor
      JOIN portal_collective_members actor_member ON actor_member.player_id = actor.player_id
      JOIN portal_collective_members target_member ON target_member.collective_id = actor_member.collective_id
      WHERE actor.discord_id = $1
        AND actor.application_status NOT IN ('revoked', 'blocked')
        AND actor_member.role = 'leader'
        AND target_member.player_id = $2
      LIMIT 1
    `,
    [session.discordUser.id, playerId],
  );
  return Boolean(result.rowCount);
}

function mapApplicantRows(rows: Array<Record<string, unknown>>): PortalDirectoryPlayer[] {
  const players = new Map<string, PortalDirectoryPlayer>();
  for (const row of rows) {
    const playerId = String(row.player_id);
    const current = players.get(playerId) ?? {
      id: playerId,
      displayName: String(row.display_name),
      discordNickname: typeof row.discord_nickname === "string" ? row.discord_nickname : null,
      characters: [],
      mainCharacterId: null,
      local: false as const,
    };
    if (typeof row.character_id === "string" && typeof row.character_name === "string" && typeof row.class_slug === "string") {
      current.characters.push({
        id: row.character_id,
        name: row.character_name,
        classSlug: row.class_slug,
      });
      if (row.is_main === true) current.mainCharacterId = row.character_id;
    }
    players.set(playerId, current);
  }
  return [...players.values()].map((player) => ({
    ...player,
    mainCharacterId: player.mainCharacterId ?? player.characters[0]?.id ?? null,
  }));
}

export async function listPendingMembershipApplicants(session: PortalSession) {
  const pool = getDatabasePool();
  const canManageAll = await canManageMembershipApplicants(session);
  const result = await pool.query(
    `
      SELECT
        p.player_id,
        p.display_name,
        p.discord_nickname,
        c.character_id,
        c.name AS character_name,
        c.class_slug,
        c.is_main
      FROM portal_players p
      LEFT JOIN portal_player_characters c ON c.player_id = p.player_id
      WHERE p.application_status = 'pending'
        AND ($1::boolean OR p.discord_id = $2::text)
      ORDER BY p.registered_at ASC, c.is_main DESC, c.created_at ASC
    `,
    [canManageAll, session.discordUser.id],
  );
  return mapApplicantRows(result.rows);
}

export async function acceptPendingMembershipApplicant(session: PortalSession, playerId: unknown) {
  if (typeof playerId !== "string" || !(await canManageMembershipApplicants(session))) return false;
  const pool = getDatabasePool();
  const result = await pool.query(
    `
      UPDATE portal_players
      SET application_status = 'accepted',
          accepted_at = COALESCE(accepted_at, NOW()),
          updated_at = NOW()
      WHERE player_id = $1
        AND application_status = 'pending'
      RETURNING player_id
    `,
    [playerId],
  );
  return Boolean(result.rowCount);
}

function mapBlockedRows(rows: Array<Record<string, unknown>>): BlockedPortalUser[] {
  const players = new Map<string, BlockedPortalUser>();
  for (const row of rows) {
    const playerId = String(row.player_id);
    const current = players.get(playerId) ?? {
      id: playerId,
      displayName: String(row.display_name),
      discordNickname: typeof row.discord_nickname === "string" ? row.discord_nickname : null,
      discordId: String(row.discord_id),
      blockedAt: toIsoString(row.blocked_at),
      characters: [],
      mainCharacterId: null,
      local: false as const,
    };
    if (typeof row.character_id === "string" && typeof row.character_name === "string" && typeof row.class_slug === "string") {
      current.characters.push({
        id: row.character_id,
        name: row.character_name,
        classSlug: row.class_slug,
      });
      if (row.is_main === true) current.mainCharacterId = row.character_id;
    }
    players.set(playerId, current);
  }
  return [...players.values()].map((player) => ({
    ...player,
    mainCharacterId: player.mainCharacterId ?? player.characters[0]?.id ?? null,
  }));
}

export async function listBlockedPortalUsers(session: PortalSession) {
  if (!(await hasPortalManagementRights(session))) return null;

  const pool = getDatabasePool();
  const result = await pool.query(
    `
      SELECT
        p.player_id,
        p.discord_id,
        p.display_name,
        p.discord_nickname,
        p.updated_at AS blocked_at,
        c.character_id,
        c.name AS character_name,
        c.class_slug,
        c.is_main
      FROM portal_players p
      LEFT JOIN portal_player_characters c ON c.player_id = p.player_id
      WHERE p.application_status = 'blocked'
      ORDER BY p.updated_at DESC, c.is_main DESC, c.created_at ASC
    `,
  );
  return mapBlockedRows(result.rows);
}

export async function deletePortalPlayer(session: PortalSession, playerId: unknown) {
  if (typeof playerId !== "string" || playerId === getPortalPlayerId(session.discordUser.id)) return false;
  if (!(await canRemovePortalPlayer(session, playerId))) return false;

  const pool = getDatabasePool();
  const target = await pool.query("SELECT discord_id FROM portal_players WHERE player_id = $1 LIMIT 1", [playerId]);
  const targetDiscordId = target.rows[0]?.discord_id;
  if (typeof targetDiscordId !== "string" || isPortalAdminDiscordId(targetDiscordId)) return false;

  const result = await pool.query("DELETE FROM portal_players WHERE player_id = $1 RETURNING player_id", [playerId]);
  return Boolean(result.rowCount);
}

export async function blockPortalPlayer(session: PortalSession, playerId: unknown) {
  if (typeof playerId !== "string" || playerId === getPortalPlayerId(session.discordUser.id)) return false;
  if (!(await hasPortalManagementRights(session))) return false;

  const pool = getDatabasePool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const target = await client.query("SELECT discord_id FROM portal_players WHERE player_id = $1 FOR UPDATE", [playerId]);
    const targetDiscordId = target.rows[0]?.discord_id;
    if (typeof targetDiscordId !== "string" || isPortalAdminDiscordId(targetDiscordId)) {
      await client.query("ROLLBACK");
      return false;
    }

    await client.query("DELETE FROM portal_collective_members WHERE player_id = $1", [playerId]);
    const result = await client.query(
      `
        UPDATE portal_players
        SET application_status = 'blocked',
            accepted_at = NULL,
            updated_at = NOW()
        WHERE player_id = $1
        RETURNING player_id
      `,
      [playerId],
    );
    await client.query("COMMIT");
    return Boolean(result.rowCount);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function unblockPortalPlayer(session: PortalSession, playerId: unknown) {
  if (typeof playerId !== "string" || !(await hasPortalManagementRights(session))) return false;

  const pool = getDatabasePool();
  const result = await pool.query(
    `
      UPDATE portal_players
      SET application_status = 'pending',
          accepted_at = NULL,
          updated_at = NOW()
      WHERE player_id = $1
        AND application_status = 'blocked'
      RETURNING player_id
    `,
    [playerId],
  );
  return Boolean(result.rowCount);
}
