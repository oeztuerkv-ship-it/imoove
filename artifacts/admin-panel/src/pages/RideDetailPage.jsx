import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const RIDES_LIST_URL = `${API_BASE}/admin/rides`;

function formatDt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "medium" });
  } catch {
    return "—";
  }
}

function rideStatusDe(status) {
  const s = String(status || "");
  const m = {
    pending: "Offen (Suche)",
    requested: "Angefordert",
    searching_driver: "Suche Fahrer",
    offered: "Angeboten",
    scheduled: "Geplant",
    accepted: "Angenommen",
    driver_arriving: "Fahrer unterwegs",
    driver_waiting: "Fahrer vor Ort",
    passenger_onboard: "Eingestiegen",
    arrived: "Vor Ort",
    in_progress: "Fahrt aktiv",
    completed: "Abgeschlossen",
    cancelled: "Storniert",
    cancelled_by_customer: "Storniert (Kund*in)",
    cancelled_by_system: "Storniert (System)",
    cancelled_by_driver: "Storniert (Fahrer*in)",
    rejected: "Abgelehnt",
  };
  return m[s] || s || "—";
}

function rideKindLabel(k) {
  const m = { standard: "Normal", medical: "Krankenfahrt", voucher: "Gutschein", company: "Firma" };
  return m[k] ?? k ?? "—";
}

function payerKindLabel(k) {
  const m = { passenger: "Fahrgast", company: "Firma", insurance: "KV", voucher: "Gutschein", third_party: "Dritt" };
  return m[k] ?? k ?? "—";
}

function actorTypeDe(t) {
  const m = { system: "System", passenger: "Fahrgast", driver: "Fahrer*in", admin: "Admin/Plattform", partner: "Partner" };
  return m[t] || t || "—";
}

function eventNarration(ev) {
  const t = String(ev.eventType || "");
  const p = (ev && typeof ev.payload === "object" && ev.payload) || {};
  if (t === "ride_created") return "Fahrt im System angelegt";
  if (t === "ride_status_changed") {
    const a = ev.fromStatus ? rideStatusDe(ev.fromStatus) : "—";
    const b = ev.toStatus ? rideStatusDe(ev.toStatus) : "—";
    return `Status: ${a} → ${b}`;
  }
  if (t === "driver_rejected") return "Fahrer*in lehnt Angebot / Zuweisung ab";
  if (t === "driver_offered") {
    const a = ev.fromStatus ? rideStatusDe(ev.fromStatus) : "—";
    const b = ev.toStatus ? rideStatusDe(ev.toStatus) : "—";
    return `Fahrerangebot: ${a} → ${b}`;
  }
  if (t === "ride_released")
    return `Admin: Fahrt freigegeben, Fahrer*in: ${p.previousDriverId != null && p.previousDriverId !== "" ? String(p.previousDriverId) : "—"}`;
  if (t === "ride_reassigned") {
    const a = p.fromDriverId != null && p.fromDriverId !== "" ? String(p.fromDriverId) : "—";
    const b = p.toDriverId != null && p.toDriverId !== "" ? String(p.toDriverId) : "—";
    return `Fahrerzuweisung: ${a} → ${b}`;
  }
  if (t === "cancel_reason")
    return `Storno-Grund: ${String(p.reason || "").trim() || "—"}`;
  if (t === "admin_action") {
    return `Plattform-Aktion: ${String(p.action || "").trim() || "—"}`;
  }
  return t || "Ereignis";
}

function auditActionDe(a) {
  const m = {
    "ride.created": "Fahrt angelegt (Partner)",
  };
  return m[a] || a;
}

function formatMoney(v) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(2)} €`;
}

export default function RideDetailPage({ rideId, onBack }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    if (!rideId?.trim()) {
      setErr("Keine Fahrt ausgewählt.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`${RIDES_LIST_URL}/${encodeURIComponent(rideId.trim())}/record`, {
        headers: adminApiHeaders(),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      setData(j);
    } catch (e) {
      setData(null);
      setErr(e instanceof Error ? e.message : "Laden fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }, [rideId]);

  useEffect(() => {
    void load();
  }, [load]);

  const r = data?.ride;
  const evs = data?.events ?? [];
  const audits = data?.panelAudit ?? [];
  const links = data?.links;

  return (
    <div className="admin-page admin-taxi-fv-page">
      <header className="admin-m-hero">
        <div className="admin-m-hero__bar">
          <div className="admin-m-hero__left">
            <button type="button" className="admin-m-back" onClick={onBack}>
              ← Zur Fahrtenliste
            </button>
            <h1 className="admin-m-hero__title">Fahrtakte</h1>
            <p className="admin-taxi-fv-heroline">
              {r?.id ? <code style={{ fontSize: "0.95em" }}>{r.id}</code> : "—"}
            </p>
            <p className="admin-m-hero__hint" style={{ marginTop: 8, maxWidth: 720 }}>
              Vollständiger Verlauf aus <code>ride_events</code> (Status) und Plattform-Audit (Mandant) — nur sichtbar machen,
              keine Fachlogik-Änderung. Abweichende reine Metadaten-Updates können ohne neues Ereignis erscheinen
              (bestehende Speicher-Logik).
            </p>
            <div className="admin-m-hero__actions" style={{ marginTop: 8 }}>
              <button type="button" className="admin-c-btn-sec" onClick={() => void load()}>
                Aktualisieren
              </button>
            </div>
          </div>
        </div>
      </header>

      {err ? <div className="admin-error-banner" style={{ marginBottom: 12 }}>{err}</div> : null}
      {loading && !r ? <p className="admin-table-sub">Lade Fahrtakte …</p> : null}

      {r ? (
        <div className="admin-taxi-fv-cards" style={{ marginTop: 12 }}>
          <section className="admin-panel-card admin-m-card admin-m-card--unified">
            <div className="admin-m-card__h">
              <span className="admin-panel-card__title" style={{ margin: 0 }}>
                Stammdaten
              </span>
            </div>
            <div className="admin-ride-rec-kv">
              <div>
                <span className="admin-ride-rec-kv__k">Kund*in</span>
                <span className="admin-ride-rec-kv__v">{r.customerName || "—"}</span>
              </div>
              <div>
                <span className="admin-ride-rec-kv__k">Mandant</span>
                <span className="admin-ride-rec-kv__v">
                  {r.companyName || r.companyId || "—"}
                </span>
              </div>
              <div>
                <span className="admin-ride-rec-kv__k">Von</span>
                <span className="admin-ride-rec-kv__v">{r.from || "—"}</span>
              </div>
              <div>
                <span className="admin-ride-rec-kv__k">Nach</span>
                <span className="admin-ride-rec-kv__v">{r.to || "—"}</span>
              </div>
              <div>
                <span className="admin-ride-rec-kv__k">Fahrtart / Zahler</span>
                <span className="admin-ride-rec-kv__v">
                  {rideKindLabel(r.rideKind)} · {payerKindLabel(r.payerKind)}
                </span>
              </div>
              <div>
                <span className="admin-ride-rec-kv__k">Geplant / Erstellt</span>
                <span className="admin-ride-rec-kv__v">
                  {r.scheduledAt ? formatDt(r.scheduledAt) : "—"} / {r.createdAt ? formatDt(r.createdAt) : "—"}
                </span>
              </div>
            </div>
          </section>

          <section className="admin-panel-card admin-m-card admin-m-card--unified">
            <div className="admin-m-card__h">
              <span className="admin-panel-card__title" style={{ margin: 0 }}>
                Status
              </span>
              <span className="admin-c-badge admin-c-badge--ok">{rideStatusDe(r.status)}</span>
            </div>
            <div className="admin-ride-rec-kv">
              <div>
                <span className="admin-ride-rec-kv__k">Aktueller Status</span>
                <span className="admin-ride-rec-kv__v">{rideStatusDe(r.status)}</span>
              </div>
            </div>
          </section>

          <section className="admin-panel-card admin-m-card admin-m-card--unified">
            <div className="admin-m-card__h">
              <span className="admin-panel-card__title" style={{ margin: 0 }}>
                Fahrer & Fahrzeug
              </span>
            </div>
            <div className="admin-ride-rec-kv">
              <div>
                <span className="admin-ride-rec-kv__k">Fahrer*in (ID/Name)</span>
                <span className="admin-ride-rec-kv__v">
                  {r.driverName ? `${r.driverName} · ` : ""}
                  {r.driverId || "—"}
                </span>
              </div>
              <div>
                <span className="admin-ride-rec-kv__k">Fahrzeug (Kennzeichen/Feld)</span>
                <span className="admin-ride-rec-kv__v">{r.vehicle || "—"}</span>
              </div>
            </div>
          </section>

          <section className="admin-panel-card admin-m-card admin-m-card--unified">
            <div className="admin-m-card__h">
              <span className="admin-panel-card__title" style={{ margin: 0 }}>
                Preis
              </span>
            </div>
            <div className="admin-ride-rec-kv">
              <div>
                <span className="admin-ride-rec-kv__k">Geschätzt / final</span>
                <span className="admin-ride-rec-kv__v">
                  {formatMoney(r.estimatedFare)}
                  {r.finalFare != null && r.finalFare !== "" ? ` / ${formatMoney(r.finalFare)}` : ""}
                </span>
              </div>
              <div>
                <span className="admin-ride-rec-kv__k">Zahlart</span>
                <span className="admin-ride-rec-kv__v">{r.paymentMethod || "—"}</span>
              </div>
              <div>
                <span className="admin-ride-rec-kv__k">Pricing-Modus</span>
                <span className="admin-ride-rec-kv__v">{r.pricingMode || "—"}</span>
              </div>
            </div>
          </section>

          <section className="admin-panel-card admin-m-card admin-m-card--unified">
            <div className="admin-m-card__h">
              <span className="admin-panel-card__title" style={{ margin: 0 }}>
                Verknüpfungen
              </span>
            </div>
            <div className="admin-ride-rec-kv">
              <div>
                <span className="admin-ride-rec-kv__k">billing_reference</span>
                <span className="admin-ride-rec-kv__v">{links?.billingReference || "—"}</span>
              </div>
              <div>
                <span className="admin-ride-rec-kv__k">Support-Ticket / Thread (Meta)</span>
                <span className="admin-ride-rec-kv__v">
                  {links?.supportTicketId || links?.supportThreadId
                    ? [links.supportTicketId, links.supportThreadId].filter(Boolean).join(" · ")
                    : "— (Vorbereitung: optional in partner_booking_meta)"}
                </span>
              </div>
            </div>
          </section>

          <section className="admin-panel-card admin-m-card admin-m-card--unified">
            <div className="admin-m-card__h">
              <span className="admin-panel-card__title" style={{ margin: 0 }}>
                Verlauf — ride_events
              </span>
              <span className="admin-table-sub" style={{ margin: 0 }}>
                {evs.length} Einträge, chronologisch
              </span>
            </div>
            {evs.length === 0 ? (
              <p className="admin-ride-rec-muted" style={{ padding: "0 16px 16px" }}>
                Noch keine Ereignisse (nur in-memory-Backend oder vor Migration 024).
              </p>
            ) : (
              <ol className="admin-ride-rec-tl">
                {evs.map((ev) => (
                  <li key={ev.id} className="admin-ride-rec-tl__row">
                    <div className="admin-ride-rec-tl__time">[{formatDt(ev.createdAt)}]</div>
                    <div className="admin-ride-rec-tl__text">{eventNarration(ev)}</div>
                    <div className="admin-ride-rec-tl__sub">
                      {ev.eventType} · {actorTypeDe(ev.actorType)}
                      {ev.actorId ? ` · ${ev.actorId}` : ""}
                    </div>
                    {ev.payload && Object.keys(ev.payload).length > 0 ? (
                      <pre className="admin-ride-rec-tl__payload">{JSON.stringify(ev.payload, null, 0)}</pre>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="admin-panel-card admin-m-card admin-m-card--unified">
            <div className="admin-m-card__h">
              <span className="admin-panel-card__title" style={{ margin: 0 }}>
                Mandanten-Audit (Plattform)
              </span>
              <span className="admin-table-sub" style={{ margin: 0 }}>subject_id = Fahrt</span>
            </div>
            {audits.length === 0 ? (
              <p className="admin-ride-rec-muted" style={{ padding: "0 16px 16px" }}>
                Keine Einträge (Fahrt ohne zugeordnetes Unternehmen oder kein passender Log).
              </p>
            ) : (
              <ol className="admin-ride-rec-tl">
                {audits.map((a) => (
                  <li key={a.id} className="admin-ride-rec-tl__row">
                    <div className="admin-ride-rec-tl__time">[{formatDt(a.createdAt)}]</div>
                    <div className="admin-ride-rec-tl__text">{auditActionDe(a.action)}</div>
                    <div className="admin-ride-rec-tl__sub">
                      {a.subjectType} · {a.action}
                    </div>
                    {a.meta && Object.keys(a.meta).length > 0 ? (
                      <pre className="admin-ride-rec-tl__payload">
                        {JSON.stringify(a.meta).length > 500 ? `${JSON.stringify(a.meta).slice(0, 500)}…` : JSON.stringify(a.meta)}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
