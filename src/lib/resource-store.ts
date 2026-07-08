"use client";

import { useEffect, useSyncExternalStore } from "react";

export type CollectiveBalance = {
  ancientCoin: number;
  resources: Record<string, number>;
  updatedAt: string;
};

export type ResourceOperation = {
  id: string;
  collectiveId: string;
  resourceSlug: string;
  delta: number;
  balance: number;
  createdAt: string;
};

export type ResourceState = {
  balances: Record<string, CollectiveBalance>;
  operations: ResourceOperation[];
};

const STORAGE_KEY = "clan-portal:resource-balances";
const SERVER_MIGRATION_KEY = "clan-portal:resource-balances-server-migrated";
const STORE_EVENT = "clan-portal:resource-balances-change";
const EMPTY_STATE: ResourceState = { balances: {}, operations: [] };
let cachedRaw: string | null | undefined;
let cachedState = EMPTY_STATE;

function normalizeAmount(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
}

function normalizeState(value: unknown): ResourceState {
  if (!value || typeof value !== "object") return EMPTY_STATE;
  const candidate = value as Partial<ResourceState>;
  const balances = candidate.balances && typeof candidate.balances === "object"
    ? Object.fromEntries(Object.entries(candidate.balances).flatMap(([collectiveId, rawBalance]) => {
      if (!rawBalance || typeof rawBalance !== "object") return [];
      const balance = rawBalance as Partial<CollectiveBalance>;
      const resources = balance.resources && typeof balance.resources === "object"
        ? Object.fromEntries(Object.entries(balance.resources).map(([slug, amount]) => [slug, normalizeAmount(amount)]))
        : {};
      return [[collectiveId, {
        ancientCoin: normalizeAmount(balance.ancientCoin),
        resources,
        updatedAt: typeof balance.updatedAt === "string" ? balance.updatedAt : new Date(0).toISOString(),
      } satisfies CollectiveBalance]];
    }))
    : {};
  const operations = Array.isArray(candidate.operations) ? candidate.operations.flatMap((operation) => {
    if (!operation || typeof operation !== "object") return [];
    const entry = operation as Partial<ResourceOperation>;
    if (typeof entry.id !== "string" || typeof entry.collectiveId !== "string" || typeof entry.resourceSlug !== "string") return [];
    return [{
      id: entry.id,
      collectiveId: entry.collectiveId,
      resourceSlug: entry.resourceSlug,
      delta: typeof entry.delta === "number" ? Math.trunc(entry.delta) : 0,
      balance: normalizeAmount(entry.balance),
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : new Date(0).toISOString(),
    }];
  }).slice(0, 200) : [];
  return { balances, operations };
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

function saveState(state: ResourceState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  cachedRaw = undefined;
  window.dispatchEvent(new Event(STORE_EVENT));
}

function hasResourceContent(state: ResourceState) {
  return state.operations.length > 0 || Object.values(state.balances).some((balance) => (
    balance.ancientCoin > 0
    || Object.keys(balance.resources).length > 0
    || Object.values(balance.resources).some((amount) => amount > 0)
  ));
}

async function requestServerStateResult(method: "GET" | "PUT", state?: ResourceState) {
  const response = await fetch("/api/resources/state", {
    method,
    headers: {
      Accept: "application/json",
      ...(method === "PUT" ? { "Content-Type": "application/json" } : {}),
    },
    body: method === "PUT" ? JSON.stringify({ state }) : undefined,
    cache: "no-store",
  });
  if (!response.ok) return { state: null, status: response.status };
  const payload = await response.json().catch(() => null) as { state?: unknown } | null;
  return { state: payload?.state ? normalizeState(payload.state) : null, status: response.status };
}

async function requestServerState(method: "GET" | "PUT", state?: ResourceState) {
  return (await requestServerStateResult(method, state)).state;
}

export async function refreshResourceStore() {
  const localState = getSnapshot();
  const serverState = await requestServerState("GET");
  if (!serverState) return localState;

  const shouldMigrateLocalState = typeof window !== "undefined"
    && window.localStorage.getItem(SERVER_MIGRATION_KEY) !== "1"
    && hasResourceContent(localState);
  if (shouldMigrateLocalState) {
    const migrationResult = await requestServerStateResult("PUT", localState).catch(() => ({ state: null, status: 0 }));
    if (migrationResult.state) {
      window.localStorage.setItem(SERVER_MIGRATION_KEY, "1");
      saveState(migrationResult.state);
      return migrationResult.state;
    }
    if (migrationResult.status === 401 || migrationResult.status === 403 || migrationResult.status === 400) {
      window.localStorage.setItem(SERVER_MIGRATION_KEY, "1");
    } else {
      return localState;
    }
  }

  saveState(serverState);
  return serverState;
}

async function saveStateToServer(state: ResourceState) {
  const serverState = await requestServerState("PUT", state).catch(() => null);
  if (serverState) {
    if (typeof window !== "undefined") window.localStorage.setItem(SERVER_MIGRATION_KEY, "1");
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

export function useResourceStore() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_STATE);
  useEffect(() => {
    let disposed = false;
    let events: EventSource | null = null;
    const sync = () => {
      if (!disposed) void refreshResourceStore().catch(() => undefined);
    };
    sync();
    if (typeof EventSource !== "undefined") {
      events = new EventSource("/api/resources/events");
      events.addEventListener("resources-changed", sync);
      events.addEventListener("ready", sync);
    }
    window.addEventListener("focus", sync);
    return () => {
      disposed = true;
      events?.close();
      window.removeEventListener("focus", sync);
    };
  }, []);
  const updateState = (updater: (current: ResourceState) => ResourceState) => {
    const nextState = normalizeState(updater(state));
    saveState(nextState);
    return saveStateToServer(nextState);
  };
  return { state, updateState };
}

export function emptyCollectiveBalance(): CollectiveBalance {
  return { ancientCoin: 0, resources: {}, updatedAt: new Date(0).toISOString() };
}

export function makeResourceOperation(collectiveId: string, resourceSlug: string, delta: number, balance: number): ResourceOperation {
  return {
    id: `operation-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    collectiveId,
    resourceSlug,
    delta,
    balance,
    createdAt: new Date().toISOString(),
  };
}
