import { useEffect, useMemo, useState } from "react";
import { usePanelAuth } from "../context/PanelAuthContext.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { hasPanelModule } from "../lib/panelNavigation.js";
import { paymentMethodForPayerMode } from "../lib/partnerRideOps.js";
import PartnerAddressFavoritesBar from "../components/PartnerAddressFavoritesBar.jsx";
import PartnerBookingChoiceCard from "../components/PartnerBookingChoiceCard.jsx";
import PartnerBookingStepper from "../components/PartnerBookingStepper.jsx";
import PartnerBookingSummaryAside from "../components/PartnerBookingSummaryAside.jsx";
import {
  addPartnerAddressFavorite,
  loadPartnerAddressFavorites,
  MAX_PARTNER_ADDRESS_FAVORITES,
  removePartnerAddressFavorite,
} from "../lib/partnerAddressFavorites.js";
import {
  defaultPartnerReservationDatetimeLocal,
  fetchDistanceMatrixByAddress,
  formatPartnerAddressFull,
  isReservationDatetimeValid,
  maxPartnerReservationDatetimeLocal,
  minPartnerReservationDatetimeLocal,
  shortAddressLabel,
  toIsoFromDatetimeLocal,
  validatePartnerRouteAddressParts,
  PARTNER_ROUTE_ADDRESS_MESSAGE_DE,
} from "../lib/smartBooking.js";
import { validatePartnerAddressParts } from "../lib/partnerAddressValidation.js";

const NOTE_MAX = 200;
const BOOKING_FORM_ID = "partner-booking-form";

const ICON = {
  route: "📍",
  passenger: "👤",
  payment: "💳",
  schedule: "📅",
  note: "📝",
  pickup: "🟢",
  dropoff: "🔴",
};

function routePreviewMapUrl(fromLat, fromLon, toLat, toLon) {
  if (!Number.isFinite(fromLat) || !Number.isFinite(fromLon)) return null;
  if (Number.isFinite(toLat) && Number.isFinite(toLon)) {
    const centerLat = (fromLat + toLat) / 2;
    const centerLon = (fromLon + toLon) / 2;
    const markers = `markers=${fromLat},${fromLon},lightgreen1|${toLat},${toLon},red`;
    return `https://staticmap.openstreetmap.de/staticmap.php?center=${centerLat},${centerLon}&zoom=12&size=640x180&${markers}`;
  }
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${fromLat},${fromLon}&zoom=14&size=640x180&markers=${fromLat},${fromLon},lightgreen1`;
}

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
  if (code === "scheduled_at_too_far") {
    return "Reservierung maximal 5 Tage im Voraus möglich.";
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
  const [addressFavorites, setAddressFavorites] = useState([]);
  const [favoriteMsg, setFavoriteMsg] = useState("");

  const companyId = typeof user?.companyId === "string" ? user.companyId.trim() : "";

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
    if (!companyId) {
      setAddressFavorites([]);
      return;
    }
    setAddressFavorites(loadPartnerAddressFavorites(companyId));
  }, [companyId]);

  function applyFavoriteToSide(side, fav) {
    setFavoriteMsg("");
    setForm((f) => ({
      ...f,
      ...(side === "from"
        ? {
            fromStreet: fav.street,
            fromHouseNo: fav.houseNo,
            fromPlz: fav.plz,
            fromLat: fav.lat ?? null,
            fromLon: fav.lon ?? null,
          }
        : {
            toStreet: fav.street,
            toHouseNo: fav.houseNo,
            toPlz: fav.plz,
            toLat: fav.lat ?? null,
            toLon: fav.lon ?? null,
          }),
    }));
  }

  function saveFavoriteFromSide(side) {
    setFavoriteMsg("");
    const parts =
      side === "from"
        ? { street: form.fromStreet, houseNo: form.fromHouseNo, plz: form.fromPlz }
        : { street: form.toStreet, houseNo: form.toHouseNo, plz: form.toPlz };
    const check = validatePartnerAddressParts(parts.street, parts.houseNo, parts.plz, side);
    if (!check.ok) {
      setFavoriteMsg(check.message);
      return;
    }
    if (!companyId) {
      setFavoriteMsg("Favoriten sind erst nach dem Laden Ihres Unternehmens verfügbar.");
      return;
    }
    const defaultLabel =
      formatPartnerAddressFull(parts.street, parts.houseNo, parts.plz).split(",")[0]?.trim() || "Favorit";
    const labelInput = window.prompt("Name für den Favoriten:", defaultLabel);
    if (labelInput == null) return;
    const result = addPartnerAddressFavorite(companyId, {
      label: labelInput,
      street: parts.street,
      houseNo: parts.houseNo,
      plz: parts.plz,
      lat: side === "from" ? form.fromLat : form.toLat,
      lon: side === "from" ? form.fromLon : form.toLon,
    });
    if (!result.ok) {
      if (result.error === "duplicate") {
        setFavoriteMsg("Diese Adresse ist bereits als Favorit gespeichert.");
      } else if (result.error === "limit_reached") {
        setFavoriteMsg(`Maximal ${MAX_PARTNER_ADDRESS_FAVORITES} Favoriten möglich.`);
      } else {
        setFavoriteMsg("Adresse unvollständig — Straße, Hausnummer und PLZ prüfen.");
      }
      return;
    }
    setAddressFavorites(result.favorites);
    setFavoriteMsg(`„${labelInput.trim() || defaultLabel}“ als Favorit gespeichert.`);
  }

  function removeFavorite(favoriteId) {
    if (!companyId) return;
    setAddressFavorites(removePartnerAddressFavorite(companyId, favoriteId));
    setFavoriteMsg("");
  }

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
          : " Termin gespeichert — im Fahrer-Planer sofort sichtbar.";
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

  const passengerStepDone = !forSomeoneElse || form.customerName.trim().length > 0;
  const paymentStepDone = payerMode === "passenger" || form.billingReference.trim().length > 0;
  const scheduleStepDone =
    scheduleMode === "now" ||
    (form.scheduledAt.trim().length > 0 && isReservationDatetimeValid(form.scheduledAt));

  const bookingSteps = {
    route: { label: "Route", done: routeReady },
    passenger: { label: "Fahrgast", done: passengerStepDone },
    payment: { label: "Zahlung", done: paymentStepDone },
    schedule: { label: "Termin", done: scheduleStepDone },
  };

  const activeStepKey =
    !routeReady
      ? "route"
      : !passengerStepDone
        ? "passenger"
        : !paymentStepDone
          ? "payment"
          : !scheduleStepDone
            ? "schedule"
            : "schedule";

  const passengerLabel = forSomeoneElse
    ? form.customerName.trim() || "Name fehlt"
    : "Laufkunde";

  const scheduleLabel =
    scheduleMode === "now"
      ? "Sofort-Taxi"
      : form.scheduledAt.trim()
        ? `Reservierung · ${form.scheduledAt.replace("T", " ")}`
        : "Reservierung";

  const mapPreviewUrl = routePreviewMapUrl(form.fromLat, form.fromLon, form.toLat, form.toLon);

  const submitLabel =
    scheduleMode === "reservation" ? "Reservierung anlegen" : "Fahrt buchen";

  const companyPaysConfirmText = companyPays
    ? "Mein Unternehmen trägt die Kosten — Rechnung nach Fahrtabschluss."
    : "Der Fahrgast zahlt direkt beim Fahrer.";

  const scheduleConfirmText =
    scheduleMode === "now" ? "Die Fahrersuche startet nach dem Buchen." : "Die Reservierung wird geplant.";

  return (
    <div className="panel-page panel-page--rides partner-booking-page partner-booking-page--saas">
      <header className="partner-booking-hero partner-booking-hero--saas">
        <p className="partner-page-eyebrow">Taxi buchen</p>
        <h2 className="partner-page-title">Neue Fahrt für Ihr Unternehmen</h2>
        <p className="partner-page-lead">
          Route, Fahrgast, Zahler und Disposition in einem Ablauf — mit klarer Abrechnung für Ihr Unternehmen.
        </p>
      </header>

      {!canCreate ? (
        <p className="panel-page__warn">Sie haben nur Leserechte — neue Fahrten können hier nicht angelegt werden.</p>
      ) : (
        <>
          <PartnerBookingStepper steps={bookingSteps} activeKey={activeStepKey} />

          <div className="partner-booking-layout partner-booking-layout--saas">
            <form id={BOOKING_FORM_ID} className="partner-booking-main partner-booking-main--saas" onSubmit={onCreate}>
              <section className="partner-ops-card partner-ops-card--saas partner-booking-section partner-booking-section--route">
                <header className="partner-booking-section__head">
                  <span className="partner-booking-section__icon" aria-hidden>
                    {ICON.route}
                  </span>
                  <div>
                    <h3 className="partner-booking-section__title">Route</h3>
                    <p className="partner-booking-section__lead">
                      Start und Ziel — Preis und Strecke werden automatisch berechnet.
                    </p>
                  </div>
                </header>

                {mapPreviewUrl ? (
                  <div className="partner-booking-map-preview partner-booking-map-preview--fade-in">
                    <img src={mapPreviewUrl} alt="Routenvorschau" loading="lazy" />
                    {routing ? <span className="partner-booking-map-preview__loading">Aktualisiere …</span> : null}
                  </div>
                ) : hasRouteInputs && routing ? (
                  <div className="partner-booking-map-preview partner-booking-map-preview--skeleton" aria-hidden>
                    <span>Route wird berechnet …</span>
                  </div>
                ) : null}

                <PartnerAddressFavoritesBar
                  favorites={addressFavorites}
                  onApply={applyFavoriteToSide}
                  onRemove={removeFavorite}
                />
                {favoriteMsg ? (
                  <p
                    className={
                      favoriteMsg.includes("gespeichert")
                        ? "panel-page__ok partner-booking-favorite-msg"
                        : "panel-page__warn partner-booking-favorite-msg"
                    }
                  >
                    {favoriteMsg}
                  </p>
                ) : null}

                <div className="panel-rides-form__grid partner-booking-route-grid">
                  <div className="partner-booking-address-block partner-booking-address-block--saas">
                    <div className="partner-booking-address-block__head">
                      <span>
                        <span aria-hidden>{ICON.pickup}</span> Abholung
                      </span>
                      <button
                        type="button"
                        className="partner-address-favorite-save"
                        onClick={() => saveFavoriteFromSide("from")}
                      >
                        ★ Favorit
                      </button>
                    </div>
                    <div className="partner-booking-address-row">
                      <label className="panel-rides-form__field partner-booking-address-row__street partner-booking-field--icon">
                        <span>Straße</span>
                        <span className="partner-booking-field__wrap">
                          <span className="partner-booking-field__icon" aria-hidden>
                            {ICON.route}
                          </span>
                          <input
                            className="partner-booking-input"
                            value={form.fromStreet}
                            onChange={(ev) => setForm((f) => ({ ...f, fromStreet: ev.target.value }))}
                            placeholder="Musterstraße"
                            autoComplete="address-line1"
                          />
                        </span>
                      </label>
                      <label className="panel-rides-form__field partner-booking-field--icon">
                        <span>Nr.</span>
                        <span className="partner-booking-field__wrap">
                          <input
                            className="partner-booking-input"
                            value={form.fromHouseNo}
                            onChange={(ev) => setForm((f) => ({ ...f, fromHouseNo: ev.target.value }))}
                            placeholder="12"
                            autoComplete="off"
                          />
                        </span>
                      </label>
                      <label className="panel-rides-form__field partner-booking-field--icon">
                        <span>PLZ</span>
                        <span className="partner-booking-field__wrap">
                          <input
                            className="partner-booking-input"
                            value={form.fromPlz}
                            onChange={(ev) =>
                              setForm((f) => ({ ...f, fromPlz: ev.target.value.replace(/\D/g, "").slice(0, 5) }))
                            }
                            placeholder="70771"
                            inputMode="numeric"
                            autoComplete="postal-code"
                          />
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="partner-booking-address-block partner-booking-address-block--saas">
                    <div className="partner-booking-address-block__head">
                      <span>
                        <span aria-hidden>{ICON.dropoff}</span> Ziel
                      </span>
                      <button
                        type="button"
                        className="partner-address-favorite-save"
                        onClick={() => saveFavoriteFromSide("to")}
                      >
                        ★ Favorit
                      </button>
                    </div>
                    <div className="partner-booking-address-row">
                      <label className="panel-rides-form__field partner-booking-address-row__street partner-booking-field--icon">
                        <span>Straße</span>
                        <span className="partner-booking-field__wrap">
                          <span className="partner-booking-field__icon" aria-hidden>
                            {ICON.route}
                          </span>
                          <input
                            className="partner-booking-input"
                            value={form.toStreet}
                            onChange={(ev) => setForm((f) => ({ ...f, toStreet: ev.target.value }))}
                            placeholder="Hauptstraße"
                            autoComplete="street-address"
                          />
                        </span>
                      </label>
                      <label className="panel-rides-form__field partner-booking-field--icon">
                        <span>Nr.</span>
                        <span className="partner-booking-field__wrap">
                          <input
                            className="partner-booking-input"
                            value={form.toHouseNo}
                            onChange={(ev) => setForm((f) => ({ ...f, toHouseNo: ev.target.value }))}
                            placeholder="1"
                            autoComplete="off"
                          />
                        </span>
                      </label>
                      <label className="panel-rides-form__field partner-booking-field--icon">
                        <span>PLZ</span>
                        <span className="partner-booking-field__wrap">
                          <input
                            className="partner-booking-input"
                            value={form.toPlz}
                            onChange={(ev) =>
                              setForm((f) => ({ ...f, toPlz: ev.target.value.replace(/\D/g, "").slice(0, 5) }))
                            }
                            placeholder="70173"
                            inputMode="numeric"
                            autoComplete="postal-code"
                          />
                        </span>
                      </label>
                    </div>
                  </div>
                  <p className="panel-page__muted partner-booking-hint">{PARTNER_ROUTE_ADDRESS_MESSAGE_DE}</p>
                </div>

                {routeReady ? (
                  <div className="partner-booking-route-live partner-booking-route-live--fade-in" aria-live="polite">
                    <span className="partner-booking-route-live__metric">
                      <span aria-hidden>📏</span> {form.distanceKm} km
                    </span>
                    <span className="partner-booking-route-live__metric">
                      <span aria-hidden>⏱</span> {form.durationMinutes} Min.
                    </span>
                    <strong className="partner-booking-route-live__price">{summaryFare}</strong>
                  </div>
                ) : null}
              </section>

              <section className="partner-ops-card partner-ops-card--saas partner-booking-section">
                <header className="partner-booking-section__head">
                  <span className="partner-booking-section__icon" aria-hidden>
                    {ICON.passenger}
                  </span>
                  <div>
                    <h3 className="partner-booking-section__title">Fahrgast</h3>
                    <p className="partner-booking-section__lead">Für wen wird die Fahrt gebucht?</p>
                  </div>
                </header>
                <div className="partner-payer-grid partner-payer-grid--2">
                  <PartnerBookingChoiceCard
                    active={!forSomeoneElse}
                    icon="🚶"
                    title="Laufkunde"
                    description="Ohne Namen — z. B. Straßenfahrt"
                    onClick={() => setForSomeoneElse(false)}
                  />
                  <PartnerBookingChoiceCard
                    active={forSomeoneElse}
                    icon="👤"
                    title="Für jemand anderen"
                    description="Name und optional Telefon"
                    onClick={() => setForSomeoneElse(true)}
                  />
                </div>
                {forSomeoneElse ? (
                  <div className="panel-rides-form__grid partner-ops-card__body partner-booking-fields--fade-in">
                    <label className="panel-rides-form__field partner-booking-field--icon">
                      <span>Name des Fahrgasts</span>
                      <span className="partner-booking-field__wrap">
                        <span className="partner-booking-field__icon" aria-hidden>
                          {ICON.passenger}
                        </span>
                        <input
                          className="partner-booking-input"
                          value={form.customerName}
                          onChange={(ev) => setForm((f) => ({ ...f, customerName: ev.target.value }))}
                          placeholder="z. B. Max Mustermann"
                          autoComplete="name"
                        />
                      </span>
                    </label>
                    <label className="panel-rides-form__field partner-booking-field--icon">
                      <span>Telefon (optional)</span>
                      <span className="partner-booking-field__wrap">
                        <input
                          className="partner-booking-input"
                          value={form.customerPhone}
                          onChange={(ev) => setForm((f) => ({ ...f, customerPhone: ev.target.value }))}
                          placeholder="+49 …"
                          inputMode="tel"
                          autoComplete="tel"
                        />
                      </span>
                    </label>
                  </div>
                ) : null}
              </section>

              <section className="partner-ops-card partner-ops-card--saas partner-booking-section">
                <header className="partner-booking-section__head">
                  <span className="partner-booking-section__icon" aria-hidden>
                    {ICON.payment}
                  </span>
                  <div>
                    <h3 className="partner-booking-section__title">Zahlung</h3>
                    <p className="partner-booking-section__lead">
                      Legt fest, ob der Fahrgast oder Ihr Unternehmen abgerechnet wird.
                    </p>
                  </div>
                </header>
                <div className="partner-payer-grid partner-payer-grid--2">
                  <PartnerBookingChoiceCard
                    active={payerMode === "passenger"}
                    icon="💳"
                    title="Fahrgast zahlt"
                    description="Bar oder Karte beim Fahrer"
                    onClick={() => setPayerMode("passenger")}
                  />
                  <PartnerBookingChoiceCard
                    active={payerMode === "company"}
                    icon="🏢"
                    title="Ihr Unternehmen zahlt"
                    description="Rechnung nach Fahrtabschluss"
                    onClick={() => setPayerMode("company")}
                  />
                </div>

                {payerMode === "passenger" ? (
                  <div className="partner-ops-card__body partner-booking-fields--fade-in">
                    <label className="panel-rides-form__field partner-booking-field--icon">
                      <span>Zahlungsart beim Fahrer</span>
                      <span className="partner-booking-field__wrap">
                        <select
                          className="partner-booking-input partner-booking-input--select"
                          value={form.paymentMethod}
                          onChange={(ev) => setForm((f) => ({ ...f, paymentMethod: ev.target.value }))}
                        >
                          <option value="Barzahlung">Barzahlung</option>
                          <option value="Karte">Karte (beim Fahrer)</option>
                        </select>
                      </span>
                    </label>
                    <p className="partner-ops-hint">
                      Der Fahrer kassiert direkt beim Fahrgast. Keine Rechnung an Ihr Unternehmen.
                    </p>
                  </div>
                ) : (
                  <div className="partner-ops-card__body partner-booking-fields--fade-in">
                    <label className="panel-rides-form__field partner-booking-field--icon">
                      <span>Interne Referenz (Pflicht)</span>
                      <span className="partner-booking-field__wrap">
                        <input
                          className="partner-booking-input"
                          value={form.billingReference}
                          onChange={(ev) => setForm((f) => ({ ...f, billingReference: ev.target.value }))}
                          placeholder="Kostenstelle, Auftragsnummer, Fall …"
                          autoComplete="off"
                          required={companyPays}
                        />
                      </span>
                    </label>
                    <div className="partner-billing-callout partner-billing-callout--saas">
                      <strong>So läuft die Rechnung</strong>
                      <p>
                        Nach Abschluss der Fahrt erscheint der Betrag in Ihrer Abrechnung (Export oder Monatsrechnung).
                        Krankenfahrten haben einen separaten Rechnungs-Flow im Bereich Krankenfahrten.
                      </p>
                    </div>
                  </div>
                )}
              </section>

              <section className="partner-ops-card partner-ops-card--saas partner-booking-section">
                <header className="partner-booking-section__head">
                  <span className="partner-booking-section__icon" aria-hidden>
                    {ICON.schedule}
                  </span>
                  <div>
                    <h3 className="partner-booking-section__title">Zeitpunkt & Disposition</h3>
                    <p className="partner-booking-section__lead">
                      Sofortfahrt startet die Fahrersuche; Reservierung plant den Termin.
                    </p>
                  </div>
                </header>
                <div className="partner-booking-schedule partner-booking-schedule--saas">
                  <PartnerBookingChoiceCard
                    active={scheduleMode === "now"}
                    icon="⚡"
                    title="Sofort-Taxi"
                    description="Online-Fahrer werden benachrichtigt"
                    onClick={() => setScheduleMode("now")}
                  />
                  <PartnerBookingChoiceCard
                    active={scheduleMode === "reservation"}
                    icon="📅"
                    title="Reservierung"
                    description="60 Minuten bis max. 5 Tage im Voraus"
                    onClick={() => setScheduleMode("reservation")}
                  />
                </div>
                {scheduleMode === "reservation" ? (
                  <label className="panel-rides-form__field partner-booking-datetime partner-booking-field--icon partner-booking-fields--fade-in">
                    <span>Abholzeit</span>
                    <span className="partner-booking-field__wrap">
                      <span className="partner-booking-field__icon" aria-hidden>
                        🕐
                      </span>
                      <input
                        className="partner-booking-input"
                        type="datetime-local"
                        value={form.scheduledAt}
                        min={minPartnerReservationDatetimeLocal()}
                        max={maxPartnerReservationDatetimeLocal()}
                        onChange={(ev) => setForm((f) => ({ ...f, scheduledAt: ev.target.value }))}
                      />
                    </span>
                  </label>
                ) : (
                  <p className="partner-ops-hint">
                    Nach dem Buchen: Status „Fahrersuche“ in Meine Fahrten — Annahme und Ablehnungen dort sichtbar.
                  </p>
                )}
              </section>

              <section className="partner-ops-card partner-ops-card--saas partner-booking-section partner-booking-section--note">
                <header className="partner-booking-section__head">
                  <span className="partner-booking-section__icon" aria-hidden>
                    {ICON.note}
                  </span>
                  <div>
                    <h3 className="partner-booking-section__title">Fahrernotiz</h3>
                    <p className="partner-booking-section__lead">Optional — Hinweise für den Fahrer vor Ort.</p>
                  </div>
                </header>
                <label className="panel-rides-form__field panel-rides-form__field--2">
                  <span className="partner-booking-note-label">Notiz (optional)</span>
                  <textarea
                    className="partner-booking-note partner-booking-note--saas"
                    value={form.driverNote}
                    onChange={(ev) => setForm((f) => ({ ...f, driverNote: ev.target.value.slice(0, NOTE_MAX) }))}
                    placeholder="z. B. Eingang Hinterhof, Rollator, Klingel defekt"
                    rows={4}
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
                  <div className="panel-rides-form__grid partner-ops-card__body partner-booking-fields--fade-in">
                    <label className="panel-rides-form__field partner-booking-field--icon">
                      <span>Fahrzeug</span>
                      <span className="partner-booking-field__wrap">
                        <select
                          className="partner-booking-input partner-booking-input--select"
                          value={form.vehicle}
                          onChange={(ev) => setForm((f) => ({ ...f, vehicle: ev.target.value }))}
                        >
                          <option value="standard">Standard</option>
                          <option value="xl">XL / Van</option>
                          <option value="wheelchair">Rollstuhl</option>
                        </select>
                      </span>
                    </label>
                    <label className="panel-rides-form__field partner-booking-field--icon">
                      <span>Fahrttyp</span>
                      <span className="partner-booking-field__wrap">
                        <select
                          className="partner-booking-input partner-booking-input--select"
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
                      </span>
                    </label>
                    <label className="panel-rides-form__field partner-booking-field--icon">
                      <span>Gutscheincode (optional)</span>
                      <span className="partner-booking-field__wrap">
                        <input
                          className="partner-booking-input"
                          value={form.voucherCode}
                          onChange={(ev) => setForm((f) => ({ ...f, voucherCode: ev.target.value }))}
                          autoComplete="off"
                        />
                      </span>
                    </label>
                    {showAccessCode ? (
                      <label className="panel-rides-form__field panel-rides-form__field--2 partner-booking-field--icon">
                        <span>Freigabe-Code (optional)</span>
                        <span className="partner-booking-field__wrap">
                          <input
                            className="partner-booking-input"
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
                        </span>
                      </label>
                    ) : null}
                  </div>
                ) : null}
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
            </form>

            <PartnerBookingSummaryAside
              summaryFare={summaryFare}
              distanceKm={form.distanceKm}
              durationMinutes={form.durationMinutes}
              routeReady={routeReady}
              hasRouteInputs={hasRouteInputs}
              fromFull={fromFull}
              toFull={toFull}
              companyPays={companyPays}
              paymentMethod={form.paymentMethod}
              passengerLabel={passengerLabel}
              scheduleLabel={scheduleLabel}
              payerConfirmed={payerConfirmed}
              onPayerConfirmedChange={setPayerConfirmed}
              companyPaysConfirmText={companyPaysConfirmText}
              scheduleConfirmText={scheduleConfirmText}
              creating={creating}
              routing={routing}
              canSubmit={routeReady && payerConfirmed}
              submitLabel={submitLabel}
              formId={BOOKING_FORM_ID}
            />
          </div>
        </>
      )}
    </div>
  );
}
