import "server-only";

import type { PoolClient } from "pg";
import { isPortalAdminDiscordId, type PortalSession } from "@/lib/auth-session";
import { getDatabasePool } from "@/lib/database";
import { emitPortalResourceChange } from "@/lib/portal-resource-events";
import { isGlobalPortalRole, resourceManagerRoles, roleIsIn, type CollectiveRole, type PortalRole } from "@/lib/portal-permissions";

type CollectiveBalance = {
  ancientCoin: number;
  resources: Record<string, number>;
  updatedAt: string;
};

type ResourceOperation = {
  id: string;
  collectiveId: string;
  resourceSlug: string;
  delta: number;
  balance: number;
  createdAt: string;
};

type ResourceState = {
  balances: Record<string, CollectiveBalance>;
  operations: ResourceOperation[];
};

type ResourceAccess = {
  playerId: string;
  portalRole: PortalRole;
  collectiveId: string | null;
  collectiveRole: CollectiveRole | null;
};

const ANCIENT_COIN_SLUG = "ancient-coin";
const EMPTY_STATE: ResourceState = { balances: {}, operations: [] };
const MANAGEABLE_ALL_COLLECTIVES = Symbol("manageable-all-collectives");
const BALANCE_KEY_SEPARATOR = "\u0000";

type BalanceMutation = {
  collectiveId: string;
  resourceSlug: string;
  incomingAmount: number | null;
  updatedAt: string;
  delta: number;
  hasNewOperation: boolean;
};

function normalizeAmount(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
}

function normalizeDate(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

function normalizeResourceState(value: unknown): ResourceState {
  if (!value || typeof value !== "object") return EMPTY_STATE;
  const candidate = value as Partial<ResourceState>;
  const balances = candidate.balances && typeof candidate.balances === "object"
    ? Object.fromEntries(Object.entries(candidate.balances).flatMap(([collectiveId, rawBalance]) => {
      if (!collectiveId || !rawBalance || typeof rawBalance !== "object") return [];
      const balance = rawBalance as Partial<CollectiveBalance>;
      const resources = balance.resources && typeof balance.resources === "object"
        ? Object.fromEntries(Object.entries(balance.resources)
          .filter(([slug]) => typeof slug === "string" && slug.trim() && slug !== ANCIENT_COIN_SLUG)
          .map(([slug, amount]) => [slug.slice(0, 140), normalizeAmount(amount)]))
        : {};
      return [[collectiveId.slice(0, 100), {
        ancientCoin: normalizeAmount(balance.ancientCoin),
        resources,
        updatedAt: normalizeDate(balance.updatedAt),
      } satisfies CollectiveBalance]];
    }))
    : {};
  const operations = Array.isArray(candidate.operations)
    ? candidate.operations.flatMap((operation) => {
      if (!operation || typeof operation !== "object") return [];
      const entry = operation as Partial<ResourceOperation>;
      if (typeof entry.id !== "string" || typeof entry.collectiveId !== "string" || typeof entry.resourceSlug !== "string") return [];
      return [{
        id: entry.id.slice(0, 80),
        collectiveId: entry.collectiveId.slice(0, 100),
        resourceSlug: entry.resourceSlug.slice(0, 140),
        delta: typeof entry.delta === "number" ? Math.trunc(entry.delta) : Number(entry.delta) || 0,
        balance: normalizeAmount(entry.balance),
        createdAt: normalizeDate(entry.createdAt),
      } satisfies ResourceOperation];
    }).slice(0, 200)
    : [];
  return { balances, operations };
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : typeof value === "string" ? new Date(value).toISOString() : new Date().toISOString();
}

async function getResourceAccess(client: PoolClient, session: PortalSession): Promise<ResourceAccess | null> {
  const result = await client.query(
    `
      SELECT
        p.player_id,
        p.portal_role,
        m.collective_id,
        m.role AS collective_role
      FROM portal_players p
      LEFT JOIN portal_collective_members m ON m.player_id = p.player_id
      WHERE p.discord_id = $1
        AND p.application_status NOT IN ('revoked', 'blocked')
      LIMIT 1
    `,
    [session.discordUser.id],
  );
  const row = result.rows[0];
  if (typeof row?.player_id !== "string") return null;
  return {
    playerId: row.player_id,
    portalRole: typeof row.portal_role === "string" ? row.portal_role as PortalRole : "member",
    collectiveId: typeof row.collective_id === "string" ? row.collective_id : null,
    collectiveRole: typeof row.collective_role === "string" ? row.collective_role as CollectiveRole : null,
  };
}

function hasResourceReadAccess(access: ResourceAccess | null, session: PortalSession) {
  return isPortalAdminDiscordId(session.discordUser.id) || Boolean(access?.collectiveId) || Boolean(access && isGlobalPortalRole(access.portalRole));
}

function getManageableCollectives(access: ResourceAccess | null, session: PortalSession) {
  if (isPortalAdminDiscordId(session.discordUser.id) || (access && isGlobalPortalRole(access.portalRole))) return MANAGEABLE_ALL_COLLECTIVES;
  if (access?.collectiveId && roleIsIn(access.collectiveRole, resourceManagerRoles)) return new Set([access.collectiveId]);
  return new Set<string>();
}

function canManageCollective(manageableCollectives: Set<string> | typeof MANAGEABLE_ALL_COLLECTIVES, collectiveId: string) {
  return manageableCollectives === MANAGEABLE_ALL_COLLECTIVES || manageableCollectives.has(collectiveId);
}

function balanceKey(collectiveId: string, resourceSlug: string) {
  return `${collectiveId}${BALANCE_KEY_SEPARATOR}${resourceSlug}`;
}

function splitBalanceKey(key: string) {
  const [collectiveId = "", resourceSlug = ""] = key.split(BALANCE_KEY_SEPARATOR);
  return { collectiveId, resourceSlug };
}

function latestDate(first: string, second: string) {
  return new Date(first).getTime() >= new Date(second).getTime() ? first : second;
}

export async function hasPortalResourceAccess(session: PortalSession) {
  if (isPortalAdminDiscordId(session.discordUser.id)) return true;
  const pool = getDatabasePool();
  const client = await pool.connect();
  try {
    return hasResourceReadAccess(await getResourceAccess(client, session), session);
  } finally {
    client.release();
  }
}

export async function listPortalResourceState(session: PortalSession) {
  const pool = getDatabasePool();
  const client = await pool.connect();
  try {
    const access = await getResourceAccess(client, session);
    if (!hasResourceReadAccess(access, session)) return null;
    const [balanceResult, operationResult] = await Promise.all([
      client.query(
        `
          SELECT collective_id, resource_slug, amount, updated_at
          FROM portal_resource_balances
          ORDER BY collective_id, resource_slug
        `,
      ),
      client.query(
        `
          SELECT operation_id, collective_id, resource_slug, delta, balance, created_at
          FROM portal_resource_operations
          ORDER BY created_at DESC
          LIMIT 200
        `,
      ),
    ]);
    const balances: Record<string, CollectiveBalance> = {};
    for (const row of balanceResult.rows) {
      const collectiveId = String(row.collective_id);
      const resourceSlug = String(row.resource_slug);
      const current = balances[collectiveId] ?? { ancientCoin: 0, resources: {}, updatedAt: new Date(0).toISOString() };
      if (resourceSlug === ANCIENT_COIN_SLUG) {
        current.ancientCoin = normalizeAmount(row.amount);
      } else {
        current.resources[resourceSlug] = normalizeAmount(row.amount);
      }
      const updatedAt = toIso(row.updated_at);
      current.updatedAt = updatedAt > current.updatedAt ? updatedAt : current.updatedAt;
      balances[collectiveId] = current;
    }
    return {
      balances,
      operations: operationResult.rows.map((row) => ({
        id: String(row.operation_id),
        collectiveId: String(row.collective_id),
        resourceSlug: String(row.resource_slug),
        delta: Number(row.delta) || 0,
        balance: normalizeAmount(row.balance),
        createdAt: toIso(row.created_at),
      })),
    } satisfies ResourceState;
  } finally {
    client.release();
  }
}

export async function savePortalResourceState(session: PortalSession, rawState: unknown) {
  const pool = getDatabasePool();
  const client = await pool.connect();
  try {
    const access = await getResourceAccess(client, session);
    if (!hasResourceReadAccess(access, session)) return null;
    const manageableCollectives = getManageableCollectives(access, session);
    if (manageableCollectives !== MANAGEABLE_ALL_COLLECTIVES && manageableCollectives.size === 0) return null;

    const state = normalizeResourceState(rawState);
    await client.query("BEGIN");
    const [collectiveResult, existingBalanceResult] = await Promise.all([
      client.query("SELECT collective_id FROM portal_collectives"),
      client.query("SELECT collective_id, resource_slug, amount FROM portal_resource_balances"),
    ]);
    const existingCollectiveIds = new Set(collectiveResult.rows.map((row) => String(row.collective_id)));
    const existingBalances = new Map<string, number>();
    for (const row of existingBalanceResult.rows) {
      existingBalances.set(balanceKey(String(row.collective_id), String(row.resource_slug)), normalizeAmount(row.amount));
    }

    const mutations = new Map<string, BalanceMutation>();
    const incomingCollectiveIds = new Set<string>();
    const incomingResourceSlugsByCollective = new Map<string, Set<string>>();
    const deletionCandidates = new Set<string>();

    const ensureMutation = (collectiveId: string, resourceSlug: string, updatedAt: string) => {
      const key = balanceKey(collectiveId, resourceSlug);
      const current = mutations.get(key);
      if (current) {
        current.updatedAt = latestDate(current.updatedAt, updatedAt);
        return current;
      }
      const mutation: BalanceMutation = {
        collectiveId,
        resourceSlug,
        incomingAmount: null,
        updatedAt,
        delta: 0,
        hasNewOperation: false,
      };
      mutations.set(key, mutation);
      return mutation;
    };

    for (const [collectiveId, balance] of Object.entries(state.balances)) {
      if (!existingCollectiveIds.has(collectiveId) || !canManageCollective(manageableCollectives, collectiveId)) continue;
      const updatedAt = balance.updatedAt;
      incomingCollectiveIds.add(collectiveId);
      ensureMutation(collectiveId, ANCIENT_COIN_SLUG, updatedAt).incomingAmount = balance.ancientCoin;
      const resourceSlugs = new Set(Object.keys(balance.resources));
      incomingResourceSlugsByCollective.set(collectiveId, resourceSlugs);
      for (const [resourceSlug, amount] of Object.entries(balance.resources)) {
        ensureMutation(collectiveId, resourceSlug, updatedAt).incomingAmount = amount;
      }
    }

    for (const operation of state.operations) {
      if (!existingCollectiveIds.has(operation.collectiveId) || !canManageCollective(manageableCollectives, operation.collectiveId)) continue;
      const insertResult = await client.query(
        `
          INSERT INTO portal_resource_operations (
            operation_id, collective_id, resource_slug, delta, balance, actor_player_id, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
          ON CONFLICT (operation_id) DO NOTHING
          RETURNING operation_id
        `,
        [operation.id, operation.collectiveId, operation.resourceSlug, operation.delta, operation.balance, access?.playerId ?? null, operation.createdAt],
      );
      if (insertResult.rowCount === 0) continue;
      const mutation = ensureMutation(operation.collectiveId, operation.resourceSlug, operation.createdAt);
      mutation.delta += operation.delta;
      mutation.hasNewOperation = true;
      if (operation.resourceSlug !== ANCIENT_COIN_SLUG && operation.balance === 0) {
        deletionCandidates.add(balanceKey(operation.collectiveId, operation.resourceSlug));
      }
    }

    for (const collectiveId of incomingCollectiveIds) {
      const incomingResourceSlugs = incomingResourceSlugsByCollective.get(collectiveId) ?? new Set<string>();
      for (const [key, amount] of existingBalances) {
        const { collectiveId: rowCollectiveId, resourceSlug } = splitBalanceKey(key);
        if (rowCollectiveId === collectiveId && resourceSlug !== ANCIENT_COIN_SLUG && amount === 0 && !incomingResourceSlugs.has(resourceSlug)) {
          deletionCandidates.add(key);
        }
      }
    }

    for (const [key, mutation] of mutations) {
      const existingAmount = existingBalances.get(key);
      const hasExistingAmount = typeof existingAmount === "number";
      if (!mutation.hasNewOperation && (hasExistingAmount || mutation.incomingAmount === null)) continue;
      const nextAmount = hasExistingAmount
        ? Math.max(0, existingAmount + mutation.delta)
        : Math.max(0, mutation.incomingAmount ?? mutation.delta);
      await client.query(
        `
          INSERT INTO portal_resource_balances (collective_id, resource_slug, amount, updated_at)
          VALUES ($1, $2, $3, $4::timestamptz)
          ON CONFLICT (collective_id, resource_slug) DO UPDATE SET
            amount = EXCLUDED.amount,
            updated_at = EXCLUDED.updated_at
        `,
        [mutation.collectiveId, mutation.resourceSlug, nextAmount, mutation.updatedAt],
      );
      existingBalances.set(key, nextAmount);
    }

    const slugsToDeleteByCollective = new Map<string, string[]>();
    for (const key of deletionCandidates) {
      const amount = existingBalances.get(key);
      if (amount !== 0) continue;
      const { collectiveId, resourceSlug } = splitBalanceKey(key);
      if (!collectiveId || !resourceSlug || resourceSlug === ANCIENT_COIN_SLUG) continue;
      const slugs = slugsToDeleteByCollective.get(collectiveId) ?? [];
      slugs.push(resourceSlug);
      slugsToDeleteByCollective.set(collectiveId, slugs);
    }

    for (const [collectiveId, slugsToDelete] of slugsToDeleteByCollective) {
      await client.query(
        `
          DELETE FROM portal_resource_balances
          WHERE collective_id = $1
            AND resource_slug = ANY($2::text[])
        `,
        [collectiveId, [...new Set(slugsToDelete)]],
      );
    }

    await client.query("COMMIT");
    emitPortalResourceChange();
    return listPortalResourceState(session);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
