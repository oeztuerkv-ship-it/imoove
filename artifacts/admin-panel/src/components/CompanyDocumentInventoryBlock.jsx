import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

function fmtDe(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function fmtSize(n) {
  if (n == null || !Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeLabel(mime) {
  const m = String(mime ?? "").toLowerCase();
  if (m.includes("pdf")) return "PDF";
  if (m.includes("png")) return "Foto (PNG)";
  if (m.includes("jpeg") || m.includes("jpg")) return "Foto (JPEG)";
  return m || "Datei";
}

function buildOpenUrl(companyId, item) {
  const cid = encodeURIComponent(companyId);
  if (item.openKind === "onboarding") {
    return `${API_BASE}/admin/companies/${cid}/documents/${encodeURIComponent(item.openRef)}/file`;
  }
  if (item.openKind === "compliance") {
    const q = new URLSearchParams({ kind: item.openRef });
    if (item.storageKey) q.set("storageKey", item.storageKey);
    return `${API_BASE}/admin/companies/${cid}/document-files/compliance/file?${q}`;
  }
  if (item.openKind === "fleet-driver") {
    return `${API_BASE}/admin/companies/${cid}/document-files/fleet-driver/${encodeURIComponent(item.openRef)}/file`;
  }
  if (item.openKind === "fleet-vehicle") {
    const q = new URLSearchParams({ storageKey: item.storageKey ?? "" });
    return `${API_BASE}/admin/companies/${cid}/document-files/fleet-vehicle/${encodeURIComponent(item.openRef)}/file?${q}`;
  }
  return null;
}

/**
 * Zentrale Übersicht aller Mandanten-Uploads (Admin): öffnen als PDF/Foto im neuen Tab.
 */
export default function CompanyDocumentInventoryBlock({
  companyId,
  title = "Alle Dokumente & Uploads",
  subtitle = "Nachvollziehen, öffnen (PDF oder Foto)",
  footer = null,
}) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("");
  const [openBusy, setOpenBusy] = useState("");

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`${API_BASE}/admin/companies/${encodeURIComponent(companyId)}/document-inventory`, {
        headers: adminApiHeaders(),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        setErr(j?.error ? String(j.error) : `HTTP ${r.status}`);
        setItems([]);
        return;
      }
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch {
      setErr("Netzwerkfehler");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const hay = [it.category, it.title, it.fileName, it.meta, it.mimeType].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [items, filter]);

  const byCategory = useMemo(() => {
    const m = new Map();
    for (const it of filtered) {
      const c = it.category || "Sonstige";
      if (!m.has(c)) m.set(c, []);
      m.get(c).push(it);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "de"));
  }, [filtered]);

  async function openItem(item) {
    const url = buildOpenUrl(companyId, item);
    if (!url) return;
    setOpenBusy(item.id);
    try {
      const res = await fetch(url, { headers: adminApiHeaders() });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const u = URL.createObjectURL(blob);
      window.open(u, "_blank", "noopener,noreferrer");
    } catch {
      window.alert("Datei konnte nicht geöffnet werden.");
    } finally {
      setOpenBusy("");
    }
  }

  return (
    <section className="admin-section-block admin-doc-inventory">
      <div className="admin-m-card__h">
        <span className="admin-panel-card__title" style={{ margin: 0 }}>
          {title}
        </span>
        {subtitle ? <span className="admin-table-sub" style={{ margin: 0 }}>{subtitle}</span> : null}
      </div>
      <div className="admin-doc-inventory__body">
        <div className="admin-doc-inventory__toolbar">
          <input
            className="admin-m-inp"
            type="search"
            placeholder="Suchen (Typ, Dateiname, Kennzeichen …)"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Dokumente filtern"
          />
          <button type="button" className="admin-onb-btn-outline" disabled={loading} onClick={() => void load()}>
            {loading ? "…" : "Aktualisieren"}
          </button>
        </div>
        {err ? <p className="admin-table-sub" style={{ color: "#b91c1c" }}>{err}</p> : null}
        {loading && !items.length ? <p className="admin-table-sub">Dokumente werden geladen …</p> : null}
        {!loading && !filtered.length ? (
          <p className="admin-onb-empty">Keine hochgeladenen Dateien im System für diesen Mandanten.</p>
        ) : null}
        {byCategory.map(([cat, rows]) => (
          <div key={cat} className="admin-doc-inventory__group">
            <h3 className="admin-doc-inventory__cat">{cat}</h3>
            <div className="admin-doc-inventory__table-wrap">
              <table className="admin-doc-inventory__table">
                <thead>
                  <tr>
                    <th>Bezeichnung</th>
                    <th>Datei</th>
                    <th>Format</th>
                    <th>Größe</th>
                    <th>Hochgeladen</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((it) => (
                    <tr key={it.id}>
                      <td>
                        <strong>{it.title}</strong>
                        {it.meta ? <div className="admin-table-sub">{it.meta}</div> : null}
                      </td>
                      <td className="admin-mono" style={{ fontSize: 12 }}>
                        {it.fileName}
                      </td>
                      <td>{mimeLabel(it.mimeType)}</td>
                      <td>{fmtSize(it.fileSizeBytes)}</td>
                      <td>{fmtDe(it.uploadedAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="admin-link"
                          disabled={openBusy === it.id}
                          onClick={() => void openItem(it)}
                        >
                          {openBusy === it.id ? "…" : "Öffnen"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {footer}
      </div>
    </section>
  );
}
