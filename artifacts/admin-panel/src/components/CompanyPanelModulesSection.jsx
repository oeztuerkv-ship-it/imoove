import { useCallback, useEffect, useMemo, useState } from "react";

import AdminOnboardingBlockFooter from "./AdminOnboardingBlockFooter";
import { PanelModuleIcon } from "./PanelModuleIcons.jsx";
import {
  defaultPanelModuleIdsForCompanyKind,
  filterModuleCatalogForCompanyKind,
} from "../lib/panelModulesByCompanyKind.js";

const BOOKING_ESSENTIAL = ["overview", "rides_list", "rides_create", "access_codes"];

export default function CompanyPanelModulesSection({
  companyKind,
  storedModules,
  moduleCatalog,
  busy,
  fieldError,
  onSave,
}) {
  const kind = String(companyKind || "general").trim();
  const catalog = useMemo(
    () => filterModuleCatalogForCompanyKind(kind, moduleCatalog ?? []),
    [kind, moduleCatalog],
  );
  const defaults = useMemo(() => defaultPanelModuleIdsForCompanyKind(kind), [kind]);

  const [useAllDefaults, setUseAllDefaults] = useState(true);
  const [selected, setSelected] = useState(() => new Set(defaults));

  useEffect(() => {
    if (storedModules == null) {
      setUseAllDefaults(true);
      setSelected(new Set(defaults));
      return;
    }
    const list = Array.isArray(storedModules) ? storedModules.filter(Boolean) : [];
    setUseAllDefaults(false);
    setSelected(new Set(list.length > 0 ? list : defaults));
  }, [storedModules, defaults]);

  const toggleModule = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setUseAllDefaults(false);
  }, []);

  const applyPreset = useCallback(
    (ids) => {
      const allowed = new Set(defaults);
      setUseAllDefaults(false);
      setSelected(new Set(ids.filter((id) => allowed.has(id))));
    },
    [defaults],
  );

  const handleSave = () => {
    if (useAllDefaults) {
      onSave(null);
      return;
    }
    const ordered = defaults.filter((id) => selected.has(id));
    if (ordered.length === 0) {
      onSave(null);
      return;
    }
    onSave(ordered);
  };

  const effectivePreview = useAllDefaults ? defaults : defaults.filter((id) => selected.has(id));
  const ridesCreateOn = effectivePreview.includes("rides_create");

  return (
    <section className="admin-section-block admin-onb-block">
      <div className="admin-m-card__h">
        <span className="admin-panel-card__title" style={{ margin: 0 }}>
          Partner-Portal: Module &amp; Rechte
        </span>
      </div>
      <p className="admin-table-sub" style={{ marginTop: 0, marginBottom: 12, lineHeight: 1.55 }}>
        Steuert, was im Partner-Panel und in der Partner-App sichtbar ist (z.&nbsp;B.{" "}
        <strong>Taxi buchen</strong>, Gutscheine, Abrechnung). Standard = alle Module für den Mandantentyp.
        Ohne <strong>Neue Fahrt</strong> (<code>rides_create</code>) kommt „Keine Berechtigung für diese Aktion“.
      </p>

      <label className="admin-m-field" style={{ marginBottom: 12 }}>
        <span className="admin-m-field__label">Freigabe-Modus</span>
        <select
          className="admin-m-inp"
          value={useAllDefaults ? "all" : "custom"}
          onChange={(e) => {
            const all = e.target.value === "all";
            setUseAllDefaults(all);
            if (all) setSelected(new Set(defaults));
          }}
        >
          <option value="all">Alle Standard-Module für diesen Mandantentyp</option>
          <option value="custom">Individuelle Auswahl</option>
        </select>
      </label>

      {!useAllDefaults ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            className="admin-btn-secondary admin-btn-primary--sm"
            onClick={() => applyPreset(BOOKING_ESSENTIAL)}
          >
            Taxi buchen (Minimum)
          </button>
          <button
            type="button"
            className="admin-btn-secondary admin-btn-primary--sm"
            onClick={() => setSelected(new Set(defaults))}
          >
            Alle für Typ
          </button>
        </div>
      ) : null}

      <div
        className={`admin-module-grid admin-module-grid--dense${useAllDefaults ? " admin-module-grid--readonly" : ""}`}
      >
        {catalog.map((mod) => {
          const on = useAllDefaults || selected.has(mod.id);
          const essential = mod.id === "rides_create";
          return (
            <button
              key={mod.id}
              type="button"
              className={`admin-module-tile${on ? " admin-module-tile--on" : ""}${useAllDefaults ? " admin-module-tile--static" : ""}`}
              disabled={useAllDefaults}
              onClick={() => toggleModule(mod.id)}
              title={mod.description || mod.label}
            >
              <span className="admin-module-tile__icon">
                <PanelModuleIcon moduleId={mod.id} />
              </span>
              <span className="admin-module-tile__text">
                <span className="admin-module-tile__label">
                  {mod.label}
                  {essential ? " *" : ""}
                </span>
                <span className="admin-module-tile__desc">{mod.id}</span>
              </span>
            </button>
          );
        })}
      </div>

      {!ridesCreateOn ? (
        <p className="admin-m-field__err" style={{ marginTop: 10 }}>
          Hinweis: Ohne Modul „Neue Fahrt“ können Partner keine Fahrten anlegen (Mobile + Panel).
        </p>
      ) : null}
      {fieldError ? (
        <p className="admin-m-field__err" style={{ marginTop: 8 }}>
          {fieldError}
        </p>
      ) : null}

      <AdminOnboardingBlockFooter
        type="button"
        label="Partner-Module speichern"
        busy={busy}
        onClick={handleSave}
      />
    </section>
  );
}
