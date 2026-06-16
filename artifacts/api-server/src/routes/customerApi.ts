import { Router } from "express";
import { getDb } from "../db/client";
import { customerAccountsTable, passengerExpoPushTokensTable } from "../db/schema";
import { eq } from "drizzle-orm";
import { cancelRideForVerifiedCustomerSession } from "./rides";
import { listAssignmentsForCompany } from "../db/fleetAssignmentsData";
import { listFleetVehiclesForCompany } from "../db/fleetVehiclesData";
import { findRideForPassenger, listRidesForPassenger, updateRide } from "../db/ridesData";
import { upsertPassengerExpoPushToken } from "../db/passengerExpoPushData";
import { createAppHelpTicket, parseAppHelpCategory } from "../db/appHelpTicketsData";
import { isPostgresConfigured } from "../db/client";
import { stripPartnerOnlyRideFields, toCustomerRideView } from "../domain/ridePublic";
import { parseMedicalScanCopaymentInput } from "../lib/medical/medicalCopayment";
import {
  runMedicalTransportDocumentScanTestForCustomer,
  runMedicalTransportDocumentScanForCustomerBooking,
} from "../lib/medical/medicalScanService";
import {
  customerPassengerId,
  rejectSuspendedCustomerBooking,
  requireCustomerSession,
  type CustomerSessionRequest,
} from "../middleware/requireCustomerSession";
import { getStripeClient } from "../lib/stripeClient.js";
import { applyStripePaymentIntentToRide } from "../lib/stripeRidePaymentSync.js";
import { stripeCardVerificationAmountEur } from "../lib/stripeRideAuthorization.js";
import { getOrCreateStripeCustomerForPassenger, chargePassengerSavedCard, resolvePassengerSavedCardPaymentMethod } from "../lib/stripePassengerCustomer";
import { isPaymentAllowedForRideStatus } from "../lib/rideStatusMachine";

const router = Router();

async function buildRidePlateMap(
  rides: Array<{ id?: string | null; companyId?: string | null; driverId?: string | null }>,
) {
  const companyIds = Array.from(
    new Set(
      rides
        .map((r) => (typeof r.companyId === "string" ? r.companyId.trim() : ""))
        .filter((v) => v.length > 0),
    ),
  );
  const driverPlateByCompany = new Map<string, Map<string, string>>();
  await Promise.all(
    companyIds.map(async (companyId) => {
      const [assignments, vehicles] = await Promise.all([
        listAssignmentsForCompany(companyId),
        listFleetVehiclesForCompany(companyId),
      ]);
      const vehiclePlateById = new Map(vehicles.map((v) => [v.id, v.licensePlate]));
      const driverPlateById = new Map<string, string>();
      for (const a of assignments) {
        const plate = vehiclePlateById.get(a.vehicleId);
        if (plate && plate.trim().length > 0) {
          driverPlateById.set(a.driverId, plate.trim());
        }
      }
      driverPlateByCompany.set(companyId, driverPlateById);
    }),
  );
  const plateByRideId = new Map<string, string>();
  for (const ride of rides) {
    const rideId = typeof ride.id === "string" ? ride.id.trim() : "";
    const companyId = typeof ride.companyId === "string" ? ride.companyId.trim() : "";
    const driverId = typeof ride.driverId === "string" ? ride.driverId.trim() : "";
    if (!rideId || !companyId || !driverId) continue;
    const plate = driverPlateByCompany.get(companyId)?.get(driverId);
    if (plate) plateByRideId.set(rideId, plate);
  }
  return plateByRideId;
}

function attachDriverPlate<T extends Record<string, unknown>>(
  ride: T,
  plateByRideId: Map<string, string>,
): T {
  const rideId = typeof ride.id === "string" ? ride.id.trim() : "";
  if (!rideId) return ride;
  const plate = plateByRideId.get(rideId);
  if (!plate) return ride;
  return {
    ...ride,
    vehicle: plate,
    plate,
    driverPlate: plate,
  } as T;
}

router.get("/customer/v1/rides", requireCustomerSession, async (req, res, next) => {
  try {
    const sess = (req as CustomerSessionRequest).customerSession;
    if (!sess) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const passengerId = customerPassengerId(sess);
    const rides = await listRidesForPassenger(passengerId);
    const views = rides.map(toCustomerRideView);
    const plateByRideId = await buildRidePlateMap(rides);
    res.json({ ok: true, items: views.map((r) => attachDriverPlate(r, plateByRideId)) });
  } catch (e) {
    next(e);
  }
});

router.get("/customer/v1/rides/:id", requireCustomerSession, async (req, res, next) => {
  try {
    const sess = (req as CustomerSessionRequest).customerSession;
    if (!sess) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const rideId = String(req.params.id ?? "").trim();
    if (!rideId) {
      res.status(400).json({ error: "ride_id_required" });
      return;
    }
    const passengerId = customerPassengerId(sess);
    const ride = await findRideForPassenger(rideId, passengerId);
    if (!ride) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const view = toCustomerRideView(ride);
    const plateByRideId = await buildRidePlateMap([ride]);
    res.json({ ok: true, item: attachDriverPlate(view, plateByRideId) });
  } catch (e) {
    next(e);
  }
});

router.patch("/customer/v1/rides/:id/payment-method", requireCustomerSession, async (req, res, next) => {
  try {
    const sess = (req as CustomerSessionRequest).customerSession;
    if (!sess) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const rideId = String(req.params.id ?? "").trim();
    if (!rideId) {
      res.status(400).json({ error: "ride_id_required" });
      return;
    }
    const paymentMethod = String((req.body as { paymentMethod?: unknown })?.paymentMethod ?? "").trim();
    if (!paymentMethod) {
      res.status(400).json({ error: "payment_method_required" });
      return;
    }
    const passengerId = customerPassengerId(sess);
    const ride = await findRideForPassenger(rideId, passengerId);
    if (!ride) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (
      ride.status === "completed" ||
      ride.status === "cancelled" ||
      ride.status === "cancelled_by_customer" ||
      ride.status === "cancelled_by_driver" ||
      ride.status === "cancelled_by_system" ||
      ride.status === "expired" ||
      ride.status === "rejected"
    ) {
      res.status(409).json({ error: "payment_method_locked_for_status" });
      return;
    }
    const updated = await updateRide(ride.id, { paymentMethod });
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, item: toCustomerRideView(updated) });
  } catch (e) {
    next(e);
  }
});

/** Kunden-Storno — Session bereits in requireCustomerSession geprüft (wie GET /customer/v1/rides). */
router.patch("/customer/v1/rides/:id/cancel", requireCustomerSession, async (req, res, next) => {
  try {
    const sess = (req as CustomerSessionRequest).customerSession;
    if (!sess) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const rideId = String(req.params.id ?? "").trim();
    if (!rideId) {
      res.status(400).json({ error: "ride_id_required" });
      return;
    }
    const cancelReason = String((req.body as { cancelReason?: unknown })?.cancelReason ?? "").trim();
    const result = await cancelRideForVerifiedCustomerSession(
      customerPassengerId(sess),
      rideId,
      cancelReason,
    );
    if (!result.ok) {
      res.status(result.status).json({
        error: result.error,
        ...(result.message ? { message: result.message } : {}),
        ...(result.from ? { from: result.from } : {}),
        ...(result.to ? { to: result.to } : {}),
      });
      return;
    }
    res.json({
      ...stripPartnerOnlyRideFields(result.ride),
      cancelReason: result.cancelReason,
    });
  } catch (e) {
    next(e);
  }
});

router.patch("/customer/v1/rides/:id/driver-note", requireCustomerSession, async (req, res, next) => {
  try {
    const sess = (req as CustomerSessionRequest).customerSession;
    if (!sess) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const rideId = String(req.params.id ?? "").trim();
    if (!rideId) {
      res.status(400).json({ error: "ride_id_required" });
      return;
    }
    const noteRaw = String((req.body as { note?: unknown })?.note ?? "");
    const note = noteRaw.trim().slice(0, 500);
    const passengerId = customerPassengerId(sess);
    const ride = await findRideForPassenger(rideId, passengerId);
    if (!ride) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const nextPartnerMeta =
      ride.partnerBookingMeta && typeof ride.partnerBookingMeta === "object"
        ? ({ ...ride.partnerBookingMeta } as Record<string, unknown>)
        : {};
    if (note) {
      nextPartnerMeta.customer_driver_note = note;
    } else {
      delete nextPartnerMeta.customer_driver_note;
    }
    const updated = await updateRide(ride.id, {
      partnerBookingMeta: nextPartnerMeta as (typeof ride)["partnerBookingMeta"],
    });
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, item: toCustomerRideView(updated) });
  } catch (e) {
    next(e);
  }
});

router.post("/customer/v1/help-tickets", requireCustomerSession, async (req, res, next) => {
  try {
    const sess = (req as CustomerSessionRequest).customerSession;
    if (!sess) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ ok: false, error: "database_not_configured" });
      return;
    }
    const body = req.body as {
      message?: unknown;
      category?: unknown;
      subject?: unknown;
      passengerName?: unknown;
      passengerEmail?: unknown;
      passengerPhone?: unknown;
    };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (message.length < 5) {
      res.status(400).json({ ok: false, error: "message_too_short" });
      return;
    }
    if (message.length > 8000) {
      res.status(400).json({ ok: false, error: "message_too_long" });
      return;
    }
    const category = parseAppHelpCategory(typeof body.category === "string" ? body.category : "other");
    const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, 200) : null;
    const passengerId = customerPassengerId(sess);
    const passengerEmail =
      typeof body.passengerEmail === "string" && body.passengerEmail.trim()
        ? body.passengerEmail.trim()
        : typeof sess.email === "string" && sess.email.trim()
          ? sess.email.trim()
          : "";
    if (!passengerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(passengerEmail)) {
      res.status(400).json({ ok: false, error: "email_required" });
      return;
    }
    const passengerName =
      typeof body.passengerName === "string" && body.passengerName.trim()
        ? body.passengerName.trim()
        : typeof sess.name === "string" && sess.name.trim()
          ? sess.name.trim()
          : null;
    const passengerPhone =
      typeof body.passengerPhone === "string" && body.passengerPhone.trim()
        ? body.passengerPhone.trim()
        : null;

    const ticket = await createAppHelpTicket({
      passengerId,
      passengerName,
      passengerEmail,
      passengerPhone,
      category,
      subject,
      message,
      source: "mobile_help",
    });
    if (!ticket) {
      res.status(503).json({ ok: false, error: "create_failed" });
      return;
    }
    console.log(`[app-help-ticket] id=${ticket.id} passenger=${passengerId} category=${category}`);
    res.status(201).json({ ok: true, ticketId: ticket.id });
  } catch (e) {
    next(e);
  }
});

router.post("/customer/v1/expo-push-token", requireCustomerSession, async (req, res, next) => {
  try {
    const sess = (req as CustomerSessionRequest).customerSession;
    if (!sess) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const raw = (req.body as { expoPushToken?: unknown })?.expoPushToken;
    const expoPushToken = typeof raw === "string" ? raw.trim() : "";
    if (!expoPushToken) {
      res.status(400).json({ error: "expo_push_token_required" });
      return;
    }
    const passengerId = customerPassengerId(sess);
    await upsertPassengerExpoPushToken(passengerId, expoPushToken);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post("/customer/v1/medical/scan-test", requireCustomerSession, async (req, res, next) => {
  try {
    const sess = (req as CustomerSessionRequest).customerSession;
    if (!sess) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
    const copay = parseMedicalScanCopaymentInput(body);
    const result = await runMedicalTransportDocumentScanTestForCustomer({
      customerPassengerId: customerPassengerId(sess),
      imageBase64,
      estimatedFare: copay.estimatedFare,
      copaymentExempt: copay.copaymentExempt,
    });
    if (!result.ok) {
      res.status(result.status).json({ ok: false, error: result.error });
      return;
    }
    res.json({
      ok: true,
      testMode: true,
      testDisclaimer: result.testDisclaimer,
      trafficLight: result.trafficLight,
      warnings: result.warnings,
      extracted: result.extracted,
      dateLogic: result.dateLogic,
      insuranceRules: result.insuranceRules,
      copayment: result.copayment,
    });
  } catch (err) {
    next(err);
  }
});

/** Kunden-Transportschein-Scan vor Krankenfahrt-Buchung (persistierter Snapshot, kein Test-Modus). */
router.post("/customer/v1/medical/scan", requireCustomerSession, rejectSuspendedCustomerBooking, async (req, res, next) => {
  try {
    const sess = (req as CustomerSessionRequest).customerSession;
    if (!sess) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
    const copay = parseMedicalScanCopaymentInput(body);
    const result = await runMedicalTransportDocumentScanForCustomerBooking({
      customerPassengerId: customerPassengerId(sess),
      imageBase64,
      estimatedFare: copay.estimatedFare,
      copaymentExempt: copay.copaymentExempt,
    });
    if (!result.ok) {
      res.status(result.status).json({ ok: false, error: result.error });
      return;
    }
    res.json({
      ok: true,
      scanId: result.scanId,
      trafficLight: result.trafficLight,
      primaryReasonDe: result.primaryReasonDe || null,
      scannedAt: result.scannedAt,
      copayment: result.copayment,
      pickupAddress: result.pickupAddress,
      destinationAddress: result.destinationAddress,
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/customer/v1/payment/create-intent",
  requireCustomerSession,
  rejectSuspendedCustomerBooking,
  async (req, res, next) => {
  try {
    const stripe = getStripeClient();
    if (!stripe) {
      res.status(503).json({
        error: "stripe_not_configured",
        message: "Kartenzahlung ist derzeit nicht verfügbar.",
      });
      return;
    }
    const sess = (req as CustomerSessionRequest).customerSession;
    if (!sess) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const body = req.body as { amount?: unknown; currency?: unknown; rideId?: unknown };
    const amountRaw = body.amount;
    const amount =
      typeof amountRaw === "number"
        ? amountRaw
        : typeof amountRaw === "string"
          ? Number(amountRaw.trim())
          : NaN;
    const currency = String(body.currency ?? "")
      .trim()
      .toLowerCase();
    const rideId = String(body.rideId ?? "").trim();
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: "invalid_amount" });
      return;
    }
    if (currency !== "eur") {
      res.status(400).json({ error: "invalid_currency" });
      return;
    }
    if (!rideId) {
      res.status(400).json({ error: "ride_id_required" });
      return;
    }
    const passengerId = customerPassengerId(sess);
    const ride = await findRideForPassenger(rideId, passengerId, { skipLifecycleExpiry: true });
    if (!ride) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (!isPaymentAllowedForRideStatus(ride.status)) {
      res.status(409).json({
        error: "payment_not_allowed_for_status",
        rideStatus: ride.status,
      });
      return;
    }
    const estimateEur = Number(ride.estimatedFare);
    const estimateFromBody = Number.isFinite(amount) && amount > 0 ? amount : NaN;
    const baseEstimate =
      Number.isFinite(estimateEur) && estimateEur > 0 ? estimateEur : estimateFromBody;
    if (!Number.isFinite(baseEstimate) || baseEstimate <= 0) {
      res.status(400).json({ error: "invalid_amount" });
      return;
    }
    const authorizationAmountEur = stripeCardVerificationAmountEur();
    const amountCents = Math.round(authorizationAmountEur * 100);
    if (amountCents < 50) {
      res.status(400).json({ error: "amount_below_minimum" });
      return;
    }
    const metadata: Record<string, string> = {
      ride_id: rideId,
      passenger_id: passengerId,
      estimated_fare_eur: String(baseEstimate),
      authorization_eur: String(authorizationAmountEur),
      charge_kind: "card_verify",
    };
    if (ride.companyId?.trim()) {
      metadata.company_id = ride.companyId.trim();
    }
    const { customerId, card } = await resolvePassengerSavedCardPaymentMethod(stripe, passengerId, sess.email);

    if (card?.paymentMethodId) {
      const charge = await chargePassengerSavedCard({
        stripe,
        customerId,
        paymentMethodId: card.paymentMethodId,
        amountCents,
        metadata,
      });
      if (charge.kind === "authorized" || charge.kind === "succeeded") {
        await updateRide(rideId, {
          paymentStatus: charge.kind === "authorized" ? "authorized" : "paid",
          stripePaymentIntentId: charge.paymentIntentId,
        });
        res.json({
          paid: charge.kind === "succeeded",
          authorized: charge.kind === "authorized",
          paymentIntentId: charge.paymentIntentId,
          authorizationAmountEur,
          estimatedFareEur: baseEstimate,
        });
        return;
      }
      if (charge.kind === "requires_action") {
        res.json({
          paid: false,
          clientSecret: charge.clientSecret,
          requiresAction: true,
          paymentIntentId: charge.paymentIntentId,
        });
        return;
      }
      await updateRide(rideId, { paymentStatus: "failed" });
      res.status(402).json({ error: charge.error });
      return;
    }

    const intent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: "eur",
        customer: customerId,
        automatic_payment_methods: { enabled: true },
        capture_method: "manual",
        setup_future_usage: "off_session",
        metadata,
      },
      { idempotencyKey: `onroda-ride-pi-${rideId}` },
    );
    const clientSecret = intent.client_secret?.trim();
    if (!clientSecret) {
      res.status(500).json({ error: "stripe_client_secret_missing" });
      return;
    }
    res.json({
      paid: false,
      clientSecret,
      paymentIntentId: intent.id,
      authorizationAmountEur,
      estimatedFareEur: baseEstimate,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/customer/v1/payment/confirm-ride", requireCustomerSession, async (req, res, next) => {
  try {
    const stripe = getStripeClient();
    if (!stripe) {
      res.status(503).json({ error: "stripe_not_configured" });
      return;
    }
    const sess = (req as CustomerSessionRequest).customerSession;
    if (!sess) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const body = req.body as { rideId?: unknown; paymentIntentId?: unknown };
    const rideId = String(body.rideId ?? "").trim();
    const paymentIntentId = String(body.paymentIntentId ?? "").trim();
    if (!rideId || !paymentIntentId) {
      res.status(400).json({ error: "ride_id_and_payment_intent_required" });
      return;
    }
    const passengerId = customerPassengerId(sess);
    const ride = await findRideForPassenger(rideId, passengerId, { skipLifecycleExpiry: true });
    if (!ride) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (ride.paymentStatus === "refunded") {
      res.status(409).json({ error: "ride_already_refunded" });
      return;
    }

    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch {
      res.status(400).json({ error: "invalid_payment_intent" });
      return;
    }

    const metaRideId = String(paymentIntent.metadata?.ride_id ?? "").trim();
    if (metaRideId !== rideId) {
      res.status(409).json({ error: "payment_intent_ride_mismatch" });
      return;
    }
    const metaPassenger = String(paymentIntent.metadata?.passenger_id ?? "").trim();
    if (metaPassenger && metaPassenger !== passengerId) {
      res.status(403).json({ error: "payment_intent_passenger_mismatch" });
      return;
    }

    const sync = await applyStripePaymentIntentToRide(paymentIntent);
    if (!sync.applied) {
      if (sync.reason === "ride_already_paid") {
        res.json({ ok: true, paymentStatus: "paid", idempotent: true });
        return;
      }
      if (paymentIntent.status !== "requires_capture" && paymentIntent.status !== "succeeded") {
        res.status(409).json({
          error: "payment_intent_not_authorized",
          status: paymentIntent.status,
        });
        return;
      }
      res.status(409).json({ error: sync.reason });
      return;
    }

    res.json({ ok: true, paymentStatus: sync.paymentStatus });
  } catch (e) {
    next(e);
  }
});

/** Hinterlegte Karte (Stripe Customer PaymentMethod) für Wallet / Buchung. */
router.get("/customer/v1/payment/saved-card", requireCustomerSession, async (req, res, next) => {
  try {
    const stripe = getStripeClient();
    if (!stripe) {
      res.status(503).json({ error: "stripe_not_configured" });
      return;
    }
    const sess = (req as CustomerSessionRequest).customerSession;
    if (!sess) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const passengerId = customerPassengerId(sess);
    const { card } = await resolvePassengerSavedCardPaymentMethod(stripe, passengerId, sess.email);
    if (!card) {
      res.json({ saved: false });
      return;
    }
    res.json({
      saved: true,
      brand: card.brand,
      last4: card.last4,
    });
  } catch (e) {
    next(e);
  }
});

/** Karte ohne Fahrt hinterlegen (Stripe SetupIntent, Payment Sheet mit setupIntentClientSecret). */
router.post("/customer/v1/payment/setup-intent", requireCustomerSession, async (req, res, next) => {
  try {
    const stripe = getStripeClient();
    if (!stripe) {
      res.status(503).json({
        error: "stripe_not_configured",
        message: "Kartenzahlung ist derzeit nicht verfügbar.",
      });
      return;
    }
    const sess = (req as CustomerSessionRequest).customerSession;
    if (!sess) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const passengerId = customerPassengerId(sess);
    const customerId = await getOrCreateStripeCustomerForPassenger(stripe, passengerId, sess.email);
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      usage: "off_session",
      metadata: { passenger_id: passengerId },
    });
    const clientSecret = setupIntent.client_secret?.trim();
    if (!clientSecret) {
      res.status(500).json({ error: "stripe_client_secret_missing" });
      return;
    }
    res.json({ clientSecret });
  } catch (e) {
    next(e);
  }
});

router.delete("/customer/v1/account", requireCustomerSession, async (req, res, next) => {
  try {
    const sess = (req as CustomerAuthRequest).customerSession;
    const passengerId = customerPassengerId(sess);
    if (!passengerId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const db = getDb();
    if (!db) {
      res.status(500).json({ error: "database_not_configured" });
      return;
    }
    // Push-Token löschen
    await db.delete(passengerExpoPushTokensTable)
      .where(eq(passengerExpoPushTokensTable.passenger_id, passengerId));
    // Konto anonymisieren (DSGVO Art. 17)
    await db.update(customerAccountsTable)
      .set({
        email: `deleted_${passengerId}@deleted.onroda.de`,
        name: "Gelöschter Nutzer",
        password_hash: "DELETED",
        phone: null,
        updated_at: new Date(),
      })
      .where(eq(customerAccountsTable.id, passengerId));
    res.json({ ok: true, message: "Konto wurde gelöscht. Deine Daten wurden anonymisiert." });
  } catch (e) {
    next(e);
  }
});

export default router;