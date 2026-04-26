import { useCallback } from "react";
import {
  getTopNavForRole,
  getTopNavSectionIdForState,
} from "../config/adminNavConfig.js";
import OnrodaMark from "./OnrodaMark";

const D = "divider";
const S = "subheading";

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
                : active === c.pageKey;
              return (
                <li key={c.label + (c.pageKey || "") + (c.companiesTab || "")} className="admin-topnav__sub-item">
                  <button
                    type="button"
                    className={
                      "admin-topnav__sublink" + (subActive ? " admin-topnav__sublink--active" : "")
                    }
                    onClick={() => {
                      if (isCompanies) {
                        pick("companies", { companiesTab: c.companiesTab || "all" });
                      } else {
                        pick(c.pageKey);
                      }
                    }}
                  >
                    {c.label}
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
                        return (
                          <li key={c.label + (c.companiesTab || c.pageKey)}>
                            <button
                              type="button"
                              className="admin-topnav__drawer-item"
                              onClick={() => {
                                if (isCompanies) {
                                  pick("companies", { companiesTab: c.companiesTab || "all" });
                                } else {
                                  pick(c.pageKey);
                                }
                              }}
                            >
                              {c.label}
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
