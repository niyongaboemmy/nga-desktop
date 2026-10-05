// Injected into every NGA app page (main frame) by NGA Desktop.
//
// It replaces a few standard web APIs with native ones, so the apps need no
// desktop-specific code. Each call is answered only for the four NGA origins
// (runtime capability "remote-apps"), and Rust decides which app a call
// came from by the webview it ran in, never by what the page claims.
//
//   new Notification(title, {body, tag, silent})  -> NGA notification manager
//   Notification.permission / requestPermission() -> "granted" (mute and
//                                                     Do Not Disturb are NGA settings)
//   navigator.setAppBadge(n) / clearAppBadge()     -> sidebar + dock badge
//   window.print() (macOS only)                    -> native print (WKWebView ignores it)
//
// And, so every app's notifications reach the desktop without app changes:
//   watchers  - read the app's OWN notification polls (MIS /notifications,
//               Tendo /api/notifications, Task Mentor's dashboard alerts) and
//               raise a desktop notification for each new unread item;
//   replay    - when an app stops polling in the background (Task Mentor
//               polls only while visible), repeat its last request with its
//               own headers, from its own origin, at a gentle interval;
//   theme     - keep every app on the same light/dark theme as the shell
//               (report a switch made here; apply one made elsewhere).
(function () {
  "use strict";
  var internals = window.__TAURI_INTERNALS__;
  if (!internals || window.__ngaBridge) return;
  window.__ngaBridge = true;
  var invoke = function (cmd, args) {
    try {
      return Promise.resolve(internals.invoke(cmd, args || {}));
    } catch (e) {
      return Promise.reject(e);
    }
  };

  var live = {};
  var seq = 0;
  var newId = function () {
    seq += 1;
    return Date.now().toString(36) + seq.toString(36) + Math.random().toString(36).slice(2, 8);
  };

  function NgaNotification(title, options) {
    if (!(this instanceof NgaNotification)) throw new TypeError("Illegal constructor");
    options = options || {};
    var self = this;
    var target = document.createDocumentFragment(); // a cheap EventTarget
    this.addEventListener = target.addEventListener.bind(target);
    this.removeEventListener = target.removeEventListener.bind(target);
    this.dispatchEvent = target.dispatchEvent.bind(target);
    this.title = String(title);
    this.body = options.body == null ? "" : String(options.body);
    this.tag = options.tag == null ? "" : String(options.tag);
    this.icon = options.icon == null ? "" : String(options.icon);
    this.data = options.data === undefined ? null : options.data;
    this.silent = !!options.silent;
    this.onclick = this.onshow = this.onclose = this.onerror = null;
    this._id = newId();
    live[this._id] = this;
    var fire = function (type) {
      var ev = new Event(type, { cancelable: type === "click" });
      var handler = self["on" + type];
      if (typeof handler === "function") handler.call(self, ev);
      self.dispatchEvent(ev);
    };
    this._fire = fire;
    invoke("web_notify", { id: this._id, title: this.title, body: this.body, tag: this.tag, silent: this.silent })
      .then(function () { fire("show"); })
      .catch(function () { delete live[self._id]; fire("error"); });
  }
  NgaNotification.prototype.close = function () {
    if (live[this._id]) {
      delete live[this._id];
      this._fire("close");
    }
  };
  Object.defineProperty(NgaNotification, "permission", { get: function () { return "granted"; } });
  Object.defineProperty(NgaNotification, "maxActions", { get: function () { return 0; } });
  NgaNotification.requestPermission = function (callback) {
    if (typeof callback === "function") callback("granted");
    return Promise.resolve("granted");
  };
  Object.defineProperty(window, "Notification", { value: NgaNotification, configurable: true, writable: true });

  // Rust calls this when the person clicks the notice (banner or NGA inbox).
  Object.defineProperty(window, "__ngaNotificationClick", {
    value: function (id) {
      var n = live[id];
      if (!n) return;
      delete live[id];
      n._fire("click");
    },
  });

  var badge = function (count) {
    return invoke("web_badge", { count: count }).then(function () {});
  };
  navigator.setAppBadge = function (n) {
    return badge(n === undefined ? -1 : Math.max(0, Math.floor(Number(n) || 0)));
  };
  navigator.clearAppBadge = function () {
    return badge(0);
  };

  // ── Installed-app mode ─────────────────────────────────────────────────────
  // Inside NGA Desktop every app IS installed. All four apps decide that with
  // matchMedia("(display-mode: standalone)") / navigator.standalone, so answering
  // truthfully hides their "Install as an app" prompts (Safari "Add to Dock",
  // Chrome install cards) without any change to the apps.
  var realMatchMedia = window.matchMedia ? window.matchMedia.bind(window) : null;
  var displayMode = /^\s*\(\s*display-mode\s*:\s*([a-z-]+)\s*\)\s*$/i;
  window.matchMedia = function (query) {
    var m = displayMode.exec(String(query));
    if (!m || !realMatchMedia) return realMatchMedia ? realMatchMedia(query) : null;
    var noop = function () {};
    return {
      matches: m[1].toLowerCase() === "standalone",
      media: String(query),
      onchange: null,
      addListener: noop,
      removeListener: noop,
      addEventListener: noop,
      removeEventListener: noop,
      dispatchEvent: function () { return false; },
    };
  };
  try { Object.defineProperty(navigator, "standalone", { get: function () { return true; }, configurable: true }); } catch (e) { /* read-only */ }

  // ── Service workers and Web Push: off inside NGA Desktop ─────────────────
  // The app pages are always online here, and a service worker's cache is
  // what kept old releases running after deploys. Web Push has no push service
  // in an app window (WebKit has no PushManager; WebView2's subscribe fails),
  // and NGA Desktop delivers notifications natively instead (notifications.rs,
  // including MIS reminders through its bell). Hiding both lets each app take
  // its own "no push here" path rather than offer a setup that cannot work.
  if (navigator.serviceWorker) {
    try {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (r) { r.unregister(); });
      }).catch(function () {});
      navigator.serviceWorker.register = function () {
        return Promise.reject(new DOMException("Service workers are off in NGA Desktop", "NotSupportedError"));
      };
    } catch (e) { /* read-only in some engines */ }
  }
  try { delete window.PushManager; } catch (e) { /* ignore */ }
  try { if (window.PushManager) Object.defineProperty(window, "PushManager", { value: undefined, configurable: true }); } catch (e) { /* ignore */ }

  // ── Fullscreen (Windows) ─────────────────────────────────────────────────
  // WebView2 shows requestFullscreen() only inside the app area. Ask NGA to
  // make the window itself fullscreen (Task Mentor's proctored quizzes,
  // e-learning lessons, videos). WKWebView (macOS) does it natively.
  // macOS: reported too, so the app's view is put back on top afterwards.
  document.addEventListener("fullscreenchange", function () {
    invoke("web_fullscreen", { on: !!document.fullscreenElement }).catch(function () {});
  });

  // ── Theme, in sync with the shell and the other apps (theme.rs) ─────────
  // Each app shows its theme on <html>: MIS, Task Mentor and Tupo with the
  // `dark` class, Tendo with data-theme. A switch made in this app is
  // reported; a theme pushed from the shell arrives as `nga:set-theme`, which
  // an app handles itself (it calls preventDefault). Older app versions get
  // their own storage key and <html> marker set directly.
  var THEME_FALLBACK = {
    mis: { key: "theme", apply: function (t) { var c = document.documentElement.classList; c.remove("light", "dark"); c.add(t); } },
    taskmentor: { key: "theme", apply: function (t) { document.documentElement.classList.toggle("dark", t === "dark"); document.documentElement.style.colorScheme = t; } },
    tendo: { key: "theme", apply: function (t) { document.documentElement.setAttribute("data-theme", t); } },
    tupo: { key: "tupo_theme", apply: function (t) { document.documentElement.classList.toggle("dark", t === "dark"); } },
  }[__NGA_APP__];
  var readTheme = function () {
    var root = document.documentElement;
    if (!root) return "";
    if (__NGA_APP__ === "tendo") {
      var a = root.getAttribute("data-theme");
      return a === "dark" || a === "light" ? a : "";
    }
    return root.classList.contains("dark") ? "dark" : "light";
  };
  var shownTheme = "";
  var themeSynced = false; // until the shell's first push, changes are just the page starting up
  var watchTheme = function () {
    shownTheme = readTheme();
    new MutationObserver(function () {
      var t = readTheme();
      if (!t || t === shownTheme) return;
      shownTheme = t;
      if (themeSynced) invoke("web_theme", { theme: t }).catch(function () {});
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
  };
  if (document.documentElement) watchTheme();
  else document.addEventListener("DOMContentLoaded", watchTheme);

  Object.defineProperty(window, "__ngaSetTheme", {
    value: function (t, persist) {
      if (t !== "light" && t !== "dark") return;
      themeSynced = true;
      shownTheme = t; // our own change: don't report it back
      var ev = new CustomEvent("nga:set-theme", { detail: { theme: t, persist: !!persist }, cancelable: true });
      var handledByApp = !window.dispatchEvent(ev);
      if (!handledByApp && THEME_FALLBACK) {
        try { localStorage.setItem(THEME_FALLBACK.key, t); } catch (e) { /* storage blocked */ }
        THEME_FALLBACK.apply(t);
      }
    },
  });

  // ── Notification watchers ──────────────────────────────────────────────────
  var str = function (v) { return v == null ? "" : String(v); };
  var WATCHERS = {
    mis: [{
      // GET /notifications?limit=20 (NotificationContext, every 45 s)
      match: /\/notifications\/?(\?|$)/,
      pick: function (j) {
        return (j && j.data || []).map(function (x) {
          var n = x.notification || {};
          return { id: "n" + n.notification_id, title: str(n.title), body: str(n.body), link: n.link, unread: !n.read_at, at: Date.parse(n.created_at) };
        });
      },
    }],
    tendo: [{
      // GET /api/notifications (NotificationCenter, every 30 s)
      match: /\/api\/notifications\/?(\?|$)/,
      pick: function (j) {
        return (j && j.data || []).map(function (n) {
          return { id: "n" + n.id, title: str(n.title), body: str(n.message), link: n.link, unread: !n.read, at: Date.parse(n.created_at) };
        });
      },
    }],
    taskmentor: [{
      // GET /dashboard/{student,instructor}/overview: polled only while visible, so replayed.
      match: /\/dashboard\/(student|instructor)\/overview/,
      replayMs: 3 * 60 * 1000,
      pick: function (j) {
        var d = (j && j.data) || {};
        return (d.reminders || d.alerts || []).filter(function (a) {
          if (!a || a.id === "all-clear" || a.notify === false) return false;
          return a.notify === true || a.severity === "critical" || a.severity === "warning" ||
            /^(result-|opens-)/.test(a.id) || a.id === "new-work";
        }).map(function (a) {
          return { id: "a" + a.id, title: str(a.title), body: str(a.message), link: a.action && a.action.url, unread: true, at: NaN };
        });
      },
    }],
  }[__NGA_APP__] || [];

  var SEEN_KEY = "nga.desktop.seen.v1";
  var seen = null;
  var loadSeen = function () {
    if (seen) return seen;
    try {
      var raw = localStorage.getItem(SEEN_KEY);
      seen = raw ? { first: false, ids: JSON.parse(raw) } : { first: true, ids: [] };
    } catch (e) {
      seen = { first: true, ids: [] };
    }
    return seen;
  };
  var saveSeen = function () {
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen.ids.slice(-400))); } catch (e) { /* full */ }
  };

  var openLink = function (link) {
    if (!link) return;
    try {
      var url = new URL(link, location.href);
      if (url.origin === location.origin) {
        // Let the SPA router handle it (React Router listens to popstate).
        history.pushState({}, "", url.pathname + url.search + url.hash);
        window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
      } else {
        location.assign(url.href);
      }
    } catch (e) { /* bad link */ }
  };

  var raise = function (title, body, tag, link) {
    var n = new NgaNotification(title, { body: body, tag: tag });
    n.onclick = function () { openLink(link); };
  };

  var handle = function (w, json) {
    var items;
    try { items = w.pick(json) || []; } catch (e) { return; }
    var s = loadSeen();
    var fresh = [];
    var dayAgo = Date.now() - 24 * 3600 * 1000;
    items.forEach(function (it) {
      if (!it || !it.id || s.ids.indexOf(it.id) !== -1) return;
      s.ids.push(it.id);
      // First run: everything already there is "seen" (no flood of old items).
      if (!s.first && it.unread && it.title && !(it.at < dayAgo)) fresh.push(it);
    });
    s.first = false;
    saveSeen();
    if (fresh.length > 3) {
      raise(fresh.length + " new notifications", fresh.slice(0, 3).map(function (f) { return f.title; }).join(" · "), "batch", null);
    } else {
      fresh.forEach(function (f) { raise(f.title, f.body, "w-" + f.id, f.link); });
    }
    w.lastAt = Date.now();
  };

  var watcherFor = function (method, url) {
    if (!WATCHERS.length || String(method || "GET").toUpperCase() !== "GET") return null;
    for (var i = 0; i < WATCHERS.length; i++) if (WATCHERS[i].match.test(url)) return WATCHERS[i];
    return null;
  };

  if (WATCHERS.length) {
    // XMLHttpRequest (axios in MIS, Task Mentor)
    var XHR = XMLHttpRequest.prototype;
    var open = XHR.open, setHeader = XHR.setRequestHeader, send = XHR.send;
    XHR.open = function (method, url) {
      this.__nga = { method: method, url: String(url), headers: {} };
      return open.apply(this, arguments);
    };
    XHR.setRequestHeader = function (k, v) {
      if (this.__nga) this.__nga.headers[k] = v;
      return setHeader.apply(this, arguments);
    };
    XHR.send = function () {
      var info = this.__nga;
      var w = info && watcherFor(info.method, info.url);
      if (w) {
        var xhr = this;
        w.request = { url: new URL(info.url, location.href).href, headers: info.headers };
        xhr.addEventListener("load", function () {
          if (xhr.status !== 200) return;
          try {
            var body = xhr.responseType === "json" ? xhr.response : JSON.parse(xhr.responseText);
            handle(w, body);
          } catch (e) { /* not JSON */ }
        });
      }
      return send.apply(this, arguments);
    };
    // fetch (Tendo)
    var origFetch = window.fetch;
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var method = (init && init.method) || (input && input.method) || "GET";
      var w = watcherFor(method, url);
      var p = origFetch.apply(this, arguments);
      if (w) {
        var headers = {};
        try { new Headers((init && init.headers) || (input && input.headers) || {}).forEach(function (v, k) { headers[k] = v; }); } catch (e) { /* ignore */ }
        w.request = { url: new URL(url, location.href).href, headers: headers };
        p.then(function (res) {
          if (res.status === 200) res.clone().json().then(function (j) { handle(w, j); }).catch(function () {});
        }).catch(function () {});
      }
      return p;
    };
    // Replay: the app stopped polling (hidden). Repeat its last request, same headers.
    setInterval(function () {
      WATCHERS.forEach(function (w) {
        if (!w.replayMs || !w.request || !document.hidden) return;
        if (w.lastAt && Date.now() - w.lastAt < w.replayMs) return;
        w.lastAt = Date.now();
        origFetch(w.request.url, { headers: w.request.headers, credentials: "include" })
          .then(function (res) { return res.status === 200 ? res.json() : null; })
          .then(function (j) { if (j) handle(w, j); })
          .catch(function () {});
      });
    }, 30 * 1000);
  }

  if (__NGA_PLATFORM__ === "macos") {
    window.print = function () {
      invoke("web_print").catch(function () {});
    };
  }

  // ── NGA MIS only: the /apps page's one-click "Update now" ───────────────
  // (updates.rs web_update_*: they refuse any other page; the update is NGA's
  // own signed package, and NGA restarts into it.)
  if (__NGA_APP__ === "mis") {
    try {
      Object.defineProperty(window, "ngaDesktop", {
        value: Object.freeze({
          version: __NGA_VERSION__,
          checkUpdate: function () { return invoke("web_update_check"); },
          installUpdate: function () { return invoke("web_update_install"); },
        }),
        configurable: false,
      });
    } catch (e) { /* already defined */ }

    // ── Who is signed in, for NGA Tools (tools/identity.rs) ──────────────
    // From MIS's own cached profile (UserContext "nga.user.offlineCache"):
    // id, user type, first name, date of birth. Never the token. Rust turns
    // the date into an age band and refuses this call from any other page.
    var lastIdentity = "";
    var reportIdentity = function () {
      try {
        var raw = localStorage.getItem("nga.user.offlineCache");
        if (!raw) return;
        var c = JSON.parse(raw) || {};
        var u = c.user || {};
        var p = c.profile || {};
        if (!u.user_id) return;
        var args = {
          userId: Number(u.user_id),
          userType: str(p.user_type),
          firstName: str(p.first_name),
          dateOfBirth: p.date_of_birth ? str(p.date_of_birth) : null,
        };
        var key = JSON.stringify(args);
        if (key === lastIdentity) return;
        lastIdentity = key;
        invoke("web_identity", args).catch(function () { lastIdentity = ""; });
      } catch (e) { /* no profile yet */ }
    };
    reportIdentity();
    setInterval(reportIdentity, 5000);
  }
})();
