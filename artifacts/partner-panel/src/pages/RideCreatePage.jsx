import { useEffect, useMemo, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { hasPanelModule } from "../lib/panelNavigation.js";
import {
  defaultPartnerReservationDatetimeLocal,
  estimateSystemFare,
  fetchDistanceMatrixByAddress,
  formatPartnerAddressFull,
  isReservationDatetimeValid,
  minPartnerReservationDatetimeLocal,
  shortAddressLabel,
  toIsoFromDatetimeLocal,
  validatePartnerRouteAddressParts,
  PARTNER_ROUTE_ADDRESS_MESSAGE_DE,
} from "../lib/smartBooking.js";

const NOTE_MAX = 200;

function hasPerm(permissions, key) {
  return Array.isArray(permissions) && permissions.includes(key);
}

function mapCreateError(res, code) {
  if (res.status === 403) {
    return code === "company_kind_not_allowed_for_instant_ride"
      ? "Sofortfahrten sind für Ihren Mandantentyp nicht freigeschaltet — bitte Reservierung wählen."
      : "Keine Berechtigung, Fahrten anzulegen.";
  }
  if (code === "customer_name_required") return "Bitte Fahrgastnamen angeben.";
  if (code === "route_fields_required") return "Route unvollständig.";
  if (code === "pricing_or_vehicle_invalid" || code === "estimated_fare_mismatch" || code === "estimate_mismatch") {
    return "Preis konnte nicht bestätigt werden — Route neu berechnen und erneut senden.";
  }
  if (code === "scheduled_at_too_soon") {
    return "Reservierung mindestens 60 Minuten im Voraus wählen.";
  }
  if (code === "open_rides_limit_reached") {
    return "Zu viele offene Fahrten — bitte zuerst abschließen oder stornieren.";
  }
  if (code === "ride_kind_invalid" || code === "payer_kind_invalid") {
    return "Fahrttyp oder Zahler ungültig.";
  }
  if (code === "access_code_invalid") return "Zugangscode ungültig oder unbekannt.";
  if (code === "access_code_inactive") return "Zugangscode ist deaktiviert.";
  if (code === "access_code_not_yet_valid") return "Zugangscode ist noch nicht gültig.";
  if (code === "access_code_expired") return "Zugangscode ist abgelaufen.";
  if (code === "access_code_exhausted") return "Zugangscode bereits vollständig eingelöst.";
  if (code === "access_code_wrong_company") return "Zugangscode gehört nicht zu Ihrem Unternehmen.";
  if (code === "access_code_in_use") {
    return "Zugangscode ist bereits für eine laufende Buchung reserviert.";
  }
  return "Fahrt konnte nicht angelegt werden.";
}

export default function RideCreatePage() {
  const { token, user } = usePanelAuth();
  const showAccessCode = hasPanelModule(user?.panelModules, "access_codes");
  const canCreate = hasPerm(user?.permissions, "rides.create");
  const [creating, setCreating] = useState(false);
  const [routing, setRouting] = useState(false);
  const [createMsg, setCreateMsg] = useState("");
  const [scheduleMode, setScheduleMode] = useState("now");
  const [forSomeoneElse, setForSomeoneElse] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [form, setForm] = useState({
    customerName: "",
    customerPhone: "",
    fromStreet: "",
    fromHouseNo: "",
    fromPlz: "",
    toStreet: "",
    toHouseNo: "",
    toPlz: "",
    distanceKm: "",
    durationMinutes: "",
    estimatedFare: "",
    paymentMethod: "rechnung",
    vehicle: "standard",
    scheduledAt: defaultPartnerReservationDatetimeLocal(),
    driverNote: "",
    rideKind: "standard",
    payerKind: "passenger",
    voucherCode: "",
    billingReference: "",
    accessCode: "",
  });

  const fromFull = useMemo(
    () => formatPartnerAddressFull(form.fromStreet, form.fromHouseNo, form.fromPlz),
    [form.fromStreet, form.fromHouseNo, form.fromPlz],
  );
  const toFull = useMemo(
    () => formatPartnerAddressFull(form.toStreet, form.toHouseNo, form.toPlz),
    [form.toStreet, form.toHouseNo, form.toPlz],
  );

  const hasRouteInputs = useMemo(
    () =>
      form.fromStreet.trim().length > 0 &&
      form.fromHouseNo.trim().length > 0 &&
      form.fromPlz.trim().length > 0 &&
      form.toStreet.trim().length > 0 &&
      form.toHouseNo.trim().length > 0 &&
      form.toPlz.trim().length > 0,
    [form.fromStreet, form.fromHouseNo, form.fromPlz, form.toStreet, form.toHouseNo, form.toPlz],
  );

  const routeReady = useMemo(() => {
    const distanceKm = Number(String(form.distanceKm).replace(",", "."));
    const durationMinutes = Number(String(form.durationMinutes).replace(",", "."));
    const estimatedFare = Number(String(form.estimatedFare).replace(",", "."));
    return (
      Number.isFinite(distanceKm) &&
      distanceKm > 0 &&
      Number.isFinite(durationMinutes) &&
      durationMinutes > 0 &&
      Number.isFinite(estimatedFare) &&
      estimatedFare >= 0
    );
  }, [form.distanceKm, form.durationMinutes, form.estimatedFare]);

  useEffect(() => {
    if (!form.accessCode.trim()) return;
    setForm((f) => (f.payerKind === "company" ? f : { ...f, payerKind: "company" }));
  }, [form.accessCode]);

  useEffect(() => {
    if (!hasRouteInputs) return;
    const t = setTimeout(() => {
      void autoFillRoute();
    }, 400);
    return () => clearTimeout(t);
  }, [fromFull, toFull, form.vehicle]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (scheduleMode === "reservation" && !form.scheduledAt.trim()) {
      setForm((f) => ({ ...f, scheduledAt: defaultPartnerReservationDatetimeLocal() }));
    }
  }, [scheduleMode, form.scheduledAt]);

  async function autoFillRoute() {
    if (!hasRouteInputs) return;
    setRouting(true);
    setCreateMsg("");
    try {
      const route = await fetchDistanceMatrixByAddress(fromFull, toFull, token, {
        vehicle: form.vehicle,
      });
      setForm((f) => ({
        ...f,
        distanceKm: String(route.distanceKm),
        durationMinutes: String(route.durationMinutes),
        estimatedFare: String(route.estimatedFare),
      }));
    } catch (e) {
      setCreateMsg(e instanceof Error ? e.message : "Route konnte nicht automatisch berechnet werden.");
    } finally {
      setRouting(false);
    }
  }

  async function resolveRouteValues() {
    const d = Number(String(form.distanceKm).replace(",", "."));
    const m = Number(String(form.durationMinutes).replace(",", "."));
    const f = Number(String(form.estimatedFare).replace(",", "."));
    if (Number.isFinite(d) && Number.isFinite(m) && Number.isFinite(f) && d > 0 && m > 0 && f >= 0) {
      return { distanceKm: d, durationMinutes: m, estimatedFare: f };
    }
    const route = await fetchDistanceMatrixByAddress(fromFull, toFull, token, {
      vehicle: form.vehicle,
    });
    setForm((prev) => ({
      ...prev,
      distanceKm: String(route.distanceKm),
      durationMinutes: String(route.durationMinutes),
      estimatedFare: String(route.estimatedFare),
    }));
    return route;
  }

  function resolvedCustomerName() {
    if (forSomeoneElse) return form.customerName.trim();
    return form.customerName.trim() || "Laufkunde";
  }

  async function onCreate(e) {
    e.preventDefault();
    if (!token || !canCreate) return;
    setCreateMsg("");

    const customerName = resolvedCustomerName();
    if (!customerName) {
      setCreateMsg("Bitte Fahrgastnamen angeben.");
      return;
    }
    if (!hasRouteInputs) {
      setCreateMsg("Bitte Abhol- und Zieladresse vollständig angeben (Straße, Hausnummer, PLZ).");
      return;
    }
    const addrCheck = validatePartnerRouteAddressParts(
      { street: form.fromStreet, houseNumber: form.fromHouseNo, plz: form.fromPlz },
      { street: form.toStreet, houseNumber: form.toHouseNo, plz: form.toPlz },
    );
    if (!addrCheck.ok) {
      setCreateMsg(addrCheck.message);
      return;
    }
    if (scheduleMode === "reservation") {
      if (!form.scheduledAt.trim()) {
        setCreateMsg("Bitte Datum und Uhrzeit für die Reservierung wählen.");
        return;
      }
      if (!isReservationDatetimeValid(form.scheduledAt)) {
        setCreateMsg("Reservierung mindestens 60 Minuten im Voraus wählen.");
        return;
      }
    }

    setCreating(true);
    try {
      const route = await resolveRouteValues();
      const body = {
        customerName,
        from: shortAddressLabel(fromFull),
        fromFull: fromFull.trim(),
        to: shortAddressLabel(toFull),
        toFull: toFull.trim(),
        distanceKm: route.distanceKm,
        durationMinutes: route.durationMinutes,
        estimatedFare: route.estimatedFare,
        paymentMethod: form.paymentMethod.trim() || "rechnung",
        vehicle: form.vehicle.trim() || "standard",
        rideKind: form.rideKind,
        payerKind: form.payerKind,
        ...(scheduleMode === "reservation" && form.scheduledAt.trim()
          ? { scheduledAt: toIsoFromDatetimeLocal(form.scheduledAt) }
          : {}),
        ...(forSomeoneElse && form.customerPhone.trim() ? { customerPhone: form.customerPhone.trim() } : {}),
        ...(form.driverNote.trim() ? { driverNote: form.driverNote.trim().slice(0, NOTE_MAX) } : {}),
        ...(form.voucherCode.trim() ? { voucherCode: form.voucherCode.trim() } : {}),
        ...(form.billingReference.trim() ? { billingReference: form.billingReference.trim() } : {}),
        ...(form.accessCode.trim() ? { accessCode: form.accessCode.trim() } : {}),
      };
      const res = await fetch(`${API_BASE}/panel/v1/rides`, {
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
        setCreateMsg(mapCreateError(res, code));
        return;
      }
      const ride = data.ride ?? {};
      const status = typeof ride.status === "string" ? ride.status : "";
      const kind =
        scheduleMode === "reservation" || status === "scheduled"
          ? "Reservierung"
          : "Sofort-Taxi";
      const id = typeof ride.id === "string" ? ride.id : "";
      setCreateMsg(
        id
          ? `${kind} angelegt (ID ${id.slice(0, 8)}…). Unter „Meine Fahrten“ sichtbar.`
          : `${kind} wurde angelegt. Unter „Meine Fahrten“ sichtbar.`,
      );
      setForm((f) => ({
        ...f,
        customerName: "",
        customerPhone: "",
        fromStreet: "",
        fromHouseNo: "",
        fromPlz: "",
        toStreet: "",
        toHouseNo: "",
        toPlz: "",
        distanceKm: "",
        durationMinutes: "",
        estimatedFare: "",
        scheduledAt: defaultPartnerReservationDatetimeLocal(),
        driverNote: "",
        rideKind: "standard",
        payerKind: "passenger",
        voucherCode: "",
        billingReference: "",
        accessCode: "",
      }));
      setScheduleMode("now");
      setForSomeoneElse(true);
    } catch {
      setCreateMsg("Fahrt konnte nicht angelegt werden.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="panel-page panel-page--rides partner-booking-page">
      <p className="partner-page-eyebrow">Taxi buchen</p>
      <h2 className="partner-page-title">Neue Fahrt für Ihr Unternehmen</h2>
      <p className="partner-page-lead">
        Straße, Hausnummer und PLZ für Abholung und Ziel — Fahrgast, Zeitpunkt und Notiz wie in der Partner-App.
      </p>

      {!canCreate ? (
        <p className="panel-page__warn">Sie haben nur Leserechte — neue Fahrten können hier nicht angelegt werden.</p>
      ) : (
        <div className="panel-card panel-card--wide partner-booking-card">
          <form className="panel-rides-form partner-booking-form" onSubmit={onCreate}>
            <section className="partner-booking-section">
              <h3 className="partner-booking-section__title">Route</h3>
              <div className="panel-rides-form__grid">
                <div className="partner-booking-address-block">
                  <span>Abholung</span>
                  <div className="partner-booking-address-row">
                    <label className="panel-rides-form__field partner-booking-address-row__street">
                      <span>Straße</span>
                      <input
                        value={form.fromStreet}
                        onChange={(ev) => setForm((f) => ({ ...f, fromStreet: ev.target.value }))}
                        placeholder="Musterstraße"
                        autoComplete="address-line1"
                      />
                    </label>
                    <label className="panel-rides-form__field">
                      <span>Nr.</span>
                      <input
                        value={form.fromHouseNo}
                        onChange={(ev) => setForm((f) => ({ ...f, fromHouseNo: ev.target.value }))}
                        placeholder="12"
                        autoComplete="off"
                      />
                    </label>
                    <label className="panel-rides-form__field">
                      <span>PLZ</span>
                      <input
                        value={form.fromPlz}
                        onChange={(ev) =>
                          setForm((f) => ({ ...f, fromPlz: ev.target.value.replace(/\D/g, "").slice(0, 5) }))
                        }
                        placeholder="70771"
                        inputMode="numeric"
                        autoComplete="postal-code"
                      />
                    </label>
                  </div>
                </div>
                <div className="partner-booking-address-block">
                  <span>Ziel</span>
                  <div className="partner-booking-address-row">
                    <label className="panel-rides-form__field partner-booking-address-row__street">
                      <span>Straße</span>
                      <input
                        value={form.toStreet}
                        onChange={(ev) => setForm((f) => ({ ...f, toStreet: ev.target.value }))}
                        placeholder="Hauptstraße"
                        autoComplete="street-address"
                      />
                    </label>
                    <label className="panel-rides-form__field">
                      <span>Nr.</span>
                      <input
                        value={form.toHouseNo}
                        onChange={(ev) => setForm((f) => ({ ...f, toHouseNo: ev.target.value }))}
                        placeholder="1"
                        autoComplete="off"
                      />
                    </label>
                    <label className="panel-rides-form__field">
                      <span>PLZ</span>
                      <input
                        value={form.toPlz}
                        onChange={(ev) =>
                          setForm((f) => ({ ...f, toPlz: ev.target.value.replace(/\D/g, "").slice(0, 5) }))
                        }
                        placeholder="70173"
                        inputMode="numeric"
                        autoComplete="postal-code"
                      />
                    </label>
                  </div>
                </div>
                <p className="panel-page__muted partner-booking-hint">{PARTNER_ROUTE_ADDRESS_MESSAGE_DE}</p>
              </div>
              {routeReady ? (
                <div className="partner-booking-route-summary" aria-live="polite">
                  <span>{form.distanceKm} km</span>
                  <span>·</span>
                  <span>{form.durationMinutes} Min.</span>
                  <span>·</span>
                  <strong>{Number(form.estimatedFare).toFixed(2).replace(".", ",")} €</strong>
                  <span className="partner-booking-route-summary__tag">geschätzt</span>
                </div>
              ) : (
                <div className="partner-booking-route-actions">
                  <button
                    type="button"
                    className="panel-btn-secondary"
                    onClick={() => void autoFillRoute()}
                    disabled={routing || !hasRouteInputs}
                  >
                    {routing ? "Berechne Route …" : "Route & Preis berechnen"}
                  </button>
                  {form.distanceKm && !form.estimatedFare ? (
                    <button
                      type="button"
                      className="panel-btn-secondary"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          estimatedFare: String(
                            estimateSystemFare(Number(String(f.distanceKm).replace(",", "."))),
                          ),
                        }))
                      }
                    >
                      Systempreis aus KM
                    </button>
                  ) : null}
                </div>
              )}
            </section>

            <section className="partner-booking-section">
              <h3 className="partner-booking-section__title">Fahrgast</h3>
              <div className="partner-booking-mode-row">
                <label className="panel-radio-line">
                  <input
                    type="radio"
                    name="passengerMode"
                    checked={!forSomeoneElse}
                    onChange={() => setForSomeoneElse(false)}
                  />
                  <span>Laufkunde / ohne Namen</span>
                </label>
                <label className="panel-radio-line">
                  <input
                    type="radio"
                    name="passengerMode"
                    checked={forSomeoneElse}
                    onChange={() => setForSomeoneElse(true)}
                  />
                  <span>Für jemand anderen</span>
                </label>
              </div>
              {forSomeoneElse ? (
                <div className="panel-rides-form__grid">
                  <label className="panel-rides-form__field">
                    <span>Name des Fahrgasts</span>
                    <input
                      value={form.customerName}
                      onChange={(ev) => setForm((f) => ({ ...f, customerName: ev.target.value }))}
                      placeholder="z. B. Max Mustermann"
                      autoComplete="name"
                    />
                  </label>
                  <label className="panel-rides-form__field">
                    <span>Telefon (optional)</span>
                    <input
                      value={form.customerPhone}
                      onChange={(ev) => setForm((f) => ({ ...f, customerPhone: ev.target.value }))}
                      placeholder="+49 …"
                      inputMode="tel"
                      autoComplete="tel"
                    />
                  </label>
                </div>
              ) : (
                <p className="panel-page__muted partner-booking-hint">
                  Die Fahrt wird als „Laufkunde“ erfasst. Optional können Sie unten eine interne Referenz setzen.
                </p>
              )}
            </section>

            <section className="partner-booking-section">
              <h3 className="partner-booking-section__title">Zeitpunkt</h3>
              <div className="partner-booking-schedule">
                <button
                  type="button"
                  className={
                    scheduleMode === "now"
                      ? "partner-booking-schedule__btn partner-booking-schedule__btn--active"
                      : "partner-booking-schedule__btn"
                  }
                  onClick={() => setScheduleMode("now")}
                >
                  <strong>Sofort-Taxi</strong>
                  <span>Disposition sucht den nächsten freien Fahrer</span>
                </button>
                <button
                  type="button"
                  className={
                    scheduleMode === "reservation"
                      ? "partner-booking-schedule__btn partner-booking-schedule__btn--active"
                      : "partner-booking-schedule__btn"
                  }
                  onClick={() => setScheduleMode("reservation")}
                >
                  <strong>Reservierung</strong>
                  <span>Mindestens 60 Minuten im Voraus</span>
                </button>
              </div>
              {scheduleMode === "reservation" ? (
                <label className="panel-rides-form__field partner-booking-datetime">
                  <span>Abholzeit</span>
                  <input
                    type="datetime-local"
                    value={form.scheduledAt}
                    min={minPartnerReservationDatetimeLocal()}
                    onChange={(ev) => setForm((f) => ({ ...f, scheduledAt: ev.target.value }))}
                  />
                </label>
              ) : null}
            </section>

            <section className="partner-booking-section">
              <h3 className="partner-booking-section__title">Notiz für den Fahrer (optional)</h3>
              <label className="panel-rides-form__field panel-rides-form__field--2">
                <textarea
                  className="partner-booking-note"
                  value={form.driverNote}
                  onChange={(ev) => setForm((f) => ({ ...f, driverNote: ev.target.value.slice(0, NOTE_MAX) }))}
                  placeholder="z. B. Eingang Hinterhof, Rollator, Anruf bei Ankunft"
                  rows={3}
                  maxLength={NOTE_MAX}
                />
                <span className="partner-booking-note-count">
                  {form.driverNote.length}/{NOTE_MAX}
                </span>
              </label>
            </section>

            <section className="partner-booking-section partner-booking-section--advanced">
              <button
                type="button"
                className="partner-booking-advanced-toggle"
                onClick={() => setShowAdvanced((v) => !v)}
                aria-expanded={showAdvanced}
              >
                {showAdvanced ? "Weniger Optionen" : "Weitere Optionen (Fahrzeug, Abrechnung)"}
              </button>
              {showAdvanced ? (
                <div className="panel-rides-form__grid">
                  <label className="panel-rides-form__field">
                    <span>Fahrzeug</span>
                    <select
                      value={form.vehicle}
                      onChange={(ev) => setForm((f) => ({ ...f, vehicle: ev.target.value }))}
                    >
                      <option value="standard">Standard</option>
                      <option value="xl">XL / Van</option>
                      <option value="wheelchair">Rollstuhl</option>
                    </select>
                  </label>
                  <label className="panel-rides-form__field">
                    <span>Zahler / Abrechnung</span>
                    <select
                      value={form.payerKind}
                      onChange={(ev) => setForm((f) => ({ ...f, payerKind: ev.target.value }))}
                    >
                      <option value="passenger">Fahrgast</option>
                      <option value="company">Firma (Rechnung)</option>
                      <option value="insurance">Kostenträger</option>
                      <option value="voucher">Gutschein</option>
                      <option value="third_party">Dritter</option>
                    </select>
                  </label>
                  <label className="panel-rides-form__field">
                    <span>Fahrttyp</span>
                    <select
                      value={form.rideKind}
                      onChange={(ev) => setForm((f) => ({ ...f, rideKind: ev.target.value }))}
                    >
                      <option value="standard">Normale Fahrt</option>
                      <option value="medical">Krankenfahrt</option>
                      <option value="voucher">Gutschein-Fahrt</option>
                      <option value="company">Firmenfahrt</option>
                    </select>
                  </label>
                  <label className="panel-rides-form__field">
                    <span>Interne Referenz (optional)</span>
                    <input
                      value={form.billingReference}
                      onChange={(ev) => setForm((f) => ({ ...f, billingReference: ev.target.value }))}
                      placeholder="Kostenstelle, Fallnummer …"
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
                        placeholder="Kostenübernahme durch Auftraggeber"
                        autoComplete="off"
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
            </section>

            {createMsg ? (
              <p
                className={
                  createMsg.includes("angelegt") ? "panel-page__ok partner-booking-feedback" : "panel-page__warn partner-booking-feedback"
                }
              >
                {createMsg}
              </p>
            ) : null}

            <button type="submit" className="panel-btn-primary partner-booking-submit" disabled={creating || routing}>
              {creating ? "Wird gebucht …" : scheduleMode === "reservation" ? "Reservierung anlegen" : "Sofort-Taxi bestellen"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
