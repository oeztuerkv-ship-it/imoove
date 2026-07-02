import { useCallback, useEffect, useState } from "react";
import AdminCollapsibleSection from "../components/AdminCollapsibleSection.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const AUDIT_URL = `${API_BASE}/admin/finance/audit`;
const PAGE_SIZE = 25;

const ENTITY_TYPE_OPTIONS = [
  { value: "", label: "Alle" },
  { value: "ride_financial", label: "Finanz-Snapshot (Fahrt)" },
  { value: "ride", label: "Fahrt" },
  { value: "invoice", label: "Rechnung" },
  { value: "settlement", label: "Unternehmer-Abrechnung" },
  { value: "payment", label: "Zahlung" },
];

const ACTION_OPTIONS = [
  { value: "", label: "Alle" },
  { value: "snapshot_created", label: "Snapshot angelegt" },
  { value: "snapshot_updated", label: "Snapshot aktualisiert" },
  { value: "snapshot_locked", label: "Snapshot gesperrt" },
  { value: "snapshot_corrected", label: "Snapshot korrigiert" },
  { value: "correction_started", label: "Korrektur gestartet" },
  { value: "status_changed", label: "Status geändert" },
  { value: "payout_line_marked_ausgezahlt", label: "Auszahlung als ausgezahlt markiert" },
  { value: "invoice_marked_paid", label: "Rechnung als bezahlt markiert" },
];

const ENTITY_TYPE_LABELS = Object.fromEntries(
  ENTITY_TYPE_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]),
);

const ACTION_LABELS = Object.fromEntries(ACTION_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]));

function entityTypeDe(value) {
  const k = String(value ?? "").trim();
  return ENTITY_TYPE_LABELS[k] || k || "—";
}

function actionDe(value) {
  const k = String(value ?? "").trim();
  return ACTION_LABELS[k] || k || "—";
}

function actorTypeDe(value) {
  const m = {
    system: "System",
    admin: "Plattform-Admin",
    driver: "Fahrer",
    partner: "Partner",
    passenger: "Kunde",
  };
  const k = String(value ?? "").trim();
  return m[k] || k || "—";
}

export default function FinanceAuditPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams();
      q.set("page", String(page));
      q.set("pageSize", String(PAGE_SIZE));
      if (entityType.trim()) q.set("entity_type", entityType.trim());
      if (action.trim()) q.set("action", action.trim());
      const res = await fetch(`${AUDIT_URL}?${q.toString()}`, { headers: adminApiHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.ok) throw new Error("invalid_response");
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total ?? 0));
    } catch {
      setItems([]);
      setTotal(0);
      setError("Finanz-Protokoll konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [page, entityType, action]);

  useEffect(() => {
    void load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="admin-page admin-page--loose admin-page--content">
      <p className="admin-page-lead">Finanz-Änderungsprotokoll mit Filter und Verlauf — nur Lesen.</p>

      {error ? (
        <section className="admin-section-block">
          <div className="admin-section-block__body">
            <div className="admin-error-banner admin-info-banner--inline">{error}</div>
          </div>
        </section>
      ) : null}

      <AdminCollapsibleSection title="Finanz-Protokoll" subtitle="Nur Lesen" defaultOpen>
        <div className="admin-filter-toolbar admin-filter-toolbar--modern admin-filter-toolbar--search-wide">
          <label className="admin-filter-field">
            <span className="admin-field-label">Objekttyp</span>
            <select
              className="admin-select"
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                setPage(1);
              }}
            >
              {ENTITY_TYPE_OPTIONS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-filter-field">
            <span className="admin-field-label">Aktion</span>
            <select
              className="admin-select"
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
            >
              {ACTION_OPTIONS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="admin-btn-refresh admin-filter-toolbar--modern__refresh" onClick={() => void load()} disabled={loading}>
            {loading ? "Lade …" : "Aktualisieren"}
          </button>
        </div>
        <div className="admin-table-card admin-table-card--embedded">
          <div className="admin-table-scroll">
            <div className="admin-table-row admin-table-row--head">
              <div>Zeit</div>
              <div>Objekttyp</div>
              <div>Objekt-ID</div>
              <div>Aktion</div>
              <div>Auslöser</div>
            </div>
            {items.map((x) => (
              <div className="admin-table-row" key={x.id}>
                <div>{x.created_at ? new Date(x.created_at).toLocaleString("de-DE") : "—"}</div>
                <div title={x.entity_type}>{entityTypeDe(x.entity_type)}</div>
                <div className="admin-mono">{x.entity_id}</div>
                <div title={x.action}>{actionDe(x.action)}</div>
                <div>
                  {actorTypeDe(x.actor_type)}
                  {x.actor_id ? ` · ${x.actor_id}` : ""}
                </div>
              </div>
            ))}
            {!loading && items.length === 0 ? <div className="admin-info-banner">Keine Protokoll-Einträge gefunden.</div> : null}
          </div>
        </div>
        <div className="admin-pagination admin-pagination--inset">
          <button className="admin-page-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Zurück
          </button>
          <span className="admin-page-dots">
            Seite {page} / {pages}
          </span>
          <button className="admin-page-btn" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>
            Weiter
          </button>
        </div>
      </AdminCollapsibleSection>
    </div>
  );
}
