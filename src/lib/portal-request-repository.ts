import "server-only";

import type { PoolClient } from "pg";
import { isPortalAdminDiscordId, type PortalSession } from "@/lib/auth-session";
import { getDatabasePool } from "@/lib/database";
import { emitPortalRequestChange } from "@/lib/portal-request-events";

type RequestStatus = "pending" | "approved" | "in-progress" | "issued" | "completed" | "rejected" | "cancelled";
type CraftFundingType = "personal" | "clan";
type ClanCraftApprovalStatus = "not-required" | "pending" | "approved" | "rejected";

type RequestActor = {
  id: string;
  name: string;
};

type ResourceRequest = {
  id: string;
  resourceSlug: string;
  resourceName: string;
  resourceImage: string | null;
  collectiveId: string;
  collectiveName: string;
  amount: number;
  purpose: string;
  requester: RequestActor;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
};

type CraftRequestRequirement = {
  slug: string;
  name: string;
  image: string | null;
  type: string;
  tier: number;
  quantity: number;
};

type CraftRequest = {
  id: string;
  itemSlug: string;
  itemName: string;
  itemImage: string | null;
  recipeId: string;
  recipeName: string;
  quantity: number;
  note: string;
  funding: CraftFundingType;
  clanApprovalStatus: ClanCraftApprovalStatus;
  requester: RequestActor;
  executor: RequestActor | null;
  requirements: CraftRequestRequirement[];
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
};

type RequestState = {
  resourceRequests: ResourceRequest[];
  craftRequests: CraftRequest[];
};

const LOCAL_PLAYER_ID = "local-user";
const EMPTY_STATE: RequestState = { resourceRequests: [], craftRequests: [] };
const validStatuses = new Set<RequestStatus>(["pending", "approved", "in-progress", "issued", "completed", "rejected", "cancelled"]);
const validCraftFundingTypes = new Set<CraftFundingType>(["personal", "clan"]);
const validClanCraftApprovalStatuses = new Set<ClanCraftApprovalStatus>(["not-required", "pending", "approved", "rejected"]);

function currentPlayerId(session: PortalSession) {
  return `player-${session.discordUser.id}`;
}

function toServerPlayerId(playerId: string, session: PortalSession) {
  return playerId === LOCAL_PLAYER_ID ? currentPlayerId(session) : playerId;
}

function normalizeText(value: unknown, fallback: string, maxLength: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : fallback;
}

function normalizeNullableText(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : null;
}

function normalizeAmount(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? Math.max(1, Math.floor(amount)) : 1;
}

function normalizeStatus(value: unknown): RequestStatus {
  return typeof value === "string" && validStatuses.has(value as RequestStatus) ? value as RequestStatus : "pending";
}

function normalizeDate(value: unknown) {
  return typeof value === "string" && value.trim() ? value : new Date().toISOString();
}

function normalizeActor(value: unknown, session: PortalSession): RequestActor {
  if (!value || typeof value !== "object") return { id: currentPlayerId(session), name: "Игрок" };
  const actor = value as Partial<RequestActor>;
  const rawId = typeof actor.id === "string" ? actor.id : currentPlayerId(session);
  return {
    id: toServerPlayerId(rawId, session),
    name: normalizeText(actor.name, "Игрок", 40),
  };
}

function normalizeCraftFunding(value: unknown): CraftFundingType {
  return typeof value === "string" && validCraftFundingTypes.has(value as CraftFundingType) ? value as CraftFundingType : "personal";
}

function normalizeClanCraftApprovalStatus(value: unknown, funding: CraftFundingType): ClanCraftApprovalStatus {
  if (funding === "personal") return "not-required";
  return typeof value === "string" && validClanCraftApprovalStatuses.has(value as ClanCraftApprovalStatus) && value !== "not-required"
    ? value as ClanCraftApprovalStatus
    : "pending";
}

function normalizeRequestState(value: unknown, session: PortalSession): RequestState {
  if (!value || typeof value !== "object") return EMPTY_STATE;
  const candidate = value as Partial<RequestState>;
  const resourceRequests = Array.isArray(candidate.resourceRequests)
    ? candidate.resourceRequests.flatMap((request) => {
      if (!request || typeof request !== "object") return [];
      const item = request as Partial<ResourceRequest>;
      if (typeof item.id !== "string" || typeof item.resourceSlug !== "string" || typeof item.collectiveId !== "string") return [];
      return [{
        id: item.id.slice(0, 80),
        resourceSlug: item.resourceSlug.slice(0, 140),
        resourceName: normalizeText(item.resourceName, item.resourceSlug, 100),
        resourceImage: normalizeNullableText(item.resourceImage, 240),
        collectiveId: item.collectiveId.slice(0, 100),
        collectiveName: normalizeText(item.collectiveName, "Коллектив", 80),
        amount: normalizeAmount(item.amount),
        purpose: typeof item.purpose === "string" ? item.purpose.trim().slice(0, 240) : "",
        requester: normalizeActor(item.requester, session),
        status: normalizeStatus(item.status),
        createdAt: normalizeDate(item.createdAt),
        updatedAt: normalizeDate(item.updatedAt),
      } satisfies ResourceRequest];
    }).slice(0, 300)
    : [];
  const craftRequests = Array.isArray(candidate.craftRequests)
    ? candidate.craftRequests.flatMap((request) => {
      if (!request || typeof request !== "object") return [];
      const item = request as Partial<CraftRequest>;
      if (typeof item.id !== "string" || typeof item.itemSlug !== "string" || typeof item.recipeId !== "string") return [];
      const funding = normalizeCraftFunding(item.funding);
      const requirements = Array.isArray(item.requirements)
        ? item.requirements.flatMap((requirement) => {
          if (!requirement || typeof requirement !== "object") return [];
          const entry = requirement as Partial<CraftRequestRequirement>;
          if (typeof entry.slug !== "string") return [];
          return [{
            slug: entry.slug.slice(0, 140),
            name: normalizeText(entry.name, entry.slug, 100),
            image: normalizeNullableText(entry.image, 240),
            type: normalizeText(entry.type, "resource", 40),
            tier: typeof entry.tier === "number" ? Math.max(0, Math.floor(entry.tier)) : 0,
            quantity: normalizeAmount(entry.quantity),
          } satisfies CraftRequestRequirement];
        }).slice(0, 80)
        : [];
      return [{
        id: item.id.slice(0, 80),
        itemSlug: item.itemSlug.slice(0, 140),
        itemName: normalizeText(item.itemName, item.itemSlug, 100),
        itemImage: normalizeNullableText(item.itemImage, 240),
        recipeId: item.recipeId.slice(0, 100),
        recipeName: normalizeText(item.recipeName, "Рецепт", 100),
        quantity: normalizeAmount(item.quantity),
        note: typeof item.note === "string" ? item.note.trim().slice(0, 240) : "",
        funding,
        clanApprovalStatus: normalizeClanCraftApprovalStatus(item.clanApprovalStatus, funding),
        requester: normalizeActor(item.requester, session),
        executor: item.executor ? normalizeActor(item.executor, session) : null,
        requirements,
        status: normalizeStatus(item.status),
        createdAt: normalizeDate(item.createdAt),
        updatedAt: normalizeDate(item.updatedAt),
      } satisfies CraftRequest];
    }).slice(0, 300)
    : [];
  return { resourceRequests, craftRequests };
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : typeof value === "string" ? new Date(value).toISOString() : new Date().toISOString();
}

async function canAccessRequests(client: PoolClient, session: PortalSession) {
  if (isPortalAdminDiscordId(session.discordUser.id)) return true;
  const result = await client.query(
    `
      SELECT 1
      FROM portal_players
      WHERE discord_id = $1
        AND application_status = 'accepted'
      LIMIT 1
    `,
    [session.discordUser.id],
  );
  return Boolean(result.rowCount);
}

export async function listPortalRequestState(session: PortalSession) {
  const pool = getDatabasePool();
  const client = await pool.connect();
  try {
    if (!(await canAccessRequests(client, session))) return null;
    const [resourceResult, craftResult, requirementResult] = await Promise.all([
      client.query(
        `
          SELECT request_id, resource_slug, resource_name, resource_image, collective_id, collective_name, amount, purpose,
            requester_player_id, requester_name, status, created_at, updated_at
          FROM portal_resource_requests
          ORDER BY created_at DESC
          LIMIT 300
        `,
      ),
      client.query(
        `
          SELECT request_id, item_slug, item_name, item_image, recipe_id, recipe_name, quantity, note, funding,
            clan_approval_status, requester_player_id, requester_name, executor_player_id, executor_name,
            status, created_at, updated_at
          FROM portal_craft_requests
          ORDER BY created_at DESC
          LIMIT 300
        `,
      ),
      client.query(
        `
          SELECT request_id, requirement_slug, requirement_name, requirement_image, requirement_type, tier, quantity
          FROM portal_craft_request_requirements
          ORDER BY request_id, position
        `,
      ),
    ]);
    const requirementsByRequest = new Map<string, CraftRequestRequirement[]>();
    for (const row of requirementResult.rows) {
      const requestId = String(row.request_id);
      const requirements = requirementsByRequest.get(requestId) ?? [];
      requirements.push({
        slug: String(row.requirement_slug),
        name: String(row.requirement_name),
        image: typeof row.requirement_image === "string" ? row.requirement_image : null,
        type: String(row.requirement_type),
        tier: Number(row.tier) || 0,
        quantity: Number(row.quantity) || 1,
      });
      requirementsByRequest.set(requestId, requirements);
    }
    return {
      resourceRequests: resourceResult.rows.map((row) => ({
        id: String(row.request_id),
        resourceSlug: String(row.resource_slug),
        resourceName: String(row.resource_name),
        resourceImage: typeof row.resource_image === "string" ? row.resource_image : null,
        collectiveId: String(row.collective_id),
        collectiveName: String(row.collective_name),
        amount: Number(row.amount) || 1,
        purpose: String(row.purpose ?? ""),
        requester: { id: String(row.requester_player_id ?? "deleted-player"), name: String(row.requester_name) },
        status: normalizeStatus(row.status),
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
      })),
      craftRequests: craftResult.rows.map((row) => {
        const funding = normalizeCraftFunding(row.funding);
        return {
          id: String(row.request_id),
          itemSlug: String(row.item_slug),
          itemName: String(row.item_name),
          itemImage: typeof row.item_image === "string" ? row.item_image : null,
          recipeId: String(row.recipe_id),
          recipeName: String(row.recipe_name),
          quantity: Number(row.quantity) || 1,
          note: String(row.note ?? ""),
          funding,
          clanApprovalStatus: normalizeClanCraftApprovalStatus(row.clan_approval_status, funding),
          requester: { id: String(row.requester_player_id ?? "deleted-player"), name: String(row.requester_name) },
          executor: row.executor_player_id ? { id: String(row.executor_player_id), name: String(row.executor_name ?? "Игрок") } : null,
          requirements: requirementsByRequest.get(String(row.request_id)) ?? [],
          status: normalizeStatus(row.status),
          createdAt: toIso(row.created_at),
          updatedAt: toIso(row.updated_at),
        } satisfies CraftRequest;
      }),
    } satisfies RequestState;
  } finally {
    client.release();
  }
}

export async function savePortalRequestState(session: PortalSession, rawState: unknown) {
  const pool = getDatabasePool();
  const client = await pool.connect();
  try {
    if (!(await canAccessRequests(client, session))) return null;
    const state = normalizeRequestState(rawState, session);
    await client.query("BEGIN");
    const playerResult = await client.query("SELECT player_id FROM portal_players");
    const existingPlayerIds = new Set(playerResult.rows.map((row) => String(row.player_id)));
    const playerIdOrNull = (playerId: string | null | undefined) => playerId && existingPlayerIds.has(playerId) ? playerId : null;

    for (const request of state.resourceRequests) {
      await client.query(
        `
          INSERT INTO portal_resource_requests (
            request_id, resource_slug, resource_name, resource_image, collective_id, collective_name, amount, purpose,
            requester_player_id, requester_name, status, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz, $13::timestamptz)
          ON CONFLICT (request_id) DO UPDATE SET
            resource_slug = EXCLUDED.resource_slug,
            resource_name = EXCLUDED.resource_name,
            resource_image = EXCLUDED.resource_image,
            collective_id = EXCLUDED.collective_id,
            collective_name = EXCLUDED.collective_name,
            amount = EXCLUDED.amount,
            purpose = EXCLUDED.purpose,
            requester_player_id = EXCLUDED.requester_player_id,
            requester_name = EXCLUDED.requester_name,
            status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at
        `,
        [
          request.id,
          request.resourceSlug,
          request.resourceName,
          request.resourceImage,
          request.collectiveId,
          request.collectiveName,
          request.amount,
          request.purpose,
          playerIdOrNull(request.requester.id),
          request.requester.name,
          request.status,
          request.createdAt,
          request.updatedAt,
        ],
      );
    }

    for (const request of state.craftRequests) {
      await client.query(
        `
          INSERT INTO portal_craft_requests (
            request_id, item_slug, item_name, item_image, recipe_id, recipe_name, quantity, note, funding,
            clan_approval_status, requester_player_id, requester_name, executor_player_id, executor_name,
            status, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::timestamptz, $17::timestamptz)
          ON CONFLICT (request_id) DO UPDATE SET
            item_slug = EXCLUDED.item_slug,
            item_name = EXCLUDED.item_name,
            item_image = EXCLUDED.item_image,
            recipe_id = EXCLUDED.recipe_id,
            recipe_name = EXCLUDED.recipe_name,
            quantity = EXCLUDED.quantity,
            note = EXCLUDED.note,
            funding = EXCLUDED.funding,
            clan_approval_status = EXCLUDED.clan_approval_status,
            requester_player_id = EXCLUDED.requester_player_id,
            requester_name = EXCLUDED.requester_name,
            executor_player_id = EXCLUDED.executor_player_id,
            executor_name = EXCLUDED.executor_name,
            status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at
        `,
        [
          request.id,
          request.itemSlug,
          request.itemName,
          request.itemImage,
          request.recipeId,
          request.recipeName,
          request.quantity,
          request.note,
          request.funding,
          request.clanApprovalStatus,
          playerIdOrNull(request.requester.id),
          request.requester.name,
          playerIdOrNull(request.executor?.id),
          request.executor?.name ?? null,
          request.status,
          request.createdAt,
          request.updatedAt,
        ],
      );
      await client.query("DELETE FROM portal_craft_request_requirements WHERE request_id = $1", [request.id]);
      for (const [position, requirement] of request.requirements.entries()) {
        await client.query(
          `
            INSERT INTO portal_craft_request_requirements (
              request_id, position, requirement_slug, requirement_name, requirement_image, requirement_type, tier, quantity
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
          [request.id, position, requirement.slug, requirement.name, requirement.image, requirement.type, requirement.tier, requirement.quantity],
        );
      }
    }

    await client.query("COMMIT");
    emitPortalRequestChange();
    return listPortalRequestState(session);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
