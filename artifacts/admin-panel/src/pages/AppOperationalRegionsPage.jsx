import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const URL = `${API_BASE}/admin/app-operational`;
const EARTH_RADIUS_KM = 6371;

function haversineKm(aLat, aLng, bLat, bLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function isRadiusConfig(r) {
  return (
    String(r.matchMode || "").toLowerCase() === "radius" &&
    r.centerLat != null &&
    r.centerLng != null &&
    r.radiusKm != null &&
    r.radiusKm > 0
  );
}

function pointMatchesRegion(r, address, lat, lng) {
  if (!r.isActive) return false;
  const a = String(address || "").toLowerCase();
  if (isRadiusConfig(r)) {
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    return haversineKm(lat, lng, r.centerLat, r.centerLng) <= r.radiusKm + 1e-6;
  }
  return (r.matchTerms || []).some((t) => {
    const s = String(t).trim().toLowerCase();
    return s && a.includes(s);
  });
}

/** Abhol- oder Zielposition: mindestens eine aktive Region matcht. */
function pointOkInActiveRegions(address, lat, lng, regions) {
  const active = (regions || []).filter((r) => r.isActive);
  if (active.length === 0) return true;
  return active.some((r) => pointMatchesRegion(r, address, lat, lng));
}

function anyActiveRadiusRegion(regions) {
  return (regions || []).some((r) => r.isActive && isRadiusConfig(r));
}

export default function AppOperationalRegionsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [regions, setRegions] = useState([]);
  const [outOfServiceDe, setOutOfServiceDe] = useState("");
  const [ruleDe, setRuleDe] = useState("");
  const [savingMsg, setSavingMsg] = useState(false);
  const [newLabel, setNewLabel] = useState("Landkreis Esslingen");
  const [newMode, setNewMode] = useState("radius");
  const [newTerms, setNewTerms] = useState("");
  const [newCenterLat, setNewCenterLat] = useState("48.7665");
  const [newCenterLng, setNewCenterLng] = useState("9.3048");
  const [newRadiusKm, setNewRadiusKm] = useState("25");
  const [addBusy, setAddBusy] = useState(false);
  const [testFrom, setTestFrom] = useState("Hauptbahnhof, Stuttgart");
  const [testTo, setTestTo] = useState("Am Schillerplatz, Esslingen am Neckar");
  const [testFromLat, setTestFromLat] = useState("48.7833");
  const [testFromLng, setTestFromLng] = useState("9.1801");
  const [testToLat, setTestToLat] = useState("48.7406");
  const [testToLng, setTestToLng] = useState("9.3103");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(URL, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `Laden fehlgeschlagen (${res.status})`);
      }
      setRegions(Array.isArray(data.serviceRegions) ? data.serviceRegions : []);
      const m = data.config?.messages;
      if (m && typeof m === "object") {
        if (typeof m.outOfServiceAreaDe === "string") setOutOfServiceDe(m.outOfServiceAreaDe);
        if (typeof m.operationalRuleDe === "string") setRuleDe(m.operationalRuleDe);
        else setRuleDe("");
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

  const saveMessage = async () => {
    setSavingMsg(true);
    setError("");
    setOkMsg("");
    try {
      const messages = { outOfServiceAreaDe: outOfServiceDe.trim() };
      if (ruleDe.trim()) messages.operationalRuleDe = ruleDe.trim();
      const res = await fetch(URL, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ messages }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Speichern fehlgeschlagen");
      setOkMsg("Hinweistexte gespeichert.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSavingMsg(false);
    }
  };

  const saveRegion = async (r) => {
    setError("");
    setOkMsg("");
    try {
      const res = await fetch(`${URL}/service-regions/${encodeURIComponent(r.id)}`, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          label: r.label,
          matchMode: r.matchMode,
          matchTerms: r.matchTerms,
          centerLat: r.centerLat,
          centerLng: r.centerLng,
          radiusKm: r.radiusKm,
          isActive: r.isActive,
          sortOrder: r.sortOrder,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Region speichern fehlgeschlagen");
      setRegions((prev) => prev.map((x) => (x.id === r.id ? data.serviceRegion : x)));
      setOkMsg(`Gebiet „${r.label}“ gespeichert.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    }
  };

  const pFromLat = testFromLat.trim() ? Number(testFromLat.replace(",", ".")) : NaN;
  const pFromLng = testFromLng.trim() ? Number(testFromLng.replace(",", ".")) : NaN;
  const pToLat = testToLat.trim() ? Number(testToLat.replace(",", ".")) : NaN;
  const pToLng = testToLng.trim() ? Number(testToLng.replace(",", ".")) : NaN;
  const fromLatN = Number.isFinite(pFromLat) ? pFromLat : null;
  const fromLngN = Number.isFinite(pFromLng) ? pFromLng : null;
  const toLatN = Number.isFinite(pToLat) ? pToLat : null;
  const toLngN = Number.isFinite(pToLng) ? pToLng : null;

  const fromOk = pointOkInActiveRegions(testFrom, fromLatN, fromLngN, regions);
  const toOk = pointOkInActiveRegions(testTo, toLatN, toLngN, regions);
  const anyActive = regions.filter((r) => r.isActive).length > 0;
  const needCoordsHint = anyActiveRadiusRegion(regions);
  let testResult = "Ohne aktive Gebiete: Einfahrt-Regel greift nicht (Fail-open).";
  if (anyActive) {
    if (needCoordsHint && (fromLatN == null || fromLngN == null || toLatN == null || toLngN == null)) {
      testResult =
        "Für mindestens eine aktive Radius-Region: bitte Abhol- und Zielkoordinaten ausfüllen, sonst keine zuverlässige Prüfung.";
    } else {
      testResult =
        fromOk && toOk
          ? "Buchung wäre zulässig (beide Orte in je einem aktiven Gebiet — Koordinaten und/oder Adresstext)."
          : `Nicht zulässig — Abholung: ${fromOk ? "ok" : "kein Treffer"}; Ziel: ${toOk ? "ok" : "kein Treffer"}. Kunde sieht: „${(outOfServiceDe || "—").trim().slice(0, 100)}“`;
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-panel-card" style={{ marginBottom: 16 }}>
        <div className="admin-panel-card__title">Hinweistexte (Kunden-App / API)</div>
        <p className="admin-table-sub" style={{ lineHeight: 1.5 }}>
          <strong>Kein Einfahrtsservice</strong> (wenn kein passendes aktives Gebiet). <strong>Plattform-Regel</strong> für
          serverseitig abgelehnte Buchungen (Feature, max. Strecke, …).
        </p>
        <div className="admin-form-vertical" style={{ marginTop: 12, maxWidth: 640 }}>
          <label className="admin-form-label" htmlFor="outsvc">
            Kein Einfahrtsservice (Deutsch)
          </label>
          <textarea
            id="outsvc"
            className="admin-textarea"
            rows={2}
            value={outOfServiceDe}
            onChange={(e) => setOutOfServiceDe(e.target.value)}
          />
          <label className="admin-form-label" htmlFor="rulede" style={{ marginTop: 12 }}>
            Plattform-Regel (allgemein, Deutsch)
          </label>
          <textarea
            id="rulede"
            className="admin-textarea"
            rows={2}
            value={ruleDe}
            onChange={(e) => setRuleDe(e.target.value)}
            placeholder="Diese Buchung ist mit den aktuellen Plattform-Regeln nicht zulässig."
          />
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            style={{ marginTop: 8, alignSelf: "flex-start" }}
            onClick={saveMessage}
            disabled={savingMsg}
          >
            {savingMsg ? "Speichert …" : "Hinweise speichern"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="admin-info-banner admin-info-banner--error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      ) : null}
      {okMsg ? (
        <div className="admin-info-banner admin-info-banner--ok" style={{ marginBottom: 12 }}>
          {okMsg}
        </div>
      ) : null}

      <div className="admin-panel-card" style={{ marginBottom: 16 }}>
        <div className="admin-panel-card__title">Start / Ziel prüfen</div>
        <p className="admin-table-sub">
          Eine <strong>Region / ein Landkreis</strong> kann per <strong>Radius</strong> (Mittelpunkt + km) oder per{" "}
          <strong>Suchbegriff in der Adresse</strong> (Legacy) definiert sein. Prüfung: beide Fahrtendpunkte müssen in
          mindestens einem <em>aktiven</em> Gebiet liegen. Koordinaten sind für Radius-Regionen maßgeblich; Adresstext
          bleibt für Anzeige und Substring-Modus.
        </p>
        <div className="admin-form-vertical" style={{ maxWidth: 640, marginTop: 8 }}>
          <label className="admin-form-label" htmlFor="tf">
            Abholadresse (Text)
          </label>
          <input id="tf" className="admin-input" value={testFrom} onChange={(e) => setTestFrom(e.target.value)} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <div>
              <label className="admin-form-label" htmlFor="tflat">
                Abholung lat
              </label>
              <input id="tflat" className="admin-input" value={testFromLat} onChange={(e) => setTestFromLat(e.target.value)} />
            </div>
            <div>
              <label className="admin-form-label" htmlFor="tflng">
                Abholung lng
              </label>
              <input id="tflng" className="admin-input" value={testFromLng} onChange={(e) => setTestFromLng(e.target.value)} />
            </div>
          </div>
          <label className="admin-form-label" htmlFor="tt" style={{ marginTop: 8 }}>
            Zieladresse (Text)
          </label>
          <input id="tt" className="admin-input" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <div>
              <label className="admin-form-label" htmlFor="ttlat">
                Ziel lat
              </label>
              <input id="ttlat" className="admin-input" value={testToLat} onChange={(e) => setTestToLat(e.target.value)} />
            </div>
            <div>
              <label className="admin-form-label" htmlFor="ttlng">
                Ziel lng
              </label>
              <input id="ttlng" className="admin-input" value={testToLng} onChange={(e) => setTestToLng(e.target.value)} />
            </div>
          </div>
        </div>
        <p className="admin-table-sub" style={{ marginTop: 12, fontWeight: 600 }}>
          Ergebnis: {testResult}
        </p>
      </div>

      <div className="admin-panel-card" style={{ marginBottom: 16 }}>
        <div className="admin-panel-card__title">Neue Region anlegen</div>
        <p className="admin-table-sub">
          <strong>Radius</strong>: Name, Mittelpunkt (lat/lng) und Radius in km — deckt umliegende Orte ohne Einzel-
          Suchbegriffe ab. <strong>Text (Legacy)</strong>: komma-getrennte Begriffe in der Adresse. Pro Region genau ein
          Modus. Tarif-Zuordnung: Tarife → Region (byServiceRegion).
        </p>
        <div className="admin-form-vertical" style={{ maxWidth: 520, marginTop: 8 }}>
          <label className="admin-form-label" htmlFor="nmode">
            Modus
          </label>
          <select id="nmode" className="admin-input" value={newMode} onChange={(e) => setNewMode(e.target.value)}>
            <option value="radius">Radius (Mittelpunkt + km)</option>
            <option value="substring">Text in Adresse (Suchbegriffe)</option>
          </select>
          <input
            className="admin-input"
            style={{ marginTop: 8 }}
            placeholder="z. B. Landkreis Esslingen (Mittelpunkt: Esslingen, Radius km anpassen)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          {newMode === "radius" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 8 }}>
              <div>
                <label className="admin-form-label">center lat</label>
                <input className="admin-input" value={newCenterLat} onChange={(e) => setNewCenterLat(e.target.value)} />
              </div>
              <div>
                <label className="admin-form-label">center lng</label>
                <input className="admin-input" value={newCenterLng} onChange={(e) => setNewCenterLng(e.target.value)} />
              </div>
              <div>
                <label className="admin-form-label">Radius (km)</label>
                <input className="admin-input" value={newRadiusKm} onChange={(e) => setNewRadiusKm(e.target.value)} />
              </div>
            </div>
          ) : null}
          {newMode === "substring" ? (
            <input
              className="admin-input"
              style={{ marginTop: 8 }}
              placeholder="tübingen, tuebingen, …"
              value={newTerms}
              onChange={(e) => setNewTerms(e.target.value)}
            />
          ) : null}
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            style={{ marginTop: 8, alignSelf: "flex-start" }}
            disabled={addBusy}
            onClick={async () => {
              setAddBusy(true);
              setError("");
              setOkMsg("");
              const label = newLabel.trim();
              if (!label) {
                setError("Bezeichnung ausfüllen.");
                setAddBusy(false);
                return;
              }
              const body = { label, isActive: true, matchMode: newMode };
              if (newMode === "substring") {
                const matchTerms = newTerms
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                if (!matchTerms.length) {
                  setError("Für Text-Modus: mindestens einen Suchbegriff.");
                  setAddBusy(false);
                  return;
                }
                body.matchTerms = matchTerms;
              } else {
                const clat = Number(String(newCenterLat).replace(",", "."));
                const clng = Number(String(newCenterLng).replace(",", "."));
                const rkm = Number(String(newRadiusKm).replace(",", "."));
                if (!Number.isFinite(clat) || !Number.isFinite(clng) || !Number.isFinite(rkm) || rkm <= 0) {
                  setError("Für Radius: gültigen Mittelpunkt und Radius > 0.");
                  setAddBusy(false);
                  return;
                }
                body.matchTerms = [];
                body.centerLat = clat;
                body.centerLng = clng;
                body.radiusKm = rkm;
              }
              try {
                const res = await fetch(`${URL}/service-regions`, {
                  method: "POST",
                  headers: adminApiHeaders({ "Content-Type": "application/json" }),
                  body: JSON.stringify(body),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data?.ok) throw new Error(data?.error || "Anlegen fehlgeschlagen");
                setNewLabel("");
                setNewTerms("");
                setOkMsg(`Region „${label}“ angelegt.`);
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Fehler");
              } finally {
                setAddBusy(false);
              }
            }}
          >
            {addBusy ? "Wird angelegt …" : "Region hinzufügen"}
          </button>
        </div>
      </div>

      <div className="admin-panel-card">
        <div className="admin-panel-card__title">Regionen / Landkreise</div>
        {loading ? (
          <p className="admin-table-sub">Laden …</p>
        ) : (
          <div className="admin-table-wrap" style={{ marginTop: 12, overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Bezeichnung</th>
                  <th>Modus</th>
                  <th>Mittelpunkt / Radius</th>
                  <th>Suchbegriffe</th>
                  <th>Aktiv</th>
                  <th>Sort.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {regions.map((r) => (
                  <AppRegionRow key={r.id} initial={r} onSave={(row) => void saveRegion(row)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AppRegionRow({ initial, onSave }) {
  const [label, setLabel] = useState(initial.label);
  const [mode, setMode] = useState(
    String(initial.matchMode || "substring").toLowerCase() === "radius" ? "radius" : "substring",
  );
  const [centerLat, setCenterLat] = useState(
    initial.centerLat != null && initial.centerLat !== "" ? String(initial.centerLat) : "",
  );
  const [centerLng, setCenterLng] = useState(
    initial.centerLng != null && initial.centerLng !== "" ? String(initial.centerLng) : "",
  );
  const [radiusKm, setRadiusKm] = useState(
    initial.radiusKm != null && initial.radiusKm !== "" ? String(initial.radiusKm) : "",
  );
  const [termsStr, setTermsStr] = useState((initial.matchTerms || []).join(", "));
  const [isActive, setIsActive] = useState(initial.isActive);
  const [sortOrder, setSortOrder] = useState(String(initial.sortOrder));
  const [centerQuery, setCenterQuery] = useState(
    (initial.label || "").trim() || String((initial.matchTerms || [])[0] || "").trim(),
  );
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState("");
  const [rowError, setRowError] = useState("");

  return (
    <tr>
      <td>
        <input className="admin-input" value={label} onChange={(e) => setLabel(e.target.value)} style={{ minWidth: 120 }} />
      </td>
      <td>
        <select className="admin-input" value={mode} onChange={(e) => setMode(e.target.value)} style={{ minWidth: 100 }}>
          <option value="radius">Radius</option>
          <option value="substring">Text</option>
        </select>
      </td>
      <td style={{ minWidth: 200 }}>
        {mode === "radius" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <input
              className="admin-input"
              placeholder="lat"
              value={centerLat}
              onChange={(e) => setCenterLat(e.target.value)}
            />
            <input
              className="admin-input"
              placeholder="lng"
              value={centerLng}
              onChange={(e) => setCenterLng(e.target.value)}
            />
            <input
              className="admin-input"
              placeholder="km"
              value={radiusKm}
              onChange={(e) => setRadiusKm(e.target.value)}
            />
            <input
              className="admin-input"
              placeholder="Mittelpunkt aus Adresse, z. B. Esslingen"
              value={centerQuery}
              onChange={(e) => setCenterQuery(e.target.value)}
            />
            <button
              type="button"
              className="admin-btn admin-btn--small"
              disabled={geoBusy}
              onClick={async () => {
                const q = centerQuery.trim() || label.trim();
                if (!q) {
                  setGeoMsg("Bitte eine Adresse oder Ortsbezeichnung eingeben.");
                  return;
                }
                setGeoBusy(true);
                setGeoMsg("");
                try {
                  const u = new URL("https://nominatim.openstreetmap.org/search");
                  u.searchParams.set("format", "jsonv2");
                  u.searchParams.set("limit", "1");
                  u.searchParams.set("q", q);
                  const res = await fetch(u.toString(), {
                    headers: { Accept: "application/json" },
                  });
                  const rows = await res.json().catch(() => []);
                  const first = Array.isArray(rows) ? rows[0] : null;
                  const lat = first?.lat != null ? Number(first.lat) : NaN;
                  const lon = first?.lon != null ? Number(first.lon) : NaN;
                  if (!res.ok || !Number.isFinite(lat) || !Number.isFinite(lon)) {
                    throw new Error("not_found");
                  }
                  setCenterLat(String(Math.round(lat * 1e6) / 1e6));
                  setCenterLng(String(Math.round(lon * 1e6) / 1e6));
                  setGeoMsg("Mittelpunkt wurde aus der Adresse übernommen.");
                } catch {
                  setGeoMsg("Adresse konnte nicht aufgelöst werden. Bitte Koordinaten manuell eintragen.");
                } finally {
                  setGeoBusy(false);
                }
              }}
            >
              {geoBusy ? "Suche …" : "Mittelpunkt aus Adresse setzen"}
            </button>
            {geoMsg ? <span className="admin-table-sub">{geoMsg}</span> : null}
          </div>
        ) : (
          <span className="admin-table-sub">—</span>
        )}
      </td>
      <td>
        <input
          className="admin-input"
          value={termsStr}
          onChange={(e) => setTermsStr(e.target.value)}
          placeholder={mode === "radius" ? "Bei Radius optional / nicht relevant" : "nur Text-Modus"}
          style={{ minWidth: 180 }}
          disabled={mode === "radius"}
        />
      </td>
      <td>
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
      </td>
      <td>
        <input
          className="admin-input"
          style={{ width: 56 }}
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
      </td>
      <td>
        {rowError ? (
          <div className="admin-info-banner admin-info-banner--error" style={{ marginBottom: 6 }}>
            {rowError}
          </div>
        ) : null}
        <button
          type="button"
          className="admin-btn admin-btn--small"
          onClick={() => {
            setRowError("");
            const matchTerms = termsStr
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            const so = Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : initial.sortOrder;
            const safeLabel = label.trim();
            if (!safeLabel) {
              setRowError("Bezeichnung darf nicht leer sein.");
              return;
            }
            if (mode === "radius") {
              if (!String(centerLat).trim()) {
                setRowError("Für Radius bitte centerLat ausfüllen.");
                return;
              }
              if (!String(centerLng).trim()) {
                setRowError("Für Radius bitte centerLng ausfüllen.");
                return;
              }
              if (!String(radiusKm).trim()) {
                setRowError("Für Radius bitte radiusKm ausfüllen.");
                return;
              }
              const cla = Number(String(centerLat).replace(",", "."));
              const clg = Number(String(centerLng).replace(",", "."));
              const rkm = Number(String(radiusKm).replace(",", "."));
              if (!Number.isFinite(cla) || !Number.isFinite(clg)) {
                setRowError("centerLat und centerLng müssen gültige Zahlen sein.");
                return;
              }
              if (!Number.isFinite(rkm) || rkm < 1) {
                setRowError("radiusKm muss mindestens 1 km sein.");
                return;
              }
              onSave({
                ...initial,
                label: safeLabel,
                isActive,
                matchMode: "radius",
                matchTerms,
                centerLat: cla,
                centerLng: clg,
                radiusKm: rkm,
                sortOrder: so,
              });
            } else {
              onSave({
                ...initial,
                label: safeLabel,
                isActive,
                matchMode: "substring",
                matchTerms,
                centerLat: null,
                centerLng: null,
                radiusKm: null,
                sortOrder: so,
              });
            }
          }}
        >
          Speichern
        </button>
      </td>
    </tr>
  );
}
