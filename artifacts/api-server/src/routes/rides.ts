import { Router } from "express";
import type { RideRequest } from "../domain/rideRequest";
import {
  adminReleaseRide,
  findRide,
  insertRide,
  listRides,
  resetRidesDemo,
  updateRide,
} from "../db/ridesData";

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
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post("/rides", async (req, res, next) => {
  try {
    const body = req.body as Omit<RideRequest, "id" | "createdAt" | "status" | "rejectedBy">;
    if (!body.customerName || body.customerName.trim() === "" || !body.passengerId) {
      res.status(401).json({ error: "Unauthorized: Bitte anmelden, um eine Fahrt zu buchen." });
      return;
    }
    const newReq: RideRequest = {
      ...body,
      id: `REQ-${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: "pending",
      rejectedBy: [],
      driverId: null,
    };
    await insertRide(newReq);
    res.status(201).json(newReq);
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
    res.json(updated);
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
    res.json(updated);
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
    res.json(updated);
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
    res.json(updated);
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
