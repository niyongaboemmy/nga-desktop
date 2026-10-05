// Each person's tool data, in their own file (tools-u<id>.json) so people who
// share a lab computer never see each other's notes. Nothing is kept for
// someone who isn't signed in: their tools work in memory only.
import { useCallback, useEffect, useRef, useState } from "react";
import { load, type Store } from "@tauri-apps/plugin-store";
import type { Identity } from "../types";

const stores = new Map<number, Promise<Store>>();

export const userStoreFile = (userId: number) => `tools-u${Math.trunc(userId)}.json`;

function userStore(userId: number): Promise<Store> {
  let s = stores.get(userId);
  if (!s) {
    s = load(userStoreFile(userId), { defaults: {}, autoSave: 250 });
    stores.set(userId, s);
  }
  return s;
}

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
