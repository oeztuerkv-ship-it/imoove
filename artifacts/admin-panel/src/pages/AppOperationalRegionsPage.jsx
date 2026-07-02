import AdminCollapsibleSection from "../components/AdminCollapsibleSection.jsx";
import CollapsibleCard from "../components/CollapsibleCard.jsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";
import {
  buildRegionPayloadFromEditor,
  getRegionTariffTemplateIds,
  getTariffCatalog,
  loadEditorFromTariff,
  resolveRegionTariffDisplay,
} from "../lib/appOperationalTariffUtils.js";

const BASE_URL = `${API_BASE}/admin/app-operational`;
const EARTH_RADIUS_KM = 6371;

function haversineKm(aLat, aLng, bLat, bLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat); const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
function isRadiusConfig(r) {
  return String(r.matchMode || "").toLowerCase() === "radius" && r.centerLat != null && r.centerLng != null && r.radiusKm != null && r.radiusKm > 0;
}
function pointMatchesRegion(r, address, lat, lng) {
  if (!r.isActive) return false;
  const a = String(address || "").toLowerCase();
  if (isRadiusConfig(r)) {
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    return haversineKm(lat, lng, r.centerLat, r.centerLng) <= r.radiusKm + 1e-6;
  }
  return (r.matchTerms || []).some((t) => { const s = String(t).trim().toLowerCase(); return s && a.includes(s); });
}
function pointOkInActiveRegions(address, lat, lng, regions) {
  const active = (regions || []).filter((r) => r.isActive);
  if (active.length === 0) return true;
  return active.some((r) => pointMatchesRegion(r, address, lat, lng));
}
function anyActiveRadiusRegion(regions) {
  return (regions || []).some((r) => r.isActive && isRadiusConfig(r));
}
async function geocodeQuery(q) {
  const u = new URL("https://nominatim.openstreetmap.org/search");
  u.searchParams.set("format", "jsonv2"); u.searchParams.set("limit", "1"); u.searchParams.set("q", q);
  const res = await fetch(u.toString(), { headers: { Accept: "application/json" } });
  const rows = await res.json().catch(() => []);
  const first = Array.isArray(rows) ? rows[0] : null;
  const lat = first?.lat != null ? Number(first.lat) : NaN;
  const lon = first?.lon != null ? Number(first.lon) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("not_found");
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lon * 1e6) / 1e6 };
}

const PRESETS = [
  { label: "Landkreis Esslingen", lat: "48.7665", lng: "9.3048", km: "25" },
  { label: "Landkreis Tübingen", lat: "48.5216", lng: "9.0576", km: "25" },
  { label: "Landkreis Ludwigsburg", lat: "48.8975", lng: "9.1922", km: "25" },
  { label: "Landkreis Böblingen", lat: "48.6844", lng: "9.0017", km: "25" },
  { label: "Landkreis Göppingen", lat: "48.7029", lng: "9.6534", km: "25" },
  { label: "Stuttgart", lat: "48.7758", lng: "9.1829", km: "20" },
  { label: "Reutlingen", lat: "48.4926", lng: "9.2041", km: "20" },
];

export default function AppOperationalRegionsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [regions, setRegions] = useState([]);
  const [config, setConfig] = useState(null);
  const [tariffDrafts, setTariffDrafts] = useState({});
  const [assignBusy, setAssignBusy] = useState("");
  const [outOfServiceDe, setOutOfServiceDe] = useState("");
  const [savingMsg, setSavingMsg] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newMode, setNewMode] = useState("radius");
  const [newTerms, setNewTerms] = useState("");
  const [newLat, setNewLat] = useState("");
  const [newLng, setNewLng] = useState("");
  const [newKm, setNewKm] = useState("25");
  const [newGeoQ, setNewGeoQ] = useState("");
  const [newGeoBusy, setNewGeoBusy] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [testFrom, setTestFrom] = useState("Hauptbahnhof, Stuttgart");
  const [testFromLat, setTestFromLat] = useState("48.7833");
  const [testFromLng, setTestFromLng] = useState("9.1801");
  const [testTo, setTestTo] = useState("Am Schillerplatz, Esslingen am Neckar");
  const [testToLat, setTestToLat] = useState("48.7406");
  const [testToLng, setTestToLng] = useState("9.3103");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(BASE_URL, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Fehler");
      setRegions(Array.isArray(data.serviceRegions) ? data.serviceRegions : []);
      setConfig(data.config || null);
      const assignments = getRegionTariffTemplateIds(data.config || {});
      setTariffDrafts(assignments);
      const m = data.config?.messages;
      if (typeof m?.outOfServiceAreaDe === "string") setOutOfServiceDe(m.outOfServiceAreaDe);
    } catch (e) { setError(e instanceof Error ? e.message : "Fehler"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const tariffs = useMemo(() => getTariffCatalog(config), [config]);

  const patchConfig = async (body) => {
    const res = await fetch(BASE_URL, {
      method: "PATCH",
      headers: adminApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) throw new Error(data?.error || "Fehler");
    setConfig(data.config);
    setTariffDrafts(getRegionTariffTemplateIds(data.config || {}));
    return data;
  };

  const saveRegionTariff = async (regionId) => {
    const tariffId = tariffDrafts[regionId] ?? "";
    setAssignBusy(regionId);
    setError("");
    setOkMsg("");
    try {
      const prevTar = config?.tariffs && typeof config.tariffs === "object" ? { ...config.tariffs } : {};
      const prevBsr =
        prevTar.byServiceRegion && typeof prevTar.byServiceRegion === "object" ? { ...prevTar.byServiceRegion } : {};
      const nextAssign = { ...getRegionTariffTemplateIds(config || {}) };

      if (!tariffId) {
        delete nextAssign[regionId];
        const nextBsr = { ...prevBsr };
        delete nextBsr[regionId];
        await patchConfig({
          tariffs: { ...prevTar, byServiceRegion: nextBsr },
          regionTariffTemplateIds: nextAssign,
        });
        setOkMsg("Gespeichert.");
        return;
      }

      const tpl = tariffs.find((t) => t.id === tariffId);
      if (!tpl) throw new Error("Tarif nicht gefunden — bitte unter „Tarife“ anlegen.");
      const ed = loadEditorFromTariff(tpl);
      const payload = buildRegionPayloadFromEditor(
        {
          ...ed,
          tariffTemplateId: tpl.id,
          tariffTemplateName: tpl.name,
        },
        tpl.regionPayload || {},
      );
      nextAssign[regionId] = tariffId;
      await patchConfig({
        tariffs: {
          ...prevTar,
          active: prevTar.active !== false,
          pricingMode: "taxi_tariff",
          byServiceRegion: { ...prevBsr, [regionId]: payload },
        },
        regionTariffTemplateIds: nextAssign,
      });
      setOkMsg("Gespeichert.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setAssignBusy("");
    }
  };

  const deleteRegion = async (id, label) => {
    if (!window.confirm(`Region "${label}" wirklich löschen?`)) return;
    setError(""); setOkMsg("");
    try {
      const res = await fetch(`${BASE_URL}/service-regions/${encodeURIComponent(id)}`, { method: "DELETE", headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Fehler");
      setRegions((prev) => prev.filter((r) => r.id !== id));
      setOkMsg(`"${label}" gelöscht.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Fehler"); }
  };

  const saveRegion = async (r) => {
    setError(""); setOkMsg("");
    try {
      const res = await fetch(`${BASE_URL}/service-regions/${encodeURIComponent(r.id)}`, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ label: r.label, matchMode: r.matchMode, matchTerms: r.matchTerms, centerLat: r.centerLat, centerLng: r.centerLng, radiusKm: r.radiusKm, isActive: r.isActive, sortOrder: r.sortOrder }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Fehler");
      setRegions((prev) => prev.map((x) => (x.id === r.id ? data.serviceRegion : x)));
      setOkMsg(`"${r.label}" gespeichert.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Fehler"); }
  };

  const addRegion = async () => {
    setAddBusy(true); setError(""); setOkMsg("");
    const label = newLabel.trim();
    if (!label) { setError("Bezeichnung eingeben."); setAddBusy(false); return; }
    const body = { label, isActive: true, matchMode: newMode };
    if (newMode === "substring") {
      const matchTerms = newTerms.split(",").map((s) => s.trim()).filter(Boolean);
      if (!matchTerms.length) { setError("Mindestens einen Suchbegriff eingeben."); setAddBusy(false); return; }
      body.matchTerms = matchTerms;
    } else {
      const clat = Number(String(newLat).replace(",", ".")); const clng = Number(String(newLng).replace(",", ".")); const rkm = Number(String(newKm).replace(",", "."));
      if (!Number.isFinite(clat) || !Number.isFinite(clng) || !Number.isFinite(rkm) || rkm <= 0) { setError("Gültige Koordinaten und Radius > 0 eingeben."); setAddBusy(false); return; }
      body.matchTerms = []; body.centerLat = clat; body.centerLng = clng; body.radiusKm = rkm;
    }
    try {
      const res = await fetch(`${BASE_URL}/service-regions`, { method: "POST", headers: adminApiHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Fehler");
      setNewLabel(""); setNewTerms(""); setNewLat(""); setNewLng(""); setNewKm("25"); setNewGeoQ("");
      setOkMsg(`Region "${label}" angelegt.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Fehler"); }
    finally { setAddBusy(false); }
  };

  const saveMessage = async () => {
    setSavingMsg(true);
    try {
      const res = await fetch(BASE_URL, { method: "PATCH", headers: adminApiHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ messages: { outOfServiceAreaDe: outOfServiceDe.trim() } }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Fehler");
      setOkMsg("Hinweistext gespeichert.");
    } catch (e) { setError(e instanceof Error ? e.message : "Fehler"); }
    finally { setSavingMsg(false); }
  };

  const pFL = testFromLat.trim() ? Number(testFromLat.replace(",", ".")) : NaN;
  const pFLg = testFromLng.trim() ? Number(testFromLng.replace(",", ".")) : NaN;
  const pTL = testToLat.trim() ? Number(testToLat.replace(",", ".")) : NaN;
  const pTLg = testToLng.trim() ? Number(testToLng.replace(",", ".")) : NaN;
  const fLat = Number.isFinite(pFL) ? pFL : null; const fLng = Number.isFinite(pFLg) ? pFLg : null;
  const tLat = Number.isFinite(pTL) ? pTL : null; const tLng = Number.isFinite(pTLg) ? pTLg : null;
  const fromOk = pointOkInActiveRegions(testFrom, fLat, fLng, regions);
  const toOk = pointOkInActiveRegions(testTo, tLat, tLng, regions);
  const anyActive = regions.some((r) => r.isActive);
  const needCoords = anyActiveRadiusRegion(regions);
  let testResult = "Ohne aktive Gebiete: Regel greift nicht.";
  if (anyActive) {
    if (needCoords && (fLat == null || fLng == null || tLat == null || tLng == null)) testResult = "Bitte Koordinaten ausfüllen für Radius-Prüfung.";
    else testResult = fromOk && toOk ? "Buchung wäre zulässig." : `Nicht zulässig — Abholung: ${fromOk ? "ok" : "kein Treffer"} / Ziel: ${toOk ? "ok" : "kein Treffer"}`;
  }

  const activeCount = regions.filter((r) => r.isActive).length;

  const gridCols = "1.1fr 0.45fr 1.1fr 1.3fr 0.65fr";

  return (
    <div className="admin-page admin-page--loose">
      <p className="admin-page-lead">
        Wo gefahren wird (Matching), Tarif-Zuordnung, Radius/Text; Buchung nur in aktiven Gebieten.
      </p>

      {error || okMsg ? (
        <section className="admin-section-block">
          <div className="admin-section-block__body admin-section-block__body--stack">
            {error ? (
              <div className="admin-info-banner admin-info-banner--error admin-info-banner--inline">{error}</div>
            ) : null}
            {okMsg ? <div className="admin-info-banner admin-info-banner--ok admin-info-banner--inline">{okMsg}</div> : null}
          </div>
        </section>
      ) : null}

      <AdminCollapsibleSection
        title="Gebiete & Tarifzuordnung"
        subtitle={loading ? "Laden …" : `${regions.length} Gebiet${regions.length === 1 ? "" : "e"}`}
        defaultOpen
      >
        {loading ? (
          <p className="admin-table-sub" style={{ marginTop: 10 }}>Laden …</p>
        ) : regions.length === 0 ? (
          <p className="admin-table-sub" style={{ marginTop: 10 }}>Noch keine Gebiete.</p>
        ) : (
          <div className="admin-table-card admin-table-card--embedded">
            <div className="admin-table-scroll">
              <div className="admin-table-row admin-table-row--head" style={{ gridTemplateColumns: gridCols }}>
                <span>Gebiet</span>
                <span>aktiv</span>
                <span>aktueller Tarif</span>
                <span>Tarif auswählen</span>
                <span />
              </div>
              {regions.map((r) => {
                const display = resolveRegionTariffDisplay(config, r, tariffs);
                const draft = tariffDrafts[r.id] ?? display.tariffId ?? "";
                return (
                  <div
                    key={r.id}
                    className="admin-table-row"
                    style={{ gridTemplateColumns: gridCols, alignItems: "center" }}
                  >
                    <span style={{ fontWeight: 500 }}>{r.label}</span>
                    <span>{r.isActive ? "ja" : "nein"}</span>
                    <span style={{ fontSize: 12 }}>{display.tariffName}</span>
                    <select
                      className="admin-input"
                      value={draft}
                      onChange={(e) => setTariffDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    >
                      <option value="">Plattform-Standard</option>
                      {tariffs.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="admin-m-btn-pri"
                      style={{ fontSize: 12, padding: "6px 10px" }}
                      disabled={assignBusy === r.id}
                      onClick={() => void saveRegionTariff(r.id)}
                    >
                      {assignBusy === r.id ? "…" : "Speichern"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </AdminCollapsibleSection>

      <CollapsibleCard title="Region hinzufügen">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="admin-btn admin-btn--small" onClick={() => { setNewLabel(p.label); setNewMode("radius"); setNewLat(p.lat); setNewLng(p.lng); setNewKm(p.km); setNewGeoQ(p.label); }}>
              + {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, marginTop: 14, maxWidth: 520, alignItems: "end" }}>
          <label className="admin-form-label">
            Bezeichnung
            <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="z. B. Landkreis Esslingen" />
          </label>
          <select className="admin-input" style={{ marginBottom: 1 }} value={newMode} onChange={(e) => setNewMode(e.target.value)}>
            <option value="radius">Radius</option>
            <option value="substring">Suchbegriff</option>
          </select>
        </div>
        {newMode === "radius" ? (
          <div style={{ marginTop: 10, maxWidth: 520 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.7fr", gap: 8 }}>
              <label className="admin-form-label">Breitengrad (lat)<input className="admin-input" style={{ display: "block", marginTop: 4 }} value={newLat} onChange={(e) => setNewLat(e.target.value)} placeholder="48.7665" /></label>
              <label className="admin-form-label">Längengrad (lng)<input className="admin-input" style={{ display: "block", marginTop: 4 }} value={newLng} onChange={(e) => setNewLng(e.target.value)} placeholder="9.3048" /></label>
              <label className="admin-form-label">Radius (km)<input className="admin-input" style={{ display: "block", marginTop: 4 }} value={newKm} onChange={(e) => setNewKm(e.target.value)} /></label>
            </div>
            <div className="admin-filter-toolbar admin-filter-toolbar--modern admin-filter-toolbar--search-wide">
              <label className="admin-filter-field admin-filter-field--search">
                <span className="admin-field-label">Koordinaten per Adresse ermitteln</span>
                <input
                  className="admin-input"
                  value={newGeoQ}
                  onChange={(e) => setNewGeoQ(e.target.value)}
                  placeholder="z. B. Esslingen am Neckar"
                />
              </label>
              <button
                type="button"
                className="admin-c-btn-sec admin-filter-toolbar--modern__refresh"
                disabled={newGeoBusy}
                onClick={async () => {
                  const q = (newGeoQ || newLabel).trim();
                  if (!q) return;
                  setNewGeoBusy(true);
                  try {
                    const c = await geocodeQuery(q);
                    setNewLat(String(c.lat));
                    setNewLng(String(c.lng));
                  } catch {
                    setError("Adresse nicht gefunden — bitte manuell eingeben.");
                  } finally {
                    setNewGeoBusy(false);
                  }
                }}
              >
                {newGeoBusy ? "Ermittle …" : "Ermitteln"}
              </button>
            </div>
          </div>
        ) : (
          <label className="admin-form-label" style={{ display: "block", marginTop: 10, maxWidth: 520 }}>
            Suchbegriffe (kommagetrennt)
            <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={newTerms} onChange={(e) => setNewTerms(e.target.value)} placeholder="esslingen, esslingen am neckar" />
          </label>
        )}
        <button type="button" className="admin-m-btn-pri" style={{ marginTop: 14 }} disabled={addBusy} onClick={addRegion}>
          {addBusy ? "Wird angelegt ..." : "Region hinzufügen"}
        </button>
      </CollapsibleCard>

      <AdminCollapsibleSection
        title="Regionen verwalten"
        subtitle={`${activeCount}/${regions.length} aktiv`}
        defaultOpen
      >
        {!loading && regions.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {regions.map((r) => (
              <AppRegionCard key={r.id} initial={r} onSave={saveRegion} onDelete={deleteRegion} />
            ))}
          </div>
        ) : null}
      </AdminCollapsibleSection>

      <CollapsibleCard title="Start / Ziel prüfen">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 600 }}>
          <div>
            <label className="admin-form-label">Abholadresse<input className="admin-input" style={{ display: "block", marginTop: 4 }} value={testFrom} onChange={(e) => setTestFrom(e.target.value)} /></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
              <label className="admin-form-label">lat<input className="admin-input" style={{ display: "block", marginTop: 4 }} value={testFromLat} onChange={(e) => setTestFromLat(e.target.value)} /></label>
              <label className="admin-form-label">lng<input className="admin-input" style={{ display: "block", marginTop: 4 }} value={testFromLng} onChange={(e) => setTestFromLng(e.target.value)} /></label>
            </div>
          </div>
          <div>
            <label className="admin-form-label">Zieladresse<input className="admin-input" style={{ display: "block", marginTop: 4 }} value={testTo} onChange={(e) => setTestTo(e.target.value)} /></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
              <label className="admin-form-label">lat<input className="admin-input" style={{ display: "block", marginTop: 4 }} value={testToLat} onChange={(e) => setTestToLat(e.target.value)} /></label>
              <label className="admin-form-label">lng<input className="admin-input" style={{ display: "block", marginTop: 4 }} value={testToLng} onChange={(e) => setTestToLng(e.target.value)} /></label>
            </div>
          </div>
        </div>
        <p className="admin-table-sub" style={{ marginTop: 12, fontWeight: 600, color: fromOk && toOk && anyActive ? "#16a34a" : "#dc2626" }}>
          {testResult}
        </p>
      </CollapsibleCard>

      <CollapsibleCard title="Hinweistext (App)">
        <label className="admin-form-label" style={{ display: "block", marginTop: 8, maxWidth: 560 }}>
          Meldung wenn kein Einfahrtsservice
          <textarea className="admin-textarea" rows={2} style={{ display: "block", marginTop: 4, width: "100%" }} value={outOfServiceDe} onChange={(e) => setOutOfServiceDe(e.target.value)} />
        </label>
        <button type="button" className="admin-c-btn-sec" style={{ marginTop: 8 }} disabled={savingMsg} onClick={saveMessage}>
          {savingMsg ? "..." : "Speichern"}
        </button>
      </CollapsibleCard>
    </div>
  );
}

function AppRegionCard({ initial, onSave, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [label, setLabel] = useState(initial.label || "");
  const [mode, setMode] = useState(String(initial.matchMode || "substring").toLowerCase() === "radius" ? "radius" : "substring");
  const [centerLat, setCenterLat] = useState(initial.centerLat != null ? String(initial.centerLat) : "");
  const [centerLng, setCenterLng] = useState(initial.centerLng != null ? String(initial.centerLng) : "");
  const [radiusKm, setRadiusKm] = useState(initial.radiusKm != null ? String(initial.radiusKm) : "");
  const [termsStr, setTermsStr] = useState((initial.matchTerms || []).join(", "));
  const [isActive, setIsActive] = useState(!!initial.isActive);
  const [sortOrder, setSortOrder] = useState(String(initial.sortOrder ?? ""));
  const [geoQ, setGeoQ] = useState("");
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const buildPayload = (overrides = {}) => {
    const matchTerms = termsStr.split(",").map((s) => s.trim()).filter(Boolean);
    const so = Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : initial.sortOrder;
    const base = mode === "radius"
      ? { ...initial, label: label.trim(), isActive, matchMode: "radius", matchTerms, centerLat: Number(String(centerLat).replace(",", ".")), centerLng: Number(String(centerLng).replace(",", ".")), radiusKm: Number(String(radiusKm).replace(",", ".")), sortOrder: so }
      : { ...initial, label: label.trim(), isActive, matchMode: "substring", matchTerms, centerLat: null, centerLng: null, radiusKm: null, sortOrder: so };
    return { ...base, ...overrides };
  };

  const handleActiveToggle = async (val) => {
    setIsActive(val);
    await onSave(buildPayload({ isActive: val }));
  };

  const handleSave = async () => {
    setBusy(true);
    await onSave(buildPayload());
    setBusy(false);
    setExpanded(false);
  };

  return (
    <div style={{ border: `0.5px solid ${isActive ? "rgba(0,0,0,0.1)" : "rgba(0,0,0,0.06)"}`, borderRadius: 12, padding: "12px 16px", background: isActive ? "#fff" : "rgba(0,0,0,0.025)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: isActive ? "#22c55e" : "rgba(0,0,0,0.18)", flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 500, flex: 1, color: isActive ? "inherit" : "rgba(0,0,0,0.4)" }}>{label}</span>
        <span style={{ fontSize: 11, background: "rgba(0,0,0,0.05)", borderRadius: 6, padding: "2px 8px", color: "rgba(0,0,0,0.4)", whiteSpace: "nowrap" }}>
          {mode === "radius" ? `${radiusKm} km` : "Text"}
        </span>
        <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", userSelect: "none" }}>
          <input type="checkbox" checked={isActive} onChange={(e) => void handleActiveToggle(e.target.checked)} />
          <span style={{ fontSize: 12, color: "rgba(0,0,0,0.45)" }}>Aktiv</span>
        </label>
        <button type="button" className="admin-c-btn-sec" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Schliessen" : "Bearbeiten"}
        </button>
        {onDelete ? <button type="button" style={{ border: "none", background: "none", cursor: "pointer", color: "rgba(200,0,0,0.5)", fontSize: 18, lineHeight: 1, padding: "0 2px" }} onClick={() => onDelete(initial.id, label)}>×</button> : null}
      </div>
      <p style={{ fontSize: 12, color: "rgba(0,0,0,0.35)", margin: "4px 0 0 18px" }}>
        {mode === "radius" ? `${centerLat}, ${centerLng}` : termsStr || "—"}
      </p>
      {expanded ? (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "0.5px solid rgba(0,0,0,0.07)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, maxWidth: 500, alignItems: "end" }}>
            <label className="admin-form-label">
              Bezeichnung
              <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={label} onChange={(e) => setLabel(e.target.value)} />
            </label>
            <select className="admin-input" style={{ marginBottom: 1 }} value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="radius">Radius</option>
              <option value="substring">Text</option>
            </select>
          </div>
          {mode === "radius" ? (
            <div style={{ marginTop: 10, maxWidth: 500 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.7fr", gap: 8 }}>
                <label className="admin-form-label">lat<input className="admin-input" style={{ display: "block", marginTop: 4 }} value={centerLat} onChange={(e) => setCenterLat(e.target.value)} /></label>
                <label className="admin-form-label">lng<input className="admin-input" style={{ display: "block", marginTop: 4 }} value={centerLng} onChange={(e) => setCenterLng(e.target.value)} /></label>
                <label className="admin-form-label">km<input className="admin-input" style={{ display: "block", marginTop: 4 }} value={radiusKm} onChange={(e) => setRadiusKm(e.target.value)} /></label>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "flex-end" }}>
                <label className="admin-form-label" style={{ flex: 1 }}>
                  Koordinaten per Adresse
                  <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={geoQ} onChange={(e) => setGeoQ(e.target.value)} placeholder="Adresse eingeben" />
                </label>
                <button type="button" className="admin-c-btn-sec" style={{ marginBottom: 1 }} disabled={geoBusy} onClick={async () => {
                  const q = (geoQ || label).trim(); if (!q) return;
                  setGeoBusy(true); setGeoMsg("");
                  try { const c = await geocodeQuery(q); setCenterLat(String(c.lat)); setCenterLng(String(c.lng)); setGeoMsg("Koordinaten übernommen."); }
                  catch { setGeoMsg("Nicht gefunden — bitte manuell eingeben."); }
                  finally { setGeoBusy(false); }
                }}>{geoBusy ? "..." : "Ermitteln"}</button>
              </div>
              {geoMsg ? <p className="admin-table-sub" style={{ marginTop: 4 }}>{geoMsg}</p> : null}
            </div>
          ) : (
            <label className="admin-form-label" style={{ display: "block", marginTop: 10, maxWidth: 500 }}>
              Suchbegriffe
              <input className="admin-input" style={{ display: "block", marginTop: 4 }} value={termsStr} onChange={(e) => setTermsStr(e.target.value)} placeholder="esslingen, esslingen am neckar" />
            </label>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14 }}>
            <button type="button" className="admin-m-btn-pri" onClick={handleSave} disabled={busy}>{busy ? "..." : "Speichern"}</button>
            <button type="button" className="admin-c-btn-sec" onClick={() => setExpanded(false)}>Abbrechen</button>
            <label style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: "auto", cursor: "pointer" }}>
              <span style={{ fontSize: 12, color: "rgba(0,0,0,0.4)" }}>Reihenfolge</span>
              <input className="admin-input" style={{ width: 52 }} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}
