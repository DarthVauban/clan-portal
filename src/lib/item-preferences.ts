"use client";

import { useSyncExternalStore } from "react";

export type ItemCollectionFilter = "all" | "favorites" | "recent";

type ItemPreferences = {
  favorites: string[];
  recent: string[];
};

const STORAGE_KEY = "clan-portal:item-preferences";
const STORE_EVENT = "clan-portal:item-preferences-change";
const EMPTY_PREFERENCES: ItemPreferences = { favorites: [], recent: [] };
const MAX_RECENT_ITEMS = 18;
let cachedRaw: string | null | undefined;
let cachedPreferences = EMPTY_PREFERENCES;

function normalizeSlugs(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((slug): slug is string => (
    typeof slug === "string" && /^[a-z0-9-]+$/i.test(slug)
  )))].slice(0, limit);
}

function normalizePreferences(value: unknown): ItemPreferences {
  if (!value || typeof value !== "object") return EMPTY_PREFERENCES;
  const candidate = value as Partial<ItemPreferences>;
  return {
    favorites: normalizeSlugs(candidate.favorites, 300),
    recent: normalizeSlugs(candidate.recent, MAX_RECENT_ITEMS),
  };
}

function getSnapshot() {
  if (typeof window === "undefined") return EMPTY_PREFERENCES;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedPreferences;
  cachedRaw = raw;
  if (!raw) {
    cachedPreferences = EMPTY_PREFERENCES;
    return cachedPreferences;
  }
  try {
    cachedPreferences = normalizePreferences(JSON.parse(raw));
  } catch {
    cachedPreferences = EMPTY_PREFERENCES;
  }
  return cachedPreferences;
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(STORE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(STORE_EVENT, onStoreChange);
  };
}

function savePreferences(preferences: ItemPreferences) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizePreferences(preferences)));
  cachedRaw = undefined;
  window.dispatchEvent(new Event(STORE_EVENT));
}

export function markItemViewed(slug: string) {
  if (typeof window === "undefined") return;
  const current = getSnapshot();
  savePreferences({
    ...current,
    recent: [slug, ...current.recent.filter((itemSlug) => itemSlug !== slug)].slice(0, MAX_RECENT_ITEMS),
  });
}

export function toggleFavoriteItem(slug: string) {
  if (typeof window === "undefined") return;
  const current = getSnapshot();
  const selected = current.favorites.includes(slug);
  savePreferences({
    ...current,
    favorites: selected
      ? current.favorites.filter((itemSlug) => itemSlug !== slug)
      : [slug, ...current.favorites],
  });
}

export function useItemPreferences() {
  const preferences = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_PREFERENCES);
  return {
    ...preferences,
    favoriteSet: new Set(preferences.favorites),
    recentSet: new Set(preferences.recent),
    toggleFavorite: toggleFavoriteItem,
    markViewed: markItemViewed,
  };
}
