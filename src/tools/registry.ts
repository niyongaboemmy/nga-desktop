// Every tool, once. The panel, the ⌘K palette, windows and permissions read this list.
// Adding a tool: make its folder, add one entry here, add its i18n keys, add a test.
import { CalendarRange, Calculator, Hourglass, NotebookPen, QrCode, Ruler, Target } from "lucide-react";
import type { Identity, ToolGroup, ToolManifest } from "./types";

export const TOOLS: ToolManifest[] = [
  {
    id: "calculator", group: "everyday", icon: Calculator,
    title: "tool.calculator", description: "tool.calculator.desc",
    keywords: ["calc", "math", "maths", "scientific", "kubara", "calculatrice", "imibare"],
    audiences: "all", network: "offline", popOut: true, present: true, personal: false,
    load: () => import("./calculator/Calculator"),
  },
  {
    id: "timer", group: "everyday", icon: Hourglass,
    title: "tool.timer", description: "tool.timer.desc",
    keywords: ["countdown", "stopwatch", "alarm", "minuteur", "chrono", "isaha", "igihe"],
    audiences: "all", network: "offline", popOut: true, present: true, personal: false,
    load: () => import("./timer/Timers"),
  },
  {
    id: "focus", group: "everyday", icon: Target,
    title: "tool.focus", description: "tool.focus.desc",
    keywords: ["pomodoro", "study", "concentrate", "concentration", "kwiga", "révision"],
    audiences: "all", network: "offline", popOut: true, present: true, personal: false,
    load: () => import("./focus/Focus"),
  },
  {
    id: "notes", group: "everyday", icon: NotebookPen,
    title: "tool.notes", description: "tool.notes.desc",
    keywords: ["note", "memo", "write", "markdown", "inyandiko", "notes"],
    audiences: "all", network: "offline", popOut: true, present: false, personal: true,
    load: () => import("./notes/Notes"),
  },
  {
    id: "converter", group: "everyday", icon: Ruler,
    title: "tool.converter", description: "tool.converter.desc",
    keywords: ["units", "convert", "length", "mass", "temperature", "unités", "ibipimo"],
    audiences: "all", network: "offline", popOut: true, present: false, personal: false,
    load: () => import("./converter/Converter"),
  },
  {
    id: "date-calc", group: "everyday", icon: CalendarRange,
    title: "tool.dates", description: "tool.dates.desc",
    keywords: ["days", "working days", "holidays", "deadline", "jours", "iminsi", "konji"],
    audiences: "all", network: "offline", popOut: true, present: false, personal: false,
    load: () => import("./datecalc/DateCalc"),
  },
  {
    id: "qr", group: "everyday", icon: QrCode,
    title: "tool.qr", description: "tool.qr.desc",
    keywords: ["qr code", "barcode", "wifi", "link", "code qr"],
    audiences: "all", network: "offline", popOut: true, present: true, personal: false,
    load: () => import("./qr/QrTool"),
  },
];

export const GROUPS: ToolGroup[] = ["everyday", "ai", "classroom", "study", "games", "office"];

export const findTool = (id: string | null | undefined) => TOOLS.find((t) => t.id === id) ?? null;

/** The tools this person may see (persona rules; personal tools are listed but locked when signed out). */
export function visibleTools(identity: Identity | null): ToolManifest[] {
  return TOOLS.filter((t) => t.audiences === "all" || (identity !== null && t.audiences.includes(identity.persona)));
}

/** Why a tool can't open right now (an i18n key), or null. */
export function lockReason(tool: ToolManifest, identity: Identity | null): "lock.signIn" | null {
  return tool.personal && !identity ? "lock.signIn" : null;
}
