// Each person's tool data is encrypted on disk (src-tauri/src/tools/vault.rs keeps
// the key: DPAPI on Windows). Values are sealed with AES-GCM before they reach
// the store plugin; older plain values are still read, and sealed on the spot.
import { toolsNative } from "./native";

export interface Sealed {
  $v: 1;
  iv: string;
  ct: string;
}

/** Written by Rust in plain JSON (timers.rs `log_focus`): never sealed. */
export const PLAIN_KEYS = new Set(["focusSessions"]);

export const isSealed = (v: unknown): v is Sealed =>
  !!v && typeof v === "object" && (v as Sealed).$v === 1 && typeof (v as Sealed).iv === "string" && typeof (v as Sealed).ct === "string";

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function importKey(base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", unb64(base64), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function seal(key: CryptoKey, value: unknown): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(value))));
  return { $v: 1, iv: b64(iv), ct: b64(ct) };
}

export async function open<T>(key: CryptoKey, sealed: Sealed): Promise<T> {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(sealed.iv) }, key, unb64(sealed.ct));
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

const keys = new Map<number, Promise<CryptoKey | null>>();

/** The person's key, or null where there is none (browser, old build, error): data stays plain. */
export function vaultKey(userId: number): Promise<CryptoKey | null> {
  let k = keys.get(userId);
  if (!k) {
    k = toolsNative
      .vaultKey(userId)
      .then((b) => (typeof b === "string" && b ? importKey(b) : null))
      .catch(() => null);
    keys.set(userId, k);
  }
  return k;
}

/** Tests: forget cached keys. */
export const forgetVaultKeys = () => keys.clear();
