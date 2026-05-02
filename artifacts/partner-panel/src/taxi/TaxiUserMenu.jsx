import { useEffect, useRef, useState } from "react";

/** Rechts oben: Kurzprofil + sekundäre Bereiche + Abmelden. */
export default function TaxiUserMenu({ user, onLogout, links }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e) {
      const el = rootRef.current;
      if (!el || el.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const label =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    user?.username ||
    user?.email ||
    "Konto";

  return (
    <div className="partner-user-menu" ref={rootRef}>
      <button
        type="button"
        className="partner-user-menu__trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="partner-user-menu__name">{label}</span>
        <span className="partner-user-menu__chev" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="partner-user-menu__dropdown" role="menu">
          {links.map((l) => (
            <button
              key={l.key}
              type="button"
              role="menuitem"
              className="partner-user-menu__item"
              onClick={() => {
                setOpen(false);
                l.onSelect();
              }}
            >
              {l.label}
            </button>
          ))}
          <div className="partner-user-menu__sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="partner-user-menu__item partner-user-menu__item--danger"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            Abmelden
          </button>
        </div>
      ) : null}
    </div>
  );
}
