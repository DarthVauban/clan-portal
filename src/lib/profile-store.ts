"use client";

import { useSyncExternalStore } from "react";
import { corepunkClassesBySlug } from "@/lib/corepunk-classes";

export type PlayerCharacter = {
  id: string;
  name: string;
  classSlug: string | null;
  confirmed: boolean;
};

export type LocalProfile = {
  displayName: string;
  joinedAt: string;
  mainCharacterId: string | null;
  characters: PlayerCharacter[];
};

export const LOCAL_PLAYER_ID = "local-user";
const STORAGE_KEY = "clan-portal:user-profile";
const PROFILE_EVENT = "clan-portal:user-profile-change";
const EMPTY_PROFILE: LocalProfile = { displayName: "", joinedAt: "", mainCharacterId: null, characters: [] };
let cachedRaw: string | null | undefined;
let cachedProfile = EMPTY_PROFILE;

function normalizeProfile(value: unknown): LocalProfile {
  if (!value || typeof value !== "object") return EMPTY_PROFILE;
  const candidate = value as Partial<LocalProfile>;
  const characters = Array.isArray(candidate.characters)
    ? candidate.characters.flatMap((character) => {
      if (!character || typeof character !== "object") return [];
      const item = character as Partial<PlayerCharacter>;
      if (typeof item.id !== "string") return [];
      const classSlug = typeof item.classSlug === "string" && corepunkClassesBySlug.get(item.classSlug)?.available
        ? item.classSlug
        : null;
      const name = typeof item.name === "string" ? item.name.slice(0, 40) : "";
      return [{
        id: item.id,
        name,
        classSlug,
        confirmed: typeof item.confirmed === "boolean" ? item.confirmed : Boolean(name.trim() && classSlug),
      }];
    })
    : [];
  const requestedMainCharacterId = typeof candidate.mainCharacterId === "string" ? candidate.mainCharacterId : null;
  const mainCharacterId = characters.some((character) => character.id === requestedMainCharacterId && character.confirmed)
    ? requestedMainCharacterId
    : characters.find((character) => character.confirmed)?.id ?? null;
  return {
    displayName: typeof candidate.displayName === "string" ? candidate.displayName.slice(0, 40) : "",
    joinedAt: typeof candidate.joinedAt === "string" ? candidate.joinedAt : "",
    mainCharacterId,
    characters,
  };
}

function getProfileSnapshot() {
  if (typeof window === "undefined") return EMPTY_PROFILE;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedProfile;
  cachedRaw = raw;
  if (!raw) {
    cachedProfile = EMPTY_PROFILE;
    return cachedProfile;
  }
  try {
    cachedProfile = normalizeProfile(JSON.parse(raw));
  } catch {
    cachedProfile = EMPTY_PROFILE;
  }
  return cachedProfile;
}

function subscribeToProfile(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(PROFILE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(PROFILE_EVENT, onStoreChange);
  };
}

function saveProfile(profile: LocalProfile) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  cachedRaw = undefined;
  window.dispatchEvent(new Event(PROFILE_EVENT));
}

export function useLocalProfile() {
  const profile = useSyncExternalStore(subscribeToProfile, getProfileSnapshot, () => EMPTY_PROFILE);
  const updateProfile = (updater: (current: LocalProfile) => LocalProfile) => saveProfile(updater(profile));
  return { profile, updateProfile };
}

export function hasCompletedRegistration(profile: LocalProfile) {
  return Boolean(profile.displayName.trim()
    && profile.characters.some((character) => character.confirmed && character.name.trim() && character.classSlug));
}
