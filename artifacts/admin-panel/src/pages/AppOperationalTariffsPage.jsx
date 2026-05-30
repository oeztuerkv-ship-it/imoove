import AdminCollapsibleSection from "../components/AdminCollapsibleSection.jsx";
import TarifBlock from "../components/TarifBlock.jsx";
import CollapsibleCard from "../components/CollapsibleCard.jsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";
import {
  buildRegionPayloadFromEditor,
  buildTariffTemplateRecord,
  countTariffUsageInRegions,
  emptySurcharge,
  getTariffCatalog,
  loadEditorFromTariff,
  tierDefaults,
} from "../lib/appOperationalTariffUtils.js";

const URL = `${API_BASE}/admin/app-operational`;
const PREVIEW = `${URL}/preview-tariff-estimate`;

function usageLabel(count) {
  if (count <= 0) return null;
  if (count === 1) return "Verwendet in 1 Gebiet";
  return `Verwendet in ${count} Gebieten`;
}

export default function AppOperationalTariffsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [config, setConfig] = useState(null);
  const [tariffs, setTariffs] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [tariffsActive, setTariffsActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const editorRef = useRef(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [stdForm, setStdForm] = useState(() => tierDefaults());
  const [xlSurchargeEur, setXlSurchargeEur] = useState("7");
  const [wcSurchargeEur, setWcSurchargeEur] = useState("0");
  const [surchargeForms, setSurchargeForms] = useState({
    night: { ...emptySurcharge },
    weekend: { ...emptySurcharge },
    holiday: { ...emptySurcharge },
  });

  const [preview, setPreview] = useState(null);
  const [prevBusy, setPrevBusy] = useState(false);
  const [pvVehicle, setPvVehicle] = useState("standard");

  const usageByTariff = useMemo(() => {
    const map = {};
    for (const t of tariffs) {
      map[t.id] = countTariffUsageInRegions(config, t.id);
    }
    return map;
  }, [config, tariffs]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(URL, { headers: adminApiHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Laden fehlgeschlagen");
      setConfig(data.config);
      setTariffs(getTariffCatalog(data.config));
      if (data.config?.tariffs?.active !== undefined) {
        setTariffsActive(data.config.tariffs.active !== false);
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

  const selectedTariff = useMemo(() => tariffs.find((t) => t.id === selectedId) ?? null, [tariffs, selectedId]);

  useEffect(() => {
    if (!selectedTariff) return;
    const ed = loadEditorFromTariff(selectedTariff);
    setName(selectedTariff.name || "");
    setDescription(ed.description);
    setValidFrom(ed.validFrom);
    setStdForm(ed.stdForm);
    setXlSurchargeEur(ed.xlSurchargeEur);
    setWcSurchargeEur(ed.wcSurchargeEur);
    setSurchargeForms(ed.surchargeForms);
  }, [selectedTariff]);

  const editorState = useMemo(
    () => ({ stdForm, xlSurchargeEur, wcSurchargeEur, surchargeForms, validFrom }),
    [stdForm, xlSurchargeEur, wcSurchargeEur, surchargeForms, validFrom],
  );

  const patchOperational = async (body) => {
      const res = await fetch(URL, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Speichern fehlgeschlagen");
    setConfig(data.config);
    setTariffs(getTariffCatalog(data.config));
    return data;
  };

  const saveTariffCatalog = async (nextCatalog, msg = "Gespeichert.") => {
    setBusy(true);
    setError("");
    try {
      await patchOperational({ tariffTemplates: nextCatalog });
      setOk(msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  };

  const scrollToEditor = () => {
    requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const startNewTariff = () => {
    setSelectedId("");
    setName("");
    setDescription("");
    setValidFrom("");
    setStdForm(tierDefaults());
    setXlSurchargeEur("7");
    setWcSurchargeEur("0");
    setSurchargeForms({
      night: { ...emptySurcharge },
      weekend: { ...emptySurcharge },
      holiday: { ...emptySurcharge },
    });
    setOk("");
    setError("");
    scrollToEditor();
  };

  const editTariff = (id) => {
    setSelectedId(id);
    scrollToEditor();
  };

  const saveCurrentTariff = async () => {
    if (!name.trim()) {
      setError("Name fehlt.");
      return;
    }
    const id = selectedId || Date.now().toString(36);
    const record = buildTariffTemplateRecord(id, { name, description, validFrom }, editorState);
    const exists = tariffs.some((t) => t.id === id);
    const next = exists ? tariffs.map((t) => (t.id === id ? record : t)) : [...tariffs, record];
    await saveTariffCatalog(next);
    if (!selectedId) setSelectedId(id);
  };

  const duplicateTariff = async (id) => {
    const src = tariffs.find((t) => t.id === id);
    if (!src) return;
    const newId = Date.now().toString(36);
    const ed = loadEditorFromTariff(src);
    const record = buildTariffTemplateRecord(
      newId,
      {
        name: `${src.name || "Tarif"} (Kopie)`,
        description: ed.description,
        validFrom: ed.validFrom,
      },
      ed,
    );
    await saveTariffCatalog([...tariffs, record], "Tarif dupliziert.");
    setSelectedId(newId);
    scrollToEditor();
  };

  const deleteTariff = async (id) => {
    const t = tariffs.find((x) => x.id === id);
    const usage = countTariffUsageInRegions(config, id);
    let msg = `Tarif „${t?.name || id}“ löschen?`;
    if (usage > 0) {
      msg = `Tarif wird noch von ${usage} Gebiet${usage === 1 ? "" : "en"} genutzt.\n\nTrotzdem löschen? Zuordnungen werden entfernt.`;
    }
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      const assignments = { ...(config?.regionTariffTemplateIds || {}) };
      for (const [rid, tid] of Object.entries(assignments)) {
        if (tid === id) delete assignments[rid];
      }
      const prevTar = config?.tariffs && typeof config.tariffs === "object" ? { ...config.tariffs } : {};
      const prevBsr =
        prevTar.byServiceRegion && typeof prevTar.byServiceRegion === "object" ? { ...prevTar.byServiceRegion } : {};
      for (const [rid, row] of Object.entries(prevBsr)) {
        if (row?.tariffTemplateId === id) delete prevBsr[rid];
      }
      await patchOperational({
        tariffTemplates: tariffs.filter((x) => x.id !== id),
        regionTariffTemplateIds: assignments,
        tariffs: { ...prevTar, byServiceRegion: prevBsr },
      });
      if (selectedId === id) setSelectedId("");
      setOk("Tarif gelöscht.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  };

  const saveTariffsActive = async () => {
    setBusy(true);
    try {
      const prevTar = config?.tariffs && typeof config.tariffs === "object" ? { ...config.tariffs } : {};
      await patchOperational({ tariffs: { ...prevTar, active: tariffsActive, pricingMode: "taxi_tariff" } });
      setOk("Gespeichert.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async () => {
    setPreview(null);
    setPrevBusy(true);
    setError("");
    try {
      const regionTariff = buildRegionPayloadFromEditor(editorState);
      const res = await fetch(PREVIEW, {
        method: "POST",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          serviceRegionId: null,
          regionTariff,
          distanceKm: 10,
          tripMinutes: 20,
          waitingMinutes: 0,
          vehicle: pvVehicle,
          at: new Date().toISOString(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Vorschau fehlgeschlagen");
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setPrevBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-page admin-page--loose">
        <p className="admin-page-lead">Laden …</p>
      </div>
    );
  }

  const bd =
    preview?.estimate && typeof preview.estimate === "object" ? preview.estimate.breakdown : null;
  const catalogCols = "1.1fr 1fr 0.75fr 1fr 1.35fr";

  return (
    <div className="admin-page admin-page--loose">
      <p className="admin-page-lead">
        Preislogik (Taxameter, Zuschläge) — Tarif-Katalog; Zuordnung zu Gebieten unter „Gebiete“.
      </p>

      {error || ok ? (
        <section className="admin-section-block">
          <div className="admin-section-block__body admin-section-block__body--stack">
            {error ? (
              <div className="admin-info-banner admin-info-banner--error admin-info-banner--inline">{error}</div>
            ) : null}
            {ok ? <div className="admin-info-banner admin-info-banner--ok admin-info-banner--inline">{ok}</div> : null}
          </div>
        </section>
      ) : null}

      <AdminCollapsibleSection title="Preise & Buchung" subtitle="Globaler Schalter für buchbare Preise" defaultOpen>
        <div className="admin-toolbar-inline">
          <label className="admin-toolbar-inline__label">
            <input type="checkbox" checked={tariffsActive} onChange={(e) => setTariffsActive(e.target.checked)} />
            Preise buchbar
          </label>
          <button type="button" className="admin-c-btn-sec" disabled={busy} onClick={() => void saveTariffsActive()}>
            Speichern
          </button>
        </div>
      </AdminCollapsibleSection>

      <AdminCollapsibleSection
        title="Tarif-Katalog"
        subtitle={tariffs.length ? `${tariffs.length} Tarif${tariffs.length === 1 ? "" : "e"}` : "Noch keine Tarife"}
        defaultOpen
      >
        <div className="admin-section-toolbar">
          <button type="button" className="admin-m-btn-pri" onClick={startNewTariff}>
            + Neuer Tarif
          </button>
        </div>

        {tariffs.length > 0 ? (
          <div className="admin-table-card admin-table-card--embedded">
            <div className="admin-table-scroll">
              <div className="admin-table-row admin-table-row--head" style={{ gridTemplateColumns: catalogCols }}>
                <span>Name</span>
                <span>Beschreibung</span>
                <span>gültig ab</span>
                <span>Nutzung</span>
                <span />
              </div>
              {tariffs.map((t) => {
                const usage = usageByTariff[t.id] ?? 0;
                const useLbl = usageLabel(usage);
                const desc = t.description || t.note || "";
                const selected = t.id === selectedId;
                return (
                  <div
                    key={t.id}
                    className={`admin-table-row${selected ? " admin-table-row--selected" : ""}`}
                    style={{ gridTemplateColumns: catalogCols, alignItems: "center" }}
                  >
                    <span className={selected ? "admin-table-row__name" : undefined}>{t.name}</span>
                    <span className="admin-table-cell-muted">{desc || "—"}</span>
                    <span className="admin-table-cell-muted">{t.validFrom || t.regionPayload?.validFrom || "—"}</span>
                    <span className={usage > 0 ? "admin-table-cell-ok" : "admin-table-cell-muted"}>
                      {useLbl || "—"}
                    </span>
                    <span className="admin-table-cell-actions">
                      <button type="button" className="admin-c-btn-sec admin-btn-compact" onClick={() => editTariff(t.id)}>
                        Bearbeiten
                      </button>
                      <button
                        type="button"
                        className="admin-c-btn-sec admin-btn-compact"
                        disabled={busy}
                        onClick={() => void duplicateTariff(t.id)}
                      >
                        Duplizieren
                      </button>
                      <button
                        type="button"
                        className="admin-c-btn-sec admin-btn-compact admin-btn-compact--danger"
                        disabled={busy}
                        onClick={() => void deleteTariff(t.id)}
                      >
                        Löschen
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="admin-table-sub">Noch keine Tarife — „+ Neuer Tarif“ legt den ersten an.</p>
        )}
      </AdminCollapsibleSection>

      <div ref={editorRef}>
        <CollapsibleCard title={selectedId ? "Tarif bearbeiten" : "Neuer Tarif"} defaultOpen>
          <div style={{ display: "grid", gap: 12, marginTop: 12, maxWidth: 560 }}>
            <label className="admin-form-label">
              Name
              <input
                className="admin-input"
                style={{ display: "block", marginTop: 4 }}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="admin-form-label">
              Beschreibung
              <input
                className="admin-input"
                style={{ display: "block", marginTop: 4 }}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="admin-form-label">
              Gültig ab
              <input
                className="admin-input"
                style={{ display: "block", marginTop: 4 }}
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                placeholder="YYYY-MM-DD"
              />
            </label>
          </div>
        </CollapsibleCard>

        <TarifBlock title="Taxameter" value={stdForm} onChange={setStdForm} />

        <CollapsibleCard title="Aufschläge">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 12, maxWidth: 400 }}>
            <label className="admin-form-label">
              XL (€)
              <input
                className="admin-input"
                style={{ display: "block", marginTop: 4 }}
                value={xlSurchargeEur}
                onChange={(e) => setXlSurchargeEur(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <label className="admin-form-label">
              Rollstuhl (€)
              <input
                className="admin-input"
                style={{ display: "block", marginTop: 4 }}
                value={wcSurchargeEur}
                onChange={(e) => setWcSurchargeEur(e.target.value)}
                inputMode="decimal"
              />
            </label>
          </div>
          <div style={{ marginTop: 14, maxWidth: 400 }}>
            {[
              ["night", "Nacht"],
              ["weekend", "Wochenende"],
              ["holiday", "Feiertag"],
            ].map(([key, label]) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={surchargeForms[key].enabled}
                  onChange={(e) =>
                    setSurchargeForms((s) => ({ ...s, [key]: { ...s[key], enabled: e.target.checked } }))
                  }
                />
                <span style={{ minWidth: 88, fontSize: 13 }}>{label}</span>
                <input
                  className="admin-input"
                  style={{ width: 72 }}
                  value={surchargeForms[key].percent}
                  onChange={(e) => setSurchargeForms((s) => ({ ...s, [key]: { ...s[key], percent: e.target.value } }))}
                />
                <span style={{ fontSize: 12, color: "rgba(0,0,0,0.45)" }}>%</span>
              </label>
            ))}
          </div>
      </CollapsibleCard>

        <div className="admin-section-toolbar admin-section-toolbar--start">
          <button type="button" className="admin-m-btn-pri" disabled={busy} onClick={() => void saveCurrentTariff()}>
            {busy ? "…" : selectedId ? "Tarif speichern" : "Tarif anlegen"}
          </button>
        </div>

        <CollapsibleCard title="Beispiel (10 km, 20 Min)">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 10, alignItems: "center" }}>
            <select className="admin-input" value={pvVehicle} onChange={(e) => setPvVehicle(e.target.value)}>
                  <option value="standard">Standard</option>
                  <option value="xl">XL</option>
                  <option value="wheelchair">Rollstuhl</option>
                </select>
            <button type="button" className="admin-c-btn-sec" onClick={() => void runPreview()} disabled={prevBusy}>
              {prevBusy ? "…" : "Rechnen"}
              </button>
            {preview?.estimate ? (
              <span style={{ fontWeight: 600 }}>{String(preview.estimate.taxiTotal ?? preview.estimate.total)} €</span>
            ) : null}
          </div>
          {bd && typeof bd === "object" ? (
            <p className="admin-table-sub" style={{ marginTop: 8 }}>
              Grund {String(bd.baseFare)} € · Strecke {String(bd.distanceCharge)} € · Zeit {String(bd.tripMinutesCharge)} €
            </p>
      ) : null}
        </CollapsibleCard>
      </div>
    </div>
  );
}
