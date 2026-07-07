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

function trimText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function getPortalPlayerId(discordId: string) {
  return `player-${discordId}`;
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
            WHEN portal_players.application_status = 'revoked' THEN 'revoked'
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
  const admin = isPortalAdminDiscordId(session.discordUser.id);
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
    [admin, session.discordUser.id],
  );
  return mapApplicantRows(result.rows);
}

export async function acceptPendingMembershipApplicant(session: PortalSession, playerId: unknown) {
  if (!isPortalAdminDiscordId(session.discordUser.id) || typeof playerId !== "string") return false;
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
