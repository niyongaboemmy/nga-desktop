// Dev-only end-to-end self-test of the tools' native side, run inside the real
// app (permissions, timers, alerts, Do Not Disturb, windows, files, shortcut).
// Only in builds made with VITE_NGA_SELFTEST=1 (release builds never set it, so it isn't in them).
// Results go to Downloads/nga-tools-selftest.txt (and -window.txt from a tool window).
import { getAllWindows, Window } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { onTool, textToBase64, toolsNative } from "./shared/native";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let started = false;

export async function runShellSelftest() {
  if (started) return; // React StrictMode runs effects twice in dev
  started = true;
  const lines: string[] = [];
  const check = (name: string, ok: boolean, detail = "") => lines.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      check(name, false, `threw ${String(e)}`);
    }
  };
  await sleep(4000);
  let alerts: string[] = [];
  const off = await onTool("nga://tool-alert", (a) => alerts.push(a.title));

  await step("identity command", async () => {
    const id = await toolsNative.identity();
    check("identity command", true, id ? `signed in as ${id.persona}` : "nobody signed in");
  });
  await step("countdown rings", async () => {
    const t = await toolsNative.createTimer({ kind: "countdown", durationMs: 2000, label: "selftest" });
    check("timer created", t.id > 0 && t.runningSince !== null);
    await sleep(3200);
    const after = (await toolsNative.timers()).find((x) => x.id === t.id);
    check("timer finished at its deadline", !!after?.finishedAt, `finishedAt=${after?.finishedAt}`);
    check("alert event reached the shell", alerts.some((a) => a.includes("selftest")), alerts.join(" | "));
    await toolsNative.timerAction(t.id, "delete");
    check("timer deleted", !(await toolsNative.timers()).some((x) => x.id === t.id));
  });
  await step("stopwatch laps", async () => {
    const s = await toolsNative.createTimer({ kind: "stopwatch" });
    await sleep(300);
    await toolsNative.timerAction(s.id, "lap");
    await toolsNative.timerAction(s.id, "pause");
    const x = (await toolsNative.timers()).find((y) => y.id === s.id)!;
    check("stopwatch lap + pause", x.laps.length === 1 && x.runningSince === null && x.elapsedMs >= 250, `laps=${x.laps} elapsed=${x.elapsedMs}`);
    await toolsNative.timerAction(s.id, "delete");
  });
  await step("focus holds notifications", async () => {
    const settings = await load("settings.json", { defaults: {}, autoSave: 100 });
    const before = (await settings.get<number>("dndUntil")) ?? 0;
    const f = await toolsNative.createTimer({ kind: "focus", workMs: 60_000, breakMs: 60_000, rounds: 1 });
    await sleep(600);
    await settings.reload();
    const during = (await settings.get<number>("dndUntil")) ?? 0;
    check("focus turns on Do Not Disturb until the work phase ends", during > Date.now() + 50_000, `dndUntil in ${Math.round((during - Date.now()) / 1000)} s`);
    await toolsNative.timerAction(f.id, "delete");
    await sleep(600);
    await settings.reload();
    const after = (await settings.get<number>("dndUntil")) ?? 0;
    check("stopping focus lifts its Do Not Disturb", after === before || after === 0, `before=${before} after=${after}`);
  });
  await step("limits", async () => {
    let refused = false;
    try {
      await toolsNative.createTimer({ kind: "countdown", durationMs: 10 });
    } catch {
      refused = true;
    }
    check("too-short timer refused", refused);
  });
  await step("displays", async () => {
    const d = await toolsNative.displays();
    check("displays listed", d.length >= 1, d.map((x) => `${x.name} ${x.width}x${x.height}${x.current ? " (NGA)" : ""}`).join(", "));
  });
  await step("pop-out window", async () => {
    await toolsNative.openWindow("calculator", "Calculator", false, true);
    await sleep(2500);
    const w = await Window.getByLabel("tool-calculator");
    check("pop-out window opened", !!w);
    check("pop-out stays on top", !!w && (await w.isAlwaysOnTop().catch(() => false)));
    await sleep(2500); // the window writes its own report
    await w?.close().catch(() => undefined);
  });
  await step("present window", async () => {
    await toolsNative.openWindow("timer", "Timers", true);
    await sleep(3000);
    const w = await Window.getByLabel("present-timer");
    check("present window opened", !!w);
    check("present window is full screen", !!w && (await w.isFullscreen().catch(() => false)));
    await w?.close().catch(() => undefined);
    await sleep(800);
  });
  await step("bad tool id refused", async () => {
    let refused = false;
    try {
      await toolsNative.openWindow("../../etc", "x", false);
    } catch {
      refused = true;
    }
    check("bad tool id refused", refused);
  });
  await step("save file", async () => {
    let refused = false;
    try {
      await toolsNative.saveFile("evil.exe", textToBase64("x"));
    } catch {
      refused = true;
    }
    check("executable file names refused", refused);
  });
  await step("shortcut", async () => {
    try {
      const on = await toolsNative.setShortcut(true);
      check("quick shortcut registers", on === true);
      await toolsNative.setShortcut(false);
    } catch (e) {
      check("quick shortcut registers", false, String(e));
    }
  });
  await step("tools modal", async () => {
    await invoke("overlay_show", { view: "tool:calculator" });
    await sleep(800);
    const overlay = await Window.getByLabel("overlay");
    check("tools open as a modal in the overlay", !!overlay && (await overlay.isVisible()));
    await (await Window.getByLabel("main"))?.setFocus();
    await sleep(600);
    check("the tool modal stays open when focus moves away", !!overlay && (await overlay.isVisible()));
    await invoke("overlay_hide");
    await sleep(400);
    check("the modal closes", !!overlay && !(await overlay.isVisible()));
  });
  await step("tooltips", async () => {
    const main = await Window.getByLabel("main");
    await main?.setFocus();
    await sleep(500);
    await invoke("tooltip_show", { text: "Notifications", hint: "From every NGA app", keys: "⌘⇧N", x: 900, y: 40 });
    await sleep(500);
    const tip = await Window.getByLabel("tooltip");
    check("tooltip shows under the button", !!tip && (await tip.isVisible()));
    check("showing a tooltip never takes focus", !!main && (await main.isFocused()));
    await invoke("tooltip_hide");
    await sleep(300);
    check("tooltip hides", !!tip && !(await tip.isVisible()));
  });
  await step("microphone (noise meter)", async () => {
    check("the shell page is a secure context", window.isSecureContext, location.origin);
    check("getUserMedia is available to the tools", !!navigator.mediaDevices?.getUserMedia);
  });
  await step("PDF tools", async () => {
    const { PDFDocument } = await import("pdf-lib");
    const { buildPdf, pageRefs, toBase64 } = await import("./office/pdfBuild");
    const { renderThumbs, pdfMode } = await import("./office/thumbs");
    const d = await PDFDocument.create();
    d.addPage([595, 842]);
    d.addPage([842, 595]);
    const src = { id: "s", name: "s.pdf", kind: "pdf" as const, bytes: await d.save(), pageCount: 2 };
    const out = await buildPdf([src], pageRefs(src), { watermark: "SELFTEST", pageNumbers: true });
    check("pdf-lib builds a PDF", out.length > 500, `${out.length} bytes`);
    let n = 0;
    const started = Date.now();
    let err = "";
    await Promise.race([
      renderThumbs(out, 120, () => n++),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timed out after 20 s")), 20_000)),
    ]).catch((e) => (err = String(e)));
    check("pdf.js draws thumbnails", n === 2, `${n} thumbnails in ${Date.now() - started} ms; mode=${pdfMode.value} ${pdfMode.detail} ${err}`);
    const path = await toolsNative.saveFile("nga-tools-selftest.pdf", toBase64(out));
    check("a PDF can be saved", path.endsWith(".pdf"), path);
  });
  await step("MIS API proxy", async () => {
    let refused = "";
    try {
      await invoke("tools_api", { id: "selftest1", method: "GET", path: "/users/me", body: null });
    } catch (e) {
      refused = String(e);
    }
    check("only /desktop/tools paths may be called", refused.includes("bad request"), refused);
  });
  const windows = (await getAllWindows()).map((w) => w.label);
  check("no tool windows left open", !windows.some((l) => l.startsWith("tool-") || l.startsWith("present-")), windows.join(","));
  off();
  alerts = [];
  const text = `NGA Tools self-test ${new Date().toISOString()}\n${lines.join("\n")}\n`;
  await toolsNative.saveFile("nga-tools-selftest.txt", textToBase64(text));
}

/** In a tool window: can it reach its own commands (capability "tools")? */
let windowStarted = false;

export async function runWindowSelftest(label: string) {
  if (windowStarted) return;
  windowStarted = true;
  const lines: string[] = [];
  for (const [name, fn] of [
    ["timers_list", () => toolsNative.timers()],
    ["tools_identity", () => toolsNative.identity()],
    ["tools_displays", () => toolsNative.displays()],
  ] as const) {
    try {
      await fn();
      lines.push(`PASS ${label} may call ${name}`);
    } catch (e) {
      lines.push(`FAIL ${label} may call ${name} — ${String(e)}`);
    }
  }
  await toolsNative.saveFile("nga-tools-selftest-window.txt", textToBase64(lines.join("\n") + "\n"));
}
