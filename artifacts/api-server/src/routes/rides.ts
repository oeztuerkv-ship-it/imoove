import { Router } from "express";
import type { RideRequest } from "../domain/rideRequest";
import {
  DEFAULT_PAYER_KIND,
  DEFAULT_RIDE_KIND,
  parseOptionalBillingTag,
  parsePayerKind,
  parseRideKind,
} from "../domain/rideBillingProfile";
import { attachAccessCodeSummariesToRides } from "../db/accessCodesData";
import {
  adminReleaseRide,
  findRide,
  insertRideWithOptionalAccessCode,
  insertSupplementalRideEvent,
  listRides,
  resetRidesDemo,
  updateRide,
} from "../db/ridesData";
import { upsertRideFinancialSnapshot } from "../db/rideFinancialsData";
import {
  DEFAULT_AUTHORIZATION_SOURCE,
  normalizeAccessCodeInput,
  parseAuthorizationSource,
} from "../domain/rideAuthorization";
import { stripPartnerOnlyRideFields } from "../domain/ridePublic";
import { getPublicFareProfile } from "../db/adminData";
import { estimateTaxiFromMergedTariff, mergeTariffsForServiceRegion, resolveMergedTariff } from "../lib/operationalTariffEngine";
import { verifyAccessCode } from "../db/accessCodesData";
import {
  getFleetDriverCapability,
  isRideCompatibleWithCapability,
} from "../db/fleetMatchingData";
import { getFleetDriverReadinessById } from "../db/fleetDriverReadiness";
import { findFleetDriverAuthRow } from "../db/fleetDriversData";
import { isFarFutureReservation } from "../lib/dispatchStatus";
import {
  assertCustomerRideOperational,
  assertPlatformNewRideAllowed,
  checkCustomerRideServiceArea,
  evaluateCustomerCancellationFeeEur,
  getOperationalConfigPayload,
  getOutOfServiceAreaMessage,
  listServiceRegionsForApi,
  resolveFinancePricingContextFromOperational,
} from "../db/appOperationalData";

export type { RideRequest } from "../domain/rideRequest";

export interface DriverLocation {
  lat: number;
  lon: number;
  updatedAt: string;
}

const DEMO: RideRequest[] = [];

export const driverLocations = new Map<string, DriverLocation>();
export const customerLocations = new Map<string, DriverLocation>();
const customerCancelReasons = new Map<string, string>();
const customerSupportTickets = new Map<
  string,
  { ticketId: string; rideId: string; category: string; message: string; source: string; createdAt: string }[]
>();

const router = Router();
const CODE_VERIFY_TTL_MS = 5 * 60 * 1000;
const codeVerifySessions = new Map<
  string,
  { driverId: string; normalized: string; expiresAt: number }
>();

function cleanupCodeVerifySessions(now = Date.now()): void {
  for (const [key, session] of codeVerifySessions) {
    if (session.expiresAt <= now) codeVerifySessions.delete(key);
  }
}

const ACTIVE_RIDE_STATUSES: ReadonlySet<RideRequest["status"]> = new Set([
  "scheduled",
  "requested",
  "searching_driver",
  "offered",
  "accepted",
  "driver_arriving",
  "driver_waiting",
  "passenger_onboard",
  "in_progress",
  // Legacy compatibility
  "pending",
  "arrived",
]);

/** PATCH-Body: finalFare / final_fare / status_data (String mit Komma erlaubt). */
function parseOptionalFinalFareFromBody(body: unknown): number | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;
  const nested =
    b.status_data != null && typeof b.status_data === "object" && !Array.isArray(b.status_data)
      ? (b.status_data as Record<string, unknown>)
      : null;
  const raw = b.finalFare ?? b.final_fare ?? nested?.finalFare ?? nested?.final_fare;
  if (raw == null || raw === "") return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(String(raw).trim().replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function normalizeStatusInput(raw: unknown): RideRequest["status"] | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  const allowed: RideRequest["status"][] = [
    "draft",
    "scheduled",
    "requested",
    "searching_driver",
    "offered",
    "pending",
    "accepted",
    "driver_arriving",
    "driver_waiting",
    "passenger_onboard",
    "arrived",
    "in_progress",
    "completed",
    "cancelled_by_customer",
    "cancelled_by_driver",
    "cancelled_by_system",
    "expired",
    "rejected",
    "cancelled",
  ];
  return (allowed as string[]).includes(s) ? (s as RideRequest["status"]) : null;
}

function canTransitionStatus(
  from: RideRequest["status"],
  to: RideRequest["status"],
): boolean {
  if (from === to) return true;
  const map: Partial<Record<RideRequest["status"], RideRequest["status"][]>> = {
    draft: ["requested", "cancelled_by_customer", "cancelled"],
    scheduled: [
      "accepted",
      "searching_driver",
      "cancelled_by_customer",
      "cancelled",
      "expired",
    ],
    requested: ["searching_driver", "offered", "accepted", "expired", "cancelled_by_customer", "cancelled"],
    searching_driver: ["offered", "accepted", "expired", "cancelled_by_customer", "cancelled"],
    offered: ["accepted", "searching_driver", "expired", "cancelled_by_customer", "cancelled"],
    pending: ["accepted", "driver_arriving", "driver_waiting", "in_progress", "completed", "cancelled", "rejected", "cancelled_by_customer", "cancelled_by_driver", "cancelled_by_system"],
    accepted: ["driver_arriving", "driver_waiting", "passenger_onboard", "in_progress", "cancelled_by_customer", "cancelled_by_driver", "cancelled_by_system", "cancelled"],
    driver_arriving: ["driver_waiting", "passenger_onboard", "in_progress", "cancelled_by_customer", "cancelled_by_driver", "cancelled_by_system"],
    driver_waiting: ["passenger_onboard", "in_progress", "cancelled_by_customer", "cancelled_by_driver", "cancelled_by_system"],
    passenger_onboard: ["in_progress", "completed", "cancelled_by_system"],
    arrived: ["passenger_onboard", "in_progress", "completed", "cancelled", "cancelled_by_customer", "cancelled_by_driver"],
    in_progress: ["completed", "cancelled_by_system", "cancelled"],
  };
  return (map[from] ?? []).includes(to);
}

function ceilToTenth(amount: number): number {
  const safe = Number.isFinite(amount) ? amount : 0;
  return Math.ceil((safe + Number.EPSILON) * 10) / 10;
}

function pickScheduledAtFromBody(raw: Partial<RideRequest> & Record<string, unknown>): string | null {
  const c = raw.scheduledAt;
  if (typeof c === "string" && c.trim()) return c.trim();
  const s = raw.scheduled_at;
  if (typeof s === "string" && s.trim()) return s.trim();
  return null;
}

function initialCustomerRideStatus(scheduledAt: string | null): RideRequest["status"] {
  return isFarFutureReservation(scheduledAt) ? "scheduled" : "searching_driver";
}

router.get("/fare-config", async (_req, res, next) => {
  try {
    const profile = await getPublicFareProfile();
    res.json({ ok: true, profile });
  } catch (e) {
    next(e);
  }
});

router.get("/fare-estimate", async (req, res, next) => {
  try {
    const opPayloadEst = await getOperationalConfigPayload();
    const gateEst = assertPlatformNewRideAllowed(opPayloadEst);
    if (!gateEst.ok) {
      res.status(gateEst.status).json({ error: gateEst.error, message: gateEst.message });
      return;
    }
    const tEst = opPayloadEst.tariffs as { active?: boolean } | undefined;
    if (tEst?.active === false) {
      res.status(400).json({ error: "tariffs_inactive", message: "Tarife sind derzeit deaktiviert." });
      return;
    }
    const distanceKm = Number(req.query.distanceKm ?? 0);
    const waitingMinutes = Number(req.query.waitingMinutes ?? 0);
    const tripMinutes = Number(
      (req.query.tripMinutes as string) ?? (req.query.durationMinutes as string) ?? (req.query.routeMinutes as string) ?? 0,
    );
    const vehicle = String(req.query.vehicle ?? "standard").trim().toLowerCase();
    const fromFullQ = String(req.query.fromFull ?? req.query.from ?? "").trim();
    if (!Number.isFinite(distanceKm) || distanceKm < 0) {
      res.status(400).json({ error: "distance_km_invalid" });
      return;
    }
    const regions = await listServiceRegionsForApi();
    const tPayload = (
      opPayloadEst.tariffs && typeof opPayloadEst.tariffs === "object" && !Array.isArray(opPayloadEst.tariffs)
        ? (opPayloadEst.tariffs as Record<string, unknown>)
        : {}
    ) as Record<string, unknown>;
    const { merged, serviceRegionId } = fromFullQ
      ? resolveMergedTariff(opPayloadEst, regions, fromFullQ)
      : { merged: mergeTariffsForServiceRegion(tPayload, null), serviceRegionId: null as string | null };
    const atRaw = req.query.at;
    const at =
      typeof atRaw === "string" && atRaw.trim() ? new Date(atRaw.trim()) : new Date();
    const applyHolidaySurcharge = String(req.query.holiday ?? req.query.assumeHoliday ?? "") === "1";
    const applyAirportFlat = String(req.query.airport ?? req.query.airportStop ?? "") === "1";
    const est = estimateTaxiFromMergedTariff(merged, {
      distanceKm,
      tripMinutes: Number.isFinite(tripMinutes) ? tripMinutes : 0,
      waitingMinutes: Math.max(0, waitingMinutes),
      vehicle,
      at,
      applyHolidaySurcharge,
      applyAirportFlat,
    });
    const profile = await getPublicFareProfile(fromFullQ || null);
    const total = est.finalRounded;
    res.json({
      ok: true,
      /** 2+ = Fahrtmin: resolveTripEurPerRouteMinute + breakdown.airportFlatEur; Deploy-Check */
      engineSchemaVersion: 2,
      serviceRegionId: serviceRegionId ?? profile.serviceRegionId ?? null,
      profile: { ...profile, serviceRegionId: serviceRegionId ?? profile.serviceRegionId ?? null },
      estimate: {
        distanceKm,
        waitingMinutes,
        tripMinutes: Number.isFinite(tripMinutes) ? tripMinutes : 0,
        vehicle,
        total,
        taxiTotal: total,
        onrodaTotal: total,
        breakdown: est.breakdown,
        engine: { subtotal: est.subtotal, afterMinFare: est.afterMinFare },
      },
    });
  } catch (e) {
    next(e);
  }
});

router.get("/rides", async (_req, res, next) => {
  try {
    const query = _req.query as { driverId?: string; companyId?: string };
    const driverId = typeof query.driverId === "string" ? query.driverId.trim() : "";
    const companyId = typeof query.companyId === "string" ? query.companyId.trim() : "";
    let rows = await listRides();
    if (driverId && companyId) {
      const capability = await getFleetDriverCapability(driverId, companyId);
      if (!capability) {
        rows = [];
      } else {
        rows = rows.filter((ride) => {
          if (ride.driverId && ride.driverId !== driverId) return false;
          if ((ride.rejectedBy ?? []).includes(driverId)) return false;
          if (!ACTIVE_RIDE_STATUSES.has(ride.status)) return false;
          return isRideCompatibleWithCapability(ride, capability);
        });
      }
    }
    const publicRows = rows.map(stripPartnerOnlyRideFields);
    const withCodes = await attachAccessCodeSummariesToRides(publicRows);
    res.json(withCodes.map((r) => ({ ...r, cancelReason: customerCancelReasons.get(r.id) ?? null })));
  } catch (e) {
    next(e);
  }
});

router.post("/rides/:rideId/support", async (req, res) => {
  const rideId = String(req.params.rideId ?? "").trim();
  if (!rideId) {
    res.status(400).json({ ok: false, error: "ride_id_required" });
    return;
  }
  const category = typeof req.body?.category === "string" ? req.body.category.trim() : "other";
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const source = typeof req.body?.source === "string" ? req.body.source.trim() : "unknown";
  if (message.length < 5) {
    res.status(400).json({ ok: false, error: "message_too_short" });
    return;
  }

  const ticketId = `cs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const entry = {
    ticketId,
    rideId,
    category: category || "other",
    message: message.slice(0, 4000),
    source: source || "unknown",
    createdAt: new Date().toISOString(),
  };
  const prev = customerSupportTickets.get(rideId) ?? [];
  prev.unshift(entry);
  customerSupportTickets.set(rideId, prev.slice(0, 50));
  console.log(`[customer-support] rideId=${rideId} ticketId=${ticketId} category=${entry.category} source=${entry.source}`);
  res.json({ ok: true, ticketId });
});

function formatEuroHtml(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return safe.toFixed(2).replace(".", ",") + " €";
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildReceiptHtmlFromRide(r: RideRequest): string {
  const date = new Date(r.createdAt);
  const dateStr = date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr = date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const amount = r.finalFare != null && Number.isFinite(Number(r.finalFare)) ? Number(r.finalFare) : Number(r.estimatedFare ?? 0);
  const rideNr = String(r.id).slice(0, 8).toUpperCase();
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Quittung #${escapeHtml(rideNr)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f5f5; color: #111; padding: 32px 16px; }
    .receipt { max-width: 520px; margin: 0 auto; background: #fff; border-radius: 16px; box-shadow: 0 2px 20px rgba(0,0,0,0.10); overflow: hidden; }
    .header { background: #DC2626; color: #fff; padding: 26px 26px 18px; text-align: center; }
    .logo { font-size: 24px; font-weight: 900; letter-spacing: 1.2px; margin-bottom: 4px; }
    .receipt-title { font-size: 12px; font-weight: 600; opacity: 0.9; letter-spacing: 1px; text-transform: uppercase; }
    .receipt-id { font-size: 12px; opacity: 0.75; margin-top: 6px; }
    .body { padding: 22px 26px; }
    .row { display:flex; justify-content:space-between; gap:12px; margin-bottom: 10px; }
    .k { color:#6b7280; font-size: 12px; font-weight: 600; }
    .v { color:#111827; font-size: 12px; font-weight: 600; text-align:right; }
    .route { margin-top: 14px; background:#f9fafb; border:1px solid #eef2f7; border-radius: 12px; padding: 14px; }
    .route h3 { font-size: 12px; color:#6b7280; letter-spacing:0.08em; text-transform:uppercase; margin-bottom: 10px; }
    .route .pt { font-size: 13px; font-weight: 600; margin-bottom: 8px; color:#111827; }
    .muted { color:#6b7280; font-size: 12px; font-weight: 500; }
    .total { margin-top: 14px; background:#DC2626; color:#fff; border-radius: 12px; padding: 14px 16px; display:flex; justify-content:space-between; align-items:center; }
    .total .lbl { font-size: 13px; font-weight: 700; opacity:0.9; }
    .total .amt { font-size: 22px; font-weight: 900; }
    .footer { text-align:center; padding: 16px 26px; background:#fafafa; border-top:1px solid #f0f0f0; font-size: 11px; color:#9ca3af; line-height: 1.6; }
    @media print { body { background:#fff; padding:0; } .receipt { box-shadow:none; border-radius:0; } }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="logo">ONRODA</div>
      <div class="receipt-title">Fahrtquittung</div>
      <div class="receipt-id">Nr. ${escapeHtml(rideNr)}</div>
    </div>
    <div class="body">
      <div class="row"><div><div class="k">Datum</div><div class="v">${escapeHtml(dateStr)}</div></div><div><div class="k">Uhrzeit</div><div class="v">${escapeHtml(timeStr)} Uhr</div></div></div>
      <div class="route">
        <h3>Route</h3>
        <div class="muted">Abfahrt</div>
        <div class="pt">${escapeHtml(r.from ?? "—")}</div>
        <div class="muted">Ziel</div>
        <div class="pt">${escapeHtml(r.to ?? "—")}</div>
      </div>
      <div style="margin-top: 14px;">
        <div class="row"><div class="k">Strecke</div><div class="v">${escapeHtml(String(r.distanceKm ?? 0))} km</div></div>
        <div class="row"><div class="k">Dauer</div><div class="v">${escapeHtml(String(r.durationMinutes ?? 0))} Min</div></div>
        <div class="row"><div class="k">Zahlungsart</div><div class="v">${escapeHtml(r.paymentMethod ?? "—")}</div></div>
        <div class="row"><div class="k">Produkt</div><div class="v">${escapeHtml(r.vehicle ?? "—")}</div></div>
      </div>
      <div class="total"><div class="lbl">Gesamtbetrag</div><div class="amt">${formatEuroHtml(amount)}</div></div>
    </div>
    <div class="footer">
      ONRODA · Deutschland<br/>
      Vielen Dank für Ihre Fahrt!<br/>
      Diese Quittung dient als Beleg.
    </div>
  </div>
  <script>
    window.addEventListener('load', function() { setTimeout(function() { try { window.print(); } catch(e) {} }, 250); });
  <\/script>
</body>
</html>`;
}

router.get("/rides/:rideId/receipt", async (req, res, next) => {
  try {
    const rideId = String(req.params.rideId ?? "").trim();
    if (!rideId) {
      res.status(400).json({ error: "ride_id_required" });
      return;
    }
    const ride = await findRide(rideId);
    if (!ride) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(buildReceiptHtmlFromRide(ride));
  } catch (e) {
    next(e);
  }
});

router.post("/rides/access-code/verify", async (req, res, next) => {
  try {
    const body = req.body as { accessCode?: unknown; driverId?: unknown };
    const accessCode = typeof body.accessCode === "string" ? body.accessCode.trim() : "";
    const driverId = typeof body.driverId === "string" ? body.driverId.trim() : "";
    if (!accessCode || !driverId) {
      res.status(400).json({ error: "access_code_or_driver_missing" });
      return;
    }
    const probe = await verifyAccessCode(accessCode, null);
    if (!probe.ok) {
      res.status(400).json({ error: probe.error });
      return;
    }
    cleanupCodeVerifySessions();
    const verifyToken = `acv-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    codeVerifySessions.set(verifyToken, {
      driverId,
      normalized: probe.normalized,
      expiresAt: Date.now() + CODE_VERIFY_TTL_MS,
    });
    res.json({
      ok: true,
      verifyToken,
      expiresInSeconds: Math.floor(CODE_VERIFY_TTL_MS / 1000),
      summary: { codeType: probe.codeType, label: probe.label },
    });
  } catch (e) {
    next(e);
  }
});

router.post("/rides", async (req, res, next) => {
  try {
    const raw = req.body as Partial<RideRequest> & { accessCodeVerifyToken?: unknown };
    if (!raw.customerName || String(raw.customerName).trim() === "" || !raw.passengerId) {
      res.status(401).json({ error: "Unauthorized: Bitte anmelden, um eine Fahrt zu buchen." });
      return;
    }
    if (
      raw.rideKind != null &&
      raw.rideKind !== "" &&
      (typeof raw.rideKind !== "string" || parseRideKind(raw.rideKind) === null)
    ) {
      res.status(400).json({ error: "ride_kind_invalid" });
      return;
    }
    if (
      raw.payerKind != null &&
      raw.payerKind !== "" &&
      (typeof raw.payerKind !== "string" || parsePayerKind(raw.payerKind) === null)
    ) {
      res.status(400).json({ error: "payer_kind_invalid" });
      return;
    }
    if (
      raw.authorizationSource != null &&
      raw.authorizationSource !== "" &&
      (typeof raw.authorizationSource !== "string" ||
        parseAuthorizationSource(raw.authorizationSource) === null)
    ) {
      res.status(400).json({ error: "authorization_source_invalid" });
      return;
    }
    if (
      raw.pricingMode != null &&
      raw.pricingMode !== "" &&
      raw.pricingMode !== "taxi_tariff"
    ) {
      res.status(400).json({ error: "pricing_mode_invalid" });
      return;
    }
    const fromFull = String((raw as { fromFull?: string }).fromFull ?? (raw as { from?: string }).from ?? "").trim();
    const toFull = String((raw as { toFull?: string }).toFull ?? (raw as { to?: string }).to ?? "").trim();
    if (!fromFull || !toFull) {
      res.status(400).json({ error: "from_to_required" });
      return;
    }
    const opPayload = await getOperationalConfigPayload();
    const sysGate = assertPlatformNewRideAllowed(opPayload);
    if (!sysGate.ok) {
      res.status(sysGate.status).json({ error: sysGate.error, message: sysGate.message });
      return;
    }
    const area = await checkCustomerRideServiceArea(fromFull, toFull);
    if (!area.ok) {
      res.status(400).json({
        error: "service_area_not_covered",
        message: getOutOfServiceAreaMessage(opPayload),
      });
      return;
    }
    const opCheck = assertCustomerRideOperational(req.body as Record<string, unknown>, opPayload);
    if (!opCheck.ok) {
      res.status(400).json({ error: opCheck.error, message: opCheck.message });
      return;
    }
    const rideKind = parseRideKind(raw.rideKind) ?? DEFAULT_RIDE_KIND;
    const payerKind = parsePayerKind(raw.payerKind) ?? DEFAULT_PAYER_KIND;
    const authorizationSource =
      parseAuthorizationSource(raw.authorizationSource) ?? DEFAULT_AUTHORIZATION_SOURCE;
    const scheduledAtNormalized = pickScheduledAtFromBody(raw as Partial<RideRequest> & Record<string, unknown>);
    const customerPhoneClean = String(
      (raw as { customerPhone?: unknown }).customerPhone ??
        (raw as { passengerPhone?: unknown }).passengerPhone ??
        (raw as { phone?: unknown }).phone ??
        "",
    ).trim();
    const newReq: RideRequest = {
      ...(raw as RideRequest),
      id: `REQ-${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: initialCustomerRideStatus(scheduledAtNormalized),
      scheduledAt: scheduledAtNormalized,
      rejectedBy: [],
      driverId: null,
      customerPhone: customerPhoneClean || null,
      rideKind,
      payerKind,
      voucherCode: parseOptionalBillingTag(raw.voucherCode, 64),
      billingReference: parseOptionalBillingTag(raw.billingReference, 256),
      authorizationSource,
      accessCodeId: null,
      pricingMode: "taxi_tariff",
    };
    const accessCodeRaw = (raw as { accessCode?: unknown }).accessCode;
    const accessCodePlain = typeof accessCodeRaw === "string" ? accessCodeRaw : undefined;
    const accessCodeVerifyToken =
      typeof raw.accessCodeVerifyToken === "string" ? raw.accessCodeVerifyToken.trim() : "";
    const driverIdForCodeRide =
      typeof raw.driverId === "string" ? raw.driverId.trim() : "";
    const normalizedCode = accessCodePlain ? normalizeAccessCodeInput(accessCodePlain) : null;
    if (normalizedCode && driverIdForCodeRide) {
      cleanupCodeVerifySessions();
      const session = accessCodeVerifyToken
        ? codeVerifySessions.get(accessCodeVerifyToken)
        : null;
      const isSessionValid =
        !!session &&
        session.expiresAt > Date.now() &&
        session.driverId === driverIdForCodeRide &&
        session.normalized === normalizedCode;
      if (!isSessionValid) {
        res.status(409).json({ error: "access_code_verify_required" });
        return;
      }
      codeVerifySessions.delete(accessCodeVerifyToken);
    }
    const ins = await insertRideWithOptionalAccessCode(newReq, accessCodePlain);
    if (!ins.ok) {
      res.status(400).json({ error: ins.error });
      return;
    }
    const created = await findRide(newReq.id);
    if (!created) {
      res.status(500).json({ error: "ride_insert_inconsistent" });
      return;
    }
    const regionsCreated = await listServiceRegionsForApi();
    const pcCreated = resolveFinancePricingContextFromOperational(created, opPayload, regionsCreated);
    void upsertRideFinancialSnapshot({
      ride: created,
      pricingContext: pcCreated,
      reason: "ride_created",
    });
    const [withSummary] = await attachAccessCodeSummariesToRides([stripPartnerOnlyRideFields(created)]);
    res.status(201).json(withSummary);
  } catch (e) {
    next(e);
  }
});

router.patch("/rides/:id/status", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, driverId, cancelReason } = req.body as {
      status: unknown;
      driverId?: string;
      cancelReason?: string;
    };
    const parsedFinalFare = parseOptionalFinalFareFromBody(req.body);
    const nextStatus = normalizeStatusInput(status);
    if (!nextStatus) {
      res.status(400).json({ error: "status_invalid" });
      return;
    }
    const cur = await findRide(id);
    if (!cur) {
      res.status(404).json({ error: "not found" });
      return;
    }
    if (!canTransitionStatus(cur.status, nextStatus)) {
      res.status(409).json({ error: "status_transition_invalid", from: cur.status, to: nextStatus });
      return;
    }
    const cancelReasonClean = typeof cancelReason === "string" ? cancelReason.trim() : "";
    if (nextStatus === "cancelled_by_customer" && !cancelReasonClean) {
      res.status(400).json({ error: "cancel_reason_required" });
      return;
    }
    if (nextStatus === "accepted" && driverId) {
      const driverAuth = await findFleetDriverAuthRow(driverId);
      const capabilityCompanyId = cur.companyId ?? driverAuth?.company_id ?? null;
      if (!capabilityCompanyId) {
        res.status(409).json({
          error: "ride_not_assignable",
          message: "Fahrt/Fahrer konnten keinem Unternehmen zugeordnet werden.",
        });
        return;
      }
      if (cur.companyId && driverAuth?.company_id && cur.companyId !== driverAuth.company_id) {
        res.status(409).json({
          error: "ride_company_mismatch",
          message: "Diese Fahrt gehört zu einem anderen Unternehmen.",
        });
        return;
      }
      const readinessR = await getFleetDriverReadinessById(driverId, capabilityCompanyId);
      if (!("error" in readinessR) && !readinessR.ready) {
        res.status(409).json({
          error: "driver_not_einsatzbereit",
          blockReasons: readinessR.blockReasons,
          message: "Fahrer ist derzeit nicht einsatzbereit (Freigabe, P-Schein, Fahrzeug oder Unternehmen).",
        });
        return;
      }
      const capability = await getFleetDriverCapability(driverId, capabilityCompanyId);
      if (!capability || !isRideCompatibleWithCapability(cur, capability)) {
        res.status(409).json({
          error: "no_matching_vehicle_available",
          message: "Aktuell kein passendes Fahrzeug verfügbar",
        });
        return;
      }
    }

    let finalFareForPatch: number | undefined = parsedFinalFare;
    let customerCancelFeeAudit: { feeEur: number; reason: string } | null = null;
    if (nextStatus === "cancelled_by_customer") {
      const opPayloadCancel = await getOperationalConfigPayload();
      const ev = await evaluateCustomerCancellationFeeEur(
        {
          status: cur.status,
          scheduledAt: cur.scheduledAt ?? null,
          createdAt: cur.createdAt,
          fromFull: cur.fromFull,
        },
        opPayloadCancel,
      );
      customerCancelFeeAudit = ev;
      if (ev.feeEur > 0) {
        const chosen = parsedFinalFare !== undefined ? parsedFinalFare : ev.feeEur;
        if (chosen < ev.feeEur - 1e-9) {
          res.status(400).json({
            error: "cancel_fee_too_low",
            message: `Für dieses Storno ist mindestens ${ev.feeEur.toFixed(2)} EUR als Endpreis vorgesehen.`,
            minFinalFareEur: ev.feeEur,
          });
          return;
        }
        const cap = Math.max(cur.estimatedFare ?? 0, ev.feeEur);
        finalFareForPatch = Math.min(Math.max(chosen, ev.feeEur), cap);
      }
    }

    const updated = await updateRide(id, {
      status: nextStatus,
      ...(finalFareForPatch !== undefined ? { finalFare: finalFareForPatch } : {}),
      ...(driverId != null ? { driverId } : {}),
    });
    if (!updated) {
      res.status(500).json({ error: "update_failed" });
      return;
    }
    if (cancelReasonClean) {
      const isCancel = [
        "cancelled",
        "cancelled_by_customer",
        "cancelled_by_driver",
        "cancelled_by_system",
        "rejected",
        "expired",
      ].includes(nextStatus);
      if (isCancel) {
        const crActor =
          nextStatus === "cancelled_by_customer"
            ? { actorType: "passenger" as const, actorId: null as string | null }
            : nextStatus === "cancelled_by_driver"
              ? { actorType: "driver" as const, actorId: driverId ?? null }
              : { actorType: "system" as const, actorId: null as string | null };
        await insertSupplementalRideEvent(id, {
          eventType: "cancel_reason",
          fromStatus: cur.status,
          toStatus: nextStatus,
          actorType: crActor.actorType,
          actorId: crActor.actorId,
          payload: {
            reason: cancelReasonClean,
            nextStatus,
            ...(nextStatus === "cancelled_by_customer" && customerCancelFeeAudit
              ? {
                  cancellationFeeEur: customerCancelFeeAudit.feeEur,
                  cancellationFeeRule: customerCancelFeeAudit.reason,
                  appliedFinalFareEur: finalFareForPatch ?? null,
                }
              : {}),
          },
        });
      }
    }
    if (nextStatus === "cancelled_by_customer") {
      customerCancelReasons.set(id, cancelReasonClean);
    }
    if (nextStatus === "completed") {
      const opPayloadComplete = await getOperationalConfigPayload();
      const regionsComplete = await listServiceRegionsForApi();
      const pcComplete = resolveFinancePricingContextFromOperational(updated, opPayloadComplete, regionsComplete);
      const finance = await upsertRideFinancialSnapshot({
        ride: updated,
        pricingContext: pcComplete,
        reason: "ride_completed_status_transition",
      });
      if (!finance.ok) {
        res.status(500).json({ error: finance.error });
        return;
      }
    }
    if (nextStatus === "completed" || nextStatus === "cancelled_by_driver" || nextStatus === "cancelled" || nextStatus === "cancelled_by_system") {
      customerCancelReasons.delete(id);
    }
    res.json({ ...stripPartnerOnlyRideFields(updated), cancelReason: customerCancelReasons.get(id) ?? null });
  } catch (e) {
    next(e);
  }
});

/** Admin: Fahrt wieder auf Markt / zur Disposition (Fahrer entfernen, Status pending). */
router.patch("/rides/:id/release", async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await adminReleaseRide(id);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(stripPartnerOnlyRideFields(updated));
  } catch (e) {
    next(e);
  }
});

router.post("/rides/:id/driver-location", (req, res) => {
  const { id } = req.params;
  const { lat, lon } = req.body as { lat: number; lon: number };
  if (typeof lat !== "number" || typeof lon !== "number") {
    res.status(400).json({ error: "lat and lon required" });
    return;
  }
  const loc: DriverLocation = { lat, lon, updatedAt: new Date().toISOString() };
  driverLocations.set(id, loc);
  res.json(loc);
});

router.get("/rides/:id/driver-location", (req, res) => {
  const { id } = req.params;
  const loc = driverLocations.get(id);
  if (!loc) {
    res.status(404).json({ error: "no location yet" });
    return;
  }
  res.json(loc);
});

router.post("/rides/:id/customer-location", (req, res) => {
  const { id } = req.params;
  const { lat, lon } = req.body as { lat: number; lon: number };
  if (typeof lat !== "number" || typeof lon !== "number") {
    res.status(400).json({ error: "lat and lon required" });
    return;
  }
  const loc: DriverLocation = { lat, lon, updatedAt: new Date().toISOString() };
  customerLocations.set(id, loc);
  res.json(loc);
});

router.get("/rides/:id/customer-location", (req, res) => {
  const { id } = req.params;
  const loc = customerLocations.get(id);
  if (!loc) {
    res.status(404).json({ error: "no location yet" });
    return;
  }
  res.json(loc);
});

router.post("/rides/:id/reject", async (req, res, next) => {
  try {
    const { id } = req.params;
    const driverIdRaw = (req.body as { driverId?: unknown }).driverId;
    const driverId = typeof driverIdRaw === "string" ? driverIdRaw.trim() : "";
    if (!driverId) {
      res.status(400).json({ error: "driver_id_required" });
      return;
    }
    const cur = await findRide(id);
    if (!cur) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const existing = cur.rejectedBy ?? [];
    const rejectIsNew = !existing.includes(driverId);
    const rejectedBy = existing.includes(driverId) ? existing : [...existing, driverId];
    const updated = await updateRide(id, { rejectedBy });
    if (!updated) {
      res.status(500).json({ error: "update_failed" });
      return;
    }
    if (rejectIsNew) {
      await insertSupplementalRideEvent(id, {
        eventType: "driver_rejected",
        fromStatus: cur.status,
        toStatus: cur.status,
        actorType: "driver",
        actorId: driverId,
        payload: { driverId },
      });
    }
    res.json(stripPartnerOnlyRideFields(updated));
  } catch (e) {
    next(e);
  }
});

router.post("/rides/:id/driver-cancel", async (req, res, next) => {
  try {
    const { id } = req.params;
    const driverIdRaw = (req.body as { driverId?: unknown }).driverId;
    const driverId = typeof driverIdRaw === "string" ? driverIdRaw.trim() : "";
    const cur = await findRide(id);
    if (!cur) {
      res.status(404).json({ error: "not found" });
      return;
    }
    // Bereits final durch Kunde/System beendet -> nicht erneut in Suchpool schieben.
    if (
      cur.status === "cancelled_by_customer" ||
      cur.status === "cancelled_by_system" ||
      cur.status === "cancelled_by_driver" ||
      cur.status === "cancelled" ||
      cur.status === "completed"
    ) {
      res.json(stripPartnerOnlyRideFields(cur));
      return;
    }
    const existing = cur.rejectedBy ?? [];
    const rejectedBy = driverId
      ? (existing.includes(driverId) ? existing : [...existing, driverId])
      : existing;
    const revertStatus: RideRequest["status"] =
      cur.scheduledAt && isFarFutureReservation(cur.scheduledAt) ? "scheduled" : "searching_driver";
    const updated = await updateRide(id, {
      status: revertStatus,
      driverId: null,
      rejectedBy,
    });
    if (!updated) {
      res.status(500).json({ error: "update_failed" });
      return;
    }
    res.json(stripPartnerOnlyRideFields(updated));
  } catch (e) {
    next(e);
  }
});

router.post("/rides/:id/driver-hard-cancel", async (req, res, next) => {
  try {
    const { id } = req.params;
    const driverIdRaw = (req.body as { driverId?: unknown }).driverId;
    const driverId = typeof driverIdRaw === "string" ? driverIdRaw.trim() : "";
    const cur = await findRide(id);
    if (!cur) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const updated = await updateRide(id, {
      status: "cancelled_by_driver",
      driverId: null,
      rejectedBy: driverId ? [...new Set([...(cur.rejectedBy ?? []), driverId])] : (cur.rejectedBy ?? []),
    });
    if (!updated) {
      res.status(500).json({ error: "update_failed" });
      return;
    }
    res.json(stripPartnerOnlyRideFields(updated));
  } catch (e) {
    next(e);
  }
});

router.delete("/rides/demo", async (_req, res, next) => {
  try {
    await resetRidesDemo([...DEMO]);
    driverLocations.clear();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
