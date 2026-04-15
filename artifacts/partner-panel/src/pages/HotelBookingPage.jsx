import { useMemo, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";
import {
  fetchDistanceMatrixByAddress,
  toIsoFromDatetimeLocal,
} from "../lib/smartBooking.js";

function hasPerm(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

export default function HotelBookingPage() {
  const { token, user } = usePanelAuth();
  const canCreate = hasPerm(user?.permissions, "rides.create");
  const [creating, setCreating] = useState(false);
  const [routing, setRouting] = useState(false);
  const [msg, setMsg] = useState("");
  const [scheduledMode, setScheduledMode] = useState("immediate");

  const [form, setForm] = useState({
    guestName: "",
    roomNumber: "",
    fromFull: "",
    toFull: "",
    distanceKm: "",
    durationMinutes: "",
    estimatedFare: "",
    vehicle: "standard",
    scheduledAt: "",
    accessCode: "",
  });
  const hasRouteInputs = useMemo(
    () => form.fromFull.trim().length > 0 && form.toFull.trim().length > 0,
    [form.fromFull, form.toFull],
  );

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

  function shortLabel(full) {
    return String(full || "").split(",")[0]?.trim() || "—";
  }

  async function resolveRouteValues() {
    const d = Number(String(form.distanceKm).replace(",", "."));
    const m = Number(String(form.durationMinutes).replace(",", "."));
    const f = Number(String(form.estimatedFare).replace(",", "."));
    if (Number.isFinite(d) && Number.isFinite(m) && Number.isFinite(f) && d > 0 && m > 0 && f >= 0) {
      return { distanceKm: d, durationMinutes: m, estimatedFare: f };
    }
    const route = await fetchDistanceMatrixByAddress(form.fromFull, form.toFull);
    setForm((prev) => ({
      ...prev,
      distanceKm: String(route.distanceKm),
      durationMinutes: String(route.durationMinutes),
      estimatedFare: String(route.estimatedFare),
    }));
    return route;
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!token || !canCreate) return;
    setMsg("");
    if (!form.guestName.trim()) {
      setMsg("Bitte Gastnamen angeben.");
      return;
    }
    if (!form.roomNumber.trim()) {
      setMsg("Bitte Zimmer-Nr. angeben (wichtig für Hotel-Abrechnung).");
      return;
    }
    if (!form.fromFull.trim() || !form.toFull.trim()) {
      setMsg("Route unvollständig.");
      return;
    }
    if (!form.accessCode.trim()) {
      setMsg("Bitte Freigabe-Code angeben (damit Hotel zahlt).");
      return;
    }
    if (scheduledMode === "scheduled" && !form.scheduledAt.trim()) {
      setMsg("Bitte Terminzeit angeben.");
      return;
    }
    setCreating(true);
    try {
      const route = await resolveRouteValues();
      const body = {
        guestName: form.guestName.trim(),
        from: shortLabel(form.fromFull),
        fromFull: form.fromFull.trim(),
        to: shortLabel(form.toFull),
        toFull: form.toFull.trim(),
        distanceKm: route.distanceKm,
        durationMinutes: route.durationMinutes,
        estimatedFare: route.estimatedFare,
        paymentMethod: "Gutschein / Freigabe (Code)",
        vehicle: form.vehicle,
        rideKind: "standard",
        payerKind: "company",
        ...(form.roomNumber.trim() ? { roomNumber: form.roomNumber.trim() } : {}),
        billedTo: "room_ledger",
        ...(scheduledMode === "scheduled" && form.scheduledAt.trim()
          ? { scheduledAt: toIsoFromDatetimeLocal(form.scheduledAt) }
          : {}),
        billingReference: `ROOM-${form.roomNumber.trim()}`,
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
                      : code === "access_code_not_yet_valid"
                        ? "Zugangscode ist noch nicht gültig (Startzeit der Freigabe)."
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
        fromFull: "",
        toFull: "",
        distanceKm: "",
        durationMinutes: "",
        estimatedFare: "",
        scheduledAt: "",
        accessCode: "",
      }));
      setScheduledMode("immediate");
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
        Minimum-Flow: Wer, wann, wo, Fahrzeug, Zimmer und Freigabe-Code. Den Rest übernimmt das System.
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
              <label className="panel-rides-form__field panel-rides-form__field--2">
                <span>Abholzeit</span>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  <label className="panel-radio-line">
                    <input
                      type="radio"
                      name="scheduleMode"
                      checked={scheduledMode === "immediate"}
                      onChange={() => setScheduledMode("immediate")}
                    />
                    <span>Sofort</span>
                  </label>
                  <label className="panel-radio-line">
                    <input
                      type="radio"
                      name="scheduleMode"
                      checked={scheduledMode === "scheduled"}
                      onChange={() => setScheduledMode("scheduled")}
                    />
                    <span>Termin</span>
                  </label>
                  {scheduledMode === "scheduled" ? (
                    <input
                      type="datetime-local"
                      value={form.scheduledAt}
                      onChange={(ev) => setForm((f) => ({ ...f, scheduledAt: ev.target.value }))}
                    />
                  ) : null}
                </div>
              </label>
              <label className="panel-rides-form__field">
                <span>Abholort</span>
                <input
                  value={form.fromFull}
                  onChange={(ev) => setForm((f) => ({ ...f, fromFull: ev.target.value }))}
                  onBlur={() => void autoFillRoute()}
                />
              </label>
              <label className="panel-rides-form__field">
                <span>Ziel</span>
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
              <label className="panel-rides-form__field">
                <span>Freigabe-Code</span>
                <input
                  value={form.accessCode}
                  onChange={(ev) => setForm((f) => ({ ...f, accessCode: ev.target.value }))}
                  autoComplete="off"
                  required
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
