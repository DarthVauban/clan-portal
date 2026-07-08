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

type RequestHistoryEntry = {
  id: string;
  status: RequestStatus;
  label: string;
  actor: RequestActor | null;
  note: string;
  createdAt: string;
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
  approver: RequestActor | null;
  issuer: RequestActor | null;
  receiver: RequestActor | null;
  closedBy: RequestActor | null;
  cancelReason: string;
  history: RequestHistoryEntry[];
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
  clanApprover: RequestActor | null;
  completedBy: RequestActor | null;
  receiver: RequestActor | null;
  cancelledBy: RequestActor | null;
  cancelReason: string;
  history: RequestHistoryEntry[];
  requesterHidden: boolean;
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
const PORTAL_REQUEST_ACCESS_SQL = `
  SELECT 1
  FROM portal_players p
  JOIN portal_collective_members m ON m.player_id = p.player_id
  WHERE p.discord_id = $1
    AND p.application_status NOT IN ('revoked', 'blocked')
  LIMIT 1
`;
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

function normalizeNullableActor(value: unknown, session: PortalSession): RequestActor | null {
  if (!value || typeof value !== "object") return null;
  return normalizeActor(value, session);
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

function normalizeHistory(value: unknown, session: PortalSession): RequestHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Partial<RequestHistoryEntry>;
    return [{
      id: normalizeText(item.id, `history-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, 80),
      status: normalizeStatus(item.status),
      label: normalizeText(item.label, "", 100),
      actor: normalizeNullableActor(item.actor, session),
      note: typeof item.note === "string" ? item.note.trim().slice(0, 240) : "",
      createdAt: normalizeDate(item.createdAt),
    } satisfies RequestHistoryEntry];
  }).slice(0, 80);
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
        approver: normalizeNullableActor(item.approver, session),
        issuer: normalizeNullableActor(item.issuer, session),
        receiver: normalizeNullableActor(item.receiver, session),
        closedBy: normalizeNullableActor(item.closedBy, session),
        cancelReason: typeof item.cancelReason === "string" ? item.cancelReason.trim().slice(0, 240) : "",
        history: normalizeHistory(item.history, session),
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
        clanApprover: normalizeNullableActor(item.clanApprover, session),
        completedBy: normalizeNullableActor(item.completedBy, session),
        receiver: normalizeNullableActor(item.receiver, session),
        cancelledBy: normalizeNullableActor(item.cancelledBy, session),
        cancelReason: typeof item.cancelReason === "string" ? item.cancelReason.trim().slice(0, 240) : "",
        history: normalizeHistory(item.history, session),
        requesterHidden: item.requesterHidden === true,
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

function rowActor(id: unknown, name: unknown): RequestActor | null {
  return typeof id === "string" && id.trim()
    ? { id, name: typeof name === "string" && name.trim() ? name : "Игрок" }
    : null;
}

function parseHistory(value: unknown): RequestHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Partial<RequestHistoryEntry>;
    return [{
      id: typeof item.id === "string" ? item.id : `history-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      status: normalizeStatus(item.status),
      label: typeof item.label === "string" ? item.label : "",
      actor: item.actor && typeof item.actor === "object" ? rowActor((item.actor as Partial<RequestActor>).id, (item.actor as Partial<RequestActor>).name) : null,
      note: typeof item.note === "string" ? item.note : "",
      createdAt: toIso(item.createdAt),
    } satisfies RequestHistoryEntry];
  });
}

async function canAccessRequests(client: PoolClient, session: PortalSession) {
  if (isPortalAdminDiscordId(session.discordUser.id)) return true;
  const result = await client.query(PORTAL_REQUEST_ACCESS_SQL, [session.discordUser.id]);
  return Boolean(result.rowCount);
}

export async function hasPortalRequestAccess(session: PortalSession) {
  if (isPortalAdminDiscordId(session.discordUser.id)) return true;
  const pool = getDatabasePool();
  const result = await pool.query(PORTAL_REQUEST_ACCESS_SQL, [session.discordUser.id]);
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
            requester_player_id, requester_name, approver_player_id, approver_name, issuer_player_id, issuer_name,
            receiver_player_id, receiver_name, closed_by_player_id, closed_by_name, cancel_reason, status_history,
            status, created_at, updated_at
          FROM portal_resource_requests
          ORDER BY created_at DESC
          LIMIT 300
        `,
      ),
      client.query(
        `
          SELECT request_id, item_slug, item_name, item_image, recipe_id, recipe_name, quantity, note, funding,
            clan_approval_status, requester_player_id, requester_name, executor_player_id, executor_name,
            clan_approver_player_id, clan_approver_name, completed_by_player_id, completed_by_name,
            receiver_player_id, receiver_name, cancelled_by_player_id, cancelled_by_name,
            cancel_reason, status_history, requester_hidden,
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
        approver: rowActor(row.approver_player_id, row.approver_name),
        issuer: rowActor(row.issuer_player_id, row.issuer_name),
        receiver: rowActor(row.receiver_player_id, row.receiver_name),
        closedBy: rowActor(row.closed_by_player_id, row.closed_by_name),
        cancelReason: String(row.cancel_reason ?? ""),
        history: parseHistory(row.status_history),
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
          clanApprover: rowActor(row.clan_approver_player_id, row.clan_approver_name),
          completedBy: rowActor(row.completed_by_player_id, row.completed_by_name),
          receiver: rowActor(row.receiver_player_id, row.receiver_name),
          cancelledBy: rowActor(row.cancelled_by_player_id, row.cancelled_by_name),
          cancelReason: String(row.cancel_reason ?? ""),
          history: parseHistory(row.status_history),
          requesterHidden: row.requester_hidden === true,
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
            requester_player_id, requester_name, approver_player_id, approver_name, issuer_player_id, issuer_name,
            receiver_player_id, receiver_name, closed_by_player_id, closed_by_name, cancel_reason, status_history,
            status, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb, $21, $22::timestamptz, $23::timestamptz)
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
            approver_player_id = EXCLUDED.approver_player_id,
            approver_name = EXCLUDED.approver_name,
            issuer_player_id = EXCLUDED.issuer_player_id,
            issuer_name = EXCLUDED.issuer_name,
            receiver_player_id = EXCLUDED.receiver_player_id,
            receiver_name = EXCLUDED.receiver_name,
            closed_by_player_id = EXCLUDED.closed_by_player_id,
            closed_by_name = EXCLUDED.closed_by_name,
            cancel_reason = EXCLUDED.cancel_reason,
            status_history = EXCLUDED.status_history,
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
          playerIdOrNull(request.approver?.id),
          request.approver?.name ?? null,
          playerIdOrNull(request.issuer?.id),
          request.issuer?.name ?? null,
          playerIdOrNull(request.receiver?.id),
          request.receiver?.name ?? null,
          playerIdOrNull(request.closedBy?.id),
          request.closedBy?.name ?? null,
          request.cancelReason,
          JSON.stringify(request.history),
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
            clan_approver_player_id, clan_approver_name, completed_by_player_id, completed_by_name,
            receiver_player_id, receiver_name, cancelled_by_player_id, cancelled_by_name,
            cancel_reason, status_history, requester_hidden, status, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24::jsonb, $25, $26, $27::timestamptz, $28::timestamptz)
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
            clan_approver_player_id = EXCLUDED.clan_approver_player_id,
            clan_approver_name = EXCLUDED.clan_approver_name,
            completed_by_player_id = EXCLUDED.completed_by_player_id,
            completed_by_name = EXCLUDED.completed_by_name,
            receiver_player_id = EXCLUDED.receiver_player_id,
            receiver_name = EXCLUDED.receiver_name,
            cancelled_by_player_id = EXCLUDED.cancelled_by_player_id,
            cancelled_by_name = EXCLUDED.cancelled_by_name,
            cancel_reason = EXCLUDED.cancel_reason,
            status_history = EXCLUDED.status_history,
            requester_hidden = EXCLUDED.requester_hidden,
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
          playerIdOrNull(request.clanApprover?.id),
          request.clanApprover?.name ?? null,
          playerIdOrNull(request.completedBy?.id),
          request.completedBy?.name ?? null,
          playerIdOrNull(request.receiver?.id),
          request.receiver?.name ?? null,
          playerIdOrNull(request.cancelledBy?.id),
          request.cancelledBy?.name ?? null,
          request.cancelReason,
          JSON.stringify(request.history),
          request.requesterHidden,
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
