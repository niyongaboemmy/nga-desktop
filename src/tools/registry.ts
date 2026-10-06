// Every tool, once. The panel, the ⌘K palette, windows and permissions read this list.
// Adding a tool: make its folder, add one entry here, add its i18n keys, add a test.
import { CalendarClock, CalendarRange, Calculator, Hand, MonitorPlay, PenLine, Percent, Shuffle, Users, Volume2, Hourglass, NotebookPen, QrCode, Ruler, Sparkles, Target } from "lucide-react";
import type { Identity, ToolGroup, ToolManifest } from "./types";

export const TOOLS: ToolManifest[] = [
  {
    id: "my-day", group: "everyday", icon: CalendarClock,
    title: "tool.myday", description: "tool.myday.desc",
    keywords: ["calendar", "agenda", "timetable", "schedule", "today", "lessons", "emploi du temps", "ingengabihe", "uyu munsi"],
    audiences: "all", network: "partial", popOut: true, present: true, personal: true, color: "#0ea5e9", size: "m",
    load: () => import("./myday/MyDay"),
  },
  {
    id: "ai", group: "ai", icon: Sparkles,
    title: "tool.ai", description: "tool.ai.desc",
    keywords: ["ai", "assistant", "chat", "gpt", "ask", "ia", "ubwenge", "lesson plan", "quiz"],
    audiences: "all", network: "online", popOut: true, present: false, personal: true, color: "#8b5cf6", size: "l",
    load: () => import("./ai/AskAi"),
  },
  {
    id: "calculator", group: "everyday", icon: Calculator,
    title: "tool.calculator", description: "tool.calculator.desc",
    keywords: ["calc", "math", "maths", "scientific", "kubara", "calculatrice", "imibare"],
    audiences: "all", network: "offline", popOut: true, present: true, personal: false, color: "#3b82f6", size: "s",
    load: () => import("./calculator/Calculator"),
  },
  {
    id: "timer", group: "everyday", icon: Hourglass,
    title: "tool.timer", description: "tool.timer.desc",
    keywords: ["countdown", "stopwatch", "alarm", "minuteur", "chrono", "isaha", "igihe"],
    audiences: "all", network: "offline", popOut: true, present: true, personal: false, color: "#f59e0b", size: "m",
    load: () => import("./timer/Timers"),
  },
  {
    id: "focus", group: "everyday", icon: Target,
    title: "tool.focus", description: "tool.focus.desc",
    keywords: ["pomodoro", "study", "concentrate", "concentration", "kwiga", "révision"],
    audiences: "all", network: "offline", popOut: true, present: true, personal: false, color: "#ef4444", size: "s",
    load: () => import("./focus/Focus"),
  },
  {
    id: "notes", group: "everyday", icon: NotebookPen,
    title: "tool.notes", description: "tool.notes.desc",
    keywords: ["note", "memo", "write", "markdown", "inyandiko", "notes"],
    audiences: "all", network: "offline", popOut: true, present: false, personal: true, color: "#eab308", size: "l",
    load: () => import("./notes/Notes"),
  },
  {
    id: "converter", group: "everyday", icon: Ruler,
    title: "tool.converter", description: "tool.converter.desc",
    keywords: ["units", "convert", "length", "mass", "temperature", "unités", "ibipimo"],
    audiences: "all", network: "offline", popOut: true, present: false, personal: false, color: "#14b8a6", size: "m",
    load: () => import("./converter/Converter"),
  },
  {
    id: "date-calc", group: "everyday", icon: CalendarRange,
    title: "tool.dates", description: "tool.dates.desc",
    keywords: ["days", "working days", "holidays", "deadline", "jours", "iminsi", "konji"],
    audiences: "all", network: "offline", popOut: true, present: false, personal: false, color: "#a855f7", size: "m",
    load: () => import("./datecalc/DateCalc"),
  },
  {
    id: "qr", group: "everyday", icon: QrCode,
    title: "tool.qr", description: "tool.qr.desc",
    keywords: ["qr code", "barcode", "wifi", "link", "code qr"],
    audiences: "all", network: "offline", popOut: true, present: true, personal: false, color: "#64748b", size: "m",
    load: () => import("./qr/QrTool"),
  },
  {
    id: "picker", group: "classroom", icon: Shuffle,
    title: "tool.picker", description: "tool.picker.desc",
    keywords: ["random", "name", "student", "pick", "choose", "wheel", "hasard", "izina"],
    audiences: ["teacher", "staff", "admin"], network: "partial", popOut: true, present: true, personal: true, color: "#f97316", size: "m",
    load: () => import("./classroom/Picker"),
  },
  {
    id: "groups", group: "classroom", icon: Users,
    title: "tool.groups", description: "tool.groups.desc",
    keywords: ["groups", "teams", "random groups", "pairs", "équipes", "amatsinda"],
    audiences: ["teacher", "staff", "admin"], network: "partial", popOut: true, present: true, personal: true, color: "#22c55e", size: "m",
    load: () => import("./classroom/Groups"),
  },
  {
    id: "noise", group: "classroom", icon: Volume2,
    title: "tool.noise", description: "tool.noise.desc",
    keywords: ["noise", "volume", "loud", "quiet", "bruit", "urusaku"],
    audiences: ["teacher", "staff", "admin"], network: "offline", popOut: true, present: true, personal: false, color: "#ef4444", size: "m",
    load: () => import("./classroom/Noise"),
  },
  {
    id: "signs", group: "classroom", icon: Hand,
    title: "tool.signs", description: "tool.signs.desc",
    keywords: ["traffic light", "work mode", "silence", "instructions", "consigne", "amabwiriza"],
    audiences: ["teacher", "staff", "admin"], network: "offline", popOut: true, present: true, personal: false, color: "#f59e0b", size: "m",
    load: () => import("./classroom/Signs"),
  },
  {
    id: "classroom-screen", group: "classroom", icon: MonitorPlay,
    title: "tool.cscreen", description: "tool.cscreen.desc",
    keywords: ["projector", "classroom screen", "board", "écran", "projecteur"],
    audiences: ["teacher", "staff", "admin"], network: "offline", popOut: false, present: true, personal: false, color: "#0ea5e9", size: "l",
    load: () => import("./classroom/ClassroomScreen"),
  },
  {
    id: "board", group: "classroom", icon: PenLine,
    title: "tool.board", description: "tool.board.desc",
    keywords: ["whiteboard", "draw", "sketch", "tableau", "kwandika", "gushushanya"],
    audiences: "all", network: "offline", popOut: true, present: true, personal: false, color: "#3b82f6", size: "l",
    load: () => import("./classroom/Board"),
  },
  {
    id: "grades", group: "study", icon: Percent,
    title: "tool.grades", description: "tool.grades.desc",
    keywords: ["marks", "average", "weighted", "grade", "notes", "moyenne", "amanota"],
    audiences: "all", network: "offline", popOut: true, present: false, personal: false, color: "#8b5cf6", size: "m",
    load: () => import("./classroom/Grades"),
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
