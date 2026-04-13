import { useEffect, useMemo, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { hasPanelModule } from "../lib/panelNavigation.js";
import {
  estimateSystemFare,
  fetchDistanceMatrixByAddress,
  toIsoFromDatetimeLocal,
} from "../lib/smartBooking.js";

function hasPerm(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

export default function HotelBookingPage() {
  const { token, user } = usePanelAuth();
  const showAccessCode = hasPanelModule(user?.panelModules, "access_codes");
  const canCreate = hasPerm(user?.permissions, "rides.create");
  const [creating, setCreating] = useState(false);
  const [routing, setRouting] = useState(false);
  const [msg, setMsg] = useState("");

  const [form, setForm] = useState({
    guestName: "",
    roomNumber: "",
    reservationRef: "",
    billedTo: "",
    from: "",
    fromFull: "",
    to: "",
    toFull: "",
    distanceKm: "",
    durationMinutes: "",
    estimatedFare: "",
    paymentMethod: "rechnung",
    vehicle: "standard",
    scheduledAt: "",
    rideKind: "standard",
    payerKind: "company",
    voucherCode: "",
    billingReference: "",
    accessCode: "",
  });
  const hasRouteInputs = useMemo(
    () => form.fromFull.trim().length > 0 && form.toFull.trim().length > 0,
    [form.fromFull, form.toFull],
  );

  useEffect(() => {
    if (!form.accessCode.trim()) return;
    setForm((f) => (f.payerKind === "company" ? f : { ...f, payerKind: "company" }));
  }, [form.accessCode]);

  async function autoFillRoute() {
    if (!hasRouteInputs) return;
    setRouting(true);
    setMsg("");
    try {
      const route = await fetchDistanceMatrixByAddress(form.fromFull, form.toFull);
      setForm((f) => ({
        ...f,
        distanceKm: String(route.distanceKm),
        durationMinutes: String(route.durationMinutes),
        estimatedFare: String(route.estimatedFare),
      }));
    } catch (e) {
      const code = e instanceof Error ? e.message : "route_error";
      setMsg(
        code === "missing_google_maps_key"
          ? "Google Maps API-Key fehlt (VITE_GOOGLE_MAPS_API_KEY)."
          : "Route konnte nicht automatisch berechnet werden.",
      );
    } finally {
      setRouting(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!token || !canCreate) return;
    setMsg("");
    const distanceKm = Number(String(form.distanceKm).replace(",", "."));
    const durationMinutes = Number(String(form.durationMinutes).replace(",", "."));
    const estimatedFare = Number(String(form.estimatedFare).replace(",", "."));
    if (!form.guestName.trim()) {
      setMsg("Bitte Gastnamen angeben.");
      return;
    }
    if (!form.from.trim() || !form.fromFull.trim() || !form.to.trim() || !form.toFull.trim()) {
      setMsg("Route unvollständig.");
      return;
    }
    if (!Number.isFinite(distanceKm) || !Number.isFinite(durationMinutes) || !Number.isFinite(estimatedFare)) {
      setMsg("Entfernung, Dauer und Preis müssen gültige Zahlen sein.");
      return;
    }
    setCreating(true);
    try {
      const body = {
        guestName: form.guestName.trim(),
        from: form.from.trim(),
        fromFull: form.fromFull.trim(),
        to: form.to.trim(),
        toFull: form.toFull.trim(),
        distanceKm,
        durationMinutes,
        estimatedFare,
        paymentMethod: form.paymentMethod.trim() || "rechnung",
        vehicle: form.vehicle.trim() || "standard",
        rideKind: form.rideKind,
        payerKind: form.payerKind,
        ...(form.roomNumber.trim() ? { roomNumber: form.roomNumber.trim() } : {}),
        ...(form.reservationRef.trim() ? { reservationRef: form.reservationRef.trim() } : {}),
        ...(form.billedTo ? { billedTo: form.billedTo } : {}),
        ...(form.scheduledAt.trim() ? { scheduledAt: toIsoFromDatetimeLocal(form.scheduledAt) } : {}),
        ...(form.voucherCode.trim() ? { voucherCode: form.voucherCode.trim() } : {}),
        ...(form.billingReference.trim() ? { billingReference: form.billingReference.trim() } : {}),
        ...(form.accessCode.trim() ? { accessCode: form.accessCode.trim() } : {}),
      };
      const res = await fetch(`${API_BASE}/panel/v1/bookings/hotel-guest`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const code = typeof data?.error === "string" ? data.error : "";
        setMsg(
          res.status === 403
            ? "Keine Berechtigung oder Modul nicht freigeschaltet."
            : code === "guest_name_required"
              ? "Gastname fehlt."
              : code === "hotel_route_fields_required" || code === "route_fields_required"
                ? "Route unvollständig."
                : code === "hotel_pricing_or_vehicle_invalid" || code === "pricing_or_vehicle_invalid"
                  ? "Preis oder Fahrzeugtyp ungültig."
                  : code === "access_code_wrong_company"
                    ? "Code gehört nicht zu Ihrem Unternehmen."
                    : code === "access_code_in_use"
                      ? "Code ist bereits in Benutzung (andere laufende Fahrt)."
                      : code === "access_code_invalid" || code === "access_code_inactive" || code === "access_code_expired" || code === "access_code_exhausted"
                        ? "Zugangscode ungültig, abgelaufen oder aufgebraucht."
                        : "Buchung konnte nicht gespeichert werden.",
        );
        return;
      }
      setMsg("Gastfahrt wurde angelegt.");
      setForm((f) => ({
        ...f,
        guestName: "",
        roomNumber: "",
        reservationRef: "",
        from: "",
        fromFull: "",
        to: "",
        toFull: "",
        distanceKm: "",
        durationMinutes: "",
        estimatedFare: "",
        scheduledAt: "",
        voucherCode: "",
        billingReference: "",
        accessCode: "",
      }));
    } catch {
      setMsg("Netzwerkfehler.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="panel-page panel-page--rides">
      <h2 className="panel-page__title">Hotel: Gastfahrt / Reservierung</h2>
      <p className="panel-page__lead">
        Erfassung mit Zimmer, Reservierungsbezug und interner Zahler-Kennzeichnung. Optional Freigabe-Code für
        digitale Kostenübernahme.
      </p>
      {!canCreate ? (
        <p className="panel-page__warn">Keine Berechtigung zum Anlegen.</p>
      ) : (
        <div className="panel-card panel-card--wide">
          <h3 className="panel-card__title">Buchung</h3>
          <form className="panel-rides-form" onSubmit={onSubmit}>
            <div className="panel-rides-form__grid">
              <label className="panel-rides-form__field panel-rides-form__field--2">
                <span>Gastname</span>
                <input
                  value={form.guestName}
                  onChange={(ev) => setForm((f) => ({ ...f, guestName: ev.target.value }))}
                  required
                  autoComplete="off"
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Zimmer (optional)</span>
                <input
                  value={form.roomNumber}
                  onChange={(ev) => setForm((f) => ({ ...f, roomNumber: ev.target.value }))}
                  autoComplete="off"
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Reservierungs-Nr. (optional)</span>
                <input
                  value={form.reservationRef}
                  onChange={(ev) => setForm((f) => ({ ...f, reservationRef: ev.target.value }))}
                  autoComplete="off"
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Intern: Belastung / Zahler-Hinweis</span>
                <select
                  value={form.billedTo}
                  onChange={(ev) => setForm((f) => ({ ...f, billedTo: ev.target.value }))}
                >
                  <option value="">— (kein Zusatz)</option>
                  <option value="guest">Gast</option>
                  <option value="room_ledger">Zimmer / City-Ledger</option>
                  <option value="company">Unternehmen / Master</option>
                </select>
              </label>
              <label className="panel-rides-form__field">
                <span>Fahrttyp</span>
                <select
                  value={form.rideKind}
                  onChange={(ev) => setForm((f) => ({ ...f, rideKind: ev.target.value }))}
                >
                  <option value="standard">Normale Fahrt</option>
                  <option value="company">Firmenfahrt</option>
                  <option value="voucher">Gutschein</option>
                  <option value="medical">Krankenfahrt</option>
                </select>
              </label>
              <div className="panel-rides-form__field panel-rides-form__field--2">
                <span>Profil</span>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="panel-btn-secondary"
                    onClick={() => setForm((f) => ({ ...f, rideKind: "medical", vehicle: "wheelchair" }))}
                  >
                    Medizinisch / Rollstuhl
                  </button>
                  <button
                    type="button"
                    className="panel-btn-secondary"
                    onClick={() => setForm((f) => ({ ...f, rideKind: "standard", vehicle: "standard" }))}
                  >
                    Hotel-Standard
                  </button>
                </div>
              </div>
              <label className="panel-rides-form__field">
                <span>Zahler (Abrechnung)</span>
                <select
                  value={form.payerKind}
                  onChange={(ev) => setForm((f) => ({ ...f, payerKind: ev.target.value }))}
                >
                  <option value="company">Firma / Hotel</option>
                  <option value="passenger">Fahrgast</option>
                  <option value="third_party">Dritter</option>
                  <option value="insurance">Kostenträger (KV)</option>
                  <option value="voucher">Gutschein</option>
                </select>
              </label>
              <label className="panel-rides-form__field">
                <span>Referenz / Kostenstelle</span>
                <input
                  value={form.billingReference}
                  onChange={(ev) => setForm((f) => ({ ...f, billingReference: ev.target.value }))}
                  autoComplete="off"
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Gutscheincode (optional)</span>
                <input
                  value={form.voucherCode}
                  onChange={(ev) => setForm((f) => ({ ...f, voucherCode: ev.target.value }))}
                  autoComplete="off"
                />
              </label>
              {showAccessCode ? (
                <label className="panel-rides-form__field panel-rides-form__field--2">
                  <span>Freigabe-Code (optional)</span>
                  <input
                    value={form.accessCode}
                    onChange={(ev) =>
                      setForm((f) => ({
                        ...f,
                        accessCode: ev.target.value,
                        payerKind: ev.target.value.trim() ? "company" : f.payerKind,
                      }))
                    }
                    autoComplete="off"
                  />
                </label>
              ) : null}
              <label className="panel-rides-form__field">
                <span>Abholort (Kurz)</span>
                <input value={form.from} onChange={(ev) => setForm((f) => ({ ...f, from: ev.target.value }))} />
              </label>
              <label className="panel-rides-form__field">
                <span>Abholort (voll)</span>
                <input
                  value={form.fromFull}
                  onChange={(ev) => setForm((f) => ({ ...f, fromFull: ev.target.value }))}
                  onBlur={() => void autoFillRoute()}
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Ziel (Kurz)</span>
                <input value={form.to} onChange={(ev) => setForm((f) => ({ ...f, to: ev.target.value }))} />
              </label>
              <label className="panel-rides-form__field">
                <span>Ziel (voll)</span>
                <input
                  value={form.toFull}
                  onChange={(ev) => setForm((f) => ({ ...f, toFull: ev.target.value }))}
                  onBlur={() => void autoFillRoute()}
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Entfernung (km)</span>
                <input
                  inputMode="decimal"
                  value={form.distanceKm}
                  onChange={(ev) => setForm((f) => ({ ...f, distanceKm: ev.target.value }))}
                  readOnly
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Dauer (Min.)</span>
                <input
                  inputMode="numeric"
                  value={form.durationMinutes}
                  onChange={(ev) => setForm((f) => ({ ...f, durationMinutes: ev.target.value }))}
                  readOnly
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Preis (geschätzt)</span>
                <input
                  inputMode="decimal"
                  value={form.estimatedFare}
                  onChange={(ev) => setForm((f) => ({ ...f, estimatedFare: ev.target.value }))}
                  readOnly
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Zahlungsart</span>
                <input
                  value={form.paymentMethod}
                  onChange={(ev) => setForm((f) => ({ ...f, paymentMethod: ev.target.value }))}
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Fahrzeug</span>
                <select
                  value={form.vehicle}
                  onChange={(ev) => setForm((f) => ({ ...f, vehicle: ev.target.value }))}
                >
                  <option value="standard">Standard</option>
                  <option value="xl">XL / Van</option>
                  <option value="wheelchair">Rollstuhl</option>
                  <option value="onroda">Onroda Fixpreis</option>
                </select>
              </label>
              <label className="panel-rides-form__field panel-rides-form__field--2">
                <span>Geplant (optional)</span>
                <input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(ev) => setForm((f) => ({ ...f, scheduledAt: ev.target.value }))}
                />
              </label>
            </div>
            {msg ? (
              <p className={msg.startsWith("Gastfahrt") ? "panel-page__ok" : "panel-page__warn"}>{msg}</p>
            ) : null}
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className="panel-btn-secondary"
                onClick={() => void autoFillRoute()}
                disabled={routing || !hasRouteInputs}
              >
                {routing ? "Berechne Route …" : "Auto-Kalkulation (KM/Dauer/Preis)"}
              </button>
              {form.distanceKm && !form.estimatedFare ? (
                <button
                  type="button"
                  className="panel-btn-secondary"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      estimatedFare: String(estimateSystemFare(Number(String(f.distanceKm).replace(",", ".")))),
                    }))
                  }
                >
                  Systempreis aus KM setzen
                </button>
              ) : null}
            </div>
            <button type="submit" className="panel-btn-primary" disabled={creating}>
              {creating ? "Speichern …" : "Gastfahrt speichern"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
