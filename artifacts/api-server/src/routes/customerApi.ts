import { Router } from "express";
import { getDb } from "../db/client";
import { customerAccountsTable, passengerExpoPushTokensTable } from "../db/schema";
import { eq } from "drizzle-orm";
import { cancelRideForVerifiedCustomerSession } from "./rides";
import { findRideForPassenger, listRidesForPassenger, updateRide } from "../db/ridesData";
import {
  attachAssignedDriverToCustomerRide,
  buildAssignedDriverMapForCustomerRides,
} from "../lib/assignedDriverForCustomer.js";
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
import { getOrCreateStripeCustomerForPassenger, resolvePassengerSavedCardPaymentMethod } from "../lib/stripePassengerCustomer";
import { submitPassengerDriverRating } from "../lib/fleetDriverRatings.js";

const router = Router();

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
    const assignedByRideId = await buildAssignedDriverMapForCustomerRides(rides);
    res.json({
      ok: true,
      items: views.map((r) => attachAssignedDriverToCustomerRide(r, assignedByRideId)),
    });
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
    const assignedByRideId = await buildAssignedDriverMapForCustomerRides([ride]);
    res.json({ ok: true, item: attachAssignedDriverToCustomerRide(view, assignedByRideId) });
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

router.post("/customer/v1/rides/:id/driver-rating", requireCustomerSession, async (req, res, next) => {
  try {
    const sess = (req as CustomerSessionRequest).customerSession;
    if (!sess) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const rideId = String(req.params.id ?? "").trim();
    const starsRaw = (req.body as { stars?: unknown })?.stars;
    const stars = typeof starsRaw === "number" ? starsRaw : Number(starsRaw);
    const result = await submitPassengerDriverRating({
      rideId,
      passengerId: customerPassengerId(sess),
      stars,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      ok: true,
      rating: result.rating,
      driverRatingAverage: result.driverRatingAverage,
    });
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
    const metadata: Record<string, string> = {
      ride_id: rideId,
      passenger_id: passengerId,
      estimated_fare_eur: String(baseEstimate),
      charge_kind: "card_setup",
    };
    if (ride.companyId?.trim()) {
      metadata.company_id = ride.companyId.trim();
    }
    const { customerId, card } = await resolvePassengerSavedCardPaymentMethod(stripe, passengerId, sess.email);

    if (card?.paymentMethodId) {
      await updateRide(rideId, { paymentStatus: "pending", stripePaymentIntentId: null });
      res.json({
        cardOnFile: true,
        estimatedFareEur: baseEstimate,
      });
      return;
    }

    const setupIntent = await stripe.setupIntents.create(
      {
        customer: customerId,
        automatic_payment_methods: { enabled: true },
        usage: "off_session",
        metadata,
      },
      { idempotencyKey: `onroda-ride-si-${rideId}` },
    );
    const clientSecret = setupIntent.client_secret?.trim();
    if (!clientSecret) {
      res.status(500).json({ error: "stripe_client_secret_missing" });
      return;
    }
    res.json({
      setupClientSecret: clientSecret,
      setupIntentId: setupIntent.id,
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
    const body = req.body as { rideId?: unknown; paymentIntentId?: unknown; setupIntentId?: unknown };
    const rideId = String(body.rideId ?? "").trim();
    const setupIntentId = String(body.setupIntentId ?? "").trim();
    const paymentIntentId = String(body.paymentIntentId ?? "").trim();
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
    if (ride.paymentStatus === "refunded") {
      res.status(409).json({ error: "ride_already_refunded" });
      return;
    }

    if (setupIntentId) {
      let setupIntent;
      try {
        setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
      } catch {
        res.status(400).json({ error: "invalid_setup_intent" });
        return;
      }
      if (setupIntent.status !== "succeeded") {
        res.status(409).json({ error: "setup_intent_not_succeeded", status: setupIntent.status });
        return;
      }
      const metaRideId = String(setupIntent.metadata?.ride_id ?? "").trim();
      if (metaRideId && metaRideId !== rideId) {
        res.status(409).json({ error: "setup_intent_ride_mismatch" });
        return;
      }
      const metaPassenger = String(setupIntent.metadata?.passenger_id ?? "").trim();
      if (metaPassenger && metaPassenger !== passengerId) {
        res.status(403).json({ error: "setup_intent_passenger_mismatch" });
        return;
      }
      await updateRide(rideId, { paymentStatus: "pending", stripePaymentIntentId: null });
      res.json({ ok: true, paymentStatus: "pending" });
      return;
    }

    if (!paymentIntentId) {
      res.status(400).json({ error: "payment_intent_or_setup_intent_required" });
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