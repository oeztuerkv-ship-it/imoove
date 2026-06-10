import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders, adminFetch } from "../lib/adminApiHeaders.js";

const BASE = `${API_BASE}/admin/customers`;
const PAGE_SIZE = 50;

function authProviderLabel(provider) {
  if (provider === "email") return "E-Mail";
  if (provider === "apple") return "Apple";
  return "Google";
}

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

export default function CustomersPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionBusyId, setActionBusyId] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const u = new URL(BASE);
      u.searchParams.set("page", String(page));
      u.searchParams.set("pageSize", String(PAGE_SIZE));
      if (debouncedQ) u.searchParams.set("q", debouncedQ);
      const res = await adminFetch(u.toString());
      const { data } = await readJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total ?? 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ]);

  async function exportCsv() {
    const u = new URL(`${BASE}/export`);
    if (debouncedQ) u.searchParams.set("q", debouncedQ);
    const res = await fetch(u.toString(), { headers: adminApiHeaders() });
    if (!res.ok) {
      alert("CSV-Export fehlgeschlagen.");
      return;
    }
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = "onroda-kunden.csv";
    a.click();
    URL.revokeObjectURL(href);
  }

  async function suspendCustomer(passengerId) {
    if (!window.confirm("Kunden für 24 Stunden sperren?")) return;
    setActionBusyId(passengerId);
    try {
      const res = await adminFetch(`${BASE}/${encodeURIComponent(passengerId)}/suspend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: 24 }),
      });
      const { data } = await readJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Sperren fehlgeschlagen");
    } finally {
      setActionBusyId("");
    }
  }

  async function liftSuspension(passengerId) {
    if (!window.confirm("Sperre für diesen Kunden aufheben?")) return;
    setActionBusyId(passengerId);
    try {
      const res = await adminFetch(`${BASE}/${encodeURIComponent(passengerId)}/lift-suspension`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const { data } = await readJson(res);
      if (!res.ok || !data?.ok) {
        throw new Error(typeof data?.message === "string" ? data.message : data?.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Aufheben fehlgeschlagen");
    } finally {
      setActionBusyId("");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="admin-page">
      <p className="admin-page-lead">
        Alle Kunden (E-Mail, Google, Apple) mit Fahrt- und Storno-Statistik. OAuth-Nutzer ohne gespeicherte E-Mail
        erscheinen mit Anmeldetyp Google/Apple.
      </p>

      <div className="admin-filter-card">
        <div className="admin-filter-grid">
          <label className="admin-filter-field">
            <span className="admin-filter-label">Suche (Name / E-Mail)</span>
            <input
              className="admin-input"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="z. B. muster@mail.de"
            />
          </label>
          <div className="admin-filter-actions">
            <button type="button" className="admin-m-btn-bearb" onClick={() => void load()} disabled={loading}>
              Aktualisieren
            </button>
            <button type="button" className="admin-m-btn-bearb admin-m-btn-bearb--ghost" onClick={() => void exportCsv()}>
              CSV exportieren
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <p className="admin-info-banner admin-info-banner--err" role="alert">
          {error}
        </p>
      ) : null}

      <div className="admin-rides-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>E-Mail</th>
              <th>Anmeldung</th>
              <th>Registriert</th>
              <th>Fahrten</th>
              <th>Stornos</th>
              <th>Gesperrt</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading ? (
              <tr>
                <td colSpan={8}>Keine Kunden gefunden.</td>
              </tr>
            ) : null}
            {items.map((row) => {
              const busy = actionBusyId === row.passengerId;
              return (
                <tr key={row.passengerId}>
                  <td>{row.name || "—"}</td>
                  <td>{row.email || "—"}</td>
                  <td>{authProviderLabel(row.authProvider)}</td>
                  <td>{formatDt(row.registeredAt)}</td>
                  <td>{row.rideCount}</td>
                  <td>{row.cancellationCount}</td>
                  <td>
                    {row.isSuspended ? (
                      <span className="admin-c-badge admin-c-badge--err" title={formatDt(row.suspendedUntil)}>
                        Ja
                      </span>
                    ) : (
                      <span className="admin-c-badge admin-c-badge--ok">Nein</span>
                    )}
                  </td>
                  <td>
                    {row.isSuspended ? (
                      <button
                        type="button"
                        className="admin-m-btn-bearb admin-m-btn-bearb--sm"
                        disabled={busy}
                        onClick={() => void liftSuspension(row.passengerId)}
                      >
                        {busy ? "…" : "Sperre aufheben"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="admin-m-btn-bearb admin-m-btn-bearb--sm admin-m-btn-bearb--ghost"
                        disabled={busy}
                        onClick={() => void suspendCustomer(row.passengerId)}
                      >
                        {busy ? "…" : "Sperren"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="admin-filter-actions" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="admin-m-btn-bearb admin-m-btn-bearb--ghost"
          disabled={page <= 1 || loading}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Zurück
        </button>
        <span className="admin-page-lead" style={{ margin: 0 }}>
          Seite {page} / {totalPages} · {total} Kunde{total === 1 ? "" : "n"}
          {loading ? " · lädt…" : ""}
        </span>
        <button
          type="button"
          className="admin-m-btn-bearb admin-m-btn-bearb--ghost"
          disabled={page >= totalPages || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          Weiter
        </button>
      </div>
    </div>
  );
}
