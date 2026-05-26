import { useState, useEffect, useCallback } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";

const PANEL = `${API_BASE}/panel/v1`;
const RED = "#EF1D26";
const BG = "#F2F2F7";

const NAV = [
  { key: "dashboard", label: "Dashboard" },
  { key: "gutscheine", label: "Gutscheine" },
  { key: "fahrten", label: "Fahrten" },
  { key: "abrechnung", label: "Abrechnung" },
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
function GutscheineView({ token, user }) {
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
    <div>
      {canManage && (
        <Section title="Neuen Gutschein erstellen">
          {err && <p style={{ color: RED, fontSize: 13, margin: "0 0 10px" }}>{err}</p>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ fontSize: 12, color: "rgba(0,0,0,0.5)" }}>
              Bezeichnung *
              <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="z. B. Willkommens-Gutschein" style={inp} />
            </label>
            <label style={{ fontSize: 12, color: "rgba(0,0,0,0.5)" }}>
              Max. Nutzungen
              <input type="number" min="1" value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))} style={inp} />
            </label>
            <label style={{ fontSize: 12, color: "rgba(0,0,0,0.5)" }}>
              Gültig ab
              <input type="date" value={form.validFrom} onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))} style={inp} />
            </label>
            <label style={{ fontSize: 12, color: "rgba(0,0,0,0.5)" }}>
              Gültig bis
              <input type="date" value={form.validUntil} onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))} style={inp} />
            </label>
          </div>
          <label style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", display: "block", marginTop: 10 }}>
            Start (optional)
            <input value={form.fixedPickup} onChange={e => setForm(f => ({ ...f, fixedPickup: e.target.value }))} placeholder="z. B. Hotel Marriott, Lobby" style={inp} />
          </label>
          <label style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", display: "block", marginTop: 10 }}>
            Ziel (optional)
            <input value={form.fixedDestination} onChange={e => setForm(f => ({ ...f, fixedDestination: e.target.value }))} placeholder="z. B. Flughafen Stuttgart Terminal 1" style={inp} />
          </label>
          <label style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", display: "block", marginTop: 10 }}>
            Code-Typ
            <select value={form.codeMode} onChange={e => setForm(f => ({ ...f, codeMode: e.target.value }))} style={inp}>
              <option value="generate">Automatisch generieren</option>
              <option value="custom">Eigenen Code festlegen</option>
            </select>
          </label>
          {form.codeMode === "custom" && (
            <label style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", display: "block", marginTop: 10 }}>
              Eigener Code
              <input value={form.customCode} onChange={e => setForm(f => ({ ...f, customCode: e.target.value }))}
                placeholder="z. B. HOTEL2026" style={inp} />
            </label>
          )}
          <label style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", display: "block", marginTop: 10 }}>
            Notiz (intern)
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Für wen ist dieser Gutschein?" style={inp} />
          </label>
          <button onClick={create} disabled={busy} style={{ ...btn, marginTop: 14, background: RED }}>
            {busy ? "Wird erstellt …" : "Gutschein erstellen"}
          </button>
        </Section>
      )}

      <Section title={`Deine Gutscheine (${items.length})`}>
        {loading ? <p style={{ fontSize: 13, color: "rgba(0,0,0,0.4)" }}>Laden …</p> : items.length === 0 ? (
          <p style={{ fontSize: 13, color: "rgba(0,0,0,0.4)" }}>Noch keine Gutscheine erstellt.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map(item => {
              const st = statusInfo(item);
              return (
                <div key={item.id} style={{ border: "0.5px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: "12px 14px", background: item.isActive ? "#fff" : "rgba(0,0,0,0.02)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{item.label || "—"}</span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    {canManage && (
                      <button onClick={() => toggle(item)} style={{ fontSize: 11, border: "0.5px solid rgba(0,0,0,0.2)", borderRadius: 6, padding: "3px 10px", cursor: "pointer", background: "transparent" }}>
                        {item.isActive ? "Deaktivieren" : "Aktivieren"}
                      </button>
                    )}
                    <button onClick={() => loadBeleg(item)} style={{ fontSize: 11, border: "0.5px solid rgba(0,0,0,0.2)", borderRadius: 6, padding: "3px 10px", cursor: "pointer", background: "transparent" }}>Belege</button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                    <code style={{ fontSize: 15, fontWeight: 700, letterSpacing: 1, color: RED, background: "#fff0f0", padding: "3px 10px", borderRadius: 6 }}>
                      {item.codeNormalized || "—"}
                    </code>
                    <button onClick={() => copyCode(item.codeNormalized)} style={{ fontSize: 12, border: copied === item.codeNormalized ? "1px solid #16a34a" : "0.5px solid rgba(0,0,0,0.15)", borderRadius: 6, padding: "4px 12px", cursor: "pointer", background: copied === item.codeNormalized ? "#dcfce7" : "#fff", color: copied === item.codeNormalized ? "#16a34a" : "inherit", fontWeight: copied === item.codeNormalized ? 600 : 400, transition: "all 0.2s" }}>
                      {copied === item.codeNormalized ? "✓ Kopiert!" : "Kopieren"}
                    </button>
                    <span style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", marginLeft: "auto" }}>
                      {item.usesCount || 0} / {item.maxUses ?? "∞"} Nutzungen
                      {item.validUntil ? ` · bis ${fmtDate(item.validUntil)}` : ""}
                    </span>
                  </div>
                  {item.fixedPickup && <p style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", margin: "5px 0 0" }}>🚩 Start: <strong>{item.fixedPickup}</strong></p>}
                {item.fixedDestination && <p style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", margin: "3px 0 0" }}>📍 Ziel: <strong>{item.fixedDestination}</strong></p>}
                {item.notes && <p style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", margin: "6px 0 0" }}>{item.notes}</p>}
                </div>
              );
            })}
          </div>
        )}
      </Section>
      {belegCode && (
        <Section title={`Belege: ${belegCode.label}`}>
          <button onClick={() => setBelegCode(null)} style={{ fontSize: 12, border: "0.5px solid rgba(0,0,0,0.2)", borderRadius: 6, padding: "3px 10px", cursor: "pointer", background: "transparent", marginBottom: 12 }}>✕ Schliessen</button>
          {belegBusy ? <p style={{ fontSize: 13, color: "rgba(0,0,0,0.4)" }}>Laden …</p> : belegRides.length === 0 ? (
            <p style={{ fontSize: 13, color: "rgba(0,0,0,0.4)" }}>Keine Fahrten mit diesem Code gefunden.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {belegRides.map((r, i) => (
                <div key={r.id || i} style={{ border: "0.5px solid rgba(0,0,0,0.1)", borderRadius: 12, padding: "16px 18px", background: "#fff" }}>
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
                      r.distanceKm != null ? { label: "Strecke", value: Number(r.distanceKm).toFixed(1) + " km" } : null,
                      r.durationMinutes != null ? { label: "Fahrzeit", value: r.durationMinutes + " Min." } : null,
                    ].filter(Boolean).map(row => (
                      <div key={row.label} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <span style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", flexShrink: 0 }}>{row.label}</span>
                        <span style={{ fontSize: 12, color: "#1c1c1e", textAlign: "right" }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)", marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>Gesamtbetrag</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: RED }}>{fmtMoney(r.finalFare || r.estimatedFare)}</span>
                  </div>
                  <p style={{ fontSize: 11, color: "rgba(0,0,0,0.3)", textAlign: "center", margin: "8px 0 0" }}>
                    Fahrtnachweis · {company?.name || "ONRODA"} · onroda.de
                  </p>
                </div>
              ))}
              <p style={{ fontSize: 12, color: "rgba(0,0,0,0.35)", fontWeight: 600, marginTop: 4 }}>Gesamt: {fmtMoney(belegRides.reduce((s, r) => s + (Number(r.finalFare) || Number(r.estimatedFare) || 0), 0))}</p>
            </div>
          )}
        </Section>
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
              <span style={{ fontWeight: 600, color: "#1c1c1e" }}>{fmtMoney(r.finalFare || r.estimatedFare)}</span>
              <Badge tone={r.status === "completed" ? "ok" : r.status === "cancelled" ? "err" : "muted"}>{r.status || "—"}</Badge>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/* ── ABRECHNUNG ────────────────────────────────────────── */
function AbrechnungView({ token }) {
  return (
    <div>
      <Section title="Abrechnungsmodell">
        <div style={{ fontSize: 13, color: "rgba(0,0,0,0.65)", lineHeight: 1.8 }}>
          <p style={{ margin: "0 0 8px" }}><strong>Monatliche Sammelrechnung</strong> — alle Fahrten die über Ihre Gutschein-Codes gebucht wurden, werden einmal im Monat in Rechnung gestellt.</p>
          <p style={{ margin: "0 0 8px" }}><strong>Zahlungsziel:</strong> 14 Tage nach Rechnungsdatum.</p>
          <p style={{ margin: 0 }}><strong>Format:</strong> PDF-Rechnung mit Einzelaufstellung aller Fahrten, Datum, Strecke und Preis.</p>
        </div>
      </Section>
      <Section title="Rechnungen" defaultOpen={false}>
        <p style={{ fontSize: 13, color: "rgba(0,0,0,0.4)" }}>Rechnungen werden hier angezeigt sobald verfügbar.</p>
      </Section>
    </div>
  );
}

/* ── MAIN ──────────────────────────────────────────────── */
export default function AgenturMasterPanel({ company, onLogout }) {
  const { token, user } = usePanelAuth();
  const [active, setActive] = useState("dashboard");

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ background: "#fff", borderBottom: "0.5px solid rgba(0,0,0,0.1)", padding: "0 24px", display: "flex", alignItems: "center", height: 56, position: "sticky", top: 0, zIndex: 100 }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 1 }}>
          <span style={{ color: RED, fontWeight: 800, fontSize: 20, letterSpacing: -1 }}>on</span>
          <span style={{ color: "#1c1c1e", fontWeight: 800, fontSize: 20, letterSpacing: -1 }}>roda</span>
        </span>
        <span style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", marginLeft: 8, background: "#F2F2F7", padding: "3px 10px", borderRadius: 20, fontWeight: 500 }}>
          {company?.company_kind === "hotel" ? "🏨 Hotel" : company?.company_kind === "travel" ? "✈️ Reisebüro" : "🏢 Agentur"}
        </span>
        <nav style={{ display: "flex", gap: 2, marginLeft: 28 }}>
          {NAV.map(n => (
            <button key={n.key} onClick={() => setActive(n.key)} style={{
              padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13,
              fontWeight: active === n.key ? 600 : 400,
              background: active === n.key ? RED : "transparent",
              color: active === n.key ? "#fff" : "rgba(0,0,0,0.6)",
              transition: "all 0.15s",
              fontSize: 14,
            }}>{n.label}</button>
          ))}
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: "rgba(0,0,0,0.5)", fontWeight: 500 }}>{company?.name || user?.companyName || ""}</span>
          {onLogout && <button onClick={onLogout} style={{ border: "0.5px solid rgba(0,0,0,0.2)", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer", background: "transparent" }}>Abmelden</button>}
        </div>
      </div>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px" }}>
        {active === "dashboard" && <DashboardView token={token} company={company} />}
        {active === "gutscheine" && <GutscheineView token={token} user={user} />}
        {active === "fahrten" && <FahrtenView token={token} />}
        {active === "abrechnung" && <AbrechnungView token={token} />}
      </div>
    </div>
  );
}

const inp = { display: "block", width: "100%", marginTop: 4, padding: "9px 12px", border: "0.5px solid rgba(0,0,0,0.18)", borderRadius: 8, fontSize: 14, boxSizing: "border-box", background: "#fff" };
const btn = { padding: "10px 20px", border: "none", borderRadius: 10, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" };
