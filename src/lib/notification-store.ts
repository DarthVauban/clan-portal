"use client";

import { useEffect, useSyncExternalStore } from "react";

export type PortalNotification = {
  id: string;
  recipientPlayerId: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  actor: { id: string; name: string } | null;
  entityType: string;
  entityId: string;
  readAt: string | null;
  createdAt: string;
};

export type PortalNotificationInput = Omit<PortalNotification, "readAt" | "createdAt"> & {
  createdAt?: string;
};

const STORAGE_KEY = "clan-portal:notifications";
const STORE_EVENT = "clan-portal:notifications-change";
const EMPTY_NOTIFICATIONS: PortalNotification[] = [];
let cachedRaw: string | null | undefined;
let cachedNotifications = EMPTY_NOTIFICATIONS;

function normalizeNotification(value: unknown): PortalNotification | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<PortalNotification>;
  if (typeof item.id !== "string" || typeof item.recipientPlayerId !== "string" || typeof item.kind !== "string" || typeof item.title !== "string") return null;
  return {
    id: item.id,
    recipientPlayerId: item.recipientPlayerId,
    kind: item.kind,
    title: item.title,
    body: typeof item.body === "string" ? item.body : "",
    href: typeof item.href === "string" ? item.href : "",
    actor: item.actor && typeof item.actor === "object" && typeof item.actor.id === "string" && typeof item.actor.name === "string"
      ? { id: item.actor.id, name: item.actor.name }
      : null,
    entityType: typeof item.entityType === "string" ? item.entityType : "",
    entityId: typeof item.entityId === "string" ? item.entityId : "",
    readAt: typeof item.readAt === "string" ? item.readAt : null,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
  };
}

function normalizeNotifications(value: unknown): PortalNotification[] {
  return Array.isArray(value)
    ? value.flatMap((notification) => {
      const normalized = normalizeNotification(notification);
      return normalized ? [normalized] : [];
    }).slice(0, 40)
    : EMPTY_NOTIFICATIONS;
}

function getSnapshot() {
  if (typeof window === "undefined") return EMPTY_NOTIFICATIONS;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedNotifications;
  cachedRaw = raw;
  if (!raw) {
    cachedNotifications = EMPTY_NOTIFICATIONS;
    return cachedNotifications;
  }
  try {
    cachedNotifications = normalizeNotifications(JSON.parse(raw));
  } catch {
    cachedNotifications = EMPTY_NOTIFICATIONS;
  }
  return cachedNotifications;
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(STORE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(STORE_EVENT, onStoreChange);
  };
}

function saveNotifications(notifications: PortalNotification[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeNotifications(notifications)));
  cachedRaw = undefined;
  window.dispatchEvent(new Event(STORE_EVENT));
}

async function requestNotifications(method: "GET" | "POST" | "PATCH", payload?: object) {
  const response = await fetch("/api/notifications", {
    method,
    headers: {
      Accept: "application/json",
      ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
    },
    body: method === "GET" ? undefined : JSON.stringify(payload ?? {}),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null) as { notifications?: unknown } | null;
  return data?.notifications ? normalizeNotifications(data.notifications) : null;
}

export async function refreshNotificationStore() {
  const notifications = await requestNotifications("GET");
  if (!notifications) return getSnapshot();
  saveNotifications(notifications);
  return notifications;
}

export async function pushPortalNotifications(notifications: PortalNotificationInput[]) {
  if (notifications.length === 0) return getSnapshot();
  const next = await requestNotifications("POST", { notifications });
  if (next) saveNotifications(next);
  return next ?? getSnapshot();
}

export async function markPortalNotificationsRead(ids: string[]) {
  const next = await requestNotifications("PATCH", { ids });
  if (next) saveNotifications(next);
  return next ?? getSnapshot();
}

export async function markAllPortalNotificationsRead() {
  const next = await requestNotifications("PATCH", { markAll: true });
  if (next) saveNotifications(next);
  return next ?? getSnapshot();
}

export function useNotificationStore() {
  const notifications = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_NOTIFICATIONS);
  useEffect(() => {
    let disposed = false;
    let events: EventSource | null = null;
    const sync = () => {
      if (!disposed) void refreshNotificationStore().catch(() => undefined);
    };
    sync();
    if (typeof EventSource !== "undefined") {
      events = new EventSource("/api/notifications/events");
      events.addEventListener("notifications-changed", sync);
      events.addEventListener("ready", sync);
    }
    window.addEventListener("focus", sync);
    return () => {
      disposed = true;
      events?.close();
      window.removeEventListener("focus", sync);
    };
  }, []);
  return { notifications };
}

export function makeNotificationId(kind: string, entityId: string, recipientPlayerId: string, suffix = "") {
  return `notification-${kind}-${entityId}-${recipientPlayerId}${suffix ? `-${suffix}` : ""}`.replace(/[^a-zA-Z0-9:_-]+/g, "-").slice(0, 120);
}

export function makePortalNotification(input: {
  recipientPlayerId: string;
  kind: string;
  title: string;
  body?: string;
  href?: string;
  actor?: { id: string; name: string } | null;
  entityType?: string;
  entityId?: string;
  suffix?: string;
}): PortalNotificationInput | null {
  if (input.actor?.id === input.recipientPlayerId) return null;
  const entityId = input.entityId ?? `${Date.now()}`;
  return {
    id: makeNotificationId(input.kind, entityId, input.recipientPlayerId, input.suffix),
    recipientPlayerId: input.recipientPlayerId,
    kind: input.kind,
    title: input.title,
    body: input.body ?? "",
    href: input.href ?? "",
    actor: input.actor ?? null,
    entityType: input.entityType ?? "",
    entityId,
  };
}
