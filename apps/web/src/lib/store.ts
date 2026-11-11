'use client';
// Tiny stale-while-revalidate cache: cached data shows instantly, every mount refetches
// in the background. shortcut: no eviction; fine for one user's wardrobe, use SWR if it grows.
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { api, ApiError } from './api';

interface Entry {
  data?: unknown;
  error?: ApiError;
  inflight?: Promise<void>;
}

const cache = new Map<string, Entry>();
const active = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function load(key: string) {
  const e = cache.get(key) ?? {};
  cache.set(key, e);
  e.inflight ??= api(key)
    .then((data) => {
      e.data = data;
      e.error = undefined;
    })
    .catch((err: ApiError) => {
      e.error = err;
    })
    .finally(() => {
      e.inflight = undefined;
      emit();
    });
  emit();
  return e.inflight;
}

export function getCached<T>(key: string) {
  return cache.get(key)?.data as T | undefined;
}

// Optimistic or server-confirmed local update.
export function setCached<T>(key: string, fn: (old: T | undefined) => T | undefined) {
  const e = cache.get(key) ?? {};
  e.data = fn(e.data as T | undefined);
  cache.set(key, e);
  emit();
}

// Refetch mounted queries whose key starts with a prefix; drop the rest so they reload on mount.
export function invalidate(...prefixes: string[]) {
  for (const key of [...cache.keys()]) {
    if (!prefixes.some((p) => key.startsWith(p))) continue;
    if (active.get(key)) load(key);
    else cache.delete(key);
  }
}

export function clearCache() {
  cache.clear();
  emit();
}

export function useQuery<T>(key: string | null, seed?: () => T | undefined) {
  useSyncExternalStore(subscribe, () => version, () => 0);
  useEffect(() => {
    if (!key) return;
    active.set(key, (active.get(key) ?? 0) + 1);
    load(key);
    return () => {
      active.set(key, (active.get(key) ?? 1) - 1);
    };
  }, [key]);
  const e = key ? cache.get(key) : undefined;
  const data = (e?.data as T | undefined) ?? seed?.();
  const reload = useCallback(() => {
    if (key) load(key);
  }, [key]);
  return {
    data,
    error: data === undefined ? e?.error : undefined,
    loading: data === undefined && !e?.error,
    reload,
  };
}
