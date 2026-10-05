import { useEffect, useState } from "react";
import { onTool, toolsNative } from "./native";
import type { Identity } from "../types";

/** Who is signed in to NGA MIS, live (null = nobody / not known yet). */
export function useIdentity(): Identity | null {
  const [id, setId] = useState<Identity | null>(null);
  useEffect(() => {
    let alive = true;
    void toolsNative.identity().then((v) => alive && setId(v)).catch(() => undefined);
    const sub = onTool("nga://identity", setId);
    return () => {
      alive = false;
      void sub.then((off) => off());
    };
  }, []);
  return id;
}
