import { useCallback, useEffect, useState } from "react";
import AdminCollapsibleSection from "../components/AdminCollapsibleSection.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const LIST_URL = `${API_BASE}/admin/finance/adjustments`;
const TAXI_COMPANIES_URL = `${API_BASE}/admin/taxi-fleet-drivers/taxi-companies`;
const PAGE_SIZE = 25;

const KIND_OPTIONS = [
  { value: "", label: "Alle Arten" },
  { value: "refund", label: "Erstattung (Refund)" },
  { value: "chargeback", label: "Chargeback" },
  { value: "manual_credit", label: "Manuelle Gutschrift" },
  { value: "manual_debit", label: "Manuelle Belastung" },
  { value: "cancel_fee", label: "Storno-Gebühr" },
  { value: "no_show_fee", label: "No-Show-Gebühr" },
];

const APPROVAL_OPTIONS = [
  { value: "", label: "Alle Freigaben" },
  { value: "pending_approval", label: "Wartet auf Freigabe" },
  { value: "approved", label: "Freigegeben" },
  { value: "rejected", label: "Abgelehnt" },
];

const KIND_LABELS = Object.fromEntries(KIND_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]));

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

function kindDe(kind) {
  const k = String(kind ?? "").trim();
  return KIND_LABELS[k] || k || "—";
}

function kindBadgeClass(kind) {
  const k = String(kind ?? "");
  if (k === "manual_credit" || k === "refund") return "admin-c-badge admin-c-badge--ok";
  if (k === "manual_debit" || k === "chargeback") return "admin-c-badge admin-c-badge--warn";
  return "admin-c-badge admin-c-badge--info";
}

function approvalBadgeClass(status) {
  if (status === "approved") return "admin-c-badge admin-c-badge--ok";
  if (status === "pending_approval") return "admin-c-badge admin-c-badge--warn";
  if (status === "rejected") return "admin-c-badge admin-c-badge--err";
  return "admin-c-badge admin-c-badge--neutral";
}

function approvalDe(status) {
  if (status === "approved") return "Freigegeben";
  if (status === "pending_approval") return "Wartet";
  if (status === "rejected") return "Abgelehnt";
  return status || "—";
}

function actorDe(type, id) {
  const m = { system: "System", admin: "Admin", stripe_webhook: "Stripe" };
  const t = m[String(type ?? "").trim()] || String(type ?? "—");
  return id ? `${t} · ${id}` : t;
}

export default function FinanceCreditsPage({ onOpenRide }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [companies, setCompanies] = useState([]);
  const [thresholdEur, setThresholdEur] = useState(100);
  const [busyId, setBusyId] = useState("");
  const [filters, setFilters] = useState({ kind: "", companyId: "", rideId: "", approvalStatus: "" });
  const [rideIdInput, setRideIdInput] = useState("");

  const [form, setForm] = useState({
    rideId: "",
    kind: "manual_credit",
    operatorPayoutAmountEur: "",
    commissionAmountEur: "",
    grossAmountEur: "",
    note: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(TAXI_COMPANIES_URL, { headers: adminApiHeaders() });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) throw new Error("companies_load_failed");
        const list = Array.isArray(data.items) ? data.items : [];
        setCompanies(
          list
            .map((c) => ({
              id: String(c.id ?? "").trim(),
              name: String(c.name ?? c.id ?? "").trim(),
            }))
            .filter((c) => c.id && c.name)
            .sort((a, b) => a.name.localeCompare(b.name, "de")),
        );
      } catch {
        setCompanies([]);
      }
    })();
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setFilters((f) => ({ ...f, rideId: rideIdInput.trim() }));
      setPage(1);
    }, 320);
    return () => window.clearTimeout(t);
  }, [rideIdInput]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams();
      q.set("page", String(page));
      q.set("pageSize", String(PAGE_SIZE));
      if (filters.kind.trim()) q.set("kind", filters.kind.trim());
      if (filters.companyId.trim()) q.set("company_id", filters.companyId.trim());
      if (filters.rideId.trim()) q.set("ride_id", filters.rideId.trim());
      if (filters.approvalStatus.trim()) q.set("approval_status", filters.approvalStatus.trim());
      const res = await fetch(`${LIST_URL}?${q.toString()}`, { headers: adminApiHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.ok) throw new Error("invalid_response");
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total ?? 0));
      const thr = Number(data.dualApprovalThresholdEur);
      if (Number.isFinite(thr) && thr >= 0) setThresholdEur(thr);
    } catch {
      setItems([]);
      setTotal(0);
      setError("Korrektur-Ledger konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function submitManual(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    setOkMsg("");
    try {
      const rideId = form.rideId.trim();
      const note = form.note.trim();
      const op = Number(String(form.operatorPayoutAmountEur).replace(",", "."));
      if (!rideId) throw new Error("Fahrt-ID ist Pflicht.");
      if (!note) throw new Error("Begründung ist Pflicht.");
      if (!Number.isFinite(op) || Math.abs(op) < 0.005) throw new Error("Betrag Unternehmer-Anteil ungültig.");

      const body = {
        rideId,
        kind: form.kind,
        operatorPayoutAmountEur: Math.abs(op),
        note,
      };
      const commission = Number(String(form.commissionAmountEur).replace(",", "."));
      const gross = Number(String(form.grossAmountEur).replace(",", "."));
      if (Number.isFinite(commission) && Math.abs(commission) >= 0.005) {
        body.commissionAmountEur = Math.abs(commission);
      }
      if (Number.isFinite(gross) && Math.abs(gross) >= 0.005) {
        body.grossAmountEur = Math.abs(gross);
      }

      const res = await fetch(LIST_URL, {
        method: "POST",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const errMap = {
          ride_not_found: "Fahrt nicht gefunden.",
          snapshot_not_found: "Kein Finanz-Snapshot für diese Fahrt.",
          taxi_only: "Nur Taxi-Mandanten (Bar-/Karten-Netting).",
          note_required: "Begründung ist Pflicht.",
          invalid_operator_payout_amount: "Betrag Unternehmer-Anteil ungültig.",
        };
        throw new Error(errMap[data?.error] || data?.message || data?.error || `HTTP ${res.status}`);
      }
      if (data.pendingApproval || data.adjustment?.approvalStatus === "pending_approval") {
        setOkMsg(
          `Korrektur angelegt — wartet auf zweite Admin-Freigabe (ab ${money(thresholdEur)} Unternehmer-Anteil). Noch nicht im Partner-Saldo.`,
        );
        setFilters((f) => ({ ...f, approvalStatus: "pending_approval" }));
      } else {
        setOkMsg(
          form.kind === "manual_credit"
            ? "Gutschrift freigegeben — im Partner-Saldo im Buchungszeitraum sichtbar."
            : "Belastung freigegeben — im Partner-Saldo im Buchungszeitraum sichtbar.",
        );
      }
      setForm({
        rideId: "",
        kind: "manual_credit",
        operatorPayoutAmountEur: "",
        commissionAmountEur: "",
        grossAmountEur: "",
        note: "",
      });
      setPage(1);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  }

  async function approveRow(id) {
    if (!id || busyId) return;
    setBusyId(id);
    setError("");
    setOkMsg("");
    try {
      const res = await fetch(`${LIST_URL}/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const errMap = {
          cannot_self_approve: "Vier-Augen: Anleger darf nicht selbst freigeben.",
          not_pending: "Eintrag ist nicht freigabefähig.",
          already_rejected: "Eintrag wurde abgelehnt.",
        };
        throw new Error(errMap[data?.error] || data?.error || `HTTP ${res.status}`);
      }
      setOkMsg("Korrektur freigegeben — jetzt im Partner-Saldo.");
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Freigabe fehlgeschlagen.");
    } finally {
      setBusyId("");
    }
  }

  async function rejectRow(id) {
    if (!id || busyId) return;
    const reason = window.prompt("Ablehnungsgrund (optional):") ?? "";
    setBusyId(id);
    setError("");
    setOkMsg("");
    try {
      const res = await fetch(`${LIST_URL}/${encodeURIComponent(id)}/reject`, {
        method: "POST",
        headers: { ...adminApiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setOkMsg("Korrektur abgelehnt.");
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ablehnung fehlgeschlagen.");
    } finally {
      setBusyId("");
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="admin-page admin-page--loose admin-page--content">
      <p className="admin-page-lead">
        Korrektur-Ledger der Plattform: Erstattungen, Chargebacks und manuelle Gutschriften/Belastungen am
        Unternehmer-Saldo. Manuelle Buchungen nur für Taxi-Fahrten mit Finanz-Snapshot. Ab{" "}
        {money(thresholdEur)} Unternehmer-Anteil gilt Vier-Augen (zweite Admin-Person). Pending zählt nicht im
        Partner-Saldo.
      </p>

      {error ? (
        <section className="admin-section-block">
          <div className="admin-section-block__body">
            <div className="admin-error-banner admin-info-banner--inline">{error}</div>
          </div>
        </section>
      ) : null}
      {okMsg ? (
        <section className="admin-section-block">
          <div className="admin-section-block__body">
            <div className="admin-info-banner admin-info-banner--inline">{okMsg}</div>
          </div>
        </section>
      ) : null}

      <AdminCollapsibleSection title="Manuelle Korrektur" subtitle="Gutschrift oder Belastung" defaultOpen>
        <form className="admin-form-grid" onSubmit={(ev) => void submitManual(ev)}>
          <label className="admin-filter-field">
            <span className="admin-field-label">Fahrt-ID</span>
            <input
              className="admin-input"
              value={form.rideId}
              onChange={(e) => setForm((f) => ({ ...f, rideId: e.target.value }))}
              placeholder="ride-…"
              required
            />
          </label>
          <label className="admin-filter-field">
            <span className="admin-field-label">Art</span>
            <select
              className="admin-select"
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
            >
              <option value="manual_credit">Gutschrift an Unternehmer</option>
              <option value="manual_debit">Belastung Unternehmer</option>
            </select>
          </label>
          <label className="admin-filter-field">
            <span className="admin-field-label">Unternehmer-Anteil (€, positiv)</span>
            <input
              className="admin-input"
              inputMode="decimal"
              value={form.operatorPayoutAmountEur}
              onChange={(e) => setForm((f) => ({ ...f, operatorPayoutAmountEur: e.target.value }))}
              placeholder="z. B. 12,50"
              required
            />
          </label>
          <label className="admin-filter-field">
            <span className="admin-field-label">Provision Δ (€, optional)</span>
            <input
              className="admin-input"
              inputMode="decimal"
              value={form.commissionAmountEur}
              onChange={(e) => setForm((f) => ({ ...f, commissionAmountEur: e.target.value }))}
              placeholder="optional"
            />
          </label>
          <label className="admin-filter-field">
            <span className="admin-field-label">Brutto Δ (€, optional)</span>
            <input
              className="admin-input"
              inputMode="decimal"
              value={form.grossAmountEur}
              onChange={(e) => setForm((f) => ({ ...f, grossAmountEur: e.target.value }))}
              placeholder="optional"
            />
          </label>
          <label className="admin-filter-field" style={{ gridColumn: "1 / -1" }}>
            <span className="admin-field-label">Begründung (Pflicht)</span>
            <input
              className="admin-input"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="z. B. Kulanz nach Support-Ticket #…"
              required
            />
          </label>
          <div style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className="admin-m-btn-pri" disabled={submitting}>
              {submitting ? "Speichere …" : "Korrektur buchen"}
            </button>
          </div>
        </form>
      </AdminCollapsibleSection>

      <AdminCollapsibleSection title="Ledger" subtitle={`${total} Einträge`} defaultOpen flushBody>
        <div className="admin-filter-toolbar admin-filter-toolbar--modern admin-filter-toolbar--search-wide">
          <label className="admin-filter-field">
            <span className="admin-field-label">Freigabe</span>
            <select
              className="admin-select"
              value={filters.approvalStatus}
              onChange={(e) => {
                setFilters((f) => ({ ...f, approvalStatus: e.target.value }));
                setPage(1);
              }}
            >
              {APPROVAL_OPTIONS.map((o) => (
                <option key={o.value || "all-appr"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-filter-field">
            <span className="admin-field-label">Art</span>
            <select
              className="admin-select"
              value={filters.kind}
              onChange={(e) => {
                setFilters((f) => ({ ...f, kind: e.target.value }));
                setPage(1);
              }}
            >
              {KIND_OPTIONS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-filter-field">
            <span className="admin-field-label">Taxi-Unternehmen</span>
            <select
              className="admin-select"
              value={filters.companyId}
              onChange={(e) => {
                setFilters((f) => ({ ...f, companyId: e.target.value }));
                setPage(1);
              }}
            >
              <option value="">Alle</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-filter-field admin-filter-field--search">
            <span className="admin-field-label">Fahrt-ID</span>
            <input
              className="admin-input"
              value={rideIdInput}
              onChange={(e) => setRideIdInput(e.target.value)}
              placeholder="Filter …"
            />
          </label>
          <button
            type="button"
            className="admin-btn-refresh admin-filter-toolbar--modern__refresh"
            onClick={() => void loadList()}
            disabled={loading}
          >
            {loading ? "Lade …" : "Aktualisieren"}
          </button>
        </div>

        <div className="admin-table-card admin-table-card--embedded">
          <div className="admin-table-scroll">
            <div className="admin-table-row admin-table-row--head">
              <div>Zeit</div>
              <div>Art</div>
              <div>Freigabe</div>
              <div>Unternehmen</div>
              <div>Fahrt</div>
              <div>Anteil Δ</div>
              <div>Provision Δ</div>
              <div>Akteur</div>
              <div>Aktion</div>
            </div>
            {items.map((x) => (
              <div className="admin-table-row" key={x.id}>
                <div>{x.createdAt ? new Date(x.createdAt).toLocaleString("de-DE") : "—"}</div>
                <div>
                  <span className={kindBadgeClass(x.kind)} title={x.label || undefined}>
                    {kindDe(x.kind)}
                  </span>
                </div>
                <div>
                  <span className={approvalBadgeClass(x.approvalStatus)}>{approvalDe(x.approvalStatus)}</span>
                </div>
                <div>{x.companyName || x.companyId || "—"}</div>
                <div className="admin-mono">
                  {typeof onOpenRide === "function" ? (
                    <button type="button" className="admin-link-btn" onClick={() => onOpenRide(x.rideId)}>
                      {x.rideId}
                    </button>
                  ) : (
                    x.rideId
                  )}
                </div>
                <div className="admin-crisp-numeric">{money(x.operatorPayoutDelta)}</div>
                <div className="admin-crisp-numeric">{money(x.commissionDelta)}</div>
                <div>
                  {actorDe(x.actorType, x.actorId)}
                  {x.requestedBy && x.approvalStatus === "pending_approval" ? (
                    <div className="admin-dash-table__muted">Antrag: {x.requestedBy}</div>
                  ) : null}
                  {x.approvedBy ? <div className="admin-dash-table__muted">OK: {x.approvedBy}</div> : null}
                </div>
                <div>
                  {x.approvalStatus === "pending_approval" ? (
                    <>
                      <button
                        type="button"
                        className="admin-m-btn-pri"
                        disabled={Boolean(busyId)}
                        onClick={() => void approveRow(x.id)}
                      >
                        {busyId === x.id ? "…" : "Freigeben"}
                      </button>{" "}
                      <button
                        type="button"
                        className="admin-m-btn-gh"
                        disabled={Boolean(busyId)}
                        onClick={() => void rejectRow(x.id)}
                      >
                        Ablehnen
                      </button>
                    </>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
            ))}
            {!loading && items.length === 0 ? (
              <div className="admin-info-banner">Keine Korrekturen gefunden.</div>
            ) : null}
          </div>
        </div>
        <div className="admin-pagination admin-pagination--inset">
          <button className="admin-page-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Zurück
          </button>
          <span className="admin-page-dots">
            Seite {page} / {pages}
          </span>
          <button
            className="admin-page-btn"
            disabled={page >= pages}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
          >
            Weiter
          </button>
        </div>
      </AdminCollapsibleSection>
    </div>
  );
}
