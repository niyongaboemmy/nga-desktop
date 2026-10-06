// Ask AI's conversation model (pure, unit-tested).
import type { Key } from "../i18n";
import type { Persona } from "../types";

export interface Turn {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Still being written. */
  streaming?: boolean;
  /** The answer failed: shown, never sent back to the AI. */
  error?: string;
  provider?: string;
  /** Tutor replies: the logged message (for "report this answer"). */
  messageId?: number;
  reported?: boolean;
  at: number;
}

export interface Status {
  available: boolean;
  reason: "STUDENTS_SOON" | "PARENTS_SOON" | "TUTOR_OFF" | null;
  persona: string;
  /** Students get the AI Tutor (MIS checks every reply before it's shown). */
  mode?: "tutor" | "assistant";
  limit: number;
  used: number;
  remaining: number;
}

export const turnId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** What goes to MIS: finished turns only, no failed answers, ending with the user. */
export function toRequest(turns: Turn[]): Array<{ role: "user" | "assistant"; content: string }> {
  return turns
    .filter((t) => !t.error && !t.streaming && t.content.trim())
    .map((t) => ({ role: t.role, content: t.content }));
}

export type StreamLine = { t?: string; done?: boolean; provider?: string; remaining?: number; error?: string; code?: string; status?: "thinking"; messageId?: number; mode?: string };

/** Apply one streamed line to the answer being written (by id). */
export function applyLine(turns: Turn[], answerId: string, line: StreamLine): Turn[] {
  return turns.map((t) => {
    if (t.id !== answerId) return t;
    if (typeof line.t === "string") return { ...t, content: t.content + line.t };
    if (line.done) return { ...t, streaming: false, provider: line.provider ?? undefined, messageId: line.messageId };
    if (line.error) return { ...t, streaming: false, error: line.error };
    return t;
  });
}

/** Keep stored conversations small. */
export const MAX_TURNS = 60;
export const trimTurns = (turns: Turn[]) => turns.slice(-MAX_TURNS);

/** Starter ideas by persona (i18n keys). */
export function suggestions(persona: Persona | string | undefined): Key[] {
  if (persona === "student") return ["ai.s.student1", "ai.s.student2", "ai.s.student3", "ai.s.student4"];
  return persona === "teacher"
    ? ["ai.s.teacher1", "ai.s.teacher2", "ai.s.teacher3", "ai.s.teacher4"]
    : ["ai.s.staff1", "ai.s.staff2", "ai.s.staff3", "ai.s.staff4"];
}

/** A friendly provider label for "Answered by". */
export const providerName = (p?: string) =>
  ({ groq: "Groq", gemini: "Google Gemini", glm: "Z.ai GLM", openrouter: "OpenRouter", deepseek: "DeepSeek", openai: "OpenAI" })[p ?? ""] ?? p ?? "";

/** A conversation id for the tutor's log (MIS: 6–40 lowercase letters/digits). */
export const newConversationId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
