"use client";

import { useEffect, useSyncExternalStore } from "react";

export type RequestStatus = "pending" | "approved" | "in-progress" | "issued" | "completed" | "rejected" | "cancelled";
export type CraftFundingType = "personal" | "clan";
export type ClanCraftApprovalStatus = "not-required" | "pending" | "approved" | "rejected";

export type RequestActor = {
  id: string;
  name: string;
};

export type ResourceRequest = {
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

export type CraftRequestRequirement = {
  slug: string;
  name: string;
  image: string | null;
  type: string;
  tier: number;
  quantity: number;
};

export type CraftRequest = {
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

export type RequestState = {
  resourceRequests: ResourceRequest[];
  craftRequests: CraftRequest[];
};

const STORAGE_KEY = "clan-portal:requests";
const STORE_EVENT = "clan-portal:requests-change";
const EMPTY_STATE: RequestState = { resourceRequests: [], craftRequests: [] };
const validStatuses = new Set<RequestStatus>(["pending", "approved", "in-progress", "issued", "completed", "rejected", "cancelled"]);
const validCraftFundingTypes = new Set<CraftFundingType>(["personal", "clan"]);
const validClanCraftApprovalStatuses = new Set<ClanCraftApprovalStatus>(["not-required", "pending", "approved", "rejected"]);
let cachedRaw: string | null | undefined;
let cachedState = EMPTY_STATE;

function normalizeAmount(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? Math.max(1, Math.floor(amount)) : 1;
}

function normalizeActor(value: unknown): RequestActor {
  if (!value || typeof value !== "object") return { id: "local-user", name: "Игрок" };
  const actor = value as Partial<RequestActor>;
  return {
    id: typeof actor.id === "string" ? actor.id : "local-user",
    name: typeof actor.name === "string" && actor.name.trim() ? actor.name.trim().slice(0, 40) : "Игрок",
  };
}

function normalizeStatus(value: unknown): RequestStatus {
  return typeof value === "string" && validStatuses.has(value as RequestStatus) ? value as RequestStatus : "pending";
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

function normalizeDate(value: unknown) {
  return typeof value === "string" && value.trim() ? value : new Date().toISOString();
}

function normalizeState(value: unknown): RequestState {
  if (!value || typeof value !== "object") return EMPTY_STATE;
  const candidate = value as Partial<RequestState>;
  const resourceRequests = Array.isArray(candidate.resourceRequests)
    ? candidate.resourceRequests.flatMap((request) => {
      if (!request || typeof request !== "object") return [];
      const item = request as Partial<ResourceRequest>;
      if (typeof item.id !== "string" || typeof item.resourceSlug !== "string" || typeof item.collectiveId !== "string") return [];
      return [{
        id: item.id,
        resourceSlug: item.resourceSlug,
        resourceName: typeof item.resourceName === "string" && item.resourceName.trim() ? item.resourceName.trim().slice(0, 80) : item.resourceSlug,
        resourceImage: typeof item.resourceImage === "string" ? item.resourceImage : null,
        collectiveId: item.collectiveId,
        collectiveName: typeof item.collectiveName === "string" && item.collectiveName.trim() ? item.collectiveName.trim().slice(0, 48) : "Коллектив",
        amount: normalizeAmount(item.amount),
        purpose: typeof item.purpose === "string" ? item.purpose.trim().slice(0, 240) : "",
        requester: normalizeActor(item.requester),
        status: normalizeStatus(item.status),
        createdAt: normalizeDate(item.createdAt),
        updatedAt: normalizeDate(item.updatedAt),
      } satisfies ResourceRequest];
    }).slice(0, 200)
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
            slug: entry.slug,
            name: typeof entry.name === "string" && entry.name.trim() ? entry.name.trim().slice(0, 80) : entry.slug,
            image: typeof entry.image === "string" ? entry.image : null,
            type: typeof entry.type === "string" ? entry.type : "resource",
            tier: typeof entry.tier === "number" ? Math.max(0, Math.floor(entry.tier)) : 0,
            quantity: normalizeAmount(entry.quantity),
          } satisfies CraftRequestRequirement];
        }).slice(0, 60)
        : [];
      return [{
        id: item.id,
        itemSlug: item.itemSlug,
        itemName: typeof item.itemName === "string" && item.itemName.trim() ? item.itemName.trim().slice(0, 80) : item.itemSlug,
        itemImage: typeof item.itemImage === "string" ? item.itemImage : null,
        recipeId: item.recipeId,
        recipeName: typeof item.recipeName === "string" && item.recipeName.trim() ? item.recipeName.trim().slice(0, 80) : "Рецепт",
        quantity: normalizeAmount(item.quantity),
        note: typeof item.note === "string" ? item.note.trim().slice(0, 240) : "",
        funding,
        clanApprovalStatus: normalizeClanCraftApprovalStatus(item.clanApprovalStatus, funding),
        requester: normalizeActor(item.requester),
        executor: item.executor ? normalizeActor(item.executor) : null,
        requirements,
        status: normalizeStatus(item.status),
        createdAt: normalizeDate(item.createdAt),
        updatedAt: normalizeDate(item.updatedAt),
      } satisfies CraftRequest];
    }).slice(0, 200)
    : [];
  return { resourceRequests, craftRequests };
}

function getSnapshot() {
  if (typeof window === "undefined") return EMPTY_STATE;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedState;
  cachedRaw = raw;
  if (!raw) {
    cachedState = EMPTY_STATE;
    return cachedState;
  }
  try {
    cachedState = normalizeState(JSON.parse(raw));
  } catch {
    cachedState = EMPTY_STATE;
  }
  return cachedState;
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(STORE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(STORE_EVENT, onStoreChange);
  };
}

function saveState(state: RequestState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
  cachedRaw = undefined;
  window.dispatchEvent(new Event(STORE_EVENT));
}

async function requestServerState(method: "GET" | "PUT", state?: RequestState) {
  const response = await fetch("/api/requests", {
    method,
    headers: {
      Accept: "application/json",
      ...(method === "PUT" ? { "Content-Type": "application/json" } : {}),
    },
    body: method === "PUT" ? JSON.stringify({ state }) : undefined,
    cache: "no-store",
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null) as { state?: unknown } | null;
  return payload?.state ? normalizeState(payload.state) : null;
}

export async function refreshRequestStore() {
  const localState = getSnapshot();
  const serverState = await requestServerState("GET");
  if (!serverState) return localState;
  if (serverState.resourceRequests.length === 0 && serverState.craftRequests.length === 0
    && (localState.resourceRequests.length > 0 || localState.craftRequests.length > 0)) {
    const migratedState = await requestServerState("PUT", localState).catch(() => null);
    if (migratedState) {
      saveState(migratedState);
      return migratedState;
    }
  }
  saveState(serverState);
  return serverState;
}

async function saveStateToServer(state: RequestState) {
  const serverState = await requestServerState("PUT", state).catch(() => null);
  if (serverState) {
    saveState(serverState);
    return serverState;
  }
  const restoredState = await requestServerState("GET").catch(() => null);
  if (restoredState) {
    saveState(restoredState);
    return restoredState;
  }
  return state;
}

export function useRequestStore() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_STATE);
  useEffect(() => {
    let disposed = false;
    const sync = () => {
      if (!disposed) void refreshRequestStore().catch(() => undefined);
    };
    sync();
    const interval = window.setInterval(sync, 2500);
    window.addEventListener("focus", sync);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", sync);
    };
  }, []);
  const updateState = (updater: (current: RequestState) => RequestState) => {
    const nextState = normalizeState(updater(state));
    saveState(nextState);
    return saveStateToServer(nextState);
  };
  return { state, updateState };
}

export function makeRequestId(prefix: "resource" | "craft") {
  return `${prefix}-request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function touchRequest<T extends { updatedAt: string; status: RequestStatus }>(request: T, status: RequestStatus): T {
  return { ...request, status, updatedAt: new Date().toISOString() };
}
