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
  listRides,
  resetRidesDemo,
  updateRide,
} from "../db/ridesData";
import {
  DEFAULT_AUTHORIZATION_SOURCE,
  normalizeAccessCodeInput,
  parseAuthorizationSource,
} from "../domain/rideAuthorization";
import { stripPartnerOnlyRideFields } from "../domain/ridePublic";
import { getPublicFareProfile } from "../db/adminData";
import { verifyAccessCode } from "../db/accessCodesData";

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

function normalizeStatusInput(raw: unknown): RideRequest["status"] | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  const allowed: RideRequest["status"][] = [
    "draft",
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
    const distanceKm = Number(req.query.distanceKm ?? 0);
    const waitingMinutes = Number(req.query.waitingMinutes ?? 0);
    const vehicle = String(req.query.vehicle ?? "standard").trim().toLowerCase();
    if (!Number.isFinite(distanceKm) || distanceKm < 0) {
      res.status(400).json({ error: "distance_km_invalid" });
      return;
    }
    const profile = await getPublicFareProfile();
    const waitPerMinute = profile.waitingPerHourEur / 60;
    const firstKm = Math.min(distanceKm, profile.thresholdKm);
    const restKm = Math.max(0, distanceKm - profile.thresholdKm);
    const distanceCharge = firstKm * profile.rateFirstKmEur + restKm * profile.rateAfterKmEur;
    const waitingCharge = Math.max(0, waitingMinutes) * waitPerMinute;
    const taxiTotal = ceilToTenth(profile.baseFareEur + distanceCharge + waitingCharge + profile.serviceFeeEur);
    const multipliers: Record<string, number> = { standard: 1, xl: 1.2, wheelchair: 1.15, onroda: 1 };
    const adjustedTaxi = ceilToTenth(taxiTotal * (multipliers[vehicle] ?? 1));
    const onrodaDistancePart = ceilToTenth(distanceKm * profile.onrodaPerKmEur);
    const onrodaTotal = Math.max(
      profile.onrodaMinFareEur,
      Math.ceil((profile.onrodaBaseFareEur + onrodaDistancePart - Number.EPSILON)),
    );
    const estimate =
      vehicle === "onroda"
        ? (profile.manualFixedPriceEur != null ? profile.manualFixedPriceEur : onrodaTotal)
        : adjustedTaxi;
    res.json({
      ok: true,
      profile,
      estimate: {
        distanceKm,
        waitingMinutes,
        vehicle,
        total: estimate,
        taxiTotal: adjustedTaxi,
        onrodaTotal,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.get("/rides", async (_req, res, next) => {
  try {
    const rows = await listRides();
    const publicRows = rows.map(stripPartnerOnlyRideFields);
    const withCodes = await attachAccessCodeSummariesToRides(publicRows);
    res.json(withCodes.map((r) => ({ ...r, cancelReason: customerCancelReasons.get(r.id) ?? null })));
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
    const rideKind = parseRideKind(raw.rideKind) ?? DEFAULT_RIDE_KIND;
    const payerKind = parsePayerKind(raw.payerKind) ?? DEFAULT_PAYER_KIND;
    const authorizationSource =
      parseAuthorizationSource(raw.authorizationSource) ?? DEFAULT_AUTHORIZATION_SOURCE;
    const newReq: RideRequest = {
      ...(raw as RideRequest),
      id: `REQ-${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: "requested",
      rejectedBy: [],
      driverId: null,
      rideKind,
      payerKind,
      voucherCode: parseOptionalBillingTag(raw.voucherCode, 64),
      billingReference: parseOptionalBillingTag(raw.billingReference, 256),
      authorizationSource,
      accessCodeId: null,
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
    const [withSummary] = await attachAccessCodeSummariesToRides([stripPartnerOnlyRideFields(created)]);
    res.status(201).json(withSummary);
  } catch (e) {
    next(e);
  }
});

router.patch("/rides/:id/status", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, finalFare, driverId, cancelReason } = req.body as {
      status: unknown;
      finalFare?: number;
      driverId?: string;
      cancelReason?: string;
    };
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
    const updated = await updateRide(id, {
      status: nextStatus,
      ...(finalFare != null ? { finalFare } : {}),
      ...(driverId != null ? { driverId } : {}),
    });
    if (!updated) {
      res.status(500).json({ error: "update_failed" });
      return;
    }
    if (nextStatus === "cancelled_by_customer") {
      customerCancelReasons.set(id, cancelReasonClean);
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
    const rejectedBy = existing.includes(driverId) ? existing : [...existing, driverId];
    const updated = await updateRide(id, { rejectedBy });
    if (!updated) {
      res.status(500).json({ error: "update_failed" });
      return;
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
    const updated = await updateRide(id, {
      status: "searching_driver",
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
