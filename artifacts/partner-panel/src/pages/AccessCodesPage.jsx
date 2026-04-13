import { useCallback, useEffect, useMemo, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";

const CODE_TYPES = [
  { value: "general", label: "Allgemein" },
  { value: "hotel", label: "Hotel" },
  { value: "company", label: "Firma / Auftraggeber" },
  { value: "voucher", label: "Gutschein / Kostenübernahme" },
];

function hasPerm(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

function typeLabel(t) {
  const row = CODE_TYPES.find((x) => x.value === t);
  return row ? row.label : t ?? "—";
}

/** Lesbarer Status für Liste (Kostenübernahme ↔ Fahrten über access_code_id). */
function usageStatus(row) {
  if (row.publicStatusLabel && row.publicStatus) {
    const tone =
      row.publicStatus === "reserved"
        ? "pending"
        : row.publicStatus === "redeemed" || row.publicStatus === "expired"
          ? "warn"
          : row.publicStatus === "cancelled"
            ? "muted"
            : "ok";
    return { label: row.publicStatusLabel, tone };
  }
  const now = Date.now();
  if (!row.isActive) return { label: "Deaktiviert", tone: "muted" };
  if (row.validFrom) {
    const t = new Date(row.validFrom).getTime();
    if (Number.isFinite(t) && t > now) return { label: "Noch nicht gültig", tone: "pending" };
  }
  if (row.validUntil) {
    const t = new Date(row.validUntil).getTime();
    if (Number.isFinite(t) && t < now) return { label: "Abgelaufen", tone: "warn" };
  }
  if (row.maxUses != null && row.usesCount >= row.maxUses) {
    return { label: "Kontingent aufgebraucht", tone: "warn" };
  }
  return { label: "Aktiv", tone: "ok" };
}

function fmtShort(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

function normalizeIsoDateInput(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
  if (de) {
    const day = de[1].padStart(2, "0");
    const month = de[2].padStart(2, "0");
    const yy = de[3];
    const year = yy.length === 2 ? `20${yy}` : yy;
    return `${year}-${month}-${day}`;
  }
  return s;
}

export default function AccessCodesPage() {
  const { token, user } = usePanelAuth();
  const canManage = hasPerm(user?.permissions, "access_codes.manage");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [formMsg, setFormMsg] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [codeMode, setCodeMode] = useState("generate");
  const [revealedCode, setRevealedCode] = useState(null);
  const [form, setForm] = useState({
    code: "",
    codeType: "general",
    label: "",
    internalNote: "",
    maxUses: "",
    validFrom: "",
    validUntil: "",
  });

  const load = useCallback(async () => {
    if (!token) return;
    setErr("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/panel/v1/access-codes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setErr("Liste konnte nicht geladen werden.");
        setItems([]);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setErr("Liste konnte nicht geladen werden.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setFormMsg("Kopieren nicht möglich — bitte manuell markieren.");
    }
  }

  async function onCreate(e) {
    e.preventDefault();
    if (!token || !canManage) return;
    setFormMsg("");
    const maxUsesRaw = String(form.maxUses).trim();
    const maxUses =
      maxUsesRaw === "" ? undefined : Number(maxUsesRaw.replace(",", "."));
    if (maxUsesRaw !== "" && (!Number.isFinite(maxUses) || maxUses < 1)) {
      setFormMsg("Max. Nutzungen: leer oder Zahl ≥ 1.");
      return;
    }
    if (codeMode === "manual" && !form.code.trim()) {
      setFormMsg("Bitte einen Code eingeben oder „Generieren“ wählen.");
      return;
    }
    try {
      const body = {
        generateCode: codeMode === "generate",
        codeType: form.codeType,
        ...(codeMode === "manual" ? { code: form.code.trim() } : {}),
        ...(form.label.trim() ? { label: form.label.trim() } : {}),
        ...(form.internalNote.trim() ? { internalNote: form.internalNote.trim() } : {}),
        ...(maxUses !== undefined ? { maxUses } : {}),
        ...(form.validFrom.trim() ? { validFrom: normalizeIsoDateInput(form.validFrom) } : {}),
        ...(form.validUntil.trim() ? { validUntil: normalizeIsoDateInput(form.validUntil) } : {}),
      };
      const res = await fetch(`${API_BASE}/panel/v1/access-codes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        if (data?.error === "code_duplicate") setFormMsg("Dieser Code ist bereits vergeben.");
        else if (data?.error === "code_required") setFormMsg("Code fehlt.");
        else if (data?.error === "code_type_invalid") setFormMsg("Ungültiger Typ.");
        else if (data?.error === "code_generate_failed") setFormMsg("Generierung fehlgeschlagen — bitte erneut versuchen.");
        else if (data?.error === "valid_from_invalid") setFormMsg("Gültig ab ist ungültig (ISO: YYYY-MM-DD).");
        else if (data?.error === "valid_until_invalid") setFormMsg("Gültig bis ist ungültig (ISO: YYYY-MM-DD).");
        else setFormMsg("Anlegen fehlgeschlagen.");
        return;
      }
      setForm({
        code: "",
        codeType: "general",
        label: "",
        internalNote: "",
        maxUses: "",
        validFrom: "",
        validUntil: "",
      });
      setFormMsg("");
      if (typeof data.revealedCode === "string" && data.revealedCode.length > 0) {
        setRevealedCode(data.revealedCode);
      } else {
        setFormMsg("Code gespeichert.");
      }
      await load();
    } catch {
      setFormMsg("Anlegen fehlgeschlagen.");
    }
  }

  async function toggleActive(row, nextActive) {
    if (!token || !canManage) return;
    setBusyId(row.id);
    setErr("");
    try {
      const res = await fetch(`${API_BASE}/panel/v1/access-codes/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive: nextActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setErr("Status konnte nicht geändert werden.");
        return;
      }
      await load();
    } catch {
      setErr("Status konnte nicht geändert werden.");
    } finally {
      setBusyId(null);
    }
  }

  const modal = useMemo(() => {
    if (!revealedCode) return null;
    return (
      <div
        className="panel-modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="revealed-code-title"
      >
        <div className="panel-modal">
          <h3 id="revealed-code-title" className="panel-modal__title">
            Ihr Freigabe-Code
          </h3>
          <p className="panel-modal__text">
            Einmalig anzeigen. Kopieren und sicher weitergeben — bei Buchungen mit diesem Code übernimmt der
            hinterlegte Kostenträger gemäß Regeln.
          </p>
          <div className="panel-revealed-code">{revealedCode}</div>
          <div className="panel-modal__actions">
            <button type="button" className="panel-btn-primary" onClick={() => void copyText(revealedCode)}>
              In Zwischenablage
            </button>
            <button type="button" className="panel-btn-secondary" onClick={() => setRevealedCode(null)}>
              Schließen
            </button>
          </div>
        </div>
      </div>
    );
  }, [revealedCode]);

  return (
    <div className="panel-page panel-page--access-codes">
      {modal}
      <h2 className="panel-page__title">Freigabe-Codes</h2>
      <p className="panel-page__lead">
        Digitale Kostenübernahme: Code bei der Buchung angeben — die Fahrt ist dann mit diesem Code verknüpft.
      </p>

      {err ? <p className="panel-page__warn">{err}</p> : null}

      {canManage ? (
        <div className="panel-card panel-card--wide">
          <h3 className="panel-card__title">Neuer Code</h3>
          <form className="panel-rides-form" onSubmit={onCreate}>
            <div className="panel-rides-form__grid">
              <fieldset className="panel-rides-form__field panel-rides-form__field--2" style={{ border: "none", padding: 0, margin: 0 }}>
                <legend className="panel-fieldset-legend">Code</legend>
                <label className="panel-radio-line">
                  <input
                    type="radio"
                    name="codeMode"
                    checked={codeMode === "generate"}
                    onChange={() => setCodeMode("generate")}
                  />
                  <span>Vom System generieren (empfohlen)</span>
                </label>
                <label className="panel-radio-line">
                  <input
                    type="radio"
                    name="codeMode"
                    checked={codeMode === "manual"}
                    onChange={() => setCodeMode("manual")}
                  />
                  <span>Eigenen Code festlegen</span>
                </label>
              </fieldset>
              {codeMode === "manual" ? (
                <label className="panel-rides-form__field panel-rides-form__field--2">
                  <span>Code</span>
                  <input
                    value={form.code}
                    onChange={(ev) => setForm((f) => ({ ...f, code: ev.target.value }))}
                    autoComplete="off"
                    placeholder="Wird in Großbuchstaben ohne Leerzeichen gespeichert"
                  />
                </label>
              ) : null}
              <label className="panel-rides-form__field">
                <span>Typ</span>
                <select
                  value={form.codeType}
                  onChange={(ev) => setForm((f) => ({ ...f, codeType: ev.target.value }))}
                >
                  {CODE_TYPES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="panel-rides-form__field">
                <span>Anzeige für Fahrer (optional)</span>
                <input
                  value={form.label}
                  onChange={(ev) => setForm((f) => ({ ...f, label: ev.target.value }))}
                  placeholder="z. B. Hotel Mitte — Gästefahrten"
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Notiz (intern, optional)</span>
                <input
                  value={form.internalNote}
                  onChange={(ev) => setForm((f) => ({ ...f, internalNote: ev.target.value }))}
                  placeholder="Nur intern sichtbar (z. B. Ansprechpartner)"
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Max. Nutzungen</span>
                <input
                  value={form.maxUses}
                  onChange={(ev) => setForm((f) => ({ ...f, maxUses: ev.target.value }))}
                  placeholder="leer = unbegrenzt"
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Gültig ab (optional, ISO)</span>
                <input
                  type="date"
                  value={form.validFrom}
                  onChange={(ev) => setForm((f) => ({ ...f, validFrom: ev.target.value }))}
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Gültig bis (optional, ISO)</span>
                <input
                  type="date"
                  value={form.validUntil}
                  onChange={(ev) => setForm((f) => ({ ...f, validUntil: ev.target.value }))}
                />
              </label>
            </div>
            {formMsg ? (
              <p className={formMsg.includes("fehl") ? "panel-page__warn" : "panel-page__ok"}>{formMsg}</p>
            ) : null}
            <button type="submit" className="panel-btn-primary">
              {codeMode === "generate" ? "Code erzeugen" : "Code speichern"}
            </button>
          </form>
        </div>
      ) : (
        <p className="panel-page__lead">Sie sehen die Liste; Anlegen und Deaktivieren nur mit erweiterten Rechten.</p>
      )}

      <div className="panel-rides-toolbar">
        <button type="button" className="panel-btn-secondary" disabled={loading} onClick={() => void load()}>
          Aktualisieren
        </button>
      </div>

      <div className="panel-card panel-card--wide panel-card--table">
        <h3 className="panel-card__title">Übersicht</h3>
        {loading ? <p className="panel-page__lead">Lade …</p> : null}
        {!loading && items.length === 0 ? <p className="panel-page__lead">Keine Codes.</p> : null}
        {!loading && items.length > 0 ? (
          <div className="panel-table-wrap">
            <table className="panel-table">
              <thead>
                <tr>
                  <th>Code (intern)</th>
                  <th>Typ</th>
                  <th>Anzeige</th>
                  <th>Notiz</th>
                  <th>Nutzungen</th>
                  <th>Zeitraum</th>
                  <th>Status</th>
                  {canManage ? <th>Aktion</th> : null}
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const st = usageStatus(row);
                  return (
                    <tr key={row.id}>
                      <td className="panel-table__muted" title="Gespeicherte Form für Abgleich bei Buchungen">
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                          <span>{row.codeNormalized}</span>
                          <button
                            type="button"
                            className="panel-btn-text"
                            title="Code kopieren"
                            aria-label={`Code ${row.codeNormalized} kopieren`}
                            onClick={() => void copyText(row.codeNormalized)}
                          >
                            ⧉
                          </button>
                        </span>
                      </td>
                      <td>{typeLabel(row.codeType)}</td>
                      <td>{row.label || "—"}</td>
                      <td className="panel-table__muted">{row.internalNote || "—"}</td>
                      <td className="panel-table__muted">
                        {row.maxUses != null ? `${row.usesCount} / ${row.maxUses}` : `${row.usesCount} / ∞`}
                      </td>
                      <td className="panel-table__muted">
                        {fmtShort(row.validFrom)} — {fmtShort(row.validUntil)}
                      </td>
                      <td title={row.reservedRideId ? `Gebunden an Fahrt ${row.reservedRideId}` : ""}>
                        <span
                          className={
                            st.tone === "ok"
                              ? "panel-pill panel-pill--ok"
                              : st.tone === "warn"
                                ? "panel-pill panel-pill--warn"
                                : st.tone === "pending"
                                  ? "panel-pill panel-pill--pending"
                                  : "panel-pill panel-pill--muted"
                          }
                        >
                          {st.label}
                        </span>
                      </td>
                      {canManage ? (
                        <td>
                          <button
                            type="button"
                            className="panel-btn-secondary"
                            disabled={busyId === row.id}
                            onClick={() => void toggleActive(row, !row.isActive)}
                          >
                            {row.isActive ? "Deaktivieren" : "Aktivieren"}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
