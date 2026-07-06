"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "clan-portal:item-name-language";
const CHANGE_EVENT = "clan-portal:item-name-language-change";

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

function getSnapshot() {
  return window.localStorage.getItem(STORAGE_KEY) === "en";
}

function getServerSnapshot() {
  return false;
}

export function useItemNameLanguage() {
  const showEnglishNames = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setShowEnglishNames = (value: boolean) => {
    window.localStorage.setItem(STORAGE_KEY, value ? "en" : "ru");
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };
  return { showEnglishNames, setShowEnglishNames };
}
