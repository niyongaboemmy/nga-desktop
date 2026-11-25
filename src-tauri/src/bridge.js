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
//               (report a switch made here; apply one made elsewhere);
//   school    - the school this computer is signed in to follows MIS's
//               `nga_school` cookie (TENANT_SWITCHING_PLAN.md A.1): watcher
//               state is kept per school and dropped when it changes.
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

  // ── The selected school: MIS's readable `nga_school=<tid>.<sid>` cookie ──
  // (TENANT_SWITCHING_PLAN.md A.1). Read only, never written; it carries no
  // credential. null when absent (MIS signed out, or an MIS without it).
  var SCHOOL_COOKIE = /^(\d{1,9})\.([A-Za-z0-9_-]{8,32})$/;
  var schoolCookie = function () {
    try {
      var m = /(?:^|;\s*)nga_school=([^;]*)/.exec(document.cookie || "");
      var p = m && SCHOOL_COOKIE.exec(decodeURIComponent(m[1]));
      var tid = p ? Number(p[1]) : 0;
      return tid > 0 ? { tid: tid, sid: p[2] } : null;
    } catch (e) { return null; }
  };
  var schoolTid = function () {
    var c = schoolCookie();
    return c ? c.tid : null;
  };
  try { Object.defineProperty(window, "__ngaSchoolCookie", { value: schoolCookie }); } catch (e) { /* defined */ }

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
    invoke("web_notify", { id: this._id, title: this.title, body: this.body, tag: this.tag, silent: this.silent, school: schoolTid() })
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
  // Tendo sends SQLite UTC times without a zone ("2026-10-07 09:30:00"): read them as UTC.
  var when = function (v) {
    var s = str(v);
    return Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s) ? s.replace(" ", "T") + "Z" : s);
  };
  // Each watcher has a contract test in its web app (desktopWatcherContract test):
  // if one fails there, change the watcher here in the same release.
  var WATCHERS = {
    mis: [{
      // GET /notifications?limit=20 (NotificationContext, every 45 s). Only the
      // top-level path: /calendar/notifications (settings) must not match.
      match: /^(?:https?:\/\/[^/]+)?\/notifications\/?(\?|$)/,
      pick: function (j) {
        return (j && j.data || []).map(function (x) {
          var n = x.notification || {};
          return { id: "n" + n.notification_id, title: str(n.title), body: str(n.body), link: n.link, unread: !n.read_at, at: when(n.created_at) };
        });
      },
    }],
    tendo: [{
      // GET /api/notifications (NotificationCenter, every 30 s)
      match: /\/api\/notifications\/?(\?|$)/,
      pick: function (j) {
        return (j && j.data || []).map(function (n) {
          return { id: "n" + n.id, title: str(n.title), body: str(n.message), link: n.link, unread: !n.read, at: when(n.created_at) };
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

  // Ids already raised, per school: notification ids repeat across schools
  // (each has its own database). Tenant 1 (and an unknown school) keeps the
  // key used before school switching.
  var SEEN_BASE = "nga.desktop.seen.v1";
  var seenKey = function () {
    var tid = schoolTid();
    return tid && tid !== 1 ? SEEN_BASE + ".t" + tid : SEEN_BASE;
  };
  var seen = null;
  var loadSeen = function () {
    var key = seenKey();
    if (seen && seen.key === key) return seen;
    try {
      var raw = localStorage.getItem(key);
      seen = raw ? { key: key, first: false, ids: JSON.parse(raw) } : { key: key, first: true, ids: [] };
    } catch (e) {
      seen = { key: key, first: true, ids: [] };
    }
    return seen;
  };
  var saveSeen = function () {
    try { localStorage.setItem(seen.key, JSON.stringify(seen.ids.slice(-400))); } catch (e) { /* full */ }
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
        w.request = { url: new URL(info.url, location.href).href, headers: info.headers, school: schoolTid() };
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
        w.request = { url: new URL(url, location.href).href, headers: headers, school: schoolTid() };
        p.then(function (res) {
          if (res.status === 200) res.clone().json().then(function (j) { handle(w, j); }).catch(function () {});
        }).catch(function () {});
      }
      return p;
    };
    // Replay: the app stopped polling (hidden). Repeat its last request, same headers.
    // Never across a school switch: the captured Authorization belongs to the
    // school it was captured in, so a changed `nga_school` (or a refusal) drops
    // it until the app polls again itself.
    setInterval(function () {
      WATCHERS.forEach(function (w) {
        if (!w.replayMs || !w.request || !document.hidden) return;
        if (w.request.school !== schoolTid()) { w.request = null; return; }
        if (w.lastAt && Date.now() - w.lastAt < w.replayMs) return;
        w.lastAt = Date.now();
        var req = w.request;
        origFetch(req.url, { headers: req.headers, credentials: "include" })
          .then(function (res) {
            if (res.status === 401 || res.status === 403 || res.status === 409) {
              if (w.request === req) w.request = null;
              return null;
            }
            return res.status === 200 ? res.json() : null;
          })
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
    // From MIS's own cached profile: id, user type, first name, date of birth
    // and e-mail. Never the token. Rust turns the date into an age band and
    // refuses this call from any other page (and while MIS is signed out).
    //
    // Only while MIS holds a session token that is still valid by its own
    // `exp` and names the same person (DK-ISO-1): a signed-out page (token
    // gone, or expired) reports nobody, even if a profile copy is left behind. The e-mail links one person's
    // accounts across schools: a new school with the same e-mail is a school
    // switch (nothing is wiped), not another person.
    //
    // The school (tenant id) is reported only once every signal agrees: the
    // `nga_school` cookie (fast), MIS's `nga.identity`, the cached profile's
    // tenant and the session token's `tid` claim (read, not trusted: MIS checks
    // it). In the middle of a sign-in or a school switch they disagree for a
    // moment, and nothing is reported until they settle. Without any (an older
    // MIS): tenant 1, as Rust assumes.
    var positiveInt = function (v) {
      var n = Number(v);
      return Number.isInteger(n) && n > 0 ? n : null;
    };
    var readToken = function () {
      try { return localStorage.getItem("token") || ""; } catch (e) { return ""; }
    };
    var tokenClaims = function () {
      try {
        var part = readToken().split(".")[1];
        if (!part) return null;
        var b = part.replace(/-/g, "+").replace(/_/g, "/");
        while (b.length % 4) b += "=";
        var c = JSON.parse(atob(b));
        return c && typeof c === "object" ? c : null;
      } catch (e) { return null; }
    };
    var tokenTid = function () {
      var c = tokenClaims();
      return c ? positiveInt(c.tid) : null;
    };
    // The session token's claims while it is still valid by its own clock and
    // names a person; else null (no token, expired, malformed). Read, not
    // trusted: MIS checks the token; this only stops a signed-out page from
    // reporting whoever used it last.
    var liveToken = function () {
      var c = tokenClaims();
      if (!c) return null;
      var exp = Number(c.exp);
      if (!isFinite(exp) || exp * 1000 <= Date.now()) return null;
      return positiveInt(c.userId) ? c : null;
    };
    // MIS's record of who is signed in here: "<tid>:<userId>" (frontend lib/tenant.ts).
    var misIdentity = function () {
      try {
        var m = /^(\d+):(\d+)$/.exec(localStorage.getItem("nga.identity") || "");
        return m && positiveInt(m[1]) && positiveInt(m[2]) ? { tid: Number(m[1]), userId: Number(m[2]) } : null;
      } catch (e) { return null; }
    };
    // The offline copy of the profile: per school + person since MIS
    // multi-tenancy (`nga.user.offlineCache.t<tid>.u<userId>`), one key before.
    // The old single key is read only by an older MIS (no `nga.identity`), and
    // only when it is the token's own person: it is not scoped to anyone.
    var cachedProfile = function (id, tokenUser) {
      try {
        if (id) {
          var scoped = localStorage.getItem("nga.user.offlineCache.t" + id.tid + ".u" + id.userId);
          return scoped ? JSON.parse(scoped) || null : null;
        }
        var raw = localStorage.getItem("nga.user.offlineCache");
        var c = raw ? JSON.parse(raw) || null : null;
        return c && c.user && positiveInt(c.user.user_id) === tokenUser ? c : null;
      } catch (e) { return null; }
    };
    var validEmail = function (v) {
      var e = str(v).trim();
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : "";
    };
    var settledIdentity = function () {
      var claims = liveToken();
      if (!claims) return null;
      var tokenUser = positiveInt(claims.userId);
      var id = misIdentity();
      if (id && id.userId !== tokenUser) return null;
      var c = cachedProfile(id, tokenUser);
      if (!c) return null;
      var u = c.user || {};
      var p = c.profile || {};
      var userId = positiveInt(u.user_id);
      if (!userId || userId !== tokenUser) return null;
      var cookie = schoolCookie();
      var known = [
        cookie && cookie.tid,
        positiveInt(c.tenant && c.tenant.tid) || positiveInt(u.tenant && u.tenant.tid),
        id && id.tid,
        tokenTid(),
      ].filter(Boolean);
      for (var i = 1; i < known.length; i++) if (known[i] !== known[0]) return null;
      // The e-mail: the token's own claim when MIS puts one there (DK-ISO-6),
      // else the cached profile's.
      var email = validEmail(claims.email) || str(u.email || p.email).trim();
      return {
        userId: userId,
        tid: known.length ? known[0] : null,
        userType: str(p.user_type),
        firstName: str(p.first_name),
        dateOfBirth: p.date_of_birth ? str(p.date_of_birth) : null,
        email: email || null,
      };
    };
    var lastIdentity = "";
    // The school Rust has accepted for this page's identity (null until then,
    // and again while a new one is on its way).
    var settledTid = null;
    // A school switch signal for Rust (DK-ISO-2): the `nga_school` cookie went
    // from one school to another while this page stayed signed in.
    var cookieSchool = null;
    var cookieSwitched = false;
    var watchSchoolCookie = function () {
      var tid = schoolTid();
      if (!liveToken()) { cookieSchool = null; cookieSwitched = false; return; }
      if (tid && cookieSchool && tid !== cookieSchool) cookieSwitched = true;
      if (tid) cookieSchool = tid;
    };
    var reportIdentity = function () {
      watchSchoolCookie();
      var args = settledIdentity();
      if (!args) { lastIdentity = ""; return; }
      var key = JSON.stringify(args);
      if (key === lastIdentity) return;
      var prev = lastIdentity ? JSON.parse(lastIdentity) : null;
      lastIdentity = key;
      if (!prev || prev.tid !== args.tid || prev.userId !== args.userId) settledTid = null;
      var switched = cookieSwitched;
      invoke("web_identity", Object.assign({}, args, { switched: switched }))
        .then(function () {
          if (switched) cookieSwitched = false;
          settledTid = args.tid || 1;
          reportSchool(true);
        })
        .catch(function () { lastIdentity = ""; });
    };
    // The tenant a tools call may name: the settled one, only while every
    // signal still agrees with it (never a header that disagrees with the token).
    var toolsTid = function () {
      var s = settledIdentity();
      return s && settledTid !== null && (s.tid || 1) === settledTid ? settledTid : null;
    };

    // ── The school chip in the title bar (school.rs) ──────────────────────
    // Name + logo of the signed-in school, and how many schools the person
    // has (MIS GET /auth/my-schools, TENANT_SWITCHING_PLAN.md A.4). An MIS
    // without it: the public GET /tenant/branding, one school (no switching).
    // The logo is fetched here (MIS's origin) and handed over as a data URL.
    var getJson = function (url, headers) {
      return fetch(url, { headers: headers, credentials: "include" }).then(function (r) {
        return r.ok ? r.json() : Promise.reject(r.status);
      });
    };
    var logoData = function (url) {
      if (!url || !/^https?:\/\//.test(String(url))) return Promise.resolve(null);
      return fetch(String(url), { credentials: "omit" })
        .then(function (r) { return r.ok ? r.blob() : null; })
        .then(function (b) {
          if (!b || b.size > 200000 || !/^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(b.type)) return null;
          return new Promise(function (resolve) {
            var fr = new FileReader();
            fr.onload = function () { resolve(typeof fr.result === "string" ? fr.result : null); };
            fr.onerror = function () { resolve(null); };
            fr.readAsDataURL(b);
          });
        })
        .catch(function () { return null; });
    };
    var school = { key: "", at: 0 };
    var SCHOOL_EVERY = 10 * 60 * 1000;
    var reportSchool = function (force) {
      var tid = toolsTid();
      var s = tid && settledIdentity();
      if (!s) return;
      var key = tid + ":" + s.userId;
      if (!force && school.key === key && Date.now() - school.at < SCHOOL_EVERY) return;
      school.key = key;
      school.at = Date.now();
      var token = readToken();
      var headers = { Accept: "application/json" };
      if (token) headers.Authorization = "Bearer " + token;
      getJson(__NGA_API__ + "/auth/my-schools", headers)
        .then(function (j) {
          var list = j && j.data && j.data.schools;
          if (!Array.isArray(list)) throw new Error("no list");
          var cur = list.filter(function (x) { return x && positiveInt(x.tid) === tid; })[0];
          if (!cur) throw new Error("not listed");
          return { name: str(cur.name), logoUrl: cur.logoUrl, count: list.length };
        })
        .catch(function () {
          // Any refusal (401: the token is no longer valid; 404: an older MIS)
          // only hides the switcher: never a sign-out from here (auth.rs
          // follows MIS's own pages for that).
          return getJson(__NGA_API__ + "/tenant/branding?tid=" + tid, { Accept: "application/json" }).then(function (j) {
            var d = (j && j.data) || {};
            if (positiveInt(d.tid) && positiveInt(d.tid) !== tid) throw new Error("other school");
            return { name: str(d.school_name || d.name), logoUrl: d.logoUrl || d.logo_url, count: 1 };
          });
        })
        .then(function (info) {
          if (!info.name) throw new Error("no name");
          return logoData(info.logoUrl).then(function (logo) {
            if (toolsTid() !== tid) return null; // switched meanwhile: the next round reports
            return invoke("web_school", { tid: tid, name: info.name, logo: logo, schools: info.count });
          });
        })
        .catch(function () { school.at = Date.now() - SCHOOL_EVERY + 60 * 1000; /* again in a minute */ });
    };

    reportIdentity();
    setInterval(function () {
      reportIdentity();
      reportSchool(false);
    }, 5000);

    // ── NGA Tools → MIS API, with this page's own session (tools/api.rs) ──
    // Only /desktop/tools/… paths. Streams NDJSON answers back line by line
    // (batched), so Ask AI shows its answer as it is written.
    var toolCalls = {};
    var TOOL_PATH = /^\/desktop\/tools\/[a-z0-9\/_-]+$/;
    Object.defineProperty(window, "__ngaToolsApiCancel", {
      value: function (id) { if (toolCalls[id]) toolCalls[id].abort(); },
    });
    Object.defineProperty(window, "__ngaToolsApi", {
      value: function (id, method, path, body, query) {
        var send = function (kind, data) {
          return invoke("web_tools_api_event", { id: id, kind: kind, data: data == null ? null : String(data) }).catch(function () {});
        };
        if (!TOOL_PATH.test(path) || (method !== "GET" && method !== "POST") || (query != null && !/^[A-Za-z0-9=&_-]{0,100}$/.test(query))) { send("error", "refused"); return; }
        var ctrl = new AbortController();
        toolCalls[id] = ctrl;
        // In the middle of a school switch, wait (up to 8 s) for the new
        // identity to settle, so the tenant header and the token never disagree.
        var settled = new Promise(function (resolve) {
          var t0 = Date.now();
          (function poll() {
            if (settledTid === null || toolsTid() !== null || Date.now() - t0 > 8000 || ctrl.signal.aborted) return resolve();
            setTimeout(poll, 250);
          })();
        });
        settled
          .then(function () {
            var token = readToken();
            var headers = { Accept: "application/json, application/x-ndjson" };
            if (token) headers.Authorization = "Bearer " + token;
            // The school: the settled identity's, else the token's own claim
            // (MIS refuses a header that disagrees with the token).
            var tid = toolsTid() || (settledTid === null ? tokenTid() : null);
            if (tid) headers["X-NGA-Tenant"] = String(tid);
            if (body != null) headers["Content-Type"] = "application/json";
            return fetch(__NGA_API__ + path + (query ? "?" + query : ""), { method: method, headers: headers, body: body == null ? undefined : body, credentials: "include", signal: ctrl.signal });
          })
          .then(function (res) {
            var type = res.headers.get("content-type") || "";
            if (res.ok && type.indexOf("ndjson") >= 0 && res.body && res.body.getReader) {
              var reader = res.body.getReader();
              var decoder = new TextDecoder();
              var buffered = "";
              var pump = function () {
                return reader.read().then(function (r) {
                  if (r.done) {
                    if (buffered.trim()) return send("lines", buffered).then(function () { return send("end", null); });
                    return send("end", null);
                  }
                  buffered += decoder.decode(r.value, { stream: true });
                  var cut = buffered.lastIndexOf("\n");
                  if (cut >= 0) {
                    var ready = buffered.slice(0, cut);
                    buffered = buffered.slice(cut + 1);
                    if (ready.trim()) send("lines", ready);
                  }
                  return pump();
                });
              };
              return pump();
            }
            return res.text().then(function (t) { return send("response", JSON.stringify({ status: res.status, body: t })); });
          })
          .catch(function (e) { send("error", e && e.name === "AbortError" ? "aborted" : "network"); })
          .then(function () { delete toolCalls[id]; });
      },
    });
  }
})();
