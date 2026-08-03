import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const URL = `${API_BASE}/admin/app-operational`;

function platformFields(s, plat) {
  const mobile = s.mobileApp && typeof s.mobileApp === "object" ? s.mobileApp : {};
  const row = mobile[plat] && typeof mobile[plat] === "object" ? mobile[plat] : {};
  return row;
}

function setPlatformField(setS, plat, key, value) {
  setS((p) => {
    const mobile = p.mobileApp && typeof p.mobileApp === "object" ? { ...p.mobileApp } : {};
    const row = mobile[plat] && typeof mobile[plat] === "object" ? { ...mobile[plat] } : {};
    row[key] = value;
    mobile[plat] = row;
    return { ...p, mobileApp: mobile };
  });
}

export default function AppOperationalSystemPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [s, setS] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(URL, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Laden fehlgeschlagen");
      if (data.config?.system && typeof data.config.system === "object") {
        setS({ ...data.config.system });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setError("");
    setOk("");
    const system = { ...s };
    try {
      const res = await fetch(URL, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ system }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || "Speichern fehlgeschlagen");
      setOk("System-Flags gespeichert. Mobile liest GET /app/config → system (inkl. mobileApp).");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    }
  };

  if (loading) return <div className="admin-page"><p className="admin-table-sub">Laden …</p></div>;

  const ios = platformFields(s, "ios");
  const android = platformFields(s, "android");

  return (
    <div className="admin-page">
      {error ? <div className="admin-info-banner admin-info-banner--error">{error}</div> : null}
      {ok ? <div className="admin-info-banner admin-info-banner--ok">{ok}</div> : null}
      <div className="admin-panel-card">
        <div className="admin-panel-card__title">System / Wartung</div>
        <p className="admin-table-sub" style={{ lineHeight: 1.5 }}>
          <code>emergencyShutdown</code> = harte Sperrung.{" "}
          <code>system.mobileApp</code> = Store-Versions-Hinweise (empfohlen / Pflicht) für iOS & Android — getrennt von OTA.
        </p>
        <div className="admin-form-vertical" style={{ maxWidth: 520, marginTop: 12 }}>
          {[
            ["maintenanceMode", "Wartungsmodus (Hinweis, kombiniere mit Kunden-App-Flag unten)"],
            ["blockNewBookings", "Neue Buchungen sperren (Kunden) — 400 mit bookingRules-Meldung"],
            ["allowCustomerApp", "Kunden-App erlaubt (false + Wartung = Sperrung) — siehe Rides-Route"],
            ["allowDriverApp", "Fahrer-App erlaubt (Hinweis, Mobile)"],
            ["emergencyShutdown", "Notfall-Abschaltung (höchste Priorität, harte 503) — vorsichtig!"],
          ].map(([k, label]) => {
            const negDefault = k === "allowCustomerApp" || k === "allowDriverApp";
            const checked = negDefault ? s[k] !== false : s[k] === true;
            return (
            <label key={k} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setS((p) => ({ ...p, [k]: e.target.checked }))}
              />
              <span style={{ lineHeight: 1.4 }}>{label}</span>
            </label>
            );
          })}
          <label className="admin-form-label" style={{ display: "block", marginTop: 12 }}>
            Globaler Hinweis (Kunden, Deutsch)
            <textarea
              className="admin-textarea"
              rows={3}
              value={String(s.globalNoticeDe ?? "")}
              onChange={(e) => setS((p) => ({ ...p, globalNoticeDe: e.target.value }))}
            />
          </label>
          <label className="admin-form-label" style={{ display: "block", marginTop: 8 }}>
            Legacy: Mindest-App-Version (Hinweis, Fallback wenn mobileApp leer)
            <input
              className="admin-input"
              style={{ maxWidth: 200, marginTop: 4, display: "block" }}
              value={s.minAppVersionHint == null ? "" : String(s.minAppVersionHint)}
              onChange={(e) => {
                const v = e.target.value.trim();
                setS((p) => ({ ...p, minAppVersionHint: v === "" ? null : v }));
              }}
            />
          </label>
        </div>

        <div className="admin-panel-card__title" style={{ marginTop: 28 }}>Mobile Store-Versionen</div>
        <p className="admin-table-sub" style={{ lineHeight: 1.5 }}>
          Empfohlen = Soft-Dialog (Später / Aktualisieren). Pflicht (<code>minVersion</code>) = blockierend.
          Nach Store-Release hier die neue Versionsnummer setzen (z. B. 1.0.3).
        </p>
        {[
          ["ios", "iOS", ios],
          ["android", "Android", android],
        ].map(([plat, label, row]) => (
          <div key={plat} className="admin-form-vertical" style={{ maxWidth: 560, marginTop: 16 }}>
            <strong>{label}</strong>
            <label className="admin-form-label" style={{ display: "block", marginTop: 8 }}>
              Empfohlene Version
              <input
                className="admin-input"
                style={{ maxWidth: 160, marginTop: 4, display: "block" }}
                value={row.recommendedVersion == null ? "" : String(row.recommendedVersion)}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setPlatformField(setS, plat, "recommendedVersion", v === "" ? null : v);
                }}
                placeholder="1.0.3"
              />
            </label>
            <label className="admin-form-label" style={{ display: "block", marginTop: 8 }}>
              Pflicht-Mindestversion (leer = keine Pflicht)
              <input
                className="admin-input"
                style={{ maxWidth: 160, marginTop: 4, display: "block" }}
                value={row.minVersion == null ? "" : String(row.minVersion)}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setPlatformField(setS, plat, "minVersion", v === "" ? null : v);
                }}
                placeholder="leer"
              />
            </label>
            <label className="admin-form-label" style={{ display: "block", marginTop: 8 }}>
              Store-URL
              <input
                className="admin-input"
                style={{ marginTop: 4, display: "block", width: "100%" }}
                value={row.storeUrl == null ? "" : String(row.storeUrl)}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setPlatformField(setS, plat, "storeUrl", v === "" ? null : v);
                }}
              />
            </label>
          </div>
        ))}

        <button type="button" className="admin-btn admin-btn--primary" style={{ marginTop: 20 }} onClick={save}>
          Speichern
        </button>
        <p className="admin-table-sub" style={{ marginTop: 8 }}>
          <code>GET {API_BASE}/app/config</code> → <code>system.mobileApp</code>
        </p>
      </div>
    </div>
  );
}
