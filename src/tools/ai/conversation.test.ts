import { describe, expect, it } from "vitest";
import {
  AI_POLICY_REASONS, applyLine, policyCopy, policyRefusal, providerName, suggestions, toRequest, trimTurns, unavailableCopy, type Turn,
} from "./conversation";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { rw } from "../i18n/rw";

const turn = (id: string, role: Turn["role"], content: string, extra: Partial<Turn> = {}): Turn => ({ id, role, content, at: 1, ...extra });

describe("Ask AI conversation", () => {
  it("sends only finished, successful turns", () => {
    const turns = [
      turn("1", "user", "hi"),
      turn("2", "assistant", "partial", { error: "cut off" }),
      turn("3", "user", "again"),
      turn("4", "assistant", "", { streaming: true }),
    ];
    expect(toRequest(turns)).toEqual([{ role: "user", content: "hi" }, { role: "user", content: "again" }]);
  });

  it("builds the answer from streamed lines", () => {
    let turns = [turn("u", "user", "q"), turn("a", "assistant", "", { streaming: true })];
    turns = applyLine(turns, "a", { t: "Hel" });
    turns = applyLine(turns, "a", { t: "lo" });
    turns = applyLine(turns, "a", { done: true, provider: "groq" });
    expect(turns[1]).toMatchObject({ content: "Hello", streaming: false, provider: "groq" });
    expect(turns[0].content).toBe("q");
  });

  it("marks failed answers", () => {
    const turns = applyLine([turn("a", "assistant", "x", { streaming: true })], "a", { error: "busy", code: "QUOTA" });
    expect(turns[0]).toMatchObject({ streaming: false, error: "busy" });
  });

  it("keeps stored conversations short", () => {
    const many = Array.from({ length: 100 }, (_, i) => turn(String(i), "user", "x"));
    expect(trimTurns(many)).toHaveLength(60);
    expect(trimTurns(many)[0].id).toBe("40");
  });

  it("suggests by role and names providers", () => {
    expect(suggestions("teacher")[0]).toBe("ai.s.teacher1");
    expect(suggestions("admin")[0]).toBe("ai.s.staff1");
    expect(providerName("gemini")).toBe("Google Gemini");
    expect(providerName("x")).toBe("x");
  });
});

describe("AI Tutor (students)", () => {
  it("keeps the logged message id for reports and suggests student prompts", async () => {
    const { applyLine, suggestions, newConversationId } = await import("./conversation");
    const turns = [{ id: "a", role: "assistant" as const, content: "", streaming: true, at: 1 }];
    const thinking = applyLine(turns, "a", { status: "thinking" });
    expect(thinking[0].streaming).toBe(true);
    const done = applyLine(applyLine(thinking, "a", { t: "Hint" }), "a", { done: true, provider: "groq", messageId: 42 });
    expect(done[0]).toMatchObject({ content: "Hint", streaming: false, messageId: 42, provider: "groq" });
    expect(suggestions("student")[0]).toBe("ai.s.student1");
    expect(newConversationId()).toMatch(/^[a-z0-9]{6,40}$/);
  });
});

describe("AI policy reasons from MIS", () => {
  it("has local copy for every reason in every language", () => {
    for (const r of AI_POLICY_REASONS) {
      const { title, body } = policyCopy(r);
      for (const dict of [en, fr, rw] as Array<Record<string, string>>) {
        expect(dict[title], `${title}`).toBeTruthy();
        expect(dict[body], `${body}`).toBeTruthy();
      }
    }
  });

  it("shows MIS's message for a policy reason, local copy without one", () => {
    expect(unavailableCopy({ reason: "GLOBAL_OFF", message: "AI is turned off for the school." }))
      .toEqual({ title: "ai.policy.GLOBAL_OFF.title", body: "ai.policy.GLOBAL_OFF.body", message: "AI is turned off for the school." });
    expect(unavailableCopy({ reason: "ROLE_OFF" }).message).toBeUndefined();
    expect(unavailableCopy({ reason: "TEACHER_OFF", message: "  " }).message).toBeUndefined();
  });

  it("keeps the tutor's own reasons on their existing copy", () => {
    expect(unavailableCopy({ reason: "TUTOR_OFF", message: "ignored" })).toEqual({ title: "tutor.offTitle", body: "tutor.off" });
    expect(unavailableCopy({ reason: "CONSENT_NEEDED" })).toEqual({ title: "tutor.consentTitle", body: "tutor.consent" });
    expect(unavailableCopy({ reason: "STUDENTS_SOON" }).title).toBe("ai.studentsSoon");
    expect(unavailableCopy({ reason: null }).title).toBe("ai.parentsSoon");
  });

  it("reads a refused chat (403 AI_DISABLED, or the reason as the code)", () => {
    expect(policyRefusal("AI_DISABLED", { code: "AI_DISABLED", reason: "EXAM_ACTIVE", message: "AI is off during this exam." }))
      .toEqual({ text: "AI is off during this exam." });
    expect(policyRefusal("AI_DISABLED", { reason: "HINTS_ONLY" })).toEqual({ key: "ai.policy.HINTS_ONLY.body" });
    expect(policyRefusal("AI_DISABLED", {})).toEqual({ key: "ai.policy.GLOBAL_OFF.body" });
    expect(policyRefusal("ROLE_OFF", { message: "Your role does not include AI tools." }))
      .toEqual({ text: "Your role does not include AI tools." });
    expect(policyRefusal("DAILY_LIMIT", { message: "x" })).toBeNull();
    expect(policyRefusal("LOCKED_EXAM")).toBeNull();
    expect(policyRefusal(undefined)).toBeNull();
  });
});
