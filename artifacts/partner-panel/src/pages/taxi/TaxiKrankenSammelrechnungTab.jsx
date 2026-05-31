import { useCallback, useEffect, useMemo, useState } from "react";
import { usePanelAuth } from "../../context/PanelAuthContext.jsx";
import { API_BASE } from "../../lib/apiBase.js";

function panelHeaders(jwt) {
  const t = typeof jwt === "string" ? jwt.trim() : "";
  return {
    "Content-Type": "application/json",
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

function fmtMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(x);
}

function statusLabel(s) {
  const x = String(s ?? "").toLowerCase();
  if (x === "draft") return "Entwurf";
  if (x === "sent") return "Gesendet";
  if (x === "paid") return "Bezahlt";
  return s || "—";
}

export default function TaxiKrankenSammelrechnungTab() {
  const { token } = usePanelAuth();
  const [range, setRange] = useState(defaultRange);
  const [insurerName, setInsurerName] = useState("");
  const [insurerIk, setInsurerIk] = useState("");
  const [insurerEmail, setInsurerEmail] = useState("");
  const [vouchers, setVouchers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const commissionPct = useMemo(() => {
    const v = vouchers[0]?.commissionRateSnap;
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    return Math.round(v * 10000) / 100;
  }, [vouchers]);

  const loadInvoices = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/panel/v1/kranken-invoices`, { headers: panelHeaders(token) });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j?.ok) setInvoices(Array.isArray(j.invoices) ? j.invoices : []);
    } catch {
      /* ignore */
    }
  }, [token]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  async function loadOpenVouchers() {
    if (!token) return;
    setLoading(true);
    setErr("");
    setMsg("");
    try {
      const q = new URLSearchParams({
        periodFrom: range.from,
        periodTo: range.to,
        ...(insurerName.trim() ? { insurerName: insurerName.trim() } : {}),
        ...(insurerIk.trim() ? { insurerIk: insurerIk.trim() } : {}),
      });
      const res = await fetch(`${API_BASE}/panel/v1/kranken-invoices/open-vouchers?${q}`, {
        headers: panelHeaders(token),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setErr(j?.error === "period_from_to_required" ? "Zeitraum wählen." : "Liste konnte nicht geladen werden.");
        setVouchers([]);
        return;
      }
      setVouchers(Array.isArray(j.vouchers) ? j.vouchers : []);
      setContacts(Array.isArray(j.insurerContacts) ? j.insurerContacts : []);
      if (!insurerEmail.trim() && j.insurerContacts?.[0]?.email) {
        setInsurerEmail(String(j.insurerContacts[0].email));
      }
    } catch {
      setErr("Netzwerkfehler.");
      setVouchers([]);
    } finally {
      setLoading(false);
    }
  }

  function applyContact(c) {
    if (c.insurerName) setInsurerName(c.insurerName);
    if (c.insurerIk) setInsurerIk(c.insurerIk);
    if (c.email) setInsurerEmail(c.email);
  }

  async function onGenerate() {
    if (!token) return;
    setBusy("generate");
    setErr("");
    setMsg("");
    try {
      const res = await fetch(`${API_BASE}/panel/v1/kranken-invoices/generate`, {
        method: "POST",
        headers: panelHeaders(token),
        body: JSON.stringify({
          periodFrom: range.from,
          periodTo: range.to,
          insurerName: insurerName.trim(),
          insurerIk: insurerIk.trim(),
          insurerEmail: insurerEmail.trim(),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setErr(
          j?.error === "no_open_vouchers"
            ? "Keine abrechenbaren T-Schein-Fahrten im Zeitraum."
            : "Sammelrechnung konnte nicht erstellt werden.",
        );
        return;
      }
      setMsg(`Sammelrechnung ${j.invoice?.invoiceNumber ?? ""} erstellt.`);
      setVouchers([]);
      await loadInvoices();
    } catch {
      setErr("Netzwerkfehler.");
    } finally {
      setBusy("");
    }
  }

  async function onSend(invoiceId) {
    if (!token) return;
    setBusy(`send-${invoiceId}`);
    setErr("");
    try {
      const res = await fetch(`${API_BASE}/panel/v1/kranken-invoices/${encodeURIComponent(invoiceId)}/send`, {
        method: "POST",
        headers: panelHeaders(token),
        body: JSON.stringify({ insurerEmail: insurerEmail.trim() || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setErr(j?.error === "smtp_not_configured" ? "E-Mail-Versand ist nicht konfiguriert." : "Versand fehlgeschlagen.");
        return;
      }
      setMsg(`Rechnung an ${j.sentTo ?? "Krankenkasse"} gesendet.`);
      await loadInvoices();
    } catch {
      setErr("Netzwerkfehler.");
    } finally {
      setBusy("");
    }
  }

  function onDownloadPdf(invoiceId, invoiceNumber) {
    if (!token) return;
    const url = `${API_BASE}/panel/v1/kranken-invoices/${encodeURIComponent(invoiceId)}/pdf`;
    fetch(url, { headers: panelHeaders(token) })
      .then(async (res) => {
        if (!res.ok) throw new Error("pdf");
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${(invoiceNumber || invoiceId).replace(/[^\w-]+/g, "_")}.pdf`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => setErr("PDF-Download fehlgeschlagen."));
  }

  const voucherSum = vouchers.reduce((s, v) => s + (Number(v.fareAmount) || 0), 0);

  return (
    <div className="partner-stack partner-stack--tight">
      <p className="partner-page-lead" style={{ marginTop: 0 }}>
        Sammelrechnung an die Krankenkasse — Provision aus Ihrem Mandanten-Satz (Admin), nicht fest im Code.
        {commissionPct != null ? (
          <>
            {" "}
            Aktuell in der Vorschau: <strong>{commissionPct} %</strong> ONRODA-Provision.
          </>
        ) : null}
      </p>

      {err ? <p className="partner-state-error">{err}</p> : null}
      {msg ? <p className="partner-state-ok">{msg}</p> : null}

      <section className="partner-card partner-card--section">
        <h3 className="partner-card__title">Filter &amp; Krankenkasse</h3>
        <div className="partner-filter-grid">
          <label className="partner-field">
            <span className="partner-field__label">Von</span>
            <input
              className="partner-input"
              type="date"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            />
          </label>
          <label className="partner-field">
            <span className="partner-field__label">Bis</span>
            <input
              className="partner-input"
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            />
          </label>
          <label className="partner-field">
            <span className="partner-field__label">Krankenkasse</span>
            <input className="partner-input" value={insurerName} onChange={(e) => setInsurerName(e.target.value)} placeholder="z. B. AOK" />
          </label>
          <label className="partner-field">
            <span className="partner-field__label">IK-Nummer</span>
            <input className="partner-input" value={insurerIk} onChange={(e) => setInsurerIk(e.target.value)} placeholder="10-stellig" />
          </label>
          <label className="partner-field partner-field--wide">
            <span className="partner-field__label">E-Mail Krankenkasse</span>
            <input
              className="partner-input"
              type="email"
              value={insurerEmail}
              onChange={(e) => setInsurerEmail(e.target.value)}
              placeholder="abrechnung@…"
            />
          </label>
        </div>
        {contacts.length > 0 ? (
          <div className="partner-toolbar-inline" style={{ marginTop: 8, flexWrap: "wrap" }}>
            {contacts.map((c, i) => (
              <button key={`${c.insurerIk}-${i}`} type="button" className="partner-btn-sec" onClick={() => applyContact(c)}>
                {c.insurerName || c.insurerIk || "Kontakt"}
              </button>
            ))}
          </div>
        ) : null}
        <div className="partner-toolbar-inline" style={{ marginTop: 12 }}>
          <button type="button" className="partner-btn-sec" onClick={() => void loadOpenVouchers()} disabled={loading}>
            {loading ? "Lade…" : "Offene T-Schein-Fahrten laden"}
          </button>
          <button
            type="button"
            className="partner-btn-primary"
            onClick={() => void onGenerate()}
            disabled={busy === "generate" || vouchers.length === 0 || !insurerName.trim()}
          >
            {busy === "generate" ? "Erzeuge…" : "Sammelrechnung erstellen"}
          </button>
        </div>
      </section>

      <section className="partner-card partner-card--section">
        <h3 className="partner-card__title">
          Offene Fahrten ({vouchers.length}) — Summe {fmtMoney(voucherSum)}
        </h3>
        {vouchers.length === 0 ? (
          <p className="partner-table-sub">Keine offenen Belege — Zeitraum laden oder Filter anpassen.</p>
        ) : (
          <div className="partner-table-wrap">
            <table className="partner-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Patient</th>
                  <th>Betrag</th>
                  <th>Provision</th>
                  <th>Netto</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v) => (
                  <tr key={v.id}>
                    <td>{v.rideReferenceAt ? new Date(v.rideReferenceAt).toLocaleDateString("de-DE") : "—"}</td>
                    <td>{v.patientName}</td>
                    <td>{fmtMoney(v.fareAmount)}</td>
                    <td>{fmtMoney(v.commissionAmount)}</td>
                    <td>{fmtMoney(v.netAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="partner-card partner-card--section">
        <h3 className="partner-card__title">Erstellte Sammelrechnungen</h3>
        {invoices.length === 0 ? (
          <p className="partner-table-sub">Noch keine Sammelrechnungen.</p>
        ) : (
          <div className="partner-table-wrap">
            <table className="partner-table">
              <thead>
                <tr>
                  <th>Nr.</th>
                  <th>Zeitraum</th>
                  <th>Krankenkasse</th>
                  <th>Betrag</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <code>{inv.invoiceNumber}</code>
                    </td>
                    <td>
                      {inv.periodFrom} – {inv.periodTo}
                    </td>
                    <td>{inv.insurerName}</td>
                    <td>{fmtMoney(inv.totalAmount)}</td>
                    <td>{statusLabel(inv.status)}</td>
                    <td>
                      <div className="partner-toolbar-inline">
                        <button type="button" className="partner-btn-sec" onClick={() => onDownloadPdf(inv.id, inv.invoiceNumber)}>
                          PDF
                        </button>
                        {inv.status === "draft" || inv.status === "sent" ? (
                          <button
                            type="button"
                            className="partner-btn-primary"
                            disabled={busy === `send-${inv.id}`}
                            onClick={() => void onSend(inv.id)}
                          >
                            {busy === `send-${inv.id}` ? "…" : "Per E-Mail senden"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
