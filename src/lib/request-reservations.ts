import type { CollectiveState } from "@/lib/collective-store";
import {
  emptyCollectiveBalance,
  makeResourceOperation,
  type ResourceOperationActor,
  type ResourceState,
} from "@/lib/resource-store";
import type { CraftRequest, RequestState } from "@/lib/request-store";

export const ALL_BANK_ID = "all";
export const ANCIENT_COIN_SLUG = "ancient-coin";

type ReservationSummary = {
  specific: Record<string, Record<string, number>>;
  pooled: Record<string, number>;
  total: Record<string, number>;
};

function addAmount(target: Record<string, number>, slug: string, amount: number) {
  target[slug] = (target[slug] ?? 0) + Math.max(0, Math.floor(amount));
}

export function getRequestReservations(requestState: RequestState, excludeRequestId = ""): ReservationSummary {
  const summary: ReservationSummary = { specific: {}, pooled: {}, total: {} };

  for (const request of requestState.resourceRequests) {
    if (request.id === excludeRequestId || !["approved", "issued"].includes(request.status)) continue;
    if (request.collectiveId === ALL_BANK_ID) {
      addAmount(summary.pooled, request.resourceSlug, request.amount);
    } else {
      summary.specific[request.collectiveId] ??= {};
      addAmount(summary.specific[request.collectiveId], request.resourceSlug, request.amount);
    }
    addAmount(summary.total, request.resourceSlug, request.amount);
  }

  for (const request of requestState.craftRequests) {
    if (
      request.id === excludeRequestId
      || request.funding !== "clan"
      || request.clanApprovalStatus !== "approved"
      || !["approved", "in-progress"].includes(request.status)
    ) continue;
    for (const requirement of request.requirements) {
      if (requirement.type !== "resource") continue;
      addAmount(summary.pooled, requirement.slug, requirement.quantity);
      addAmount(summary.total, requirement.slug, requirement.quantity);
    }
  }

  return summary;
}

export function getRawResourceAmount(
  resourceState: ResourceState,
  collectiveState: CollectiveState,
  collectiveId: string,
  resourceSlug: string,
) {
  const readBalance = (id: string) => {
    const balance = resourceState.balances[id];
    if (!balance) return 0;
    return resourceSlug === ANCIENT_COIN_SLUG
      ? balance.ancientCoin
      : balance.resources[resourceSlug] ?? 0;
  };
  if (collectiveId !== ALL_BANK_ID) return readBalance(collectiveId);
  return collectiveState.collectives.reduce((total, collective) => total + readBalance(collective.id), 0);
}

export function getAvailableResourceAmount(
  resourceState: ResourceState,
  requestState: RequestState,
  collectiveState: CollectiveState,
  collectiveId: string,
  resourceSlug: string,
  excludeRequestId = "",
) {
  const reservations = getRequestReservations(requestState, excludeRequestId);
  const totalRaw = getRawResourceAmount(resourceState, collectiveState, ALL_BANK_ID, resourceSlug);
  const totalFree = Math.max(0, totalRaw - (reservations.total[resourceSlug] ?? 0));
  if (collectiveId === ALL_BANK_ID) return totalFree;
  const collectiveRaw = getRawResourceAmount(resourceState, collectiveState, collectiveId, resourceSlug);
  const collectiveReserved = reservations.specific[collectiveId]?.[resourceSlug] ?? 0;
  return Math.max(0, Math.min(collectiveRaw - collectiveReserved, totalFree));
}

export function getReservedResourceAmount(requestState: RequestState, resourceSlug: string, collectiveId = ALL_BANK_ID) {
  const reservations = getRequestReservations(requestState);
  if (collectiveId === ALL_BANK_ID) return reservations.total[resourceSlug] ?? 0;
  return reservations.specific[collectiveId]?.[resourceSlug] ?? 0;
}

export function deductClanCraftResources(
  resourceState: ResourceState,
  collectiveState: CollectiveState,
  request: CraftRequest,
  actor: ResourceOperationActor,
): ResourceState | null {
  if (request.funding !== "clan") return resourceState;
  const requiredResources = request.requirements.filter((requirement) => requirement.type === "resource");
  for (const requirement of requiredResources) {
    if (getRawResourceAmount(resourceState, collectiveState, ALL_BANK_ID, requirement.slug) < requirement.quantity) return null;
  }

  const now = new Date().toISOString();
  const balances = { ...resourceState.balances };
  const operations = [...resourceState.operations];
  for (const requirement of requiredResources) {
    let remaining = requirement.quantity;
    for (const collective of collectiveState.collectives) {
      if (remaining <= 0) break;
      const balance = balances[collective.id] ?? emptyCollectiveBalance();
      const previousAmount = balance.resources[requirement.slug] ?? 0;
      if (previousAmount <= 0) continue;
      const taken = Math.min(previousAmount, remaining);
      const nextAmount = previousAmount - taken;
      balances[collective.id] = {
        ...balance,
        resources: { ...balance.resources, [requirement.slug]: nextAmount },
        updatedAt: now,
      };
      operations.unshift(makeResourceOperation(collective.id, requirement.slug, -taken, nextAmount, {
        actor,
        balanceBefore: previousAmount,
        collectiveName: collective.name,
        resourceName: requirement.name,
        resourceImage: requirement.image,
        note: `Крафт ${request.itemName} x${request.quantity} · заявка ${request.requester.name}`,
        source: "request",
      }));
      remaining -= taken;
    }
  }
  return { balances, operations: operations.slice(0, 200) };
}
