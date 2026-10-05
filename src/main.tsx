import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { OverlayApp } from "./OverlayApp";
import "./styles.css";
import { restoreTheme } from "./lib/theme";
import { ToolWindowApp } from "./tools/ToolWindowApp";
import "./tools/tools.css";

restoreTheme();

// The same page runs in several windows: the main shell, the floating overlay
// window above it (palette, index.html?overlay=1), and tool windows
// (index.html?tool=<id>[&present=1], tools/windows.rs).
const params = new URLSearchParams(window.location.search);
const overlay = params.has("overlay");
const tool = params.get("tool");
if (overlay) document.documentElement.classList.add("overlay-window");
if (tool) document.documentElement.classList.add("tool-window-root");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {overlay ? <OverlayApp /> : tool ? <ToolWindowApp toolId={tool} present={params.has("present")} /> : <App />}
  </React.StrictMode>,
);
