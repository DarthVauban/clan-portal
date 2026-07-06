"use client";

import { useSyncExternalStore } from "react";

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

export function useResourceStore() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_STATE);
  const updateState = (updater: (current: ResourceState) => ResourceState) => saveState(updater(state));
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
