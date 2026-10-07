import { useEffect, useState } from "react";
import { onTool, toolsNative } from "./native";
import type { Identity } from "../types";
import { forgetPersonalStores } from "./store";
import { forgetVaultKeys } from "./vault";

/** Signed out: the person's data (and key) may have just been removed (tools/vault.rs). */
const onIdentity = (v: Identity | null) => {
  if (!v) {
    forgetVaultKeys();
    forgetPersonalStores();
  }
};

/** Who is signed in to NGA MIS, live (null = nobody / not known yet). */
export function useIdentity(): Identity | null {
  const [id, setId] = useState<Identity | null>(null);
  useEffect(() => {
    let alive = true;
    void toolsNative.identity().then((v) => alive && setId(v)).catch(() => undefined);
    const sub = onTool("nga://identity", (v: Identity | null) => {
      onIdentity(v);
      setId(v);
    });
    return () => {
      alive = false;
      void sub.then((off) => off());
    };
  }, []);
  return id;
}
