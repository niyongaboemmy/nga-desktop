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

/**
 * Why MIS says no under the school's AI policy (MIS ai_policy, shared
 * decideAi rule): the super admin's switch, the app switch, the role's AI_USE,
 * or the teacher's setting for the quiz/assignment the student is in.
 */
export const AI_POLICY_REASONS = [
  "GLOBAL_OFF", "APP_OFF", "ROLE_OFF", "TEACHER_OFF", "EXAM_ACTIVE", "ASSESSMENT_LOCKED", "HINTS_ONLY", "FEATURE_OFF",
] as const;
export type AiPolicyReason = (typeof AI_POLICY_REASONS)[number];
export const isAiPolicyReason = (r: unknown): r is AiPolicyReason =>
  typeof r === "string" && (AI_POLICY_REASONS as readonly string[]).includes(r);

export interface Status {
  available: boolean;
  reason: "STUDENTS_SOON" | "PARENTS_SOON" | "TUTOR_OFF" | "CONSENT_NEEDED" | AiPolicyReason | null;
  /** MIS's own explanation of `reason` (newer MIS); shown in place of local copy when present. */
  message?: string;
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

/** Local copy for a policy reason, used when MIS sends no message. */
export const policyCopy = (reason: AiPolicyReason): { title: Key; body: Key } => ({
  title: `ai.policy.${reason}.title` as Key,
  body: `ai.policy.${reason}.body` as Key,
});

/**
 * What the "AI isn't available" screen says. The tutor's own reasons keep
 * their local copy; a policy reason shows MIS's `message` when it sent one.
 */
export function unavailableCopy(status: Pick<Status, "reason" | "message">): { title: Key; body: Key; message?: string } {
  const r = status.reason;
  if (r === "CONSENT_NEEDED") return { title: "tutor.consentTitle", body: "tutor.consent" };
  if (r === "TUTOR_OFF") return { title: "tutor.offTitle", body: "tutor.off" };
  if (r === "STUDENTS_SOON") return { title: "ai.studentsSoon", body: "ai.studentsSoonBody" };
  // Every policy reason has its own en/fr/rw copy; MIS's English message is
  // only the fallback for a reason this build does not know yet.
  if (isAiPolicyReason(r)) return policyCopy(r);
  if (typeof r === "string" && typeof status.message === "string" && status.message.trim()) {
    return { ...policyCopy("GLOBAL_OFF"), message: status.message.trim() };
  }
  return { title: "ai.parentsSoon", body: "ai.parentsSoonBody" };
}

/**
 * A chat refused by the AI policy: MIS answers 403 `{code: "AI_DISABLED",
 * reason, message}` (or, from older paths, the reason itself as the code).
 * Returns the local copy's key for a known reason (localised), else MIS's
 * message; null for other errors.
 */
export function policyRefusal(code: string | undefined, data?: Record<string, unknown>): { text: string } | { key: Key } | null {
  const reason = code === "AI_DISABLED" ? data?.reason : code;
  if (code !== "AI_DISABLED" && !isAiPolicyReason(reason)) return null;
  if (isAiPolicyReason(reason)) return { key: policyCopy(reason).body };
  const message = typeof data?.message === "string" ? data.message.trim() : "";
  return message ? { text: message } : { key: policyCopy("GLOBAL_OFF").body };
}
