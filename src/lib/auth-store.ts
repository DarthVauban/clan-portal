"use client";

import { useEffect, useSyncExternalStore } from "react";

export type PortalAuthStage = "anonymous" | "discord-authorized" | "registered";

export type PortalAuthState = {
  stage: PortalAuthStage;
  discordId: string | null;
  discordNickname: string | null;
  avatarUrl: string | null;
  isPortalAdmin: boolean;
  authorizedAt: string | null;
  registeredAt: string | null;
};

const EMPTY_AUTH: PortalAuthState = {
  stage: "anonymous",
  discordId: null,
  discordNickname: null,
  avatarUrl: null,
  isPortalAdmin: false,
  authorizedAt: null,
  registeredAt: null,
};

let currentAuth = EMPTY_AUTH;
let loaded = false;
let loadingPromise: Promise<PortalAuthState> | null = null;
const listeners = new Set<() => void>();

function normalizeAuth(value: unknown): PortalAuthState {
  if (!value || typeof value !== "object") return EMPTY_AUTH;
  const candidate = value as Partial<PortalAuthState>;
  const stage: PortalAuthStage =
    candidate.stage === "discord-authorized" || candidate.stage === "registered"
      ? candidate.stage
      : "anonymous";
  return {
    stage,
    discordId: typeof candidate.discordId === "string" ? candidate.discordId : null,
    discordNickname: typeof candidate.discordNickname === "string" ? candidate.discordNickname.slice(0, 80) : null,
    avatarUrl: typeof candidate.avatarUrl === "string" ? candidate.avatarUrl : null,
    isPortalAdmin: candidate.isPortalAdmin === true,
    authorizedAt: typeof candidate.authorizedAt === "string" ? candidate.authorizedAt : null,
    registeredAt: typeof candidate.registeredAt === "string" ? candidate.registeredAt : null,
  };
}

function notify() {
  listeners.forEach((listener) => listener());
}

function setAuth(auth: PortalAuthState, markLoaded = true) {
  currentAuth = auth;
  loaded = markLoaded;
  notify();
}

async function requestAuth(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  const response = await fetch(input, {
    ...init,
    headers,
    cache: "no-store",
  });
  const payload = normalizeAuth(await response.json().catch(() => null));
  if (!response.ok) throw new Error("Auth request failed.");
  setAuth(payload);
  return payload;
}

export function refreshPortalAuth() {
  if (!loadingPromise) {
    loadingPromise = requestAuth("/api/auth/me")
      .catch(() => {
        setAuth(EMPTY_AUTH);
        return EMPTY_AUTH;
      })
      .finally(() => {
        loadingPromise = null;
      });
  }
  return loadingPromise;
}

function getSnapshot() {
  return currentAuth;
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  if (typeof window !== "undefined" && !loaded) void refreshPortalAuth();
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function usePortalAuth() {
  const auth = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_AUTH);

  useEffect(() => {
    void refreshPortalAuth();
  }, []);

  const loginWithDiscord = () => {
    window.location.href = "/api/auth/discord/login";
  };
  const completeRegistration = () => requestAuth("/api/auth/register", { method: "POST" });
  const logout = () => requestAuth("/api/auth/logout", { method: "POST" });

  return {
    auth,
    loading: !loaded,
    loginWithDiscord,
    completeRegistration,
    logout,
    refreshAuth: refreshPortalAuth,
  };
}
