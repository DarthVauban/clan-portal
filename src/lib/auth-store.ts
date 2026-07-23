"use client";

import { useEffect, useSyncExternalStore } from "react";

export type PortalAuthStage = "anonymous" | "discord-authorized" | "registered";
export type PortalApplicationStatus = "pending" | "accepted" | "revoked" | "blocked";

export type PortalAuthState = {
  stage: PortalAuthStage;
  discordId: string | null;
  discordNickname: string | null;
  avatarUrl: string | null;
  isPortalAdmin: boolean;
  registeredProfile: {
    displayName: string;
    characterName: string;
    classSlug: string;
  } | null;
  applicationStatus: PortalApplicationStatus | null;
  authorizedAt: string | null;
  registeredAt: string | null;
};

export type PortalRegistrationPayload = {
  profileName: string;
  characterName: string;
  classSlug: string;
  requestedCollectiveId?: string | null;
};

const EMPTY_AUTH: PortalAuthState = {
  stage: "anonymous",
  discordId: null,
  discordNickname: null,
  avatarUrl: null,
  isPortalAdmin: false,
  registeredProfile: null,
  applicationStatus: null,
  authorizedAt: null,
  registeredAt: null,
};
const AUTH_STORAGE_KEY = "clan-portal:auth-state";

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
    applicationStatus: candidate.applicationStatus === "pending" || candidate.applicationStatus === "accepted" || candidate.applicationStatus === "revoked" || candidate.applicationStatus === "blocked"
      ? candidate.applicationStatus
      : null,
    registeredProfile: candidate.registeredProfile
      && typeof candidate.registeredProfile === "object"
      && typeof candidate.registeredProfile.displayName === "string"
      && typeof candidate.registeredProfile.characterName === "string"
      && typeof candidate.registeredProfile.classSlug === "string"
      ? {
        displayName: candidate.registeredProfile.displayName.slice(0, 40),
        characterName: candidate.registeredProfile.characterName.slice(0, 40),
        classSlug: candidate.registeredProfile.classSlug,
      }
      : null,
    authorizedAt: typeof candidate.authorizedAt === "string" ? candidate.authorizedAt : null,
    registeredAt: typeof candidate.registeredAt === "string" ? candidate.registeredAt : null,
  };
}

function persistAuth(auth: PortalAuthState) {
  if (typeof window === "undefined") return;
  if (auth.stage === "anonymous") {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
}

function readCachedAuth() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const auth = normalizeAuth(JSON.parse(raw));
    return auth.stage === "anonymous" ? null : auth;
  } catch {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

function notify() {
  listeners.forEach((listener) => listener());
}

function setAuth(auth: PortalAuthState, markLoaded = true) {
  currentAuth = auth;
  loaded = markLoaded;
  if (markLoaded) persistAuth(auth);
  notify();
}

export function applyPortalAuthState(rawAuth: unknown) {
  const auth = normalizeAuth(rawAuth);
  setAuth(auth);
  return auth;
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
  if (!loaded) {
    const cachedAuth = readCachedAuth();
    if (cachedAuth) {
      currentAuth = cachedAuth;
      loaded = true;
    }
  }
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
  const completeRegistration = (payload: PortalRegistrationPayload) => requestAuth("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
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
