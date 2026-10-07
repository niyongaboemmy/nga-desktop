// Each person's tool data, in their own file (tools-u<id>.json) so people who
// share a lab computer never see each other's notes, encrypted with their own
// key (vault.ts). Nothing is kept for someone who isn't signed in: their tools
// work in memory only.
import { useCallback, useEffect, useRef, useState } from "react";
import { load, type Store } from "@tauri-apps/plugin-store";
import type { Identity } from "../types";
import { PLAIN_KEYS, isSealed, open, seal, vaultKey } from "./vault";

export const userStoreFile = (userId: number) => `tools-u${Math.trunc(userId)}.json`;

/** A person's tool file: values are sealed on write and opened on read. */
export interface PersonalStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

const stores = new Map<number, Promise<PersonalStore>>();

export function personalStore(raw: Store, key: CryptoKey | null): PersonalStore {
  // Keys holding a sealed value we couldn't open (no key here): never overwrite them.
  const locked = new Set<string>();
  // Writes to a key happen in order (sealing is async); a newer write wins over re-sealing.
  const chains = new Map<string, Promise<void>>();
  const written = new Set<string>();
  const queue = (k: string, job: () => Promise<void>) => {
    const next = (chains.get(k) ?? Promise.resolve()).then(job, job);
    chains.set(k, next.catch(() => undefined));
    return next;
  };
  return {
    async get<T>(k: string) {
      const v = await raw.get<unknown>(k);
      if (v === undefined || v === null) return undefined;
      if (isSealed(v)) {
        if (!key) {
          locked.add(k);
          return undefined;
        }
        try {
          return await open<T>(key, v);
        } catch {
          locked.add(k);
          return undefined;
        }
      }
      // Written before encryption (or by Rust): seal it now, unless a newer write gets there first.
      if (key && !PLAIN_KEYS.has(k)) {
        void queue(k, async () => {
          if (!written.has(k)) await raw.set(k, await seal(key, v));
        }).catch(() => undefined);
      }
      return v as T;
    },
    set(k: string, value: unknown) {
      if (locked.has(k)) return Promise.resolve();
      written.add(k);
      return queue(k, async () => {
        await raw.set(k, key && !PLAIN_KEYS.has(k) ? await seal(key, value) : value);
      });
    },
  };
}

function userStore(userId: number): Promise<PersonalStore> {
  let s = stores.get(userId);
  if (!s) {
    s = Promise.all([load(userStoreFile(userId), { defaults: {}, autoSave: 250 }), vaultKey(userId)]).then(([raw, key]) => personalStore(raw, key));
    stores.set(userId, s);
  }
  return s;
}

/** Signed out (the data may have been removed from this computer): load afresh next time. */
export const forgetPersonalStores = () => stores.clear();

/**
 * State kept in the signed-in person's tool file under `key`.
 * Signed out: plain in-memory state. Returns [value, setValue, ready].
 */
export function usePersonal<T>(identity: Identity | null, key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(identity === null);
  const userId = identity?.userId ?? null;
  const initialRef = useRef(initial);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    let alive = true;
    setReady(false);
    if (userId === null) {
      setValue(initialRef.current);
      setReady(true);
      return;
    }
    void userStore(userId)
      .then((s) => s.get<T>(key))
      .then((v) => {
        if (!alive) return;
        setValue(v === undefined || v === null ? initialRef.current : v);
        setReady(true);
      })
      .catch(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [userId, key]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const v = typeof next === "function" ? (next as (p: T) => T)(valueRef.current) : next;
      valueRef.current = v;
      setValue(v);
      if (userId !== null) void userStore(userId).then((s) => s.set(key, v)).catch(() => undefined);
    },
    [userId, key],
  );
  return [value, set, ready];
}

/** One read of a value in the person's tool file (null when signed out or missing). */
export async function readPersonal<T>(identity: Identity | null, key: string): Promise<T | null> {
  if (!identity) return null;
  try {
    const v = await (await userStore(identity.userId)).get<T>(key);
    return v ?? null;
  } catch {
    return null;
  }
}
