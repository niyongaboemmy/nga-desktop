#!/usr/bin/env node
// Runs the browser probe end to end in a built NGA Desktop, unattended:
//   node scripts/probe-ci.mjs <path to the app binary>
//
// - starts the stand-in apps (fake-apps.mjs, PROBE=1 PROBE_CI=1) and the app
//   with a profile that has finished onboarding;
// - Windows: WebView2 gets a fake camera/mic and auto-accepts screen sharing;
// - clicks the probe's button with the real OS mouse whenever it waits for a
//   user gesture, and takes screenshots on the way;
// - notices if the app dies (that's a result too), checks the download landed;
// - writes probe-out/summary.md (also to the GitHub job summary).
// Used by .github/workflows/probe.yml; also works locally on a desktop.
import { spawn, execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const bin = process.argv[2];
if (!bin || !existsSync(bin)) throw new Error("usage: probe-ci.mjs <app binary> (not found: " + bin + ")");
const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "probe-out");
const resultFile = join(root, "probe-result.json");
const WIN = process.platform === "win32";
const MAC = process.platform === "darwin";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
rmSync(resultFile, { force: true });
const started = Date.now();

// ── Profile: onboarding done, MIS first ─────────────────────────────────────
const id = "com.amashuri.nga.desktop.dev";
const dataDir = WIN ? join(process.env.APPDATA, id) : MAC ? join(homedir(), "Library/Application Support", id) : join(homedir(), ".local/share", id);
mkdirSync(dataDir, { recursive: true });
writeFileSync(join(dataDir, "settings.json"), JSON.stringify({ onboarded: true, startApp: "mis" }));

// ── OS helpers: screenshot + click ──────────────────────────────────────────
const ps = (script) => execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8" }).trim();
const WIN_API = `Add-Type @"
using System; using System.Runtime.InteropServices;
public class U {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
[U]::SetProcessDPIAware() | Out-Null`;
let macTool = null;
function macHelper() {
  if (macTool) return macTool;
  const src = join(tmpdir(), "nga-probe-mouse.swift");
  writeFileSync(src, `import CoreGraphics
import Foundation
let a = CommandLine.arguments
if a[1] == "bounds" {
  let pid = Int32(a[2])!
  let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
  var best = CGRect.zero
  for w in list where (w[kCGWindowOwnerPID as String] as? Int32) == pid {
    if let b = w[kCGWindowBounds as String] as? [String: CGFloat] {
      let r = CGRect(x: b["X"] ?? 0, y: b["Y"] ?? 0, width: b["Width"] ?? 0, height: b["Height"] ?? 0)
      if r.width * r.height > best.width * best.height { best = r }
    }
  }
  print("\\(Int(best.minX)) \\(Int(best.minY)) \\(Int(best.width)) \\(Int(best.height))")
} else {
  let p = CGPoint(x: Double(a[2])!, y: Double(a[3])!)
  for t in [CGEventType.mouseMoved, .leftMouseDown, .leftMouseUp] {
    CGEvent(mouseEventSource: nil, mouseType: t, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
    usleep(120000)
  }
}
`);
  macTool = join(tmpdir(), "nga-probe-mouse");
  execFileSync("swiftc", ["-O", src, "-o", macTool]);
  return macTool;
}

function screenshot(name) {
  const file = join(out, name + ".png");
  try {
    if (WIN)
      ps(`Add-Type -AssemblyName System.Windows.Forms,System.Drawing
${WIN_API}
$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp=New-Object Drawing.Bitmap $b.Width,$b.Height
$g=[Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location,[Drawing.Point]::Empty,$b.Size); $bmp.Save('${file}')`);
    else if (MAC) execFileSync("screencapture", ["-x", file]);
    log("screenshot", name);
  } catch (e) {
    log("screenshot failed", name, String(e.message).slice(0, 200));
  }
}

/** Clicks low in the app's window: below the title bar, clear of system prompts. */
function click(pid) {
  try {
    if (WIN) {
      const r = ps(`${WIN_API}
$p = Get-Process -Id ${pid}; $h = $p.MainWindowHandle; $r = New-Object U+RECT; [U]::GetWindowRect($h, [ref]$r) | Out-Null
[U]::SetForegroundWindow($h) | Out-Null; Start-Sleep -Milliseconds 300
$x = [int](($r.L + $r.R) / 2); $y = [int]($r.T + ($r.B - $r.T) * 0.75)
[U]::SetCursorPos($x, $y) | Out-Null; Start-Sleep -Milliseconds 150
[U]::mouse_event(2,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 80; [U]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
"$($r.L),$($r.T),$($r.R),$($r.B) -> $x,$y"`);
      log("click", r);
    } else if (MAC) {
      const [x, y, w, h] = execFileSync(macHelper(), ["bounds", String(pid)], { encoding: "utf8" }).trim().split(" ").map(Number);
      if (!w) return log("click: no window on screen for pid", pid);
      execFileSync(macHelper(), ["click", String(Math.round(x + w / 2)), String(Math.round(y + h * 0.75))]);
      log("click", `${x},${y} ${w}x${h}`);
    }
  } catch (e) {
    log("click failed", String(e.message).slice(0, 300));
  }
}

// ── Run ─────────────────────────────────────────────────────────────────────
const fake = spawn(process.execPath, [join(root, "scripts/fake-apps.mjs")], {
  env: { ...process.env, PROBE: "1", PROBE_CI: "1" },
  stdio: ["ignore", openSync(join(out, "fake-apps.log"), "w"), "inherit"],
});
await sleep(1500);

const env = { ...process.env, RUST_BACKTRACE: "1" };
if (WIN)
  // Replaces wry's own arguments, so they're repeated here (Tauri's defaults).
  env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = [
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    '--auto-select-desktop-capture-source="Entire screen"',
  ].join(" ");
// A file descriptor, not a stream: it must exist before spawn, and survives a crash.
const appLog = openSync(join(out, "app.log"), "w");
const app = spawn(bin, [], { env, stdio: ["ignore", appLog, appLog] });
let exited = null;
app.on("exit", (code, signal) => {
  exited = { code, signal, at: Date.now() };
  log("APP EXITED", code, signal);
});
log("app pid", app.pid);

const read = () => {
  try {
    return JSON.parse(readFileSync(resultFile, "utf8"));
  } catch {
    return null;
  }
};
let last = "", clicksForState = 0, shot = false;
const deadline = Date.now() + 12 * 60_000;
while (Date.now() < deadline && !exited) {
  await sleep(1000);
  const R = read();
  const st = R?.__state || "";
  if (st !== last) {
    log("state:", st || "(no results yet)");
    last = st;
    clicksForState = 0;
    if (st === "in-fullscreen") screenshot("2-fullscreen");
  }
  if (st.startsWith("awaiting-click")) {
    if (!shot) {
      screenshot("1-app");
      shot = true;
    }
    // The first click may only bring the window forward; click again until the probe moves on.
    if (clicksForState < 3) {
      clicksForState++;
      click(app.pid);
      await sleep(1500);
    }
  }
  if (st === "done") break;
}
if (!shot) screenshot("1-app");
screenshot("3-end");
const R = read() || {};
const crashed = exited;

// The probe's blob download should have landed in Downloads.
const dl = join(homedir(), "Downloads");
let download = "NOT FOUND in " + dl;
try {
  const f = readdirSync(dl).filter((x) => x.startsWith("nga-desktop-probe") && statSync(join(dl, x)).mtimeMs > started - 5000);
  if (f.length) download = "saved: " + join(dl, f[0]);
} catch (e) {
  download = "could not read " + dl + ": " + e.message;
}
R["blob download landed"] = download;
if (crashed) R["APP EXITED"] = `code ${exited.code} signal ${exited.signal} after ${((exited.at - started) / 1000).toFixed(0)} s (last state: ${last})`;
else if (R.__state !== "done") R["PROBE INCOMPLETE"] = "stopped at: " + (R.__state || "no results");

app.kill();
fake.kill();
await sleep(1000);

// ── Summary ─────────────────────────────────────────────────────────────────

const bad = (v) => /^(ERROR|NO\b|BLOCKED|NOT FOUND|SKIPPED)|STUCK|EXITED/.test(String(v));
const rows = Object.entries(R)
  .filter(([k]) => !k.startsWith("__"))
  .map(([k, v]) => `| ${bad(v) || k.startsWith("APP") || k.startsWith("PROBE") ? "⚠️" : "✅"} | ${k} | ${String(v).replace(/\|/g, "\\|").replace(/\n/g, " ")} |`);
const md = `## Browser probe: ${R.engine || process.platform} (${process.platform})\n\n| | Check | Result |\n|---|---|---|\n${rows.join("\n")}\n`;
writeFileSync(join(out, "summary.md"), md);
writeFileSync(join(out, "probe-result.json"), JSON.stringify(R, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
console.log(md);
// A crash or an unfinished run fails the job; individual ⚠️ rows are findings to read.
process.exit(crashed || R.__state !== "done" ? 1 : 0);
