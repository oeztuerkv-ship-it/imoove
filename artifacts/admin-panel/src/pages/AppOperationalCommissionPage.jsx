import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const URL = `${API_BASE}/admin/app-operational`;

const KINDS = [
  { key: "standard", label: "Normale Fahrt" },
  { key: "medical", label: "Krankenfahrt" },
  { key: "voucher", label: "Gutschein" },
  { key: "company", label: "Firmen- / Hotelkontext" },
];

export default function AppOperationalCommissionPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [defaultRatePercent, setDefaultRatePercent] = useState("7");
  const [active, setActive] = useState(true);
  const [minProv, setMinProv] = useState("");
  const [saving, setSaving] = useState(false);
  const [serviceRegions, setServiceRegions] = useState([]);
  const [byRegion, setByRegion] = useState({});
  const [byCompanyJson, setByCompanyJson] = useState("{}");
  const [rideKindState, setRideKindState] = useState({
    standard: { ratePercent: "7", active: true },
    medical: { ratePercent: "7", active: true },
    voucher: { ratePercent: "7", active: true },
    company: { ratePercent: "7", active: true },
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(URL, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Laden fehlgeschlagen");
      setServiceRegions(Array.isArray(data.serviceRegions) ? data.serviceRegions : []);
      const c = data.config?.commission;
      if (c && typeof c === "object") {
        const dr = c.defaultRate;
        setDefaultRatePercent(
          typeof dr === "number" && Number.isFinite(dr) ? String(Math.round(dr * 1000) / 10) : "7",
        );
        setActive(c.active !== false);
        const m = c.minProvisionEur;
        setMinProv(m == null || m === "" ? "" : String(m));
        setByRegion(typeof c.byServiceRegion === "object" && c.byServiceRegion ? c.byServiceRegion : {});
        setByCompanyJson(JSON.stringify(c.byCompany && typeof c.byCompany === "object" ? c.byCompany : {}, null, 2));
        const rkr = c.rideKindRates && typeof c.rideKindRates === "object" ? c.rideKindRates : {};
        setRideKindState((prev) => {
          const next = { ...prev };
          for (const { key } of KINDS) {
            const row = rkr[key];
            if (row && typeof row === "object") {
              const r = row.rate;
              next[key] = {
                ratePercent:
                  typeof r === "number" && Number.isFinite(r) ? String(Math.round(r * 1000) / 10) : next[key].ratePercent,
                active: row.active !== false,
              };
            }
          }
          return next;
        });
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
    setSaving(true);
    setError("");
    setOkMsg("");
    const n = Number(String(defaultRatePercent).replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setError("Bitte eine gültige Prozentzahl 0–100 (Standard).");
      setSaving(false);
      return;
    }
    let byCompany = {};
    try {
      byCompany = JSON.parse(byCompanyJson || "{}");
      if (typeof byCompany !== "object" || byCompany === null || Array.isArray(byCompany)) throw new Error("Object");
    } catch {
      setError("„Pro Firma“: gültiges JSON-Objekt (z. B. {\"co-demo-1\":{\"defaultRate\":0.06,\"active\":true}}).");
      setSaving(false);
      return;
    }
    const rideKindRates = {};
    for (const { key } of KINDS) {
      const st = rideKindState[key];
      const pct = Number(String(st?.ratePercent ?? "0").replace(",", "."));
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        setError(`Provision ${key}: 0–100.`);
        setSaving(false);
        return;
      }
      rideKindRates[key] = { rate: pct / 100, active: st?.active !== false };
    }
    const minProvisionEur =
      minProv.trim() === "" ? null : Number(String(minProv).replace(",", "."));
    if (minProvisionEur != null && (!Number.isFinite(minProvisionEur) || minProvisionEur < 0)) {
      setError("Mindestprovision: leer oder nicht-negative Zahl.");
      setSaving(false);
      return;
    }
    const defaultRate = n / 100;
    try {
      const res = await fetch(URL, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          commission: {
            defaultRate,
            active,
            minProvisionEur,
            byServiceRegion: byRegion,
            byCompany,
            rideKindRates,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Speichern fehlgeschlagen");
      setOkMsg("Provision gespeichert (erscheint in /api/app/config → provision).");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-page">
        <p className="admin-table-sub">Laden …</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      {error ? <div className="admin-info-banner admin-info-banner--error">{error}</div> : null}
      {okMsg ? <div className="admin-info-banner admin-info-banner--ok">{okMsg}</div> : null}
      <div className="admin-panel-card" style={{ marginBottom: 16 }}>
        <div className="admin-panel-card__title">Standard-Provision &amp; Schalter</div>
        <div className="admin-form-vertical" style={{ maxWidth: 400 }}>
          <label className="admin-form-label" htmlFor="comPct">
            Standard-Provision (%)
          </label>
          <input
            id="comPct"
            className="admin-input"
            value={defaultRatePercent}
            onChange={(e) => setDefaultRatePercent(e.target.value)}
            inputMode="decimal"
          />
          <label className="admin-form-label" htmlFor="minP" style={{ marginTop: 8 }}>
            Mindestprovision (EUR, leer = kein)
          </label>
          <input
            id="minP"
            className="admin-input"
            value={minProv}
            onChange={(e) => setMinProv(e.target.value)}
            inputMode="decimal"
            placeholder="z. B. 0.5"
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span>Provision-Modul aktiv (Auswertung/Reports)</span>
          </label>
        </div>
      </div>

      <div className="admin-panel-card" style={{ marginBottom: 16 }}>
        <div className="admin-panel-card__title">Pro Fahrtart</div>
        <p className="admin-table-sub">Fahrtarten entsprechen <code>rideKind</code> (standard, medical, voucher, company).</p>
        <div className="admin-table-wrap" style={{ marginTop: 8 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Art</th>
                <th>Provision %</th>
                <th>Aktiv</th>
              </tr>
            </thead>
            <tbody>
              {KINDS.map(({ key, label }) => (
                <tr key={key}>
                  <td>{label}</td>
                  <td>
                    <input
                      className="admin-input"
                      style={{ width: 100 }}
                      value={rideKindState[key]?.ratePercent ?? "0"}
                      onChange={(e) =>
                        setRideKindState((p) => ({ ...p, [key]: { ...p[key], ratePercent: e.target.value } }))
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={rideKindState[key]?.active !== false}
                      onChange={(e) =>
                        setRideKindState((p) => ({ ...p, [key]: { ...p[key], active: e.target.checked } }))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-panel-card" style={{ marginBottom: 16 }}>
        <div className="admin-panel-card__title">Pro Stadt (Service-Gebiet)</div>
        <p className="admin-table-sub">Werte überschreiben den Standard, wenn pro Region gepflegt.</p>
        {serviceRegions.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Gebiet</th>
                  <th>Provision % (leer = Standard)</th>
                  <th>Aktiv</th>
                </tr>
              </thead>
              <tbody>
                {serviceRegions.map((r) => {
                  const br = (byRegion[r.id] && typeof byRegion[r.id] === "object" ? byRegion[r.id] : {}) || {};
                  const pct = br.defaultRate != null && Number.isFinite(br.defaultRate) ? String((br.defaultRate * 100).toFixed(2)) : "";
                  return (
                    <tr key={r.id}>
                      <td>{r.label}</td>
                      <td>
                        <input
                          className="admin-input"
                          style={{ width: 100 }}
                          value={pct}
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            setByRegion((prev) => {
                              const next = { ...prev };
                              const o = { ...(next[r.id] && typeof next[r.id] === "object" ? next[r.id] : {}) };
                              if (v === "") {
                                o.defaultRate = undefined;
                              } else {
                                const n0 = Number(v.replace(",", "."));
                                o.defaultRate = Number.isFinite(n0) ? n0 / 100 : 0.07;
                              }
                              next[r.id] = o;
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={br.active !== false}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setByRegion((prev) => {
                              const next = { ...prev };
                              const o = { ...(next[r.id] && typeof next[r.id] === "object" ? next[r.id] : {}) };
                              o.active = on;
                              next[r.id] = o;
                              return next;
                            });
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="admin-table-sub">Keine Service-Gebiete geladen.</p>
        )}
      </div>

      <div className="admin-panel-card" style={{ marginBottom: 16 }}>
        <div className="admin-panel-card__title">Pro Firma (Partner-Mandant)</div>
        <p className="admin-table-sub">
          JSON-Objekt, Schlüssel = <code>admin_companies.id</code> (z. B. <code>co-demo-1</code>), Wert:{" "}
          <code>{`{ "defaultRate": 0.07, "active": true }`}</code>
        </p>
        <textarea
          className="admin-textarea"
          rows={6}
          style={{ fontFamily: "monospace", maxWidth: 640 }}
          value={byCompanyJson}
          onChange={(e) => setByCompanyJson(e.target.value)}
        />
      </div>

      <div className="admin-panel-card">
        <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={saving}>
          {saving ? "Speichert …" : "Alles speichern"}
        </button>
        <p className="admin-table-sub" style={{ marginTop: 8 }}>
          Öffentlich: <code>{API_BASE}/app/config</code> → <code>provision</code> (Kunden-App, ohne vertrauliche Keys).
        </p>
      </div>
    </div>
  );
}
