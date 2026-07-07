import "server-only";

import { getDatabasePool } from "@/lib/database";
import { isPortalAdminDiscordId, type PortalSession } from "@/lib/auth-session";

const LOCAL_PLAYER_ID = "local-user";
const COLLECTIVE_LIMIT = 24;
const collectiveRoles = new Set(["leader", "officer", "recruiter", "treasurer", "raid-leader", "member"]);
const portalRoles = new Set(["administrator", "clan-leader", "member"]);

type ServerCollectiveMember = {
  playerId: string;
  role: string;
  joinedAt: string;
};

type ServerCollective = {
  id: string;
  name: string;
  tag: string;
  createdAt: string;
  members: ServerCollectiveMember[];
};

type ServerDirectoryPlayer = {
  id: string;
  displayName: string;
  discordNickname: string | null;
  characters: Array<{ id: string; name: string; classSlug: string }>;
  mainCharacterId: string | null;
  local: false;
};

type ServerCollectiveState = {
  collectives: ServerCollective[];
  portalRoles: Record<string, string>;
  revokedPlayerIds: string[];
  directoryPlayers: ServerDirectoryPlayer[];
};

function currentPlayerId(session: PortalSession) {
  return `player-${session.discordUser.id}`;
}

function toClientPlayerId(playerId: string, session: PortalSession) {
  return playerId === currentPlayerId(session) ? LOCAL_PLAYER_ID : playerId;
}

function toServerPlayerId(playerId: string, session: PortalSession) {
  return playerId === LOCAL_PLAYER_ID ? currentPlayerId(session) : playerId;
}

function toDateString(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value.trim()) return value.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeState(rawState: unknown, session: PortalSession) {
  const source = rawState && typeof rawState === "object" ? rawState as Partial<ServerCollectiveState> : {};
  const assignedPlayerIds = new Set<string>();
  const collectives = Array.isArray(source.collectives)
    ? source.collectives.flatMap((collective) => {
      if (!collective || typeof collective !== "object") return [];
      const item = collective as Partial<ServerCollective>;
      const id = cleanText(item.id, 80);
      const name = cleanText(item.name, 48);
      if (!id || !name) return [];
      const members = Array.isArray(item.members)
        ? item.members.flatMap((member) => {
          if (!member || typeof member !== "object") return [];
          const entry = member as Partial<ServerCollectiveMember>;
          const playerId = toServerPlayerId(cleanText(entry.playerId, 90), session);
          if (!playerId || assignedPlayerIds.has(playerId)) return [];
          const role = typeof entry.role === "string" && collectiveRoles.has(entry.role) ? entry.role : "member";
          assignedPlayerIds.add(playerId);
          return [{ playerId, role, joinedAt: toDateString(entry.joinedAt) }];
        }).slice(0, COLLECTIVE_LIMIT)
        : [];
      return [{
        id,
        name,
        tag: cleanText(item.tag, 6).toLocaleUpperCase("ru"),
        createdAt: toDateString(item.createdAt),
        members,
      }];
    })
    : [];

  const portalRoleEntries = source.portalRoles && typeof source.portalRoles === "object"
    ? Object.entries(source.portalRoles).flatMap(([rawPlayerId, rawRole]) => {
      const playerId = toServerPlayerId(cleanText(rawPlayerId, 90), session);
      const role = typeof rawRole === "string" && portalRoles.has(rawRole) ? rawRole : null;
      return playerId && role ? [[playerId, role] as const] : [];
    })
    : [];

  return {
    collectives,
    portalRoles: Object.fromEntries(portalRoleEntries),
  };
}

function mapPlayers(rows: Array<Record<string, unknown>>, session: PortalSession): ServerDirectoryPlayer[] {
  const players = new Map<string, ServerDirectoryPlayer>();
  for (const row of rows) {
    const rawPlayerId = String(row.player_id);
    if (rawPlayerId === currentPlayerId(session)) continue;
    const playerId = toClientPlayerId(rawPlayerId, session);
    const current = players.get(playerId) ?? {
      id: playerId,
      displayName: String(row.display_name),
      discordNickname: typeof row.discord_nickname === "string" ? row.discord_nickname : null,
      characters: [],
      mainCharacterId: null,
      local: false as const,
    };
    if (typeof row.character_id === "string" && typeof row.character_name === "string" && typeof row.class_slug === "string") {
      current.characters.push({ id: row.character_id, name: row.character_name, classSlug: row.class_slug });
      if (row.is_main === true) current.mainCharacterId = row.character_id;
    }
    players.set(playerId, current);
  }
  return [...players.values()].map((player) => ({
    ...player,
    mainCharacterId: player.mainCharacterId ?? player.characters[0]?.id ?? null,
  }));
}

export async function listPortalCollectiveState(session: PortalSession): Promise<ServerCollectiveState> {
  const pool = getDatabasePool();
  const [collectiveResult, playerResult, revokedResult] = await Promise.all([
    pool.query(`
      SELECT
        c.collective_id,
        c.name,
        c.tag,
        c.created_at,
        m.player_id,
        m.role,
        m.joined_at
      FROM portal_collectives c
      LEFT JOIN portal_collective_members m ON m.collective_id = c.collective_id
      ORDER BY c.created_at ASC, c.name ASC, m.joined_at ASC
    `),
    pool.query(`
      SELECT
        p.player_id,
        p.display_name,
        p.discord_nickname,
        p.portal_role,
        c.character_id,
        c.name AS character_name,
        c.class_slug,
        c.is_main
      FROM portal_players p
      LEFT JOIN portal_player_characters c ON c.player_id = p.player_id
      WHERE p.application_status <> 'revoked'
      ORDER BY p.registered_at ASC, c.is_main DESC, c.created_at ASC
    `),
    pool.query("SELECT player_id FROM portal_players WHERE application_status = 'revoked'"),
  ]);

  const collectives = new Map<string, ServerCollective>();
  for (const row of collectiveResult.rows) {
    const id = String(row.collective_id);
    const current = collectives.get(id) ?? {
      id,
      name: String(row.name),
      tag: String(row.tag ?? ""),
      createdAt: toDateString(row.created_at),
      members: [],
    };
    if (typeof row.player_id === "string") {
      current.members.push({
        playerId: toClientPlayerId(row.player_id, session),
        role: String(row.role ?? "member"),
        joinedAt: toDateString(row.joined_at),
      });
    }
    collectives.set(id, current);
  }

  const roleEntries = playerResult.rows.flatMap((row) => {
    if (typeof row.player_id !== "string" || typeof row.portal_role !== "string") return [];
    return [[toClientPlayerId(row.player_id, session), row.portal_role] as const];
  });
  if (isPortalAdminDiscordId(session.discordUser.id)) roleEntries.push([LOCAL_PLAYER_ID, "administrator"]);

  return {
    collectives: [...collectives.values()],
    portalRoles: Object.fromEntries(roleEntries),
    revokedPlayerIds: revokedResult.rows.flatMap((row) => typeof row.player_id === "string" ? [toClientPlayerId(row.player_id, session)] : []),
    directoryPlayers: mapPlayers(playerResult.rows, session),
  };
}

export async function savePortalCollectiveState(session: PortalSession, rawState: unknown) {
  if (!isPortalAdminDiscordId(session.discordUser.id)) return null;

  const pool = getDatabasePool();
  const normalized = normalizeState(rawState, session);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existingPlayers = await client.query("SELECT player_id FROM portal_players WHERE application_status <> 'revoked'");
    const existingPlayerIds = new Set(existingPlayers.rows.map((row) => String(row.player_id)));

    await client.query("DELETE FROM portal_collective_members");
    await client.query("DELETE FROM portal_collectives");

    for (const collective of normalized.collectives) {
      await client.query(
        `
          INSERT INTO portal_collectives (collective_id, name, tag, created_at, updated_at)
          VALUES ($1, $2, $3, $4::date, NOW())
        `,
        [collective.id, collective.name, collective.tag, collective.createdAt],
      );
      for (const member of collective.members) {
        if (!existingPlayerIds.has(member.playerId)) continue;
        await client.query(
          `
            INSERT INTO portal_collective_members (collective_id, player_id, role, joined_at, updated_at)
            VALUES ($1, $2, $3, $4::date, NOW())
          `,
          [collective.id, member.playerId, member.role, member.joinedAt],
        );
      }
    }

    const memberIds = [...new Set(normalized.collectives.flatMap((collective) => collective.members.map((member) => member.playerId)))].filter((playerId) => existingPlayerIds.has(playerId));
    if (memberIds.length > 0) {
      await client.query(
        `
          UPDATE portal_players
          SET application_status = 'accepted',
              accepted_at = COALESCE(accepted_at, NOW()),
              updated_at = NOW()
          WHERE player_id = ANY($1::text[])
        `,
        [memberIds],
      );
    }

    for (const [playerId, role] of Object.entries(normalized.portalRoles)) {
      if (!existingPlayerIds.has(playerId) || !portalRoles.has(role)) continue;
      await client.query("UPDATE portal_players SET portal_role = $2, updated_at = NOW() WHERE player_id = $1", [playerId, role]);
    }

    await client.query("COMMIT");
    return listPortalCollectiveState(session);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
