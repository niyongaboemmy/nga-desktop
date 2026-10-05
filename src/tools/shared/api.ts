// NGA MIS API calls for the tools. They are made by the MIS page inside NGA
// (src-tauri/src/tools/api.rs + bridge.js), with MIS's own session: the token
// never reaches the shell. Only /desktop/tools/… paths are allowed.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

interface ApiEvent {
  id: string;
  kind: "lines" | "end" | "response" | "error";
  data: string | null;
}

export class MisApiError extends Error {
  constructor(message: string, readonly status = 0, readonly code?: string) {
    super(message);
  }
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/** Reads `{success, message, code}` error bodies into a MisApiError. */
export function errorFrom(status: number, body: string): MisApiError {
  try {
    const j = JSON.parse(body);
    return new MisApiError(j?.message || `NGA MIS said ${status}`, status, j?.code);
  } catch {
    return new MisApiError(status === 401 ? "Sign in to NGA MIS again" : `NGA MIS said ${status}`, status);
  }
}

/** Splits NDJSON text into parsed objects (ignores blank and broken lines). */
export function parseLines(text: string): unknown[] {
  const out: unknown[] = [];
  for (const line of text.split("\n")) {
    const l = line.trim();
    if (!l) continue;
    try {
      out.push(JSON.parse(l));
    } catch {
      /* a broken line is skipped, never fatal */
    }
  }
  return out;
}

interface Call {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  /** NDJSON lines as they arrive (streaming endpoints). */
  onLine?: (line: unknown) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** One MIS request. Resolves with the JSON body (non-streaming) or null (stream finished). */
export function misCall<T = unknown>({ method, path, body, onLine, signal, timeoutMs = 120_000 }: Call): Promise<T | null> {
  const id = newId();
  return new Promise<T | null>((resolve, reject) => {
    let off: UnlistenFn | null = null;
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      off?.();
      fn();
    };
    const onAbort = () => {
      void invoke("tools_api_cancel", { id }).catch(() => undefined);
      finish(() => reject(new MisApiError("Stopped", 0, "ABORTED")));
    };
    const timer = window.setTimeout(() => onAbort(), timeoutMs);
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort);
    void listen<ApiEvent>("nga://tools-api", ({ payload: e }) => {
      if (e.id !== id) return;
      if (e.kind === "lines") parseLines(e.data ?? "").forEach((l) => onLine?.(l));
      else if (e.kind === "end") finish(() => resolve(null));
      else if (e.kind === "error")
        finish(() => reject(new MisApiError(e.data === "network" ? "No connection to NGA MIS" : "The request was refused", 0, e.data ?? undefined)));
      else if (e.kind === "response") {
        let status = 0, text = "";
        try {
          const r = JSON.parse(e.data ?? "{}");
          status = r.status;
          text = r.body ?? "";
        } catch {
          /* handled below */
        }
        if (status >= 200 && status < 300) {
          finish(() => {
            try {
              const j = text ? JSON.parse(text) : null;
              resolve((j && typeof j === "object" && "data" in j ? j.data : j) as T);
            } catch {
              reject(new MisApiError("Unexpected answer from NGA MIS", status));
            }
          });
        } else finish(() => reject(errorFrom(status, text)));
      }
    }).then((unlisten) => {
      off = unlisten;
      if (done) unlisten();
      return invoke("tools_api", { id, method, path, body: body === undefined ? null : JSON.stringify(body) });
    }).catch((err) => finish(() => reject(new MisApiError(String(err)))));
  });
}
