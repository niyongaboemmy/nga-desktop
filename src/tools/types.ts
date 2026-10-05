// The Tools Hub's shared types (docs/TOOLS_HUB_IMPLEMENTATION_PLAN.md §5.3).
import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { Key, Translate, Lang } from "./i18n";

export type Persona = "student" | "teacher" | "staff" | "admin" | "parent";
export type Surface = "panel" | "window" | "page";
export type ToolGroup = "everyday" | "ai" | "classroom" | "study" | "games" | "office";

/** Who is signed in to NGA MIS (tools/identity.rs). */
export interface Identity {
  userId: number;
  persona: Persona;
  firstName: string;
  ageBand: "under13" | "13to17" | "adult" | null;
}

export interface ToolContext {
  surface: Surface;
  /** Full screen on a projector (big, high-contrast view). */
  present: boolean;
  identity: Identity | null;
  lang: Lang;
  t: Translate;
}

export interface ToolProps {
  ctx: ToolContext;
}

export interface ToolManifest {
  /** Stable slug: settings, windows (`tool-<id>`) and analytics use it. */
  id: string;
  group: ToolGroup;
  icon: LucideIcon;
  title: Key;
  description: Key;
  /** Extra palette search words (any language). */
  keywords: string[];
  audiences: Persona[] | "all";
  network: "offline" | "partial" | "online";
  /** Can it open in its own window / on a projector? */
  popOut: boolean;
  present: boolean;
  /** Keeps personal data: needs someone signed in to NGA MIS. */
  personal: boolean;
  /** Icon tile colour. */
  color: string;
  /** Modal width: s ≈ 440 px, m ≈ 580 px, l ≈ 880 px (tall). */
  size: "s" | "m" | "l";
  load: () => Promise<{ default: ComponentType<ToolProps> }>;
}
