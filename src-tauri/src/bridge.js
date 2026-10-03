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
//   theme     - report NGA MIS's light/dark theme so the shell can match it.
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

  // ── Theme (only NGA MIS's report is used; MIS sets html.dark / html.light) ──
  var lastTheme = "";
  var reportTheme = function () {
    var cl = document.documentElement.classList;
    var theme = cl.contains("dark") ? "dark" : cl.contains("light") ? "light" : "";
    if (theme && theme !== lastTheme) {
      lastTheme = theme;
      invoke("web_theme", { theme: theme }).catch(function () {});
    }
  };
  if (__NGA_APP__ === "mis") {
    var startTheme = function () {
      reportTheme();
      new MutationObserver(reportTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    };
    if (document.documentElement) startTheme();
    else document.addEventListener("DOMContentLoaded", startTheme);
  }

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
})();
