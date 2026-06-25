import { useState, useEffect, useCallback } from "react";
import OnrodaMark from "./OnrodaMark.jsx";
import FixedPriceVoucherPurchaseSection, { AgCard } from "./FixedPriceVoucherPurchaseSection.jsx";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";
import "../styles/agentur-gutscheine.css";
import {
  downloadPanelInvoicePdf,
  fetchPanelInvoice,
  fetchPanelInvoices,
} from "../lib/panelInvoicesApi.js";

const PANEL = `${API_BASE}/panel/v1`;
const RED = "#EF1D26";
const BG = "#F2F2F7";
const MESSAGES_UNREAD_POLL_MS = 30_000;

const NAV = [
  { key: "dashboard", label: "Übersicht", icon: "🏨" },
  { key: "gutscheine", label: "Gutscheine", icon: "🎟️" },
  { key: "fahrten", label: "Fahrten", icon: "🚕" },
  { key: "abrechnung", label: "Abrechnung", icon: "🧾" },
  { key: "posteingang", label: "Posteingang", icon: "📬" },
  { key: "support", label: "Support", icon: "💬" },
  { key: "einstellungen", label: "Einstellungen", icon: "⚙️" },
];

function Badge({ tone, children }) {
  const colors = {
    ok: { bg: "#dcfce7", color: "#166534" },
    warn: { bg: "#fef9c3", color: "#854d0e" },
    muted: { bg: "#f3f4f6", color: "#6b7280" },
    err: { bg: "#fee2e2", color: "#991b1b" },
  };
  const c = colors[tone] || colors.muted;
  return (
    <span style={{ background: c.bg, color: c.color, fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 20 }}>
      {children}
    </span>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "0.5px solid rgba(0,0,0,0.08)", padding: "16px 20px", ...style }}>
      {children}
    </div>
  );
}

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card style={{ marginBottom: 14 }}>
      <button type="button" onClick={() => setOpen(v => !v)} style={{ display: "flex", width: "100%", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: "#1c1c1e" }}>{title}</span>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "rgba(0,0,0,0.3)", transform: open ? "rotate(0deg)" : "rotate(-90deg)", display: "inline-block", transition: "transform 0.2s" }}>▼</span>
      </button>
      {open && <div style={{ marginTop: 14 }}>{children}</div>}
    </Card>
  );
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtMoney(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toFixed(2).replace(".", ",") + " €";
}

/* ── DASHBOARD ─────────────────────────────────────────── */
function DashboardView({ token, company }) {
  const [codes, setCodes] = useState([]);
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.all([
      fetch(`${PANEL}/access-codes`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => ({})),
      fetch(`${PANEL}/rides`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => ({})),
    ]).then(([c, r]) => {
      if (cancelled) return;
      setCodes(Array.isArray(c.items) ? c.items : []);
      setRides(Array.isArray(r.rides) ? r.rides : []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [token]);

  const activeCodes = codes.filter(c => c.isActive).length;
  const totalSpent = rides.reduce((s, r) => s + (Number(r.finalFare) || Number(r.estimatedFare) || 0), 0);
  const ridesThisMonth = rides.filter(r => {
    const d = new Date(r.createdAt || r.created_at || "");
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  return (
    <div>
      <p style={{ fontSize: 22, fontWeight: 700, margin: "0 0 16px", color: "#1c1c1e" }}>
        Guten Tag{company?.name ? `, ${company.name}` : ""}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Aktive Gutscheine", value: loading ? "…" : activeCodes },
          { label: "Fahrten diesen Monat", value: loading ? "…" : ridesThisMonth },
          { label: "Offene Kosten", value: loading ? "…" : fmtMoney(totalSpent) },
        ].map(s => (
          <Card key={s.label} style={{ textAlign: "center" }}>
            <p style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", margin: "0 0 6px" }}>{s.label}</p>
            <p style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#1c1c1e" }}>{s.value}</p>
          </Card>
        ))}
      </div>
      <Section title="So funktioniert die Abrechnung">
        <div style={{ fontSize: 13, color: "rgba(0,0,0,0.65)", lineHeight: 1.7 }}>
          <p style={{ margin: "0 0 8px" }}>🎟️ <strong>Sie erstellen Gutschein-Codes</strong> — Ihre Gäste geben den Code bei der Buchung ein.</p>
          <p style={{ margin: "0 0 8px" }}>🚕 <strong>Die Fahrt wird Ihrem Konto zugeordnet</strong> — der Gast zahlt nichts direkt.</p>
          <p style={{ margin: 0 }}>🧾 <strong>Monatsrechnung</strong> — alle Fahrten werden gesammelt in Rechnung gestellt.</p>
        </div>
      </Section>
    </div>
  );
}

/* ── GUTSCHEINE ────────────────────────────────────────── */
function GutscheineView({ token, user, company }) {
  const canManage = Array.isArray(user?.permissions) && user.permissions.includes("access_codes.manage");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ label: "", codeMode: "generate", customCode: "", maxUses: "1", validFrom: "", validUntil: "", fixedPickup: "", fixedDestination: "", notes: "" });
  const [copied, setCopied] = useState(null);
  const [belegCode, setBelegCode] = useState(null);
  const [belegRides, setBelegRides] = useState([]);
  const [belegBusy, setBelegBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${PANEL}/access-codes`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch { setErr("Laden fehlgeschlagen."); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!form.label.trim()) { setErr("Bezeichnung eingeben."); return; }
    setBusy(true); setErr("");
    try {
      const body = {
        label: form.label.trim(),
        codeType: "voucher",
        generateCode: form.codeMode === "generate",
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        fixedPickup: form.fixedPickup.trim() || undefined,
        fixedDestination: form.fixedDestination.trim() || undefined,
        internalNote: form.notes.trim() || undefined,
      };
      if (form.codeMode === "custom" && form.customCode.trim()) body.code = form.customCode.trim();
      if (form.validFrom) body.validFrom = new Date(form.validFrom).toISOString();
      if (form.validUntil) body.validUntil = new Date(form.validUntil + "T23:59:59").toISOString();
      const res = await fetch(`${PANEL}/access-codes`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Fehler");
      setForm({ label: "", codeMode: "generate", customCode: "", maxUses: "1", validFrom: "", validUntil: "", fixedPickup: "", fixedDestination: "", notes: "" });
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const toggle = async (item) => {
    try {
      await fetch(`${PANEL}/access-codes/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      await load();
    } catch { /**/ }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code).then(() => { setCopied(code); setTimeout(() => setCopied(null), 2000); });
  };

  const loadBeleg = async (item) => {
    setBelegCode(item); setBelegRides([]); setBelegBusy(true);
    try {
      const res = await fetch(`${PANEL}/rides?accessCodeId=${encodeURIComponent(item.id)}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      setBelegRides(Array.isArray(data.rides) ? data.rides : []);
    } catch {/**/ } finally { setBelegBusy(false); }
  };
  const statusInfo = (row) => {
    if (!row.isActive) return { label: "Deaktiviert", tone: "muted" };
    if (row.maxUses != null && (row.usesCount || 0) >= row.maxUses) return { label: "Aufgebraucht", tone: "warn" };
    return { label: "Aktiv", tone: "ok" };
  };

  return (
    <div className="ag-gutscheine">
      <header className="ag-gutscheine__header">
        <h1 className="ag-gutscheine__title">Gutscheine</h1>
        <p className="ag-gutscheine__lead">
          Festpreis-Gutscheine kaufen oder klassische Codes für Ihre Gäste erstellen — alles an einem Ort.
        </p>
      </header>

      <FixedPriceVoucherPurchaseSection token={token} canManage={canManage} />

      {canManage && (
        <AgCard icon="✨" title="Neuen Gutschein erstellen" subtitle="Code für Gäste — Abrechnung über Ihr Konto">
          {err ? <div className="ag-alert ag-alert--error">{err}</div> : null}
          <div className="ag-form-grid">
            <label className="ag-field">
              <span className="ag-field__label">Bezeichnung *</span>
              <input
                className="ag-field__input"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="z. B. Willkommens-Gutschein"
              />
            </label>
            <label className="ag-field">
              <span className="ag-field__label">Max. Nutzungen</span>
              <input
                className="ag-field__input"
                type="number"
                min="1"
                value={form.maxUses}
                onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))}
              />
            </label>
            <label className="ag-field">
              <span className="ag-field__label">Gültig ab</span>
              <input
                className="ag-field__input"
                type="date"
                value={form.validFrom}
                onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
              />
            </label>
            <label className="ag-field">
              <span className="ag-field__label">Gültig bis</span>
              <input
                className="ag-field__input"
                type="date"
                value={form.validUntil}
                onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
              />
            </label>
            <label className="ag-field ag-form-grid--full">
              <span className="ag-field__label">Start (optional)</span>
              <input
                className="ag-field__input"
                value={form.fixedPickup}
                onChange={(e) => setForm((f) => ({ ...f, fixedPickup: e.target.value }))}
                placeholder="z. B. Hotel Marriott, Lobby"
              />
            </label>
            <label className="ag-field ag-form-grid--full">
              <span className="ag-field__label">Ziel (optional)</span>
              <input
                className="ag-field__input"
                value={form.fixedDestination}
                onChange={(e) => setForm((f) => ({ ...f, fixedDestination: e.target.value }))}
                placeholder="z. B. Flughafen Stuttgart Terminal 1"
              />
            </label>
            <label className="ag-field ag-form-grid--full">
              <span className="ag-field__label">Code-Typ</span>
              <select
                className="ag-field__input"
                value={form.codeMode}
                onChange={(e) => setForm((f) => ({ ...f, codeMode: e.target.value }))}
              >
                <option value="generate">Automatisch generieren</option>
                <option value="custom">Eigenen Code festlegen</option>
              </select>
            </label>
            {form.codeMode === "custom" && (
              <label className="ag-field ag-form-grid--full">
                <span className="ag-field__label">Eigener Code</span>
                <input
                  className="ag-field__input"
                  value={form.customCode}
                  onChange={(e) => setForm((f) => ({ ...f, customCode: e.target.value }))}
                  placeholder="z. B. HOTEL2026"
                />
              </label>
            )}
            <label className="ag-field ag-form-grid--full">
              <span className="ag-field__label">Notiz (intern)</span>
              <input
                className="ag-field__input"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Für wen ist dieser Gutschein?"
              />
            </label>
          </div>
          <div className="ag-actions">
            <button type="button" className="ag-btn ag-btn--primary" onClick={create} disabled={busy}>
              {busy ? "Wird erstellt …" : "Gutschein erstellen"}
            </button>
          </div>
        </AgCard>
      )}

      <AgCard icon="🎫" title={`Deine Gutscheine (${items.length})`} subtitle="Aktive Codes und Nutzung">
        {loading ? (
          <p className="ag-empty">Laden …</p>
        ) : items.length === 0 ? (
          <p className="ag-empty">Noch keine Gutscheine erstellt.</p>
        ) : (
          <div className="ag-voucher-list">
            {items.map((item) => {
              const st = statusInfo(item);
              return (
                <div key={item.id} className="ag-voucher-item" style={{ opacity: item.isActive ? 1 : 0.72 }}>
                  <div className="ag-voucher-item__main">
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span className="ag-voucher-item__title">{item.label || "—"}</span>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      <span className="ag-code-pill">{item.codeNormalized || "—"}</span>
                      <button
                        type="button"
                        className="ag-btn ag-btn--ghost ag-btn--sm"
                        onClick={() => copyCode(item.codeNormalized)}
                      >
                        {copied === item.codeNormalized ? "✓ Kopiert" : "Kopieren"}
                      </button>
                    </div>
                    <div className="ag-voucher-item__meta" style={{ marginTop: 8 }}>
                      {item.usesCount || 0} / {item.maxUses ?? "∞"} Nutzungen
                      {item.validUntil ? ` · bis ${fmtDate(item.validUntil)}` : ""}
                    </div>
                    {item.fixedPickup ? (
                      <div className="ag-voucher-item__route">Start: {item.fixedPickup}</div>
                    ) : null}
                    {item.fixedDestination ? (
                      <div className="ag-voucher-item__route">Ziel: {item.fixedDestination}</div>
                    ) : null}
                    {item.notes ? <div className="ag-voucher-item__meta">{item.notes}</div> : null}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {canManage ? (
                      <button type="button" className="ag-btn ag-btn--ghost ag-btn--sm" onClick={() => toggle(item)}>
                        {item.isActive ? "Deaktivieren" : "Aktivieren"}
                      </button>
                    ) : null}
                    <button type="button" className="ag-btn ag-btn--secondary ag-btn--sm" onClick={() => loadBeleg(item)}>
                      Belege
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AgCard>
      {belegCode && (
        <AgCard icon="🧾" title={`Belege: ${belegCode.label}`} subtitle="Fahrten mit diesem Gutscheincode">
          <button type="button" className="ag-btn ag-btn--ghost ag-btn--sm" onClick={() => setBelegCode(null)} style={{ marginBottom: 12 }}>
            Schließen
          </button>
          {belegBusy ? (
            <p className="ag-empty">Laden …</p>
          ) : belegRides.length === 0 ? (
            <p className="ag-empty">Keine Fahrten mit diesem Code gefunden.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {belegRides.map((r, i) => (
                <div key={r.id || i} className="ag-voucher-item" style={{ flexDirection: "column", alignItems: "stretch" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                      <span style={{ color: RED, fontWeight: 800, fontSize: 16, letterSpacing: -0.5 }}>on</span>
                      <span style={{ color: "#1c1c1e", fontWeight: 800, fontSize: 16, letterSpacing: -0.5 }}>roda</span>
                    </div>
                    <span style={{ fontSize: 11, background: "#F2F2F7", color: "rgba(0,0,0,0.5)", padding: "2px 8px", borderRadius: 20 }}>Fahrtbeleg</span>
                  </div>
                  <div style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                    {[
                      { label: "Datum", value: fmtDate(r.createdAt || r.created_at) },
                      { label: "Abholung", value: String(r.fromFull || r.from || "—") },
                      { label: "Ziel", value: String(r.toFull || r.to || "—") },
                      (r.actualDistanceKm != null || r.distanceKm != null) ? { 
                        label: r.actualDistanceKm != null ? "Gefahrene Strecke" : "Geplante Strecke", 
                        value: Number(r.actualDistanceKm ?? r.distanceKm).toFixed(1) + " km" 
                      } : null,
                      r.actualDurationMinutes != null ? { label: "Fahrtdauer", value: r.actualDurationMinutes + " Min." } : 
                      r.durationMinutes != null ? { label: "Geplante Dauer", value: r.durationMinutes + " Min." } : null,
                    ].filter(Boolean).map(row => (
                      <div key={row.label} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <span style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", flexShrink: 0 }}>{row.label}</span>
                        <span style={{ fontSize: 12, color: "#1c1c1e", textAlign: "right" }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)", marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>Gesamtbetrag</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: RED }}>{fmtMoney(r.finalFare != null ? r.finalFare : r.status !== "completed" ? r.estimatedFare : null)}</span>
                  </div>
                  <p style={{ fontSize: 11, color: "rgba(0,0,0,0.3)", textAlign: "center", margin: "8px 0 0" }}>
                    Fahrtnachweis · {company?.name || "ONRODA"} · onroda.de
                  </p>
                </div>
              ))}
              <p style={{ fontSize: 12, color: "rgba(0,0,0,0.35)", fontWeight: 600, marginTop: 4 }}>Gesamt: {fmtMoney(belegRides.reduce((s, r) => s + (Number(r.finalFare) || Number(r.estimatedFare) || 0), 0))}</p>
            </div>
          )}
        </AgCard>
      )}
    </div>
  );
}

/* ── FAHRTEN ───────────────────────────────────────────── */
function FahrtenView({ token }) {
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`${PANEL}/rides`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).catch(() => ({}))
      .then(data => {
        if (!cancelled) { setRides(Array.isArray(data.rides) ? data.rides : []); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <Section title={`Fahrten (${rides.length})`}>
      {loading ? <p style={{ fontSize: 13, color: "rgba(0,0,0,0.4)" }}>Laden …</p> : rides.length === 0 ? (
        <p style={{ fontSize: 13, color: "rgba(0,0,0,0.4)" }}>Noch keine Fahrten vorhanden.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rides.slice(0, 50).map((r, i) => (
            <div key={r.id || i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: i % 2 === 0 ? "#fafafa" : "#fff", borderRadius: 8, fontSize: 13 }}>
              <span style={{ color: "rgba(0,0,0,0.35)", fontSize: 11, minWidth: 60 }}>{fmtDate(r.createdAt || r.created_at)}</span>
              <span style={{ flex: 1, color: "#1c1c1e" }}>{String(r.fromFull || r.from || "—").split(",")[0]} → {String(r.toFull || r.to || "—").split(",")[0]}</span>
              <span style={{ fontWeight: 600, color: "#1c1c1e" }}>{fmtMoney(r.finalFare != null ? r.finalFare : r.status !== "completed" ? r.estimatedFare : null)}</span>
              <Badge tone={r.status === "completed" ? "ok" : r.status === "cancelled" ? "err" : "muted"}>{r.status || "—"}</Badge>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/* ── ABRECHNUNG ────────────────────────────────────────── */

function paymentStatusLabelDe(paymentStatus, statusLabelDe) {
  if (statusLabelDe) return statusLabelDe;
  const m = {
    draft: "Entwurf",
    open: "Offen",
    issued: "Offen",
    due: "Fällig",
    overdue: "Überfällig",
    reminder_sent: "Zahlungserinnerung",
    partial: "Teilweise bezahlt",
    partially_paid: "Teilweise bezahlt",
    paid: "Bezahlt",
    cancelled: "Storniert",
  };
  return m[paymentStatus] || paymentStatus || "—";
}

function paymentStatusTone(paymentStatus) {
  if (paymentStatus === "paid") return "ok";
  if (paymentStatus === "overdue" || paymentStatus === "cancelled") return "err";
  if (paymentStatus === "reminder_sent") return "muted";
  if (
    paymentStatus === "open" ||
    paymentStatus === "issued" ||
    paymentStatus === "due" ||
    paymentStatus === "partial" ||
    paymentStatus === "partially_paid"
  ) {
    return "warn";
  }
  return "muted";
}

function InvoicePaymentNotice({ summary, detail, onPdf, pdfBusy }) {
  const ui = detail?.paymentUi ?? summary?.paymentUi;
  if (!ui || ui.kind === "none") return null;
  const isReminder = ui.kind === "reminder";
  const ref = detail?.paymentReference || summary?.paymentReference;
  return (
    <Card
      style={{
        border: isReminder ? "1px solid #e2e8f0" : "1px solid rgba(239,29,38,0.18)",
        background: isReminder ? "#f8fafc" : "rgba(239,29,38,0.04)",
        padding: "16px 18px",
      }}
    >
      <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 16, color: "#1c1c1e" }}>{ui.title}</p>
      {ui.bodyLines.map((line, i) => {
        const isRefLine = isReminder && i === ui.bodyLines.length - 1;
        return (
          <p
            key={`${line}-${i}`}
            style={{
              margin: i === 0 ? 0 : "6px 0 0",
              fontSize: 14,
              lineHeight: 1.55,
              color: isRefLine ? "#1c1c1e" : "rgba(0,0,0,0.62)",
              wordBreak: "break-word",
            }}
          >
            {isRefLine ? <strong>{line}</strong> : line}
          </p>
        );
      })}
      {ui.showPaymentDetails ? (
        <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button
            type="button"
            onClick={() => onPdf(summary)}
            disabled={pdfBusy}
            style={{ ...btn, background: RED, padding: "8px 14px", fontSize: 13, opacity: pdfBusy ? 0.7 : 1 }}
          >
            {pdfBusy ? "…" : "PDF herunterladen"}
          </button>
          {ref ? (
            <div
              style={{
                flex: "1 1 200px",
                fontSize: 13,
                color: "rgba(0,0,0,0.62)",
                lineHeight: 1.5,
                padding: "8px 12px",
                borderRadius: 10,
                background: "#fff",
                border: "0.5px solid rgba(0,0,0,0.08)",
              }}
            >
              <span style={{ display: "block", fontSize: 11, marginBottom: 4 }}>Verwendungszweck</span>
              <strong style={{ wordBreak: "break-word", color: "#1c1c1e" }}>{ref}</strong>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function periodLabel(from, to) {
  if (!from && !to) return "—";
  return `${fmtDate(from)} – ${fmtDate(to)}`;
}

function safePdfFilename(invoiceNumber, invoiceId) {
  const base = String(invoiceNumber || invoiceId || "rechnung").replace(/[^\wäöüÄÖÜß.-]+/g, "-");
  return `ONRODA-Rechnung-${base}.pdf`;
}

/** Blob-Download (Desktop + die meisten Mobile-Browser). */
function triggerPdfDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  try {
  const a = document.createElement("a");
  a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
}

function AbrechnungView({ token }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pdfBusyId, setPdfBusyId] = useState(null);

  const loadInvoices = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setInvoices([]);
      setSelectedId(null);
      setDetail(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await fetchPanelInvoices(API_BASE, token);
      const list = Array.isArray(data.invoices) ? data.invoices : [];
      setInvoices(list);
      const preferred = list.find((inv) => inv.id === "inv-apr-2026-demo") || list[0];
      setSelectedId(preferred?.id ?? null);
    } catch (e) {
      setInvoices([]);
      setSelectedId(null);
      setError(e instanceof Error ? e.message : "Rechnungen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    if (!token || !selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    fetchPanelInvoice(API_BASE, selectedId, token)
      .then((data) => {
        if (!cancelled) setDetail(data.invoice ?? null);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, selectedId]);

  const selectedSummary = invoices.find((inv) => inv.id === selectedId) ?? null;

  const handlePdfDownload = async (invoice) => {
    if (!token || !invoice?.id) return;
    setPdfBusyId(invoice.id);
    try {
      const blob = await downloadPanelInvoicePdf(API_BASE, invoice.id, token);
      triggerPdfDownload(blob, safePdfFilename(invoice.invoiceNumber, invoice.id));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "PDF konnte nicht geladen werden.");
    } finally {
      setPdfBusyId(null);
    }
  };

  if (!token) {
    return (
      <Card>
        <p style={{ margin: 0, fontSize: 14, color: "rgba(0,0,0,0.55)" }}>Bitte melden Sie sich an, um Rechnungen zu sehen.</p>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <p style={{ margin: 0, fontSize: 14, color: "rgba(0,0,0,0.55)" }}>Rechnungen werden geladen …</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <p style={{ margin: "0 0 12px", color: "#991b1b", fontSize: 14 }}>{error}</p>
        <button type="button" onClick={() => void loadInvoices()} style={{ ...btn, background: RED }}>
          Erneut laden
        </button>
      </Card>
    );
  }

  if (invoices.length === 0) {
    return (
      <Card style={{ textAlign: "center", padding: "32px 24px" }}>
        <p style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#1c1c1e" }}>Noch keine Rechnungen</p>
        <p style={{ margin: 0, fontSize: 14, color: "rgba(0,0,0,0.55)", lineHeight: 1.6, maxWidth: 420, marginInline: "auto" }}>
          Sobald ONRODA eine Monatsabrechnung für Ihr Hotel erstellt hat, erscheint sie hier — inklusive PDF-Download und Einzelaufstellung.
        </p>
      </Card>
    );
  }

  const detailItems = Array.isArray(detail?.items) ? detail.items : [];

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Section title="Ihre Rechnungen">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "0.5px solid rgba(0,0,0,0.1)", textAlign: "left" }}>
                {["Rechnungsnr.", "Zeitraum", "Status", "Betrag", "Fällig", "Pos.", ""].map((h) => (
                  <th key={h} style={{ padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "rgba(0,0,0,0.45)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const active = inv.id === selectedId;
                return (
                  <tr
                    key={inv.id}
                    onClick={() => setSelectedId(inv.id)}
                    style={{
                      borderBottom: "0.5px solid rgba(0,0,0,0.06)",
                      cursor: "pointer",
                      background: active ? "rgba(239,29,38,0.06)" : "transparent",
                    }}
                  >
                    <td style={{ padding: "12px 10px", fontWeight: 600, color: active ? RED : "#1c1c1e", wordBreak: "break-word", maxWidth: 140 }} title={inv.invoiceNumber}>
                      {inv.invoiceNumber || "—"}
                    </td>
                    <td style={{ padding: "12px 10px", color: "rgba(0,0,0,0.65)" }}>{periodLabel(inv.periodFrom, inv.periodTo)}</td>
                    <td style={{ padding: "12px 10px" }}>
                      <Badge tone={paymentStatusTone(inv.workflowStatus || inv.paymentStatus)}>
                        {paymentStatusLabelDe(inv.workflowStatus || inv.paymentStatus, inv.statusLabelDe)}
                      </Badge>
                    </td>
                    <td style={{ padding: "12px 10px", fontWeight: 600 }}>{fmtMoney(inv.totalGross)}</td>
                    <td style={{ padding: "12px 10px", color: "rgba(0,0,0,0.65)" }}>{fmtDate(inv.dueDate)}</td>
                    <td style={{ padding: "12px 10px", color: "rgba(0,0,0,0.55)" }}>{inv.itemCount ?? "—"}</td>
                    <td style={{ padding: "12px 10px" }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handlePdfDownload(inv);
                        }}
                        disabled={pdfBusyId === inv.id}
                        style={{ ...btn, background: RED, padding: "6px 12px", fontSize: 12, opacity: pdfBusyId === inv.id ? 0.7 : 1 }}
                      >
                        {pdfBusyId === inv.id ? "…" : "PDF"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {selectedSummary && (
        <>
          <InvoicePaymentNotice
            summary={selectedSummary}
            detail={detail}
            onPdf={handlePdfDownload}
            pdfBusy={pdfBusyId === selectedSummary.id}
          />
          <Section title={`Rechnung ${selectedSummary.invoiceNumber}`}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <p style={{ margin: "0 0 6px", fontSize: 12, color: "rgba(0,0,0,0.45)" }}>Rechnungsnummer</p>
                  <h3 style={{ margin: 0, fontSize: 22, wordBreak: "break-word" }}>{selectedSummary.invoiceNumber}</h3>
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: "rgba(0,0,0,0.45)" }}>{periodLabel(selectedSummary.periodFrom, selectedSummary.periodTo)}</p>
              </div>
                <Badge tone={paymentStatusTone(selectedSummary.workflowStatus || selectedSummary.paymentStatus)}>
                  {paymentStatusLabelDe(
                    selectedSummary.workflowStatus || selectedSummary.paymentStatus,
                    selectedSummary.statusLabelDe,
                  )}
                </Badge>
            </div>

            <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                  <p style={{ margin: "0 0 4px", fontSize: 12, color: "rgba(0,0,0,0.45)" }}>Positionen</p>
                  <strong style={{ fontSize: 18 }}>{selectedSummary.itemCount ?? detailItems.length}</strong>
              </div>
              <div>
                <p style={{ margin: "0 0 4px", fontSize: 12, color: "rgba(0,0,0,0.45)" }}>Fällig am</p>
                  <strong style={{ fontSize: 18 }}>{fmtDate(selectedSummary.dueDate)}</strong>
              </div>
              <div>
                <p style={{ margin: "0 0 4px", fontSize: 12, color: "rgba(0,0,0,0.45)" }}>Zu zahlen</p>
                  <strong style={{ fontSize: 20, color: RED }}>{fmtMoney(selectedSummary.totalGross)}</strong>
                </div>
              </div>

              <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => void handlePdfDownload(selectedSummary)}
                  disabled={pdfBusyId === selectedSummary.id}
                  style={{ ...btn, background: RED, flex: 1, opacity: pdfBusyId === selectedSummary.id ? 0.7 : 1 }}
                >
                  {pdfBusyId === selectedSummary.id ? "PDF wird geladen …" : "PDF-Rechnung herunterladen"}
                </button>
            </div>

              <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: "#f8fafc", fontSize: 13, color: "rgba(0,0,0,0.62)", lineHeight: 1.6 }}>
                Rechnungsdatum: <strong>{fmtDate(selectedSummary.issueDate)}</strong>
                {selectedSummary.subtotalNet != null && (
                  <>
                    {" "}
                    · Netto {fmtMoney(selectedSummary.subtotalNet)} · MwSt. {fmtMoney(selectedSummary.vatTotal)}
                  </>
                )}
                {(detail?.paymentReference || selectedSummary.paymentReference) ? (
                  <p style={{ margin: "10px 0 0", wordBreak: "break-word" }}>
                    <span style={{ display: "block", fontSize: 11, color: "rgba(0,0,0,0.45)", marginBottom: 4 }}>
                      Verwendungszweck (= Rechnungsnummer, bitte exakt bei Überweisung)
                    </span>
                    <strong style={{ color: "#1c1c1e" }}>
                      {detail?.paymentReference || selectedSummary.paymentReference}
                    </strong>
                  </p>
                ) : null}
            </div>
          </Card>

          <Card>
            <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 15 }}>Einzelaufstellung</p>
              {detailLoading ? (
                <p style={{ margin: 0, fontSize: 13, color: "rgba(0,0,0,0.5)" }}>Positionen werden geladen …</p>
              ) : detailItems.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: "rgba(0,0,0,0.5)" }}>
                  Für diese Rechnung sind noch keine Positionen hinterlegt.
                </p>
              ) : (
                <div style={{ display: "grid", gap: 10, maxHeight: 320, overflowY: "auto" }}>
                  {detailItems.map((item, i) => (
                    <div
                      key={item.id || i}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "28px 1fr auto",
                        gap: 10,
                        padding: "10px 12px",
                        borderRadius: 10,
                        background: "#f8fafc",
                        fontSize: 13,
                      }}
                    >
                      <span style={{ color: "rgba(0,0,0,0.45)" }}>{i + 1}.</span>
                      <span>
                        <span style={{ display: "block", fontWeight: 500, wordBreak: "break-word" }}>
                          {item.description || "Position"}
                        </span>
                        {item.rideId ? (
                          <span style={{ fontSize: 11, color: "rgba(0,0,0,0.45)" }}>Fahrt {item.rideId}</span>
                        ) : null}
                      </span>
                      <strong style={{ whiteSpace: "nowrap" }}>{fmtMoney(item.lineGross)}</strong>
                </div>
              ))}
            </div>
              )}
          </Card>
        </div>
      </Section>
        </>
      )}

      <Section title="Zahlungsstatus" defaultOpen={false}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Card>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: "rgba(0,0,0,0.45)" }}>Status</p>
            {selectedSummary ? (
              <Badge tone={paymentStatusTone(selectedSummary.workflowStatus || selectedSummary.paymentStatus)}>
                {paymentStatusLabelDe(
                  selectedSummary.workflowStatus || selectedSummary.paymentStatus,
                  selectedSummary.statusLabelDe,
                )}
              </Badge>
            ) : (
              <span>—</span>
            )}
          </Card>
          <Card>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: "rgba(0,0,0,0.45)" }}>Zahlungsziel</p>
            <strong>{selectedSummary?.dueDate ? fmtDate(selectedSummary.dueDate) : "—"}</strong>
          </Card>
          <Card>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: "rgba(0,0,0,0.45)" }}>Zahlart</p>
            <strong>Überweisung</strong>
          </Card>
        </div>
      </Section>
    </div>
  );
}

/* ── POSTEINGANG (Operator → Partner) ─────────────────── */
function PosteingangView({ token, onUnreadRefresh }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    fetch(`${PANEL}/messages`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((j) => {
        const list = Array.isArray(j.items) ? j.items : [];
        setItems(list);
        setLoading(false);
      })
      .catch(() => {
        setItems([]);
        setLoading(false);
      });
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = items.find((m) => m.id === selectedId) ?? null;

  const openMessage = (msg) => {
    setSelectedId(msg.id);
    if (msg.isRead) return;
    fetch(`${PANEL}/messages/${encodeURIComponent(msg.id)}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((j) => {
        if (j?.item) {
          setItems((prev) => prev.map((row) => (row.id === j.item.id ? j.item : row)));
        } else {
          setItems((prev) =>
            prev.map((row) =>
              row.id === msg.id ? { ...row, isRead: true, readAt: new Date().toISOString() } : row,
            ),
          );
        }
        onUnreadRefresh?.();
      })
      .catch(() => {
        setItems((prev) =>
          prev.map((row) =>
            row.id === msg.id ? { ...row, isRead: true, readAt: new Date().toISOString() } : row,
          ),
        );
        onUnreadRefresh?.();
      });
  };

  if (selected) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          style={{
            border: "none",
            background: "transparent",
            color: RED,
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
            marginBottom: 12,
            padding: 0,
          }}
        >
          ← Zurück zur Liste
        </button>
        <Card>
          <p style={{ margin: "0 0 8px", fontSize: 12, color: "rgba(0,0,0,0.45)" }}>{fmtDateTime(selected.createdAt)}</p>
          <h2 style={{ margin: "0 0 16px", fontSize: 20, fontWeight: 700, color: "#1c1c1e" }}>{selected.subject}</h2>
          <p style={{ margin: 0, fontSize: 15, color: "#374151", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{selected.body}</p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 22, fontWeight: 700, margin: "0 0 16px", color: "#1c1c1e" }}>Posteingang</p>
      <p style={{ margin: "0 0 16px", fontSize: 14, color: "rgba(0,0,0,0.55)" }}>
        Mitteilungen von ONRODA an Ihr Unternehmen — keine Antwort nötig.
      </p>
      {loading ? (
        <p style={{ color: "rgba(0,0,0,0.45)" }}>Lädt…</p>
      ) : items.length === 0 ? (
        <Card>
          <p style={{ margin: 0, fontSize: 14, color: "rgba(0,0,0,0.55)" }}>Keine Nachrichten.</p>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {items.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => openMessage(m)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                width: "100%",
                textAlign: "left",
                padding: "14px 16px",
                borderRadius: 12,
                border: "0.5px solid rgba(0,0,0,0.08)",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              {!m.isRead ? (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: RED,
                    marginTop: 6,
                    flexShrink: 0,
                  }}
                />
              ) : (
                <span style={{ width: 8, flexShrink: 0 }} />
              )}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    fontSize: 15,
                    fontWeight: m.isRead ? 500 : 700,
                    color: m.isRead ? "#6b7280" : "#1c1c1e",
                    marginBottom: 4,
                  }}
                >
                  {m.subject}
                </span>
                <span style={{ fontSize: 12, color: "rgba(0,0,0,0.45)" }}>{fmtDateTime(m.createdAt)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SupportView() {
  return (
    <div>
      <Section title="Support & Hilfe">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Card>
            <p style={{ margin: "0 0 6px", fontWeight: 700 }}>Schnelle Hilfe</p>
            <p style={{ margin: 0, fontSize: 13, color: "rgba(0,0,0,0.55)", lineHeight: 1.6 }}>
              Fragen zu Gutscheinen, Fahrten oder Abrechnung können direkt an den ONRODA-Support weitergegeben werden.
            </p>
          </Card>
          <Card>
            <p style={{ margin: "0 0 6px", fontWeight: 700 }}>Fahrt prüfen lassen</p>
            <p style={{ margin: 0, fontSize: 13, color: "rgba(0,0,0,0.55)", lineHeight: 1.6 }}>
              Bei Unklarheiten zu einer Fahrt bitte die Fahrt öffnen und die Referenz angeben.
            </p>
          </Card>
        </div>
      </Section>

      <Section title="Typische Anliegen" defaultOpen={false}>
        <div style={{ display: "grid", gap: 10, fontSize: 13, color: "rgba(0,0,0,0.65)" }}>
          <p style={{ margin: 0 }}>• Gutschein wurde nicht akzeptiert</p>
          <p style={{ margin: 0 }}>• Gast hat Fahrt nicht gefunden</p>
          <p style={{ margin: 0 }}>• Rechnung oder Einzelaufstellung benötigt</p>
          <p style={{ margin: 0 }}>• Fahrt wurde falsch zugeordnet</p>
        </div>
      </Section>
    </div>
  );
}

function EinstellungenView({ company, user }) {
  return (
    <div>
      <Section title="Hotel-/Partnerprofil">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Card>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: "rgba(0,0,0,0.45)" }}>Partner</p>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{company?.name || user?.companyName || "Hotel / Partner"}</p>
          </Card>
          <Card>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: "rgba(0,0,0,0.45)" }}>Status</p>
            <Badge tone="ok">Aktiv</Badge>
          </Card>
        </div>
      </Section>

      <Section title="Passwort ändern" defaultOpen={false}>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "rgba(0,0,0,0.6)", lineHeight: 1.6 }}>
          Passwort-Änderung wird hier vorbereitet. Falls noch kein API-Endpunkt existiert, muss dieser sauber unter /panel/v1 ergänzt werden.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <input type="password" placeholder="Aktuelles Passwort" style={inp} />
          <input type="password" placeholder="Neues Passwort" style={inp} />
        </div>
        <button type="button" disabled style={{ ...btn, marginTop: 12, background: "#9ca3af", cursor: "not-allowed" }}>
          Passwort ändern
        </button>
      </Section>

      <Section title="Rechnung & Benachrichtigungen" defaultOpen={false}>
        <div style={{ display: "grid", gap: 10, fontSize: 13, color: "rgba(0,0,0,0.65)" }}>
          <p style={{ margin: 0 }}>• Rechnungsadresse anzeigen/bearbeiten</p>
          <p style={{ margin: 0 }}>• E-Mail für Monatsrechnung verwalten</p>
          <p style={{ margin: 0 }}>• Benachrichtigungen für neue Fahrten aktivieren</p>
        </div>
      </Section>
    </div>
  );
}


export default function AgenturMasterPanel({ company, onLogout }) {
  const { token, user } = usePanelAuth();
  const [active, setActive] = useState("dashboard");
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

  const refreshUnreadMessageCount = useCallback(() => {
    if (!token) {
      setUnreadMessageCount(0);
      return;
    }
    fetch(`${PANEL}/messages/unread-count`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((j) => {
        const n = typeof j?.count === "number" ? j.count : 0;
        setUnreadMessageCount(Math.max(0, n));
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) {
      setUnreadMessageCount(0);
      return;
    }
    refreshUnreadMessageCount();
    const id = setInterval(refreshUnreadMessageCount, MESSAGES_UNREAD_POLL_MS);
    return () => clearInterval(id);
  }, [token, refreshUnreadMessageCount]);

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: "0.5px solid rgba(0,0,0,0.1)", padding: "0 24px", display: "flex", alignItems: "center", height: 56, position: "sticky", top: 0, zIndex: 100 }}>
        <OnrodaMark className="partner-shell__brand-mark-img" />
        <span style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", marginLeft: 8, background: "#F2F2F7", padding: "3px 10px", borderRadius: 20, fontWeight: 500 }}>
          {company?.company_kind === "hotel" ? "🏨 Hotel" : company?.company_kind === "travel" ? "✈️ Reisebüro" : "🏢 Agentur"}
        </span>
        <nav style={{ display: "flex", gap: 2, marginLeft: 28 }}>
          {NAV.map(n => (
            <button key={n.key} onClick={() => setActive(n.key)} style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "9px 14px",
              borderRadius: 999,
              border: active === n.key ? "none" : "0.5px solid rgba(0,0,0,0.08)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: active === n.key ? 700 : 500,
              background: active === n.key ? RED : "#fff",
              color: active === n.key ? "#fff" : "rgba(0,0,0,0.65)",
              boxShadow: active === n.key ? "0 10px 22px rgba(239,29,38,0.22)" : "0 4px 12px rgba(15,23,42,0.04)",
              transition: "all 0.15s",
              position: "relative",
            }}>
              <span>{n.icon}</span>
              <span>{n.label}</span>
              {n.key === "posteingang" && unreadMessageCount > 0 ? (
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    right: 4,
                    minWidth: 18,
                    height: 18,
                    borderRadius: 9,
                    background: RED,
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 4px",
                    lineHeight: 1,
                    boxShadow: "0 2px 6px rgba(239,29,38,0.35)",
                  }}
                  aria-label={`${unreadMessageCount} ungelesene Nachrichten`}
                >
                  {unreadMessageCount > 99 ? "99+" : unreadMessageCount}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: "rgba(0,0,0,0.5)", fontWeight: 500 }}>{company?.name || user?.companyName || ""}</span>
          {onLogout && <button onClick={onLogout} style={{ border: "0.5px solid rgba(0,0,0,0.2)", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer", background: "transparent" }}>Abmelden</button>}
        </div>
      </div>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px" }}>
        {active === "dashboard" && <DashboardView token={token} company={company} />}
        {active === "gutscheine" && <GutscheineView token={token} user={user} company={company} />}
        {active === "fahrten" && <FahrtenView token={token} />}
        {active === "abrechnung" && <AbrechnungView token={token} />}
        {active === "posteingang" && (
          <PosteingangView token={token} onUnreadRefresh={refreshUnreadMessageCount} />
        )}
        {active === "support" && <SupportView />}
        {active === "einstellungen" && <EinstellungenView company={company} user={user} />}
      </div>
    </div>
  );
}

const inp = { display: "block", width: "100%", marginTop: 4, padding: "9px 12px", border: "0.5px solid rgba(0,0,0,0.18)", borderRadius: 8, fontSize: 14, boxSizing: "border-box", background: "#fff" };
const btn = { padding: "10px 20px", border: "none", borderRadius: 10, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" };
