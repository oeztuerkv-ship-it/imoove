import { useEffect, useMemo, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { hasPanelModule } from "../lib/panelNavigation.js";
import { paymentMethodForPayerMode } from "../lib/partnerRideOps.js";
import {
  defaultPartnerReservationDatetimeLocal,
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

function mapCreateError(res, data) {
  const code = typeof data?.error === "string" ? data.error : "";
  const msg = typeof data?.message === "string" ? data.message.trim() : "";
  const hint = typeof data?.hint === "string" ? data.hint.trim() : "";

  if (msg) return msg;
  if (code === "partner_address_incomplete") {
    return "Adresse unvollständig — Straße, Hausnummer und PLZ prüfen.";
  }
  if (code === "billing_reference_required") {
    return "Bei Rechnungszahlung bitte interne Referenz (Kostenstelle / Fallnummer) angeben.";
  }
  if (res.status === 403) {
    if (code === "company_kind_not_allowed_for_instant_ride") {
      return "Sofortfahrten sind für Ihren Mandantentyp nicht freigeschaltet — bitte Reservierung wählen.";
    }
    if (code === "route_outside_assigned_area") {
      return "Route liegt außerhalb Ihrer zugewiesenen Einsatzgebiete.";
    }
    if (code === "module_disabled") {
      return hint ? `Funktion nicht freigeschaltet (${hint}).` : "Funktion für Ihr Konto nicht freigeschaltet.";
    }
    return "Keine Berechtigung, Fahrten anzulegen.";
  }
  if (code === "customer_name_required") return "Bitte Fahrgastnamen angeben.";
  if (code === "route_fields_required") return "Route unvollständig.";
  if (code === "service_area_not_covered") {
    return "Adresse liegt außerhalb des Servicegebietes.";
  }
  if (code === "from_not_found") return "Abholadresse konnte nicht gefunden werden.";
  if (code === "to_not_found") return "Zieladresse konnte nicht gefunden werden.";
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
  if (code === "feature_invoice_disabled") {
    return "Rechnungszahlung ist derzeit nicht freigeschaltet.";
  }
  if (code === "feature_normal_ride_disabled") {
    return "Normale Fahrten sind derzeit nicht freigeschaltet.";
  }
  if (code === "feature_prebooking_disabled") {
    return "Reservierungen sind derzeit nicht freigeschaltet.";
  }
  if (code === "tariffs_inactive") {
    return "Tarife sind derzeit nicht aktiv — bitte später erneut versuchen.";
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
  if (code) return `Fahrt konnte nicht angelegt werden (${code}).`;
  if (res.status >= 500) return "Serverfehler — bitte kurz warten und erneut senden.";
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
  const [payerMode, setPayerMode] = useState("passenger");
  const [payerConfirmed, setPayerConfirmed] = useState(false);

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
    fromLat: null,
    fromLon: null,
    toLat: null,
    toLon: null,
    paymentMethod: "Barzahlung",
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

  const companyPays = payerMode === "company";

  useEffect(() => {
    if (!form.accessCode.trim()) return;
    setPayerMode("company");
    setForm((f) => ({
      ...f,
      payerKind: "company",
      paymentMethod: paymentMethodForPayerMode("company"),
    }));
  }, [form.accessCode]);

  useEffect(() => {
    setForm((f) => ({
      ...f,
      payerKind: payerMode === "company" ? "company" : "passenger",
      paymentMethod:
        payerMode === "company"
          ? paymentMethodForPayerMode("company")
          : f.paymentMethod === "rechnung"
            ? "Barzahlung"
            : f.paymentMethod,
    }));
    setPayerConfirmed(false);
  }, [payerMode]);

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

  async function applyRouteResult(route) {
    setForm((f) => ({
      ...f,
      distanceKm: String(route.distanceKm),
      durationMinutes: String(route.durationMinutes),
      estimatedFare: String(route.estimatedFare),
      fromLat: route.fromLat ?? null,
      fromLon: route.fromLon ?? null,
      toLat: route.toLat ?? null,
      toLon: route.toLon ?? null,
    }));
    return route;
  }

  async function fetchFreshRoute() {
    const route = await fetchDistanceMatrixByAddress(fromFull, toFull, token, {
      vehicle: form.vehicle,
    });
    await applyRouteResult(route);
    return route;
  }

  async function autoFillRoute() {
    if (!hasRouteInputs) return;
    setRouting(true);
    setCreateMsg("");
    try {
      await fetchFreshRoute();
    } catch (e) {
      setCreateMsg(e instanceof Error ? e.message : "Route konnte nicht automatisch berechnet werden.");
      setForm((f) => ({
        ...f,
        distanceKm: "",
        durationMinutes: "",
        estimatedFare: "",
        fromLat: null,
        fromLon: null,
        toLat: null,
        toLon: null,
      }));
    } finally {
      setRouting(false);
    }
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
    if (companyPays && !form.billingReference.trim()) {
      setCreateMsg("Bei Rechnungszahlung bitte interne Referenz angeben (Kostenstelle / Fallnummer).");
      return;
    }
    if (!payerConfirmed) {
      setCreateMsg("Bitte bestätigen Sie die Zahlungsregelung und Disposition.");
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
      const route = await fetchFreshRoute();
      const body = {
        customerName,
        from: shortAddressLabel(fromFull),
        fromFull: fromFull.trim(),
        to: shortAddressLabel(toFull),
        toFull: toFull.trim(),
        distanceKm: route.distanceKm,
        durationMinutes: route.durationMinutes,
        estimatedFare: route.estimatedFare,
        ...(route.fromLat != null && route.fromLon != null ? { fromLat: route.fromLat, fromLon: route.fromLon } : {}),
        ...(route.toLat != null && route.toLon != null ? { toLat: route.toLat, toLon: route.toLon } : {}),
        paymentMethod: form.paymentMethod.trim() || paymentMethodForPayerMode(payerMode),
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
        setCreateMsg(mapCreateError(res, data));
        return;
      }
      const ride = data.ride ?? {};
      const status = typeof ride.status === "string" ? ride.status : "";
      const kind =
        scheduleMode === "reservation" || status === "scheduled"
          ? "Reservierung"
          : "Sofort-Taxi";
      const dispatchHint =
        scheduleMode === "now"
          ? " Fahrersuche startet — Status unter „Meine Fahrten“."
          : " Termin gespeichert — Fahrer-Zuweisung zum Abholzeitpunkt.";
      const id = typeof ride.id === "string" ? ride.id : "";
      setCreateMsg(
        id
          ? `${kind} angelegt (ID ${id.slice(0, 8)}…).${dispatchHint}`
          : `${kind} wurde angelegt.${dispatchHint}`,
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
        fromLat: null,
        fromLon: null,
        toLat: null,
        toLon: null,
        scheduledAt: defaultPartnerReservationDatetimeLocal(),
        driverNote: "",
        rideKind: "standard",
        payerKind: "passenger",
        paymentMethod: "Barzahlung",
        voucherCode: "",
        billingReference: "",
        accessCode: "",
      }));
      setPayerMode("passenger");
      setPayerConfirmed(false);
      setScheduleMode("now");
      setForSomeoneElse(true);
    } catch {
      setCreateMsg("Fahrt konnte nicht angelegt werden.");
    } finally {
      setCreating(false);
    }
  }

  const summaryFare = routeReady ? `${Number(form.estimatedFare).toFixed(2).replace(".", ",")} €` : "—";

  return (
    <div className="panel-page panel-page--rides partner-booking-page partner-booking-page--modern">
      <header className="partner-booking-hero">
        <p className="partner-page-eyebrow">Taxi buchen</p>
        <h2 className="partner-page-title">Neue Fahrt für Ihr Unternehmen</h2>
        <p className="partner-page-lead">
          Route, Fahrgast, Zahler und Disposition in einem Ablauf — wie in der Partner-App, mit klarer Abrechnung.
        </p>
      </header>

      {!canCreate ? (
        <p className="panel-page__warn">Sie haben nur Leserechte — neue Fahrten können hier nicht angelegt werden.</p>
      ) : (
        <div className="partner-booking-layout">
          <form className="partner-booking-main" onSubmit={onCreate}>
            <section className="partner-ops-card">
              <div className="partner-ops-card__head">
                <span className="partner-ops-card__step">1</span>
                <div>
                  <h3 className="partner-ops-card__title">Route</h3>
                  <p className="partner-ops-card__lead">Straße, Hausnummer und PLZ — Preis wird automatisch berechnet.</p>
                </div>
              </div>
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
                <div className="partner-booking-route-summary partner-booking-route-summary--modern" aria-live="polite">
                  <div>
                    <span className="partner-booking-route-summary__km">{form.distanceKm} km</span>
                    <span className="partner-booking-route-summary__sep">·</span>
                    <span>{form.durationMinutes} Min.</span>
                  </div>
                  <strong className="partner-booking-route-summary__price">{summaryFare}</strong>
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
                </div>
              )}
            </section>

            <section className="partner-ops-card">
              <div className="partner-ops-card__head">
                <span className="partner-ops-card__step">2</span>
                <div>
                  <h3 className="partner-ops-card__title">Fahrgast</h3>
                  <p className="partner-ops-card__lead">Für wen wird die Fahrt gebucht?</p>
                </div>
              </div>
              <div className="partner-payer-grid partner-payer-grid--2">
                <button
                  type="button"
                  className={!forSomeoneElse ? "partner-payer-tile partner-payer-tile--active" : "partner-payer-tile"}
                  onClick={() => setForSomeoneElse(false)}
                >
                  <strong>Laufkunde</strong>
                  <span>Ohne Namen — z. B. Straßenfahrt</span>
                </button>
                <button
                  type="button"
                  className={forSomeoneElse ? "partner-payer-tile partner-payer-tile--active" : "partner-payer-tile"}
                  onClick={() => setForSomeoneElse(true)}
                >
                  <strong>Für jemand anderen</strong>
                  <span>Name und optional Telefon</span>
                </button>
              </div>
              {forSomeoneElse ? (
                <div className="panel-rides-form__grid partner-ops-card__body">
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
              ) : null}
            </section>

            <section className="partner-ops-card">
              <div className="partner-ops-card__head">
                <span className="partner-ops-card__step">3</span>
                <div>
                  <h3 className="partner-ops-card__title">Wer zahlt?</h3>
                  <p className="partner-ops-card__lead">Legt fest, ob der Fahrgast oder Ihr Unternehmen abgerechnet wird.</p>
                </div>
              </div>
              <div className="partner-payer-grid partner-payer-grid--2">
                <button
                  type="button"
                  className={payerMode === "passenger" ? "partner-payer-tile partner-payer-tile--active" : "partner-payer-tile"}
                  onClick={() => setPayerMode("passenger")}
                >
                  <strong>Fahrgast zahlt</strong>
                  <span>Bar oder Karte beim Fahrer</span>
                </button>
                <button
                  type="button"
                  className={payerMode === "company" ? "partner-payer-tile partner-payer-tile--active" : "partner-payer-tile"}
                  onClick={() => setPayerMode("company")}
                >
                  <strong>Ihr Unternehmen zahlt</strong>
                  <span>Rechnung nach Fahrtabschluss</span>
                </button>
              </div>

              {payerMode === "passenger" ? (
                <div className="partner-ops-card__body">
                  <label className="panel-rides-form__field">
                    <span>Zahlungsart beim Fahrer</span>
                    <select
                      value={form.paymentMethod}
                      onChange={(ev) => setForm((f) => ({ ...f, paymentMethod: ev.target.value }))}
                    >
                      <option value="Barzahlung">Barzahlung</option>
                      <option value="Karte">Karte (beim Fahrer)</option>
                    </select>
                  </label>
                  <p className="partner-ops-hint">
                    Der Fahrer kassiert direkt beim Fahrgast. Keine Rechnung an Ihr Unternehmen.
                  </p>
                </div>
              ) : (
                <div className="partner-ops-card__body">
                  <label className="panel-rides-form__field">
                    <span>Interne Referenz (Pflicht)</span>
                    <input
                      value={form.billingReference}
                      onChange={(ev) => setForm((f) => ({ ...f, billingReference: ev.target.value }))}
                      placeholder="Kostenstelle, Auftragsnummer, Fall …"
                      autoComplete="off"
                      required={companyPays}
                    />
                  </label>
                  <div className="partner-billing-callout">
                    <strong>So läuft die Rechnung</strong>
                    <p>
                      Nach Abschluss der Fahrt erscheint der Betrag in Ihrer Abrechnung (Export oder Monatsrechnung).
                      Krankenfahrten haben einen separaten Rechnungs-Flow im Bereich Krankenfahrten.
                    </p>
                  </div>
                </div>
              )}
            </section>

            <section className="partner-ops-card">
              <div className="partner-ops-card__head">
                <span className="partner-ops-card__step">4</span>
                <div>
                  <h3 className="partner-ops-card__title">Zeitpunkt & Disposition</h3>
                  <p className="partner-ops-card__lead">Sofortfahrt startet die Fahrersuche; Reservierung plant den Termin.</p>
                </div>
              </div>
              <div className="partner-booking-schedule partner-booking-schedule--modern">
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
                  <span>Online-Fahrer werden benachrichtigt</span>
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
              ) : (
                <p className="partner-ops-hint">
                  Nach dem Buchen: Status „Fahrersuche“ in Meine Fahrten — Annahme und Ablehnungen dort sichtbar.
                </p>
              )}
            </section>

            <section className="partner-ops-card partner-ops-card--compact">
              <label className="panel-rides-form__field panel-rides-form__field--2">
                <span>Notiz für den Fahrer (optional)</span>
                <textarea
                  className="partner-booking-note"
                  value={form.driverNote}
                  onChange={(ev) => setForm((f) => ({ ...f, driverNote: ev.target.value.slice(0, NOTE_MAX) }))}
                  placeholder="z. B. Eingang Hinterhof, Rollator"
                  rows={2}
                  maxLength={NOTE_MAX}
                />
                <span className="partner-booking-note-count">
                  {form.driverNote.length}/{NOTE_MAX}
                </span>
              </label>
              <button
                type="button"
                className="partner-booking-advanced-toggle"
                onClick={() => setShowAdvanced((v) => !v)}
                aria-expanded={showAdvanced}
              >
                {showAdvanced ? "Weniger Optionen" : "Fahrzeug, Gutschein, Freigabe-Code …"}
              </button>
              {showAdvanced ? (
                <div className="panel-rides-form__grid partner-ops-card__body">
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
                    <span>Fahrttyp</span>
                    <select
                      value={form.rideKind}
                      onChange={(ev) => {
                        const rk = ev.target.value;
                        setForm((f) => ({
                          ...f,
                          rideKind: rk,
                          ...(rk === "medical" ? { payerKind: "insurance", paymentMethod: "rechnung" } : {}),
                        }));
                        if (rk === "medical") setPayerMode("company");
                      }}
                    >
                      <option value="standard">Normale Fahrt</option>
                      <option value="medical">Krankenfahrt</option>
                      <option value="company">Firmenfahrt</option>
                    </select>
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
                            ...(ev.target.value.trim()
                              ? { payerKind: "company", paymentMethod: "rechnung" }
                              : {}),
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

            <section className="partner-ops-card partner-ops-card--confirm">
              <label className="partner-confirm-line">
                <input
                  type="checkbox"
                  checked={payerConfirmed}
                  onChange={(ev) => setPayerConfirmed(ev.target.checked)}
                />
                <span>
                  Ich bestätige:{" "}
                  {companyPays
                    ? "Mein Unternehmen trägt die Kosten — Rechnung nach Fahrtabschluss."
                    : "Der Fahrgast zahlt direkt beim Fahrer."}{" "}
                  {scheduleMode === "now" ? "Die Fahrersuche startet nach dem Buchen." : "Die Reservierung wird geplant."}
                </span>
              </label>
            </section>

            {createMsg ? (
              <p
                className={
                  createMsg.includes("angelegt")
                    ? "panel-page__ok partner-booking-feedback"
                    : "panel-page__warn partner-booking-feedback"
                }
              >
                {createMsg}
              </p>
            ) : null}

            <button
              type="submit"
              className="panel-btn-primary partner-booking-submit partner-booking-submit--wide"
              disabled={creating || routing || !routeReady || !payerConfirmed}
            >
              {creating ? "Wird gebucht …" : routing ? "Route wird berechnet …" : scheduleMode === "reservation" ? "Reservierung anlegen" : "Sofort-Taxi bestellen"}
            </button>
          </form>

          <aside className="partner-booking-aside" aria-label="Buchungsübersicht">
            <div className="partner-booking-summary">
              <h3 className="partner-booking-summary__title">Übersicht</h3>
              <dl className="partner-booking-summary__list">
                <div>
                  <dt>Route</dt>
                  <dd>{hasRouteInputs ? `${fromFull} → ${toFull}` : "Noch offen"}</dd>
                </div>
                <div>
                  <dt>Preis (geschätzt)</dt>
                  <dd className="partner-booking-summary__price">{summaryFare}</dd>
                </div>
                <div>
                  <dt>Zahler</dt>
                  <dd>{companyPays ? "Ihr Unternehmen (Rechnung)" : "Fahrgast"}</dd>
                </div>
                <div>
                  <dt>Zahlung</dt>
                  <dd>{companyPays ? "Rechnung nach Abschluss" : form.paymentMethod}</dd>
                </div>
                <div>
                  <dt>Disposition</dt>
                  <dd>{scheduleMode === "now" ? "Sofort — Fahrersuche" : "Reservierung"}</dd>
                </div>
              </dl>
              {!payerConfirmed ? (
                <p className="partner-booking-summary__hint">Bestätigung unten erforderlich zum Buchen.</p>
              ) : null}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
