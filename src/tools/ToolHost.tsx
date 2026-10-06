import { Component, lazy, Suspense, useMemo, type ComponentType, type ReactNode } from "react";
import { LoaderCircle, RotateCw, TriangleAlert } from "lucide-react";
import type { ToolContext, ToolManifest, ToolProps } from "./types";

// Tools whose code has already arrived: rendered directly, without React.lazy's
// Suspense round (React holds a fallback ~300 ms before revealing content).
const loaded = new Map<string, ComponentType<ToolProps>>();
const loading = new Map<string, Promise<void>>();

/** Start loading a tool's code early (hover, focus or keyboard selection in the launcher). */
export function preloadTool(tool: ToolManifest): Promise<void> {
  let p = loading.get(tool.id);
  if (!p) {
    p = tool.load().then((m) => void loaded.set(tool.id, m.default)).catch(() => void loading.delete(tool.id));
    loading.set(tool.id, p);
  }
  return p;
}

// One lazy component per tool, created once (so React keeps its state).
const lazies = new Map<string, ComponentType<ToolProps>>();
const lazyFor = (tool: ToolManifest) => {
  let c = lazies.get(tool.id);
  if (!c) {
    c = lazy(tool.load);
    lazies.set(tool.id, c);
  }
  return c;
};

/** A tool that crashes shows "Reload" instead of taking the shell down with it. */
class Boundary extends Component<{ children: ReactNode; ctx: ToolContext }, { error: boolean; n: number }> {
  state = { error: false, n: 0 };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(error: unknown) {
    console.error("tool crashed", error);
  }
  render() {
    const { t } = this.props.ctx;
    if (this.state.error)
      return (
        <div className="tool-error" role="alert">
          <TriangleAlert size={22} />
          <p>{t("host.crashed")}</p>
          <button className="btn sm" onClick={() => this.setState((s) => ({ error: false, n: s.n + 1 }))}>
            <RotateCw size={14} /> {t("host.reload")}
          </button>
        </div>
      );
    return <div key={this.state.n} className="tool-body">{this.props.children}</div>;
  }
}

export function ToolHost({ tool, ctx }: { tool: ToolManifest; ctx: ToolContext }) {
  const Tool = useMemo(() => loaded.get(tool.id) ?? lazyFor(tool), [tool]);
  return (
    <Boundary ctx={ctx}>
      <Suspense fallback={<div className="tool-loading"><LoaderCircle size={20} className="spin" /></div>}>
        <Tool ctx={ctx} />
      </Suspense>
    </Boundary>
  );
}
