import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminFetch } from "../lib/adminApiHeaders.js";

const BASE = `${API_BASE}/admin/customer-accounts`;

function formatDt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

async function readJson(res) {
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { _raw: text };
    }
  }
  return { data, text };
}

export default function CustomerAccountsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminFetch(BASE);
      const { data } = await readJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="admin-page admin-page--content">
      <p className="admin-page-lead">
        Registrierte Endkunden per E-Mail und Passwort — getrennt von Google- und Apple-Anmeldung.
      </p>

      <div className="admin-filter-toolbar admin-filter-toolbar--modern admin-filter-toolbar--single" style={{ maxWidth: 220, marginBottom: 16 }}>
        <button type="button" className="admin-btn-refresh" onClick={() => void load()} disabled={loading}>
          {loading ? "Lade …" : "Aktualisieren"}
        </button>
      </div>

      {error ? <div className="admin-error-banner">{error}</div> : null}

      <div className="admin-table-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>E-Mail</th>
              <th>Name</th>
              <th>E-Mail bestätigt</th>
              <th>Registriert</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading ? (
              <tr>
                <td colSpan={4}>Noch keine Kundenkonten.</td>
              </tr>
            ) : null}
            {items.map((row) => (
              <tr key={row.id}>
                <td>{row.email}</td>
                <td>{row.name}</td>
                <td>{formatDt(row.emailVerifiedAt)}</td>
                <td>{formatDt(row.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="admin-table-toolbar__info" style={{ marginTop: 12 }}>
        {items.length} Konto{items.length === 1 ? "" : "en"} (max. 500 neueste).
      </p>
    </div>
  );
}
