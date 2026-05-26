import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const AUDIT_URL = `${API_BASE}/admin/finance/audit`;
const PAGE_SIZE = 25;

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
      setError("Finance-Audit konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [page, entityType, action]);

  useEffect(() => {
    void load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="admin-page admin-page--loose">
      {error ? <div className="admin-error-banner">{error}</div> : null}
      <div className="admin-panel-card">
        <div className="admin-panel-card__title">Finance Audit (read only)</div>
        <div className="admin-table-toolbar">
          <input className="admin-input" placeholder="entity_type (z. B. ride_financial)" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} />
          <input className="admin-input" placeholder="action (z. B. snapshot_updated)" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} />
          <button type="button" className="admin-btn-refresh" onClick={() => void load()} disabled={loading}>
            {loading ? "Lade …" : "Aktualisieren"}
          </button>
        </div>
        <div className="admin-table-card">
          <div className="admin-table-scroll">
            <div className="admin-table-row admin-table-row--head">
              <div>Zeit</div><div>Entity</div><div>Entity ID</div><div>Action</div><div>Actor</div>
            </div>
            {items.map((x) => (
              <div className="admin-table-row" key={x.id}>
                <div>{x.created_at ? new Date(x.created_at).toLocaleString("de-DE") : "—"}</div>
                <div>{x.entity_type}</div>
                <div className="admin-mono">{x.entity_id}</div>
                <div>{x.action}</div>
                <div>{x.actor_type}{x.actor_id ? ` · ${x.actor_id}` : ""}</div>
              </div>
            ))}
            {!loading && items.length === 0 ? <div className="admin-info-banner">Keine Audit-Einträge gefunden.</div> : null}
          </div>
        </div>
        <div className="admin-pagination">
          <button className="admin-page-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Zurück</button>
          <span className="admin-page-dots">Seite {page} / {pages}</span>
          <button className="admin-page-btn" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>Weiter</button>
        </div>
      </div>
    </div>
  );
}
