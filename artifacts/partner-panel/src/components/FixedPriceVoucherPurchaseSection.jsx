import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchDistanceMatrixByAddress, PARTNER_ROUTE_ADDRESS_MESSAGE_DE, validatePartnerRouteAddresses } from "../lib/smartBooking.js";
import {
  downloadFixedPriceVoucherPdf,
  estimateFixedPriceVoucher,
  fetchFixedPriceVoucherOrderBySession,
  fetchFixedPriceVoucherOrders,
  startFixedPriceVoucherCheckout,
} from "../lib/fixedPriceVoucherApi.js";

function fmtMoney(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `${Number(n).toFixed(2).replace(".", ",")} €`;
}

function vehicleLabel(v) {
  if (v === "xl") return "XL / Großraum";
  if (v === "wheelchair") return "Rollstuhl";
  return "Standard";
}

function readCheckoutReturn() {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  if (q.get("fpv_success") !== "1") return null;
  const sessionId = (q.get("session_id") ?? "").trim();
  if (!sessionId) return null;
  return sessionId;
}

function clearCheckoutReturnParams() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("fpv_success");
  url.searchParams.delete("session_id");
  url.searchParams.delete("fpv_cancel");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export function AgCard({ icon, title, subtitle, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="ag-card">
      <button type="button" className="ag-card__head" onClick={() => setOpen((v) => !v)}>
        <span className="ag-card__icon" aria-hidden>
          {icon}
        </span>
        <span className="ag-card__title-wrap">
          <span className="ag-card__title">{title}</span>
          {subtitle ? <span className="ag-card__subtitle">{subtitle}</span> : null}
        </span>
        <span
          className={`ag-card__chevron ${open ? "ag-card__chevron--open" : "ag-card__chevron--closed"}`}
          aria-hidden
        >
          ▼
        </span>
      </button>
      {open ? <div className="ag-card__body">{children}</div> : null}
    </section>
  );
}

/**
 * Partner-Panel: Festpreis-Gutschein kaufen (Produkt A).
 */
export default function FixedPriceVoucherPurchaseSection({ token, canManage }) {
  const [form, setForm] = useState({
    label: "",
    fromFull: "",
    toFull: "",
    vehicle: "standard",
    distanceKm: "",
    durationMinutes: "",
  });
  const [estimate, setEstimate] = useState(null);
  const [routing, setRouting] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [paying, setPaying] = useState(false);
  const [err, setErr] = useState("");
  const [orders, setOrders] = useState([]);
  const [successOrder, setSuccessOrder] = useState(null);
  const [pdfBusyId, setPdfBusyId] = useState(null);

  const hasRoute = form.fromFull.trim() && form.toFull.trim();

  const loadOrders = useCallback(async () => {
    if (!token) return;
    try {
      const rows = await fetchFixedPriceVoucherOrders(token);
      setOrders(rows.filter((o) => o.status === "paid"));
    } catch {
      /* optional */
    }
  }, [token]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    const sessionId = readCheckoutReturn();
    if (!sessionId || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const order = await fetchFixedPriceVoucherOrderBySession(token, sessionId);
        if (!cancelled) {
          setSuccessOrder(order);
          void loadOrders();
        }
      } catch {
        if (!cancelled) setErr("Zahlung wird noch verarbeitet — bitte Seite in wenigen Sekunden neu laden.");
      } finally {
        clearCheckoutReturnParams();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, loadOrders]);

  async function calcRoute() {
    if (!hasRoute) return;
    setRouting(true);
    setErr("");
    setEstimate(null);
    try {
      const route = await fetchDistanceMatrixByAddress(form.fromFull, form.toFull, token);
      setForm((f) => ({
        ...f,
        distanceKm: String(route.distanceKm),
        durationMinutes: String(route.durationMinutes),
      }));
    } catch (e) {
      const code = e instanceof Error ? e.message : "route_error";
      setErr(
        code === "missing_google_maps_key" || code === "route_not_computable"
          ? "Strecke konnte nicht berechnet werden — bitte Adresse prüfen oder später erneut versuchen."
          : "Strecke konnte nicht berechnet werden — Adresse prüfen.",
      );
    } finally {
      setRouting(false);
    }
  }

  async function runEstimate() {
    const addrCheck = validatePartnerRouteAddresses(form.fromFull, form.toFull);
    if (!addrCheck.ok) {
      setErr(addrCheck.message);
      return;
    }
    const distanceKm = Number(String(form.distanceKm).replace(",", "."));
    if (!hasRoute || !Number.isFinite(distanceKm) || distanceKm <= 0) {
      setErr("Bitte Start, Ziel und Strecke berechnen.");
      return;
    }
    setEstimating(true);
    setErr("");
    try {
      const est = await estimateFixedPriceVoucher(token, {
        label: form.label.trim() || undefined,
        fromFull: form.fromFull.trim(),
        toFull: form.toFull.trim(),
        distanceKm,
        vehicle: form.vehicle,
      });
      setEstimate(est);
      if (!est.eligible) setErr(est.message || "Route nicht als Festpreis buchbar.");
    } catch (e) {
      setEstimate(null);
      setErr(e instanceof Error ? e.message : "Preisberechnung fehlgeschlagen.");
    } finally {
      setEstimating(false);
    }
  }

  async function payNow() {
    if (!canManage || !estimate?.eligible) return;
    const distanceKm = Number(String(form.distanceKm).replace(",", "."));
    setPaying(true);
    setErr("");
    try {
      const { checkoutUrl } = await startFixedPriceVoucherCheckout(token, {
        label: form.label.trim() || undefined,
        fromFull: form.fromFull.trim(),
        toFull: form.toFull.trim(),
        distanceKm,
        vehicle: form.vehicle,
      });
      window.location.href = checkoutUrl;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Checkout fehlgeschlagen.");
      setPaying(false);
    }
  }

  async function downloadPdf(orderId) {
    setPdfBusyId(orderId);
    try {
      const blob = await downloadFixedPriceVoucherPdf(token, orderId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `onroda-festpreis-gutschein-${orderId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "PDF-Download fehlgeschlagen.");
    } finally {
      setPdfBusyId(null);
    }
  }

  const pricePreview = useMemo(() => {
    if (!estimate?.eligible) return null;
    return estimate;
  }, [estimate]);

  return (
    <div>
      {successOrder?.status === "paid" && (
        <div className="ag-success-card">
          <p className="ag-success-card__title">Zahlung erfolgreich</p>
          {successOrder.codePlain && (
            <p className="ag-success-card__code">{successOrder.codePlain}</p>
          )}
          <p className="ag-success-card__meta">
            {successOrder.fromFull} → {successOrder.toFull} · {fmtMoney(successOrder.priceEur)}
          </p>
          {successOrder.canDownloadPdf && (
            <button
              type="button"
              className="ag-btn ag-btn--primary"
              onClick={() => downloadPdf(successOrder.id)}
              disabled={pdfBusyId === successOrder.id}
            >
              {pdfBusyId === successOrder.id ? "PDF wird erstellt …" : "Gutschein-PDF herunterladen"}
            </button>
          )}
        </div>
      )}

      <AgCard
        icon="🎟️"
        title="Festpreis-Gutschein kaufen"
        subtitle="Route berechnen, Festpreis anzeigen und per Karte bezahlen"
      >
        {err ? <div className="ag-alert ag-alert--error">{err}</div> : null}

        <div className="ag-form-grid">
          <label className="ag-field ag-form-grid--full">
            <span className="ag-field__label">Bezeichnung (optional)</span>
            <input
              className="ag-field__input"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="z. B. Gast Müller — Flughafen"
            />
          </label>
          <label className="ag-field">
            <span className="ag-field__label">Start *</span>
            <input
              className="ag-field__input"
              value={form.fromFull}
              onChange={(e) => setForm((f) => ({ ...f, fromFull: e.target.value }))}
              placeholder="Musterstraße 12, 70771 Leinfelden-Echterdingen"
            />
          </label>
          <label className="ag-field">
            <span className="ag-field__label">Ziel *</span>
            <input
              className="ag-field__input"
              value={form.toFull}
              onChange={(e) => setForm((f) => ({ ...f, toFull: e.target.value }))}
              placeholder="Zielstraße 1, 72072 Tübingen"
            />
          </label>
        </div>
        <p className="ag-field-hint">{PARTNER_ROUTE_ADDRESS_MESSAGE_DE}</p>

        <div className="ag-route-row">
          <label className="ag-field">
            <span className="ag-field__label">Fahrzeugklasse</span>
            <select
              className="ag-field__input"
              value={form.vehicle}
              onChange={(e) => setForm((f) => ({ ...f, vehicle: e.target.value }))}
            >
              <option value="standard">Standard</option>
              <option value="xl">XL / Großraum</option>
              <option value="wheelchair">Rollstuhl</option>
            </select>
          </label>
          <button
            type="button"
            className="ag-btn ag-btn--secondary"
            onClick={calcRoute}
            disabled={!hasRoute || routing}
          >
            {routing ? "Strecke wird berechnet …" : "Strecke berechnen"}
          </button>
        </div>

        {form.distanceKm ? (
          <div className="ag-route-chip">
            <span className="ag-route-chip__dot" aria-hidden />
            Strecke: {Number(form.distanceKm).toFixed(1).replace(".", ",")} km
            {form.durationMinutes ? ` · ca. ${form.durationMinutes} Min.` : ""}
          </div>
        ) : null}

        {!pricePreview?.eligible ? (
          <div className="ag-actions">
            <button
              type="button"
              className="ag-btn ag-btn--secondary"
              onClick={runEstimate}
              disabled={estimating || !form.distanceKm}
            >
              {estimating ? "Preis wird berechnet …" : "Festpreis berechnen"}
            </button>
          </div>
        ) : (
          <div className="ag-price-hero">
            <div>
              <p className="ag-price-hero__label">Ihr Festpreis</p>
              <div className="ag-price-hero__amount">{fmtMoney(pricePreview.priceEur)}</div>
              <p className="ag-price-hero__meta">
                {vehicleLabel(form.vehicle)} · {Number(form.distanceKm).toFixed(1).replace(".", ",")} km
              </p>
            </div>
            <div className="ag-price-hero__actions">
              <button
                type="button"
                className="ag-btn ag-btn--ghost ag-btn--sm"
                onClick={runEstimate}
                disabled={estimating}
              >
                Neu berechnen
              </button>
              {canManage ? (
                <button type="button" className="ag-btn ag-btn--primary" onClick={payNow} disabled={paying}>
                  {paying ? "Weiterleitung …" : `Jetzt ${fmtMoney(pricePreview.priceEur)} zahlen`}
                </button>
              ) : null}
            </div>
          </div>
        )}
      </AgCard>

      {orders.length > 0 && (
        <AgCard icon="📋" title="Gekaufte Festpreis-Gutscheine" subtitle={`${orders.length} bezahlt`}>
          <div className="ag-voucher-list">
            {orders.slice(0, 15).map((o) => (
              <div key={o.id} className="ag-voucher-item">
                <div className="ag-voucher-item__main">
                  <div className="ag-voucher-item__title">{o.label || "Festpreis-Gutschein"}</div>
                  <div className="ag-voucher-item__route">
                    {o.fromFull} → {o.toFull}
                  </div>
                  <div className="ag-voucher-item__meta">
                    {fmtMoney(o.priceEur)} · {vehicleLabel(o.vehicle)}
                    {o.codePlain ? ` · Code: ${o.codePlain}` : ""}
                  </div>
                </div>
                {o.canDownloadPdf && (
                  <button
                    type="button"
                    className="ag-btn ag-btn--secondary ag-btn--sm"
                    onClick={() => downloadPdf(o.id)}
                    disabled={pdfBusyId === o.id}
                  >
                    PDF
                  </button>
                )}
              </div>
            ))}
          </div>
        </AgCard>
      )}
    </div>
  );
}
