// The teacher's class lists (MIS /desktop/tools/classes, cached per person) and
// their own lists (clubs, pasted names), shared by the name picker and the group maker.
import { useCallback, useEffect, useState } from "react";
import { misCall } from "../shared/api";
import { usePersonal } from "../shared/store";
import type { Identity } from "../types";
import type { Person } from "./logic";

export interface ClassList {
  id: string;
  name: string;
  people: Person[];
  /** From NGA MIS (read-only) or made here. */
  source: "mis" | "own";
}

interface MisClass {
  classGroupId: number;
  name: string;
  grade: string | null;
  students: Array<{ id: number; name: string }>;
}

/** One name per line (or comma-separated), trimmed, no blanks or duplicates. */
export function parseNames(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter((s) => s && !seen.has(s.toLowerCase()) && (seen.add(s.toLowerCase()), true))
    .slice(0, 200);
}

export function useClassLists(identity: Identity | null) {
  const [cache, setCache] = usePersonal<{ at: number; classes: MisClass[] } | null>(identity, "classes.cache", null);
  const [own, setOwn] = usePersonal<Array<{ id: string; name: string; names: string[] }>>(identity, "classes.own", []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    if (!identity) return;
    setLoading(true);
    setError(null);
    misCall<{ classes: MisClass[] }>({ method: "GET", path: "/desktop/tools/classes", timeoutMs: 20_000 })
      .then((d) => d && setCache({ at: Date.now(), classes: d.classes }))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [identity, setCache]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const lists: ClassList[] = [
    ...(cache?.classes ?? []).map((c) => ({
      id: `mis-${c.classGroupId}`,
      name: c.grade && !c.name.includes(c.grade) ? `${c.grade} ${c.name}` : c.name,
      people: c.students.map((s) => ({ id: s.id, name: s.name })),
      source: "mis" as const,
    })),
    ...own.map((o) => ({ id: o.id, name: o.name, people: o.names.map((n, i) => ({ id: `${o.id}-${i}`, name: n })), source: "own" as const })),
  ];

  const saveOwn = (id: string | null, name: string, names: string[]) =>
    setOwn((list) => {
      const next = { id: id ?? `own-${Date.now().toString(36)}`, name: name.trim() || "List", names };
      return id ? list.map((l) => (l.id === id ? next : l)) : [...list, next];
    });
  const deleteOwn = (id: string) => setOwn((list) => list.filter((l) => l.id !== id));

  return { lists, loading, error, refresh, cachedAt: cache?.at ?? null, saveOwn, deleteOwn };
}
