import "server-only";

import type { PoolClient } from "pg";
import { getDatabasePool } from "@/lib/database";
import { isPortalAdminDiscordId, type PortalSession } from "@/lib/auth-session";
import { DEFAULT_PORTAL_NAME, normalizePortalName } from "@/lib/portal-branding";
import { emitPortalStateChange } from "@/lib/portal-live-events";
import { canManageMembershipApplicants, hasPortalManagementRights } from "@/lib/portal-player-repository";
import { emitPortalResourceChange } from "@/lib/portal-resource-events";
import {
  applicantManagerRoles,
  collectiveRoleValues,
  memberManagerRoles,
  portalRoleValues,
  roleIsIn,
  type CollectiveRole,
} from "@/lib/portal-permissions";

const LOCAL_PLAYER_ID = "local-user";
const COLLECTIVE_LIMIT = 24;
const collectiveRoles = new Set<string>(collectiveRoleValues);
const portalRoles = new Set<string>(portalRoleValues);

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
  portalName: string;
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
    portalName: normalizePortalName(source.portalName),
  };
}

type CurrentCollective = {
  id: string;
  name: string;
  tag: string;
  createdAt: string;
  members: Map<string, ServerCollectiveMember>;
};

async function getActorMembership(client: PoolClient, session: PortalSession) {
  const result = await client.query(
    `
      SELECT
        p.player_id,
        m.collective_id,
        m.role
      FROM portal_players p
      JOIN portal_collective_members m ON m.player_id = p.player_id
      WHERE p.discord_id = $1
        AND p.application_status NOT IN ('revoked', 'blocked')
      LIMIT 1
    `,
    [session.discordUser.id],
  );
  const row = result.rows[0];
  if (typeof row?.player_id !== "string" || typeof row.collective_id !== "string" || typeof row.role !== "string") return null;
  return {
    playerId: row.player_id as string,
    collectiveId: row.collective_id as string,
    role: row.role as CollectiveRole,
  };
}

async function getCurrentCollectives(client: PoolClient) {
  const result = await client.query(
    `
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
    `,
  );
  const collectives = new Map<string, CurrentCollective>();
  for (const row of result.rows) {
    const id = String(row.collective_id);
    const current = collectives.get(id) ?? {
      id,
      name: String(row.name),
      tag: String(row.tag ?? ""),
      createdAt: toDateString(row.created_at),
      members: new Map<string, ServerCollectiveMember>(),
    };
    if (typeof row.player_id === "string") {
      current.members.set(row.player_id, {
        playerId: row.player_id,
        role: typeof row.role === "string" && collectiveRoles.has(row.role) ? row.role : "member",
        joinedAt: toDateString(row.joined_at),
      });
    }
    collectives.set(id, current);
  }
  return collectives;
}

function sameCollectiveShell(next: ServerCollective, current: CurrentCollective) {
  return next.name === current.name
    && next.tag === current.tag
    && next.createdAt === current.createdAt;
}

function sameMembers(nextMembers: ServerCollectiveMember[], currentMembers: Map<string, ServerCollectiveMember>) {
  if (nextMembers.length !== currentMembers.size) return false;
  return nextMembers.every((member) => {
    const current = currentMembers.get(member.playerId);
    return current && current.role === member.role && current.joinedAt === member.joinedAt;
  });
}

async function addedPlayersArePendingApplicants(client: PoolClient, playerIds: string[]) {
  if (playerIds.length === 0) return true;
  const result = await client.query(
    `
      SELECT player_id, application_status
      FROM portal_players
      WHERE player_id = ANY($1::text[])
    `,
    [playerIds],
  );
  if (result.rowCount !== playerIds.length) return false;
  return result.rows.every((row) => row.application_status === "pending");
}

async function validateScopedStateChange(client: PoolClient, session: PortalSession, normalized: ReturnType<typeof normalizeState>) {
  const actor = await getActorMembership(client, session);
  if (!actor) return false;

  const currentCollectives = await getCurrentCollectives(client);
  if (normalized.collectives.length !== currentCollectives.size) return false;
  for (const collective of normalized.collectives) {
    const current = currentCollectives.get(collective.id);
    if (!current || !sameCollectiveShell(collective, current)) return false;
  }

  const canAcceptApplicants = roleIsIn(actor.role, applicantManagerRoles);
  const canManageMembers = roleIsIn(actor.role, memberManagerRoles);
  const currentOwnCollective = currentCollectives.get(actor.collectiveId);
  const nextOwnCollective = normalized.collectives.find((collective) => collective.id === actor.collectiveId);
  if (!currentOwnCollective || !nextOwnCollective || nextOwnCollective.members.length > COLLECTIVE_LIMIT) return false;

  for (const collective of normalized.collectives) {
    if (collective.id === actor.collectiveId) continue;
    const current = currentCollectives.get(collective.id);
    if (!current || !sameMembers(collective.members, current.members)) return false;
  }

  const nextOwnMembers = new Map(nextOwnCollective.members.map((member) => [member.playerId, member]));
  const addedPlayerIds: string[] = [];
  for (const [playerId, currentMember] of currentOwnCollective.members) {
    const nextMember = nextOwnMembers.get(playerId);
    if (!nextMember) {
      return false;
    }
    if (nextMember.joinedAt !== currentMember.joinedAt) return false;
    if (nextMember.role !== currentMember.role) {
      if (!canManageMembers || currentMember.role === "leader" || nextMember.role === "leader" || playerId === actor.playerId) return false;
    }
  }

  for (const nextMember of nextOwnCollective.members) {
    if (currentOwnCollective.members.has(nextMember.playerId)) continue;
    if (!canAcceptApplicants || nextMember.role !== "member" || nextMember.playerId === actor.playerId) return false;
    addedPlayerIds.push(nextMember.playerId);
  }

  return addedPlayersArePendingApplicants(client, addedPlayerIds);
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
  const [collectiveResult, playerResult, revokedResult, settingsResult] = await Promise.all([
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
      LEFT JOIN (
        SELECT m.*
        FROM portal_collective_members m
        JOIN portal_players p ON p.player_id = m.player_id
        WHERE p.application_status NOT IN ('revoked', 'blocked')
      ) m ON m.collective_id = c.collective_id
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
      WHERE p.application_status NOT IN ('revoked', 'blocked')
      ORDER BY p.registered_at ASC, c.is_main DESC, c.created_at ASC
    `),
    pool.query("SELECT player_id FROM portal_players WHERE application_status = 'revoked'"),
    pool.query("SELECT setting_value FROM portal_settings WHERE setting_key = 'portal_name' LIMIT 1"),
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
    portalName: normalizePortalName(settingsResult.rows[0]?.setting_value ?? DEFAULT_PORTAL_NAME),
    collectives: [...collectives.values()],
    portalRoles: Object.fromEntries(roleEntries),
    revokedPlayerIds: revokedResult.rows.flatMap((row) => typeof row.player_id === "string" ? [toClientPlayerId(row.player_id, session)] : []),
    directoryPlayers: mapPlayers(playerResult.rows, session),
  };
}

export async function savePortalCollectiveState(session: PortalSession, rawState: unknown) {
  if (!(await canManageMembershipApplicants(session))) return null;

  const pool = getDatabasePool();
  const normalized = normalizeState(rawState, session);
  const canManagePortalSettings = await hasPortalManagementRights(session);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (!canManagePortalSettings && !(await validateScopedStateChange(client, session, normalized))) {
      await client.query("ROLLBACK");
      return null;
    }

    const existingPlayers = await client.query("SELECT player_id FROM portal_players WHERE application_status NOT IN ('revoked', 'blocked')");
    const existingPlayerIds = new Set(existingPlayers.rows.map((row) => String(row.player_id)));
    const currentMemberResult = await client.query(
      `
        SELECT DISTINCT m.player_id
        FROM portal_collective_members m
        JOIN portal_players p ON p.player_id = m.player_id
        WHERE p.application_status NOT IN ('revoked', 'blocked')
      `,
    );
    const previousMemberIds = new Set(currentMemberResult.rows.map((row) => String(row.player_id)));
    const nextCollectiveIds = normalized.collectives.map((collective) => collective.id);

    if (nextCollectiveIds.length > 0) {
      await client.query("DELETE FROM portal_resource_operations WHERE NOT (collective_id = ANY($1::text[]))", [nextCollectiveIds]);
      await client.query("DELETE FROM portal_resource_balances WHERE NOT (collective_id = ANY($1::text[]))", [nextCollectiveIds]);
    } else {
      await client.query("DELETE FROM portal_resource_operations");
      await client.query("DELETE FROM portal_resource_balances");
    }

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

    const removedMemberIds = [...previousMemberIds].filter((playerId) => !memberIds.includes(playerId));
    if (removedMemberIds.length > 0) {
      await client.query(
        `
          UPDATE portal_players
          SET application_status = 'pending',
              accepted_at = NULL,
              updated_at = NOW()
          WHERE player_id = ANY($1::text[])
            AND application_status = 'accepted'
        `,
        [removedMemberIds],
      );
    }

    if (canManagePortalSettings) {
      await client.query(
        `
          INSERT INTO portal_settings (setting_key, setting_value, updated_at)
          VALUES ('portal_name', $1, NOW())
          ON CONFLICT (setting_key) DO UPDATE SET
            setting_value = EXCLUDED.setting_value,
            updated_at = NOW()
        `,
        [normalized.portalName],
      );
    }

    await client.query("COMMIT");
    emitPortalStateChange();
    emitPortalResourceChange();
    return listPortalCollectiveState(session);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function leaveOwnCollective(session: PortalSession) {
  const playerId = currentPlayerId(session);
  const pool = getDatabasePool();
  const membership = await pool.query(
    `
      SELECT
        m.collective_id,
        m.role,
        COUNT(all_members.player_id)::int AS member_count
      FROM portal_collective_members m
      JOIN portal_collective_members all_members ON all_members.collective_id = m.collective_id
      WHERE m.player_id = $1
      GROUP BY m.collective_id, m.role
      LIMIT 1
    `,
    [playerId],
  );
  const row = membership.rows[0];
  if (!row) return listPortalCollectiveState(session);
  if (row.role === "leader" && Number(row.member_count) > 1) return null;

  await pool.query("DELETE FROM portal_collective_members WHERE player_id = $1", [playerId]);
  emitPortalStateChange();
  return listPortalCollectiveState(session);
}
