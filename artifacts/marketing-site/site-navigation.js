/* Shared presentation-only menu. No requests, storage, booking or account changes. */
(function () {
  "use strict";
  var toggle = document.getElementById("site-nav-toggle");
  var nav = document.getElementById("site-primary-nav");
  var header = document.getElementById("site-header");
  var inner = header && header.querySelector(".hp-header-inner");
  if (!toggle || !nav || !inner) return;
  function setOpen(open) {
    inner.classList.toggle("hp-nav-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }
  toggle.addEventListener("click", function () {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });
  nav.addEventListener("click", function (event) {
    if (event.target && event.target.closest && event.target.closest("a[href]")) setOpen(false);
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      toggle.focus();
    }
  });
  document.addEventListener("click", function (event) {
    if (!header.contains(event.target)) setOpen(false);
  });
  window.addEventListener("hashchange", function () { setOpen(false); });
  window.matchMedia("(min-width: 1051px)").addEventListener("change", function () { setOpen(false); });
})();
