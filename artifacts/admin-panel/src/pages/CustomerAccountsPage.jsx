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
    <div className="app-news-page">
      <header className="app-news-hero">
        <h1 className="app-news-hero__title">Kundenkonten (App)</h1>
        <p className="app-news-hero__sub">
          Registrierte Endkunden per E-Mail und Passwort — getrennt von Google-OAuth.
        </p>
      </header>

      {error ? (
        <p className="app-news-cap-banner" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? <p className="app-news-hero__sub">Lade Konten…</p> : null}

      <div className="admin-table-wrap" style={{ marginTop: 16 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>E-Mail</th>
              <th>Name</th>
              <th>Telefon</th>
              <th>E-Mail bestätigt</th>
              <th>Registriert</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading ? (
              <tr>
                <td colSpan={5}>Noch keine Kundenkonten.</td>
              </tr>
            ) : null}
            {items.map((row) => (
              <tr key={row.id}>
                <td>{row.email}</td>
                <td>{row.name}</td>
                <td>{row.phone || "—"}</td>
                <td>{formatDt(row.emailVerifiedAt)}</td>
                <td>{formatDt(row.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="app-news-hero__sub" style={{ marginTop: 12 }}>
        {items.length} Konto{items.length === 1 ? "" : "en"} (max. 500 neueste).
      </p>
    </div>
  );
}
