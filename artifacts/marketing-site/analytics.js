/**
 * ONRODA Marketing-Homepage — anonyme Besucherstatistik (DSGVO-freundlich).
 * Keine Cookies von Drittanbietern; nur technische Visitor-ID in localStorage.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "onroda_hp_vid";
  var DNT =
    navigator.doNotTrack === "1" ||
    window.doNotTrack === "1" ||
    navigator.msDoNotTrack === "1";

  if (DNT) return;

  function publicApiBase() {
    var m = document.querySelector('meta[name="onroda-public-api-base"]');
    if (m && m.getAttribute("content")) {
      return String(m.getAttribute("content")).replace(/\/$/, "");
    }
    var h = window.location.hostname;
    if (h === "localhost" || h === "127.0.0.1") {
      return "http://" + h + ":3000/api";
    }
    return "https://api.onroda.de/api";
  }

  function randomVisitorId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    var s = "";
    for (var i = 0; i < 32; i++) {
      s += Math.floor(Math.random() * 16).toString(16);
    }
    return s;
  }

  function visitorId() {
    try {
      var existing = localStorage.getItem(STORAGE_KEY);
      if (existing && /^[a-f0-9-]{8,64}$/i.test(existing)) return existing;
      var id = randomVisitorId();
      localStorage.setItem(STORAGE_KEY, id);
      return id;
    } catch (_e) {
      return randomVisitorId();
    }
  }

  function sanitizeReferrer() {
    var ref = document.referrer || "";
    if (!ref) return null;
    try {
      var u = new URL(ref);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      return u.origin + u.pathname;
    } catch (_e2) {
      return null;
    }
  }

  function pagePath(extra) {
    var p = window.location.pathname || "/";
    if (extra) p += extra;
    if (p.length > 512) p = p.slice(0, 512);
    return p;
  }

  function sendEvent(eventType, pathExtra) {
    var payload = {
      eventType: eventType,
      pagePath: pagePath(pathExtra),
      referrer: sanitizeReferrer(),
      anonymousVisitorId: visitorId(),
    };
    var url = publicApiBase() + "/public/analytics/event";
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
        if (navigator.sendBeacon(url, blob)) return;
      }
    } catch (_e3) {}
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
      credentials: "omit",
    }).catch(function () {});
  }

  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  onReady(function () {
    sendEvent("page_view");

    document.addEventListener(
      "click",
      function (e) {
        var el = e.target;
        while (el && el !== document.body) {
          if (el.getAttribute && el.getAttribute("data-onroda-event")) {
            var t = el.getAttribute("data-onroda-event");
            if (t) sendEvent(t, el.id ? "#" + el.id : "");
            return;
          }
          if (el.matches && el.matches("a[href^='mailto:'], a[href^='tel:']")) {
            sendEvent("contact_click", el.id ? "#" + el.id : "");
            return;
          }
          if (el.matches && el.matches(".hp-store-badge, .hp-store-badge--apple, .hp-store-badge--google")) {
            sendEvent("app_download_click", el.id ? "#" + el.id : "");
            return;
          }
          if (el.matches && el.matches("a.hp-btn-primary, a.hp-btn-ghost, button.hp-btn-primary, button.hp-btn-ghost")) {
            var href = el.getAttribute("href") || "";
            if (href.indexOf("#partner") >= 0 || (el.closest && el.closest("#partner"))) {
              sendEvent("partner_interest_click", el.id ? "#" + el.id : "");
              return;
            }
            sendEvent("cta_click", el.id ? "#" + el.id : "");
            return;
          }
          if (el.id === "partner-form-submit" || (el.closest && el.closest("#partner-form"))) {
            if (el.type === "submit" || el.id === "partner-form-submit") {
              sendEvent("partner_interest_click", "#partner-form");
            }
            return;
          }
          el = el.parentElement;
        }
      },
      true,
    );
  });
})();
