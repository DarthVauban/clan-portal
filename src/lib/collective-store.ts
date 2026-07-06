"use client";

import { useSyncExternalStore } from "react";
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
  collectives: Collective[];
  portalRoles: Record<string, PortalRole>;
  revokedPlayerIds: string[];
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

const demoPlayers: DirectoryPlayer[] = [
  { id: "player-aelita", displayName: "Aelita", discordNickname: "aelita.cp", mainCharacterId: "aelita-main", local: false, characters: [{ id: "aelita-main", name: "Aelita", classSlug: "shaman" }, { id: "aelita-alt", name: "Mosswitch", classSlug: "ranger" }] },
  { id: "player-brann", displayName: "Brann", discordNickname: "brann_guard", mainCharacterId: "brann-main", local: false, characters: [{ id: "brann-main", name: "Iron Brann", classSlug: "defender" }] },
  { id: "player-vesper", displayName: "Vesper", discordNickname: "vesper.exe", mainCharacterId: "vesper-main", local: false, characters: [{ id: "vesper-main", name: "Vesper", classSlug: "infiltrator" }] },
  { id: "player-kael", displayName: "Kael", discordNickname: "kaelboom", mainCharacterId: "kael-main", local: false, characters: [{ id: "kael-main", name: "Kael Boom", classSlug: "blast-medic" }] },
  { id: "player-mira", displayName: "Mira", discordNickname: "mira.wild", mainCharacterId: "mira-main", local: false, characters: [{ id: "mira-main", name: "Mira Wild", classSlug: "ranger" }] },
  { id: "player-ragnar", displayName: "Ragnar", discordNickname: "ragnar_cp", mainCharacterId: "ragnar-main", local: false, characters: [{ id: "ragnar-main", name: "Ragnar", classSlug: "destroyer" }] },
  { id: "player-sable", displayName: "Sable", discordNickname: "sable.shadow", mainCharacterId: "sable-main", local: false, characters: [{ id: "sable-main", name: "Sable", classSlug: "infiltrator" }] },
  { id: "player-torin", displayName: "Torin", discordNickname: "torin.wall", mainCharacterId: "torin-main", local: false, characters: [{ id: "torin-main", name: "Torin", classSlug: "legionnary" }] },
  { id: "player-yuna", displayName: "Yuna", discordNickname: "yuna.spirit", mainCharacterId: "yuna-main", local: false, characters: [{ id: "yuna-main", name: "Yuna", classSlug: "shaman" }] },
  { id: "player-zed", displayName: "Zed", discordNickname: "zed.med", mainCharacterId: "zed-main", local: false, characters: [{ id: "zed-main", name: "Zed Remedy", classSlug: "blast-medic" }] },
  { id: "player-nyx", displayName: "Nyx", discordNickname: "nyx.core", mainCharacterId: "nyx-main", local: false, characters: [{ id: "nyx-main", name: "Nyx", classSlug: "destroyer" }] },
  { id: "player-orion", displayName: "Orion", discordNickname: "orion.aegis", mainCharacterId: "orion-main", local: false, characters: [{ id: "orion-main", name: "Orion Aegis", classSlug: "defender" }] },
];

const STORAGE_KEY = "clan-portal:collectives";
const STORE_EVENT = "clan-portal:collectives-change";
const DEFAULT_PORTAL_ROLES: Record<string, PortalRole> = {
  [LOCAL_PLAYER_ID]: "administrator",
  "player-aelita": "clan-leader",
};
const EMPTY_STATE: CollectiveState = { collectives: [], portalRoles: DEFAULT_PORTAL_ROLES, revokedPlayerIds: [] };
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
      if (typeof entry.playerId !== "string" || assignedPlayers.has(entry.playerId)) return [];
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
    ? Object.entries(candidate.portalRoles).flatMap(([playerId, role]) => typeof role === "string" && validPortalRoles.has(role as PortalRole) ? [[playerId, role as PortalRole] as const] : [])
    : [];
  const portalRoleMap = Object.fromEntries(portalRoleEntries) as Record<string, PortalRole>;
  const revokedPlayerIds = Array.isArray(candidate.revokedPlayerIds)
    ? [...new Set(candidate.revokedPlayerIds.filter((playerId): playerId is string => typeof playerId === "string" && playerId !== LOCAL_PLAYER_ID))]
    : [];
  return { collectives, portalRoles: { ...DEFAULT_PORTAL_ROLES, ...portalRoleMap }, revokedPlayerIds };
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

export function useCollectiveStore() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_STATE);
  const updateState = (updater: (current: CollectiveState) => CollectiveState) => saveState(updater(state));
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
  const players = [localPlayer, ...demoPlayers];
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
