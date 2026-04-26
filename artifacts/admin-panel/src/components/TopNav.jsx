import { useCallback, useEffect, useRef, useState } from "react";
import {
  getTopNavForRole,
  getTopNavSectionIdForState,
} from "../config/adminNavConfig.js";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";
import OnrodaMark from "./OnrodaMark";

const D = "divider";
const S = "subheading";

const OPERATOR_SNAPSHOT_URL = `${API_BASE}/admin/dashboard/operator-snapshot`;
const ROLES_WITH_OPERATOR_SNAPSHOT = new Set(["admin", "service"]);

/**
 * Liefert u. a. `registration.pendingCount` und `support.*` (open/in_progress) — gleicher Endpunkt wie im Dashboard.
 */
function useAdminNavQueueBadges(role) {
  const [registrationPending, setRegistrationPending] = useState(0);
  const [supportOpen, setSupportOpen] = useState(0);
  const alive = useRef(true);
  const load = useCallback(() => {
    if (!ROLES_WITH_OPERATOR_SNAPSHOT.has(role)) {
      setRegistrationPending(0);
      setSupportOpen(0);
      return;
    }
    void (async () => {
      try {
        const res = await fetch(OPERATOR_SNAPSHOT_URL, { headers: adminApiHeaders() });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (!data?.ok || !data?.snapshot) return;
        const r = data.snapshot;
        const regN = Math.max(0, Math.floor(Number(r.registration?.pendingCount ?? 0) || 0));
        const openN = Math.max(0, Math.floor(Number(r.support?.openCount ?? 0) || 0));
        const progN = Math.max(0, Math.floor(Number(r.support?.inProgressCount ?? 0) || 0));
        if (alive.current) {
          setRegistrationPending(regN);
          setSupportOpen(openN + progN);
        }
      } catch {
        /* 503 / netz: Badges weglassen */
      }
    })();
  }, [role]);

  useEffect(() => {
    alive.current = true;
    load();
    const id = window.setInterval(load, 90_000);
    return () => {
      alive.current = false;
      window.clearInterval(id);
    };
  }, [load]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && ROLES_WITH_OPERATOR_SNAPSHOT.has(role)) {
        load();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load, role]);

  return { registrationPending, supportOpen };
}

function navBadgeForPageKey(pageKey, { registrationPending, supportOpen }) {
  if (pageKey === "company-registration-requests") return registrationPending;
  if (pageKey === "support-inbox") return supportOpen;
  return 0;
}

function NavCountBadge({ n }) {
  if (!n || n <= 0) return null;
  const t = n > 99 ? "99+" : String(n);
  return (
    <span className="admin-topnav__badge" aria-hidden="true">
      {t}
    </span>
  );
}

/**
 * @param {object} p
 * @param {string} p.active
 * @param {string} p.companiesListTab
 * @param {(key: string, o?: { companiesTab?: string }) => void} p.onPickPage
 * @param {string} p.role
 * @param {boolean} p.narrow
 * @param {boolean} p.mobileOpen
 * @param {() => void} p.onOpenMobile
 * @param {() => void} p.onCloseMobile
 */
export default function TopNav({
  active,
  companiesListTab,
  onPickPage,
  role = "admin",
  narrow = false,
  mobileOpen = false,
  onOpenMobile,
  onCloseMobile,
}) {
  const queueBadges = useAdminNavQueueBadges(role);
  const row1 = getTopNavForRole(role);
  const sectionId = getTopNavSectionIdForState(active, companiesListTab, role);

  const pick = useCallback(
    (pageKey, opt) => {
      onPickPage(pageKey, opt);
      onCloseMobile?.();
    },
    [onPickPage, onCloseMobile],
  );

  const subRow = row1.find((s) => s.id === sectionId);
  const showSub =
    subRow && subRow.kind === "section" && subRow.children && subRow.children.length > 0;

  return (
    <div className="admin-topnav" aria-label="Plattform-Navigation">
      <div className="admin-topnav__row1">
        {narrow ? (
          <button
            type="button"
            className="admin-topnav__hamburger"
            aria-label="Menü öffnen"
            aria-expanded={mobileOpen}
            onClick={() => onOpenMobile?.()}
          >
            <span className="admin-topnav__hamburger-bar" />
            <span className="admin-topnav__hamburger-bar" />
            <span className="admin-topnav__hamburger-bar" />
          </button>
        ) : null}
        <div className="admin-topnav__brand" aria-hidden>
          <div className="admin-topnav__mark">
            <OnrodaMark className="admin-topnav__mark-img" />
          </div>
          <div className="admin-topnav__brand-text">
            <div className="admin-topnav__logo">ONRODA</div>
            <div className="admin-topnav__logo-sub">Plattform-Konsole</div>
          </div>
        </div>
        {narrow && !mobileOpen ? null : (
          <nav className="admin-topnav__main" aria-label="Hauptmenü">
            <ul className="admin-topnav__list">
              {row1.map((sec) => {
                const isActive = sec.id === sectionId;
                if (sec.kind === "link") {
                  return (
                    <li key={sec.id} className="admin-topnav__item">
                      <button
                        type="button"
                        className={
                          "admin-topnav__link" + (isActive ? " admin-topnav__link--active" : "")
                        }
                        onClick={() => pick(sec.pageKey)}
                      >
                        {sec.label}
                      </button>
                    </li>
                  );
                }
                return (
                  <li key={sec.id} className="admin-topnav__item">
                    <button
                      type="button"
                      className={
                        "admin-topnav__link" + (isActive ? " admin-topnav__link--active" : "")
                      }
                      onClick={() => {
                        const t = sec.defaultTarget;
                        if (t?.pageKey === "companies" && t.companiesTab) {
                          pick("companies", { companiesTab: t.companiesTab });
                        } else if (t?.pageKey) {
                          pick(t.pageKey);
                        }
                      }}
                    >
                      {sec.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>

      {showSub && !narrow ? (
        <div className="admin-topnav__row2" role="navigation" aria-label="Untermenü">
          <ul className="admin-topnav__sublist">
            {subRow.children.map((c, i) => {
              if (c.type === D) {
                return (
                  <li key={`d-${i}`} className="admin-topnav__sub-sep" aria-hidden>
                    <span className="admin-topnav__sub-sep-line" />
                  </li>
                );
              }
              if (c.type === S) {
                return (
                  <li key={`h-${i}`} className="admin-topnav__subhead">
                    {c.labelText}
                  </li>
                );
              }
              const isCompanies = c.pageKey === "companies" && c.companiesTab;
              const tab = companiesListTab != null && companiesListTab !== "" ? companiesListTab : "all";
              const subActive = isCompanies
                ? active === "companies" && (c.companiesTab || "all") === tab
                : active === c.pageKey || (c.pageKey === "rides" && active === "ride-detail");
              const queueN = isCompanies ? 0 : navBadgeForPageKey(c.pageKey, queueBadges);
              const subA11y =
                queueN > 0 ? `${c.label}, ${queueN} offen` : c.label;
              return (
                <li key={c.label + (c.pageKey || "") + (c.companiesTab || "")} className="admin-topnav__sub-item">
                  <button
                    type="button"
                    className={
                      "admin-topnav__sublink" +
                      (subActive ? " admin-topnav__sublink--active" : "") +
                      (queueN > 0 ? " admin-topnav__sublink--has-badge" : "")
                    }
                    aria-label={subA11y}
                    onClick={() => {
                      if (isCompanies) {
                        pick("companies", { companiesTab: c.companiesTab || "all" });
                      } else {
                        pick(c.pageKey);
                      }
                    }}
                  >
                    <span className="admin-topnav__sublink-txt">{c.label}</span>
                    <NavCountBadge n={queueN} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {narrow && mobileOpen ? (
        <>
          <div
            className="admin-topnav__backdrop"
            role="presentation"
            onClick={() => onCloseMobile?.()}
          />
          <div className="admin-topnav__drawer" role="dialog" aria-label="Navigationsmenü">
            <div className="admin-topnav__drawer-header">
              <div className="admin-topnav__drawer-header-title">Navigation</div>
              <button
                type="button"
                className="admin-topnav__drawer-close"
                aria-label="Menü schließen"
                onClick={() => onCloseMobile?.()}
              >
                ×
              </button>
            </div>
            <div className="admin-topnav__drawer-panel">
            <nav className="admin-topnav__drawer-nav" aria-label="Hauptmenü mobil">
              {row1.map((sec) => {
                if (sec.kind === "link") {
                  return (
                    <div key={sec.id} className="admin-topnav__drawer-block">
                      <button
                        type="button"
                        className="admin-topnav__drawer-top"
                        onClick={() => pick(sec.pageKey)}
                      >
                        {sec.label}
                      </button>
                    </div>
                  );
                }
                return (
                  <div key={sec.id} className="admin-topnav__drawer-block">
                    <div className="admin-topnav__drawer-section-title">{sec.label}</div>
                    <ul className="admin-topnav__drawer-sub">
                      {sec.children.map((c, i) => {
                        if (c.type === D) {
                          return null;
                        }
                        if (c.type === S) {
                          return (
                            <li key={`sh-${i}`} className="admin-topnav__drawer-subhead">
                              {c.labelText}
                            </li>
                          );
                        }
                        const isCompanies = c.pageKey === "companies" && c.companiesTab;
                        const dQueueN = isCompanies ? 0 : navBadgeForPageKey(c.pageKey, queueBadges);
                        const dA11y = dQueueN > 0 ? `${c.label}, ${dQueueN} offen` : c.label;
                        return (
                          <li key={c.label + (c.companiesTab || c.pageKey)}>
                            <button
                              type="button"
                              className={
                                "admin-topnav__drawer-item" + (dQueueN > 0 ? " admin-topnav__drawer-item--has-badge" : "")
                              }
                              aria-label={dA11y}
                              onClick={() => {
                                if (isCompanies) {
                                  pick("companies", { companiesTab: c.companiesTab || "all" });
                                } else {
                                  pick(c.pageKey);
                                }
                              }}
                            >
                              <span className="admin-topnav__drawer-item-txt">{c.label}</span>
                              <NavCountBadge n={dQueueN} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </nav>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
