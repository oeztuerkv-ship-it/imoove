import { useEffect, useMemo, useRef, useState } from "react";
import { getGlobalCreateMenuItems } from "./globalCreateActions.js";

/**
 * Zentrale Schnellaktionen (Bolt-Fleet-Philosophie): nur Einträge anzeigen, die Mandant + Rechte erlauben.
 */
export default function GlobalCreateMenu({ user, onSelectAction }) {
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

  const items = useMemo(() => getGlobalCreateMenuItems(user), [user]);

  if (items.length === 0) return null;

  return (
    <div className="partner-global-create" ref={rootRef}>
      <button
        type="button"
        className="partner-global-create__trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        title="Neu anlegen"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden className="partner-global-create__plus">
          +
        </span>
      </button>
      {open ? (
        <div className="partner-global-create__menu" role="menu" aria-label="Neu anlegen">
          {items.map((row) => (
            <button
              key={row.id}
              type="button"
              role="menuitem"
              className="partner-global-create__item"
              onClick={() => {
                setOpen(false);
                onSelectAction(row.id);
              }}
            >
              {row.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
