import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchDistanceMatrixByAddress } from "../lib/smartBooking.js";
import {
  downloadFixedPriceVoucherPdf,
  estimateFixedPriceVoucher,
  fetchFixedPriceVoucherOrderBySession,
  fetchFixedPriceVoucherOrders,
  startFixedPriceVoucherCheckout,
} from "../lib/fixedPriceVoucherApi.js";

const TEAL = "#0d9488";
const inp = {
  width: "100%",
  marginTop: 4,
  padding: "10px 12px",
  borderRadius: 10,
  border: "0.5px solid rgba(0,0,0,0.15)",
  fontSize: 14,
  boxSizing: "border-box",
};

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

/**
 * Partner-Panel: Festpreis-Gutschein kaufen (Produkt A).
 */
export default function FixedPriceVoucherPurchaseSection({
  token,
  canManage,
  Card,
  Section,
  accent = TEAL,
}) {
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
      const route = await fetchDistanceMatrixByAddress(form.fromFull, form.toFull);
      setForm((f) => ({
        ...f,
        distanceKm: String(route.distanceKm),
        durationMinutes: String(route.durationMinutes),
      }));
    } catch (e) {
      const code = e instanceof Error ? e.message : "route_error";
      setErr(
        code === "missing_google_maps_key"
          ? "Google Maps API-Key fehlt (VITE_GOOGLE_MAPS_API_KEY)."
          : "Strecke konnte nicht berechnet werden — Adresse prüfen.",
      );
    } finally {
      setRouting(false);
    }
  }

  async function runEstimate() {
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
        <Card style={{ marginBottom: 14, borderColor: `${accent}55`, background: "#f0fdfa" }}>
          <p style={{ margin: "0 0 8px", fontWeight: 600, color: "#115e59" }}>Zahlung erfolgreich</p>
          {successOrder.codePlain && (
            <p style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 700, letterSpacing: 2, color: accent }}>
              {successOrder.codePlain}
            </p>
          )}
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "rgba(0,0,0,0.6)" }}>
            {successOrder.fromFull} → {successOrder.toFull} · {fmtMoney(successOrder.priceEur)}
          </p>
          {successOrder.canDownloadPdf && (
            <button
              type="button"
              onClick={() => downloadPdf(successOrder.id)}
              disabled={pdfBusyId === successOrder.id}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: "none",
                background: accent,
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {pdfBusyId === successOrder.id ? "PDF wird erstellt …" : "Gutschein-PDF herunterladen"}
            </button>
          )}
        </Card>
      )}

      <Section title="Festpreis-Gutschein kaufen">
        <p style={{ fontSize: 13, color: "rgba(0,0,0,0.55)", margin: "0 0 14px", lineHeight: 1.5 }}>
          Route und Festpreis nach ONRODA-Tarif (Grundgebühr + km × Faktor, inkl. Fahrzeug-Aufschlag). Nach Kartenzahlung
          erhalten Sie sofort den Code und können das PDF herunterladen.
        </p>
        {err && <p style={{ color: "#b91c1c", fontSize: 13, margin: "0 0 10px" }}>{err}</p>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", gridColumn: "1 / -1" }}>
            Bezeichnung (optional)
            <input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="z. B. Gast Müller — Flughafen"
              style={inp}
            />
          </label>
          <label style={{ fontSize: 12, color: "rgba(0,0,0,0.5)" }}>
            Start (Straße, PLZ Ort) *
            <input
              value={form.fromFull}
              onChange={(e) => setForm((f) => ({ ...f, fromFull: e.target.value }))}
              placeholder="Musterstraße 1, 73728 Esslingen"
              style={inp}
            />
          </label>
          <label style={{ fontSize: 12, color: "rgba(0,0,0,0.5)" }}>
            Ziel (Straße, PLZ Ort) *
            <input
              value={form.toFull}
              onChange={(e) => setForm((f) => ({ ...f, toFull: e.target.value }))}
              placeholder="Flughafen Stuttgart, 70629"
              style={inp}
            />
          </label>
          <label style={{ fontSize: 12, color: "rgba(0,0,0,0.5)" }}>
            Fahrzeugklasse
            <select
              value={form.vehicle}
              onChange={(e) => setForm((f) => ({ ...f, vehicle: e.target.value }))}
              style={inp}
            >
              <option value="standard">Standard</option>
              <option value="xl">XL / Großraum</option>
              <option value="wheelchair">Rollstuhl</option>
            </select>
          </label>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              type="button"
              onClick={calcRoute}
              disabled={!hasRoute || routing}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${accent}`,
                background: "#fff",
                color: accent,
                fontWeight: 600,
                cursor: hasRoute && !routing ? "pointer" : "not-allowed",
              }}
            >
              {routing ? "Strecke …" : "Strecke berechnen"}
            </button>
          </div>
        </div>
        {form.distanceKm && (
          <p style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", margin: "10px 0 0" }}>
            Strecke: {Number(form.distanceKm).toFixed(1).replace(".", ",")} km
            {form.durationMinutes ? ` · ca. ${form.durationMinutes} Min.` : ""}
          </p>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={runEstimate}
            disabled={estimating || !form.distanceKm}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: `1px solid ${accent}`,
              background: "#fff",
              color: accent,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {estimating ? "Preis …" : "Festpreis berechnen"}
          </button>
          {canManage && pricePreview?.eligible && (
            <button
              type="button"
              onClick={payNow}
              disabled={paying}
              style={{
                padding: "10px 20px",
                borderRadius: 10,
                border: "none",
                background: accent,
                color: "#fff",
                fontWeight: 700,
                cursor: paying ? "wait" : "pointer",
              }}
            >
              {paying ? "Weiterleitung …" : `Jetzt ${fmtMoney(pricePreview.priceEur)} per Karte zahlen`}
            </button>
          )}
        </div>
        {pricePreview?.eligible && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 10,
              background: "#f8fafc",
              fontSize: 13,
              color: "#334155",
            }}
          >
            <div>
              <strong>Festpreis:</strong> {fmtMoney(pricePreview.priceEur)}
            </div>
            <div>
              Basis {fmtMoney(pricePreview.basePriceEur)}
              {pricePreview.vehicleSurchargeEur > 0
                ? ` + ${vehicleLabel(form.vehicle)} ${fmtMoney(pricePreview.vehicleSurchargeEur)}`
                : ""}
            </div>
            <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", marginTop: 4 }}>
              Tarif: Grundgebühr {fmtMoney(pricePreview.baseFeeEur)} + {pricePreview.perKmEur} €/km
            </div>
          </div>
        )}
      </Section>

      {orders.length > 0 && (
        <Section title="Gekaufte Festpreis-Gutscheine">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {orders.slice(0, 15).map((o) => (
              <div
                key={o.id}
                style={{
                  border: "0.5px solid rgba(0,0,0,0.08)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{o.label || "Festpreis-Gutschein"}</div>
                  <div style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", marginTop: 4 }}>
                    {o.fromFull} → {o.toFull}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", marginTop: 2 }}>
                    {fmtMoney(o.priceEur)} · {vehicleLabel(o.vehicle)}
                    {o.codePlain ? ` · Code: ${o.codePlain}` : ""}
                  </div>
                </div>
                {o.canDownloadPdf && (
                  <button
                    type="button"
                    onClick={() => downloadPdf(o.id)}
                    disabled={pdfBusyId === o.id}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: `1px solid ${accent}`,
                      background: "#fff",
                      color: accent,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    PDF
                  </button>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
