import { Router } from "express";
import { getStripeClient } from "../lib/stripeClient.js";
import { anonymizeCustomerAccount } from "../lib/customerAccountDeletion";
import { cancelRideForVerifiedCustomerSession } from "./rides";
import { findRideForPassenger, listRidesForPassenger, updateRide } from "../db/ridesData";
import {
  attachAssignedDriverToCustomerRide,
  buildAssignedDriverMapForCustomerRides,
} from "../lib/assignedDriverForCustomer.js";
import { upsertPassengerExpoPushToken } from "../db/passengerExpoPushData";
import {
  appendAppHelpTicketMessageForPassenger,
  createAppHelpTicket,
  getAppHelpTicketForPassenger,
  listAppHelpTicketsForPassenger,
  parseAppHelpCategory,
} from "../db/appHelpTicketsData";
import {
  appendRideSupportTicketMessageForPassenger,
  getRideSupportTicketForPassenger,
  listRideSupportTicketsForPassenger,
} from "../db/rideSupportTicketsData";
import { isPostgresConfigured } from "../db/client";
import { stripPartnerOnlyRideFields, toCustomerRideView } from "../domain/ridePublic";
import { attachBookingPartnerNamesToRides } from "../lib/rideBookingPartnerName.js";
import { parseMedicalScanCopaymentInput } from "../lib/medical/medicalCopayment";
import {
  runMedicalTransportDocumentScanTestForCustomer,
  runMedicalTransportDocumentScanForCustomerBooking,
} from "../lib/medical/medicalScanService";
import {
  customerPassengerId,
  rejectSuspendedCustomerBooking,
  requireCustomerSession,
  requireCustomerSessionJwtOnly,
  type CustomerSessionRequest,
} from "../middleware/requireCustomerSession";
import { logger } from "../lib/logger";
import { applyStripePaymentIntentToRide } from "../lib/stripeRidePaymentSync.js";
import { getOrCreateStripeCustomerForPassenger, resolvePassengerSavedCardPaymentMethod } from "../lib/stripePassengerCustomer";
import { retryPassengerFailedRidePayment } from "../lib/ridePaymentRecovery";
import { submitPassengerRideTip } from "../lib/rideTipPayment";
import { respondCustomerPaymentRouteError } from "../lib/stripeHttpError.js";
import { submitPassengerDriverRating } from "../lib/fleetDriverRatings.js";
import { isPaymentAllowedForRideStatus } from "../lib/rideStatusMachine.js";
import { sendRideChatMessageCreated, sendRideChatMessagesJson } from "../lib/rideChatRouteHelpers";
import {
  ensurePassengerRideVerifyPin,
  setPassengerRideVerifyPin,
} from "../lib/customerRideVerifyPin";
import { upsertPassengerProfile, inferPassengerAuthProvider } from "../db/passengerProfilesData";

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
    const withPartners = await attachBookingPartnerNamesToRides(rides);
    const views = withPartners.map(toCustomerRideView);
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
      logger.info(
        {
          event: "auth.customer.ride_cancel.failed",
          rideId,
          error: result.error,
          status: result.status,
          from: result.from,
          to: result.to,
        },
        "customer ride cancel rejected",
      );
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
    if (ride.chatEnabled) {
      res.status(409).json({ error: "chat_active_use_chat" });
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

router.get("/customer/v1/rides/:id/chat/messages", requireCustomerSession, async (req, res, next) => {
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
    const after = typeof req.query.after === "string" ? req.query.after : undefined;
    await sendRideChatMessagesJson(res, ride, after);
  } catch (e) {
    next(e);
  }
});

router.post("/customer/v1/rides/:id/chat/messages", requireCustomerSession, async (req, res, next) => {
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
    await sendRideChatMessageCreated(res, ride, req.body, {
      kind: "customer",
      actorId: passengerId,
    });
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

router.get("/customer/v1/help-tickets", requireCustomerSession, async (req, res, next) => {
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
    const passengerId = customerPassengerId(sess);
    const items = await listAppHelpTicketsForPassenger(passengerId, 15);
    res.json({
      ok: true,
      tickets: items.map((t) => ({
        id: t.id,
        kind: "app",
        category: t.category,
        message: t.message.slice(0, 200),
        status: t.status,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    });
  } catch (e) {
    next(e);
  }
});

router.get("/customer/v1/support/inbox", requireCustomerSession, async (req, res, next) => {
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
    const passengerId = customerPassengerId(sess);
    const [appTickets, rideTickets] = await Promise.all([
      listAppHelpTicketsForPassenger(passengerId, 20),
      listRideSupportTicketsForPassenger(passengerId, 20),
    ]);
    const merged = [
      ...appTickets.map((t) => ({
        id: t.id,
        kind: "app" as const,
        category: t.category,
        status: t.status,
        preview: t.message.slice(0, 160),
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        rideId: null as string | null,
      })),
      ...rideTickets.map((t) => ({
        id: t.id,
        kind: "ride" as const,
        category: t.category,
        status: t.status,
        preview: t.messageSnippet || t.category,
        createdAt: t.createdAtIso,
        updatedAt: t.createdAtIso,
        rideId: t.rideId,
      })),
    ].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    res.json({ ok: true, items: merged.slice(0, 30) });
  } catch (e) {
    next(e);
  }
});

router.get("/customer/v1/support/tickets/:ticketId", requireCustomerSession, async (req, res, next) => {
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
    const passengerId = customerPassengerId(sess);
    const ticketId = String(req.params.ticketId ?? "").trim();
    if (!ticketId) {
      res.status(400).json({ ok: false, error: "ticket_id_required" });
      return;
    }
    if (ticketId.startsWith("aht-")) {
      const t = await getAppHelpTicketForPassenger(ticketId, passengerId);
      if (!t) {
        res.status(404).json({ ok: false, error: "not_found" });
        return;
      }
      res.json({
        ok: true,
        ticket: {
          id: t.id,
          kind: "app",
          category: t.category,
          status: t.status,
          message: t.message,
          subject: t.subject,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          rideId: null,
          canReply: t.status !== "resolved",
        },
      });
      return;
    }
    if (ticketId.startsWith("rst-")) {
      const t = await getRideSupportTicketForPassenger(ticketId, passengerId);
      if (!t) {
        res.status(404).json({ ok: false, error: "not_found" });
        return;
      }
      res.json({
        ok: true,
        ticket: {
          id: t.id,
          kind: "ride",
          category: t.category,
          status: t.status,
          message: t.message ?? "",
          subject: null,
          createdAt: t.createdAtIso,
          updatedAt: t.updatedAtIso,
          rideId: t.rideId,
          canReply: t.status !== "resolved",
        },
      });
      return;
    }
    res.status(404).json({ ok: false, error: "not_found" });
  } catch (e) {
    next(e);
  }
});

router.post("/customer/v1/support/tickets/:ticketId/messages", requireCustomerSession, async (req, res, next) => {
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
    const passengerId = customerPassengerId(sess);
    const ticketId = String(req.params.ticketId ?? "").trim();
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!ticketId || message.length < 2) {
      res.status(400).json({ ok: false, error: "message_required" });
      return;
    }
    if (ticketId.startsWith("aht-")) {
      const updated = await appendAppHelpTicketMessageForPassenger(ticketId, passengerId, message);
      if (!updated) {
        res.status(400).json({ ok: false, error: "cannot_reply" });
        return;
      }
      res.json({ ok: true, ticketId: updated.id });
      return;
    }
    if (ticketId.startsWith("rst-")) {
      const updated = await appendRideSupportTicketMessageForPassenger(ticketId, passengerId, message);
      if (!updated) {
        res.status(400).json({ ok: false, error: "cannot_reply" });
        return;
      }
      res.json({ ok: true, ticketId: updated.id });
      return;
    }
    res.status(404).json({ ok: false, error: "not_found" });
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
    const passengerEmailRaw =
      typeof body.passengerEmail === "string" && body.passengerEmail.trim()
        ? body.passengerEmail.trim()
        : typeof sess.email === "string" && sess.email.trim()
          ? sess.email.trim()
          : "";
    const passengerEmail =
      passengerEmailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(passengerEmailRaw)
        ? passengerEmailRaw
        : `passenger+${passengerId.replace(/[^a-zA-Z0-9_-]/g, "")}@tickets.onroda.app`;
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
    if (respondCustomerPaymentRouteError(res, e, "payment/create-intent")) return;
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
    if (respondCustomerPaymentRouteError(res, e, "payment/confirm-ride")) return;
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
    if (respondCustomerPaymentRouteError(res, e, "payment/saved-card")) return;
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
    if (respondCustomerPaymentRouteError(res, e, "payment/setup-intent")) return;
    next(e);
  }
});

/** Offene fehlgeschlagene Fahrtzahlung erneut einziehen (nach Karten-Update). */
router.post("/customer/v1/payment/retry-ride/:rideId", requireCustomerSession, async (req, res, next) => {
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
    const rideId = String(req.params.rideId ?? "").trim();
    if (!rideId) {
      res.status(400).json({ error: "ride_id_required" });
      return;
    }
    const passengerId = customerPassengerId(sess);
    const outcome = await retryPassengerFailedRidePayment(rideId, passengerId);
    if (!outcome.ok) {
      const status =
        outcome.error === "not_found" ? 404
        : outcome.error === "ride_not_completed" || outcome.error === "payment_not_failed" ? 409
        : 402;
      res.status(status).json({ ok: false, error: outcome.error });
      return;
    }
    res.json({ ok: true, paymentStatus: "paid" });
  } catch (e) {
    if (respondCustomerPaymentRouteError(res, e, "payment/retry-ride")) return;
    next(e);
  }
});

router.post("/customer/v1/rides/:rideId/tip", requireCustomerSession, async (req, res, next) => {
  try {
    const sess = (req as CustomerAuthRequest).customerSession;
    const passengerId = customerPassengerId(sess);
    if (!passengerId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const rideId = String(req.params.rideId ?? "").trim();
    const body = (req.body ?? {}) as { amountEur?: unknown };
    const amountEur = Number(body.amountEur);
    if (!rideId || !Number.isFinite(amountEur)) {
      res.status(400).json({ error: "invalid_tip_amount" });
      return;
    }
    const outcome = await submitPassengerRideTip({ rideId, passengerId, amountEur });
    if (!outcome.ok) {
      res.status(outcome.status).json({ error: outcome.error });
      return;
    }
    res.json({
      ok: true,
      tipAmount: outcome.tipAmount,
      chargedViaStripe: outcome.chargedViaStripe,
      idempotent: outcome.idempotent === true,
    });
  } catch (e) {
    if (respondCustomerPaymentRouteError(res, e, "rides/tip")) return;
    next(e);
  }
});

/** Abhol-PIN anzeigen (Auto-Vergabe falls noch keiner gesetzt). */
router.get("/customer/v1/profile/ride-pin", requireCustomerSession, async (req, res, next) => {
  try {
    const sess = (req as CustomerSessionRequest).customerSession;
    const passengerId = customerPassengerId(sess);
    if (!passengerId) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    await upsertPassengerProfile({
      passengerId,
      name: sess.name ?? "",
      email: sess.email ?? "",
      authProvider: inferPassengerAuthProvider(passengerId),
    });
    const ensured = await ensurePassengerRideVerifyPin(passengerId);
    if (!ensured) {
      res.status(503).json({
        ok: false,
        error: "ride_pin_unavailable",
        message: "Abhol-Code konnte nicht geladen werden.",
      });
      return;
    }
    res.json({
      ok: true,
      pin: ensured.pin,
      autoAssigned: ensured.created,
      setAt: ensured.setAt,
    });
  } catch (e) {
    next(e);
  }
});

/** Abhol-PIN ändern (4 Ziffern). */
router.patch("/customer/v1/profile/ride-pin", requireCustomerSession, async (req, res, next) => {
  try {
    const sess = (req as CustomerSessionRequest).customerSession;
    const passengerId = customerPassengerId(sess);
    if (!passengerId) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    const body = (req.body ?? {}) as { pin?: unknown };
    const pin = typeof body.pin === "string" ? body.pin.trim() : "";
    await upsertPassengerProfile({
      passengerId,
      name: sess.name ?? "",
      email: sess.email ?? "",
      authProvider: inferPassengerAuthProvider(passengerId),
    });
    const result = await setPassengerRideVerifyPin(passengerId, pin);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json({ ok: true, pin, setAt: result.setAt });
  } catch (e) {
    next(e);
  }
});

router.delete("/customer/v1/account", requireCustomerSessionJwtOnly, async (req, res, next) => {
  try {
    const sess = (req as CustomerSessionRequest).customerSession;
    const passengerId = customerPassengerId(sess);
    if (!passengerId) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    const result = await anonymizeCustomerAccount(passengerId);
    if (!result.ok) {
      res.status(result.error === "database_not_configured" ? 503 : 400).json({
        ok: false,
        error: result.error,
      });
      return;
    }
    res.json({
      ok: true,
      alreadyDeleted: result.alreadyDeleted,
      message: "Konto wurde gelöscht. Deine Daten wurden anonymisiert.",
    });
  } catch (e) {
    next(e);
  }
});

export default router;