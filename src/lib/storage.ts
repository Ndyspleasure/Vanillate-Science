"use client";

import { useSyncExternalStore } from "react";

/**
 * Local-only persistence (history, favorites, preferences). Nothing is sent to a server.
 * Components subscribe with useStoredList(); writes notify all subscribers in this tab
 * and other tabs (via the native "storage" event).
 */
export interface HistoryEntry {
  id: string;
  kind: "solve" | "tool" | "formula" | "units" | "graph" | "check";
  title: string;
  /** Short description of the input (plain text). */
  input: string;
  href: string;
  answer?: string;
  time: number;
}

export const HISTORY_KEY = "vs-history";
export const FAVORITES_KEY = "vs-favorites";
const MAX_HISTORY = 60;
const MAX_FAVORITES = 100;
const EVENT = "vs-storage";

const cache = new Map<string, { raw: string | null; value: HistoryEntry[] }>();
const EMPTY: HistoryEntry[] = [];

function read(key: string): HistoryEntry[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return EMPTY;
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value;
  let value: HistoryEntry[] = EMPTY;
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed))
      value = parsed.filter((e) => e && typeof e.href === "string" && typeof e.title === "string");
  } catch {
    value = EMPTY;
  }
  cache.set(key, { raw, value });
  return value;
}

function write(key: string, list: HistoryEntry[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // storage full or disabled — history is best-effort
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useStoredList(key: string): HistoryEntry[] {
  return useSyncExternalStore(
    subscribe,
    () => read(key),
    () => EMPTY,
  );
}

export function addHistory(entry: Omit<HistoryEntry, "id" | "time">) {
  const list = read(HISTORY_KEY).filter((e) => e.href !== entry.href);
  list.unshift({
    ...entry,
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    time: Date.now(),
  });
  write(HISTORY_KEY, list.slice(0, MAX_HISTORY));
}

export function removeEntry(key: string, id: string) {
  write(
    key,
    read(key).filter((e) => e.id !== id),
  );
}

export function clearList(key: string) {
  write(key, []);
}

export function isFavorite(list: HistoryEntry[], href: string): boolean {
  return list.some((e) => e.href === href);
}

export function toggleFavorite(entry: Omit<HistoryEntry, "id" | "time">) {
  const list = read(FAVORITES_KEY);
  if (list.some((e) => e.href === entry.href))
    write(
      FAVORITES_KEY,
      list.filter((e) => e.href !== entry.href),
    );
  else
    write(
      FAVORITES_KEY,
      [
        {
          ...entry,
          id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          time: Date.now(),
        },
        ...list,
      ].slice(0, MAX_FAVORITES),
    );
}

// ---------------------------------------------------------------------------
// Small string preferences (explanation level, last tab, …)
// ---------------------------------------------------------------------------

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function usePreference<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[],
): [T, (v: T) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => readPref(key),
    () => null,
  );
  const value =
    raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const set = (v: T) => {
    try {
      localStorage.setItem(key, v);
    } catch {
      // ignore
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return [value, set];
}
