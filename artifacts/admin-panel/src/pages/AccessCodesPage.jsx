import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const LIST_URL = `${API_BASE}/admin/access-codes`;
const CREATE_URL = `${API_BASE}/admin/access-codes`;
const COMPANIES_URL = `${API_BASE}/admin/companies`;

const CODE_TYPES = [
  { value: "general", label: "Fahrcode" },
  { value: "voucher", label: "Gutschein" },
  { value: "hotel", label: "Hotel" },
  { value: "company", label: "Firma" },
];

function codeTypeLabel(t) {
  const m = { voucher: "Gutschein", hotel: "Hotel", company: "Firma", general: "Fahrcode" };
  return m[t] ?? t ?? "—";
}

function truncate(s, max) {
  if (!s) return "";
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

export default function AccessCodesPage() {
  const [items, setItems] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState("");

  const [form, setForm] = useState({
    generateCode: true,
    code: "",
    codeType: "general",
    companyId: "",
    label: "",
    internalNote: "",
    maxUses: "",
    validFrom: "",
    validUntil: "",
  });

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(LIST_URL, { headers: adminApiHeaders() });
      if (!res.ok) throw new Error(`Codes konnten nicht geladen werden (${res.status}).`);
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(COMPANIES_URL, { headers: adminApiHeaders() });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data?.ok && Array.isArray(data.items)) setCompanies(data.items);
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setRevealed("");

    const maxUsesRaw = form.maxUses.trim();
    const maxUses =
      maxUsesRaw === "" ? undefined : Number.isFinite(Number(maxUsesRaw)) ? Number(maxUsesRaw) : undefined;
    if (maxUsesRaw !== "" && (maxUses === undefined || maxUses < 1)) {
      setError("Max. Nutzungen: leer oder positive Zahl.");
      return;
    }

    if (!form.generateCode && !form.code.trim()) {
      setError("Bitte einen Code eingeben oder „Code erzeugen“ aktivieren.");
      return;
    }

    setSaving(true);
    try {
      const vf =
        form.validFrom.trim() && !Number.isNaN(Date.parse(form.validFrom))
          ? new Date(form.validFrom).toISOString()
          : undefined;
      const vu =
        form.validUntil.trim() && !Number.isNaN(Date.parse(form.validUntil))
          ? new Date(form.validUntil).toISOString()
          : undefined;

      const body = {
        generateCode: form.generateCode,
        code: form.generateCode ? "" : form.code.trim(),
        codeType: form.codeType,
        companyId: form.companyId.trim() || undefined,
        label: form.label.trim() || undefined,
        internalNote: form.internalNote.trim() || undefined,
        maxUses,
        validFrom: vf,
        validUntil: vu,
      };

      const res = await fetch(CREATE_URL, {
        method: "POST",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `Anlegen fehlgeschlagen (${res.status}).`);
      }
      if (data?.revealedCode) setRevealed(String(data.revealedCode));
      await loadList();
      setForm((f) => ({
        ...f,
        code: "",
        label: "",
        internalNote: "",
        maxUses: "",
        validFrom: "",
        validUntil: "",
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  function companyName(id) {
    if (!id) return "—";
    return companies.find((c) => c.id === id)?.name ?? id;
  }

  return (
    <div className="admin-page admin-page--loose">
      {error ? <div className="admin-error-banner">{error}</div> : null}
      {revealed ? (
        <div className="admin-info-banner">
          Neu erzeugter Code (nur hier sichtbar): <strong className="admin-mono">{revealed}</strong>
        </div>
      ) : null}

      <div className="admin-panel-card">
        <div className="admin-panel-card__title">Zugangscode anlegen</div>
        <form onSubmit={handleCreate} className="admin-form-vertical">
          <div className="admin-inline-check">
            <input
              type="checkbox"
              id="ac-gen"
              checked={form.generateCode}
              onChange={(e) => setForm((f) => ({ ...f, generateCode: e.target.checked }))}
            />
            <label htmlFor="ac-gen">Code automatisch erzeugen (empfohlen)</label>
          </div>

          {!form.generateCode ? (
            <div className="admin-form-pair">
              <span className="admin-field-label">Code</span>
              <input
                className="admin-input"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                autoComplete="off"
              />
            </div>
          ) : null}

          <div className="admin-form-pair">
            <span className="admin-field-label">Typ</span>
            <select
              className="admin-select"
              value={form.codeType}
              onChange={(e) => setForm((f) => ({ ...f, codeType: e.target.value }))}
            >
              {CODE_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-form-pair">
            <span className="admin-field-label">Mandant</span>
            <select
              className="admin-select"
              value={form.companyId}
              onChange={(e) => setForm((f) => ({ ...f, companyId: e.target.value }))}
            >
              <option value="">— Plattformweit —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-form-pair">
            <span className="admin-field-label">Anzeige-Label</span>
            <input
              className="admin-input"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="z. B. Hotel XY – Lobby"
            />
          </div>

          <div className="admin-form-pair">
            <span className="admin-field-label">Interne Notiz</span>
            <textarea
              className="admin-textarea"
              rows={3}
              value={form.internalNote}
              onChange={(e) => setForm((f) => ({ ...f, internalNote: e.target.value }))}
              placeholder="Zweck, Kampagne, Kontext — nur im Admin sichtbar"
            />
          </div>

          <div className="admin-form-pair">
            <span className="admin-field-label">Max. Nutzungen</span>
            <input
              className="admin-input"
              value={form.maxUses}
              onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))}
              placeholder="leer = unbegrenzt"
            />
          </div>

          <div className="admin-form-pair">
            <span className="admin-field-label">Gültig ab</span>
            <input
              className="admin-input"
              type="datetime-local"
              value={form.validFrom}
              onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
            />
          </div>

          <div className="admin-form-pair">
            <span className="admin-field-label">Gültig bis</span>
            <input
              className="admin-input"
              type="datetime-local"
              value={form.validUntil}
              onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
            />
          </div>

          <div className="admin-toolbar-row">
            <button type="submit" className="admin-btn-primary" disabled={saving}>
              {saving ? "Speichern …" : "Code anlegen"}
            </button>
            <button type="button" className="admin-btn-refresh" onClick={() => void loadList()} disabled={loading}>
              Liste aktualisieren
            </button>
          </div>
        </form>
      </div>

      <div className="admin-panel-card">
        <div className="admin-panel-card__title">Alle Codes</div>
        {loading ? (
          <div className="admin-muted">Wird geladen …</div>
        ) : (
          <div className="admin-data-table admin-data-table--access-codes">
            <div className="admin-data-table__head admin-cs-grid admin-cs-grid--access-codes">
              <div>Code (Hash)</div>
              <div>Typ</div>
              <div>Mandant</div>
              <div>Label</div>
              <div>Notiz</div>
              <div>Nutzung</div>
              <div>Status</div>
            </div>
            {items.map((row) => (
              <div key={row.id} className="admin-data-table__row admin-cs-grid admin-cs-grid--access-codes">
                <div className="admin-mono admin-ellipsis" title={row.codeNormalized}>
                  {truncate(row.codeNormalized, 28)}
                </div>
                <div>{codeTypeLabel(row.codeType)}</div>
                <div className="admin-ellipsis" title={companyName(row.companyId)}>
                  {companyName(row.companyId)}
                </div>
                <div className="admin-ellipsis" title={row.label || ""}>
                  {row.label || "—"}
                </div>
                <div className="admin-ellipsis admin-muted" title={row.internalNote || ""}>
                  {row.internalNote ? truncate(row.internalNote, 48) : "—"}
                </div>
                <div className="admin-mono">
                  {row.maxUses != null ? `${row.usesCount} / ${row.maxUses}` : `${row.usesCount}`}
                </div>
                <div>{row.isActive ? "aktiv" : "inaktiv"}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
