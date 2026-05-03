import { useEffect, useMemo, useState } from "react";
import {
  findNavGroupIdForPage,
  getAdminNavGroupsForRole,
} from "../config/adminNavConfig.js";
import OnrodaMark from "./OnrodaMark";
import NavGlyph from "./NavGlyph";

export default function Sidebar({ active, onChange, role = "admin", onCloseMobile }) {
  const groups = useMemo(() => getAdminNavGroupsForRole(role), [role]);

  const [openGroups, setOpenGroups] = useState(() => {
    const initial = new Set();
    const gid = findNavGroupIdForPage(active);
    if (gid) initial.add(gid);
    return initial;
  });

  useEffect(() => {
    const gid = findNavGroupIdForPage(active);
    if (!gid) return;
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.add(gid);
      return next;
    });
  }, [active]);

  function toggleGroup(id) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function pickPage(key) {
    onChange(key);
    onCloseMobile?.();
  }

  return (
    <aside className="admin-sidebar" aria-label="Plattform-Navigation">
      <div className="admin-sidebar__scroll">
        <div className="admin-sidebar__brand">
          <div className="admin-sidebar__brand-mark">
            <OnrodaMark className="admin-sidebar__mark-img" />
          </div>
          <div>
            <div className="admin-sidebar__logo-sub">Plattform-Konsole</div>
          </div>
        </div>

        <div className="admin-sidebar__section-title">Menü</div>

        <nav className="admin-sidebar__nav-tree" aria-label="Hauptnavigation">
          {groups.map((group) => {
            const open = openGroups.has(group.id);
            const groupActive = group.items.some((it) => it.pageKey === active);
            return (
              <div key={group.id} className="admin-sidebar__group">
                <button
                  type="button"
                  className={
                    "admin-sidebar__group-head" +
                    (open ? " admin-sidebar__group-head--open" : "") +
                    (groupActive ? " admin-sidebar__group-head--active" : "")
                  }
                  aria-expanded={open}
                  onClick={() => {
                    if (
                      group.id === "dashboard" &&
                      group.items.length === 1 &&
                      group.items[0].pageKey === "dashboard"
                    ) {
                      pickPage("dashboard");
                      return;
                    }
                    toggleGroup(group.id);
                  }}
                >
                  <span className="admin-sidebar__group-head-left">
                    <span className="admin-sidebar__icon admin-sidebar__icon--group" aria-hidden>
                      <NavGlyph name={group.icon} active={groupActive} />
                    </span>
                    <span className="admin-sidebar__group-label">{group.label}</span>
                  </span>
                  <span className="admin-sidebar__chevron" aria-hidden>
                    <NavGlyph name="chevron" active={false} />
                  </span>
                </button>
                {open ? (
                  <div className="admin-sidebar__sub">
                    {group.items.map((item) => {
                      const isActive = active === item.pageKey;
                      return (
                        <button
                          key={item.pageKey}
                          type="button"
                          onClick={() => pickPage(item.pageKey)}
                          className={
                            "admin-sidebar__sublink" +
                            (isActive ? " admin-sidebar__sublink--active" : "")
                          }
                        >
                          <span className="admin-sidebar__icon admin-sidebar__icon--sub" aria-hidden>
                            <NavGlyph name={item.icon} active={isActive} />
                          </span>
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
      </div>

      <div className="admin-sidebar__footer">
        <div className="admin-sidebar__footer-title">Hinweis</div>
        <div className="admin-sidebar__footer-text">
          Sichtbare Bereiche hängen von Ihrer Rolle ab. Mandanten arbeiten gesondert unter panel.onroda.de.
        </div>
      </div>
    </aside>
  );
}
