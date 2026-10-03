import { ArrowLeft, ArrowRight, ExternalLink, Printer, RotateCw } from "lucide-react";
import { native, type DesktopApp } from "../lib/native";
import type { AppView } from "../lib/appState";

export function Header({ app, view, page }: { app: DesktopApp | null; view?: AppView; page: "app" | "settings" }) {
  const onApp = page === "app" && !!app;
  return (
    <header className="header">
      <div className="nav-btns">
        <button disabled={!onApp} onClick={() => native.back()} title="Back"><ArrowLeft size={17} /></button>
        <button disabled={!onApp} onClick={() => native.forward()} title="Forward"><ArrowRight size={17} /></button>
        <button disabled={!onApp} onClick={() => native.reload()} title="Reload"><RotateCw size={16} /></button>
      </div>
      <div className="title">
        {page === "settings" ? (
          <strong>Settings</strong>
        ) : app ? (
          <>
            <strong>{app.name}</strong>
            {view?.title && view.title !== app.name && <span className="page-title">{view.title}</span>}
          </>
        ) : null}
      </div>
      <div className="nav-btns">
        <button disabled={!onApp || view?.status !== "ready"} onClick={() => native.print()} title="Print"><Printer size={16} /></button>
        <button disabled={!onApp} onClick={() => native.openInBrowser()} title="Open in browser"><ExternalLink size={16} /></button>
      </div>
      {onApp && view?.busy && <div className="progress" />}
    </header>
  );
}
