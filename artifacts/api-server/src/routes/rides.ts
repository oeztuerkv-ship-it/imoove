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
  parseAuthorizationSource,
} from "../domain/rideAuthorization";
import { stripPartnerOnlyRideFields } from "../domain/ridePublic";

export type { RideRequest } from "../domain/rideRequest";

export interface DriverLocation {
  lat: number;
  lon: number;
  updatedAt: string;
}

const DEMO: RideRequest[] = [];

export const driverLocations = new Map<string, DriverLocation>();
export const customerLocations = new Map<string, DriverLocation>();

const router = Router();

router.get("/rides", async (_req, res, next) => {
  try {
    const rows = await listRides();
    const publicRows = rows.map(stripPartnerOnlyRideFields);
    res.json(await attachAccessCodeSummariesToRides(publicRows));
  } catch (e) {
    next(e);
  }
});

router.post("/rides", async (req, res, next) => {
  try {
    const raw = req.body as Partial<RideRequest>;
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
      status: "pending",
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
    const { status, finalFare, driverId } = req.body as {
      status: RideRequest["status"];
      finalFare?: number;
      driverId?: string;
    };
    const cur = await findRide(id);
    if (!cur) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const updated = await updateRide(id, {
      status,
      ...(finalFare != null ? { finalFare } : {}),
      ...(driverId != null ? { driverId } : {}),
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
    const { driverId } = req.body as { driverId: string };
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
    const { driverId } = req.body as { driverId: string };
    const cur = await findRide(id);
    if (!cur) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const existing = cur.rejectedBy ?? [];
    const rejectedBy = existing.includes(driverId) ? existing : [...existing, driverId];
    const updated = await updateRide(id, {
      status: "pending",
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
