import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { OverlayApp } from "./OverlayApp";
import "./styles.css";
import { restoreTheme } from "./lib/theme";

restoreTheme();

// The same page runs in two windows: the main shell, and the floating overlay
// window above it (palette), opened as index.html?overlay=1.
const overlay = new URLSearchParams(window.location.search).has("overlay");
if (overlay) document.documentElement.classList.add("overlay-window");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {overlay ? <OverlayApp /> : <App />}
  </React.StrictMode>,
);
