"use client";

import { useEffect, useSyncExternalStore } from "react";
import { DEFAULT_PORTAL_NAME, normalizePortalName } from "@/lib/portal-branding";
import { LOCAL_PLAYER_ID, type LocalProfile } from "@/lib/profile-store";

export const COLLECTIVE_LIMIT = 24;

export type CollectiveRole = "leader" | "officer" | "recruiter" | "treasurer" | "raid-leader" | "member";
export type PortalRole = "administrator" | "clan-leader" | "member";

export type CollectiveMember = {
  playerId: string;
  role: CollectiveRole;
  joinedAt: string;
};

export type Collective = {
  id: string;
  name: string;
  tag: string;
  createdAt: string;
  members: CollectiveMember[];
};

export type CollectiveState = {
  portalName: string;
  collectives: Collective[];
  portalRoles: Record<string, PortalRole>;
  revokedPlayerIds: string[];
  directoryPlayers: DirectoryPlayer[];
};

export type DirectoryCharacter = {
  id: string;
  name: string;
  classSlug: string;
};

export type DirectoryPlayer = {
  id: string;
  displayName: string;
  discordNickname: string | null;
  characters: DirectoryCharacter[];
  mainCharacterId: string | null;
  local: boolean;
};

export const collectiveRoles: Array<{ value: CollectiveRole; label: string }> = [
  { value: "leader", label: "Лидер коллектива" },
  { value: "officer", label: "Офицер" },
  { value: "recruiter", label: "Рекрутер" },
  { value: "treasurer", label: "Казначей" },
  { value: "raid-leader", label: "Рейд-лидер" },
  { value: "member", label: "Участник" },
];

export const collectiveRoleLabels = Object.fromEntries(collectiveRoles.map((role) => [role.value, role.label])) as Record<CollectiveRole, string>;
export const portalRoleLabels: Record<PortalRole, string> = {
  administrator: "Администратор",
  "clan-leader": "Лидер клана",
  member: "Игрок",
};
export const portalRoles: Array<{ value: PortalRole; label: string }> = [
  { value: "administrator", label: portalRoleLabels.administrator },
  { value: "clan-leader", label: portalRoleLabels["clan-leader"] },
  { value: "member", label: portalRoleLabels.member },
];

const legacyDemoPlayerIds = new Set([
  "player-aelita", "player-brann", "player-vesper", "player-kael", "player-mira", "player-ragnar",
  "player-sable", "player-torin", "player-yuna", "player-zed", "player-nyx", "player-orion",
]);

const STORAGE_KEY = "clan-portal:collectives";
const STORE_EVENT = "clan-portal:collectives-change";
const DEFAULT_PORTAL_ROLES: Record<string, PortalRole> = {
  [LOCAL_PLAYER_ID]: "member",
};
const EMPTY_STATE: CollectiveState = { portalName: DEFAULT_PORTAL_NAME, collectives: [], portalRoles: DEFAULT_PORTAL_ROLES, revokedPlayerIds: [], directoryPlayers: [] };
const validRoles = new Set<CollectiveRole>(collectiveRoles.map((role) => role.value));
const validPortalRoles = new Set<PortalRole>(portalRoles.map((role) => role.value));
let cachedRaw: string | null | undefined;
let cachedState = EMPTY_STATE;

function normalizeState(value: unknown): CollectiveState {
  if (!value || typeof value !== "object") return EMPTY_STATE;
  const candidate = value as Partial<CollectiveState>;
  if (!Array.isArray(candidate.collectives)) return EMPTY_STATE;
  const assignedPlayers = new Set<string>();
  const collectives = candidate.collectives.flatMap((collective) => {
    if (!collective || typeof collective !== "object") return [];
    const item = collective as Partial<Collective>;
    if (typeof item.id !== "string" || typeof item.name !== "string") return [];
    const members = Array.isArray(item.members) ? item.members.flatMap((member) => {
      if (!member || typeof member !== "object") return [];
      const entry = member as Partial<CollectiveMember>;
      if (typeof entry.playerId !== "string" || assignedPlayers.has(entry.playerId) || legacyDemoPlayerIds.has(entry.playerId)) return [];
      const role = typeof entry.role === "string" && validRoles.has(entry.role as CollectiveRole) ? entry.role as CollectiveRole : "member";
      assignedPlayers.add(entry.playerId);
      return [{ playerId: entry.playerId, role, joinedAt: typeof entry.joinedAt === "string" ? entry.joinedAt : todayIso() }];
    }).slice(0, COLLECTIVE_LIMIT) : [];
    return [{
      id: item.id,
      name: item.name.slice(0, 48),
      tag: typeof item.tag === "string" ? item.tag.slice(0, 6).toLocaleUpperCase("ru") : "",
      createdAt: typeof item.createdAt === "string" ? item.createdAt : todayIso(),
      members,
    }];
  });
  const portalRoleEntries = candidate.portalRoles && typeof candidate.portalRoles === "object"
    ? Object.entries(candidate.portalRoles).flatMap(([playerId, role]) => !legacyDemoPlayerIds.has(playerId) && typeof role === "string" && validPortalRoles.has(role as PortalRole) ? [[playerId, role as PortalRole] as const] : [])
    : [];
  const portalRoleMap = Object.fromEntries(portalRoleEntries) as Record<string, PortalRole>;
  const revokedPlayerIds = Array.isArray(candidate.revokedPlayerIds)
    ? [...new Set(candidate.revokedPlayerIds.filter((playerId): playerId is string => typeof playerId === "string" && playerId !== LOCAL_PLAYER_ID && !legacyDemoPlayerIds.has(playerId)))]
    : [];
  const directoryPlayers = Array.isArray(candidate.directoryPlayers)
    ? candidate.directoryPlayers.flatMap((player) => {
      if (!player || typeof player !== "object") return [];
      const item = player as Partial<DirectoryPlayer>;
      if (typeof item.id !== "string" || item.id === LOCAL_PLAYER_ID || legacyDemoPlayerIds.has(item.id) || typeof item.displayName !== "string") return [];
      const characters = Array.isArray(item.characters)
        ? item.characters.flatMap((character) => {
          if (!character || typeof character !== "object") return [];
          const entry = character as Partial<DirectoryCharacter>;
          return typeof entry.id === "string" && typeof entry.name === "string" && typeof entry.classSlug === "string"
            ? [{ id: entry.id, name: entry.name.slice(0, 40), classSlug: entry.classSlug }]
            : [];
        })
        : [];
      return [{
        id: item.id,
        displayName: item.displayName.slice(0, 40),
        discordNickname: typeof item.discordNickname === "string" ? item.discordNickname.slice(0, 80) : null,
        characters,
        mainCharacterId: typeof item.mainCharacterId === "string" ? item.mainCharacterId : characters[0]?.id ?? null,
        local: false,
      }];
    })
    : [];
  return { portalName: normalizePortalName(candidate.portalName), collectives, portalRoles: { ...DEFAULT_PORTAL_ROLES, ...portalRoleMap }, revokedPlayerIds, directoryPlayers };
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

function saveState(state: CollectiveState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  cachedRaw = undefined;
  window.dispatchEvent(new Event(STORE_EVENT));
}

async function requestServerState(method: "GET" | "PUT", state?: CollectiveState) {
  const response = await fetch("/api/collectives/state", {
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

export async function refreshCollectiveStore() {
  const localState = getSnapshot();
  const serverState = await requestServerState("GET");
  if (!serverState) return localState;
  if (serverState.collectives.length === 0 && localState.collectives.length > 0) {
    const migratedState = await requestServerState("PUT", localState).catch(() => null);
    if (migratedState) {
      saveState(migratedState);
      return migratedState;
    }
  }
  saveState(serverState);
  return serverState;
}

async function saveStateToServer(state: CollectiveState) {
  const serverState = await requestServerState("PUT", state).catch(() => null);
  if (serverState) {
    saveState(serverState);
    return serverState;
  }
  return state;
}

export function useCollectiveStore() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_STATE);
  useEffect(() => {
    void refreshCollectiveStore();
  }, []);
  const updateState = (updater: (current: CollectiveState) => CollectiveState) => {
    const nextState = normalizeState(updater(state));
    saveState(nextState);
    return saveStateToServer(nextState);
  };
  return { state, updateState };
}

export function getPlayerDirectory(profile: LocalProfile, state?: CollectiveState): DirectoryPlayer[] {
  const localCharacters = profile.characters.flatMap((character) => character.confirmed && character.classSlug
    ? [{ id: character.id, name: character.name, classSlug: character.classSlug }]
    : []);
  const localPlayer: DirectoryPlayer = {
    id: LOCAL_PLAYER_ID,
    displayName: profile.displayName.trim() || "Локальный пользователь",
    discordNickname: null,
    characters: localCharacters,
    mainCharacterId: profile.mainCharacterId,
    local: true,
  };
  const players = [localPlayer, ...(state?.directoryPlayers ?? [])];
  return state ? players.filter((player) => !state.revokedPlayerIds.includes(player.id)) : players;
}

export function getMainCharacter(player: DirectoryPlayer) {
  return player.characters.find((character) => character.id === player.mainCharacterId) ?? player.characters[0];
}

export function findMembership(state: CollectiveState, playerId: string) {
  for (const collective of state.collectives) {
    const member = collective.members.find((entry) => entry.playerId === playerId);
    if (member) return { collective, member };
  }
  return null;
}

export function getPortalRole(state: CollectiveState, playerId: string): PortalRole {
  return state.portalRoles[playerId] ?? "member";
}

export function hasAbsolutePortalRights(state: CollectiveState, playerId: string) {
  const role = getPortalRole(state, playerId);
  return role === "administrator" || role === "clan-leader";
}

export function isPlayerRevoked(state: CollectiveState, playerId: string) {
  return state.revokedPlayerIds.includes(playerId);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function formatCollectiveDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}
