import { Router } from "express";

export interface RideRequest {
  id: string;
  createdAt: string;
  scheduledAt?: string | null;
  from: string;
  fromFull: string;
  fromLat?: number;
  fromLon?: number;
  to: string;
  toFull: string;
  toLat?: number;
  toLon?: number;
  distanceKm: number;
  durationMinutes: number;
  estimatedFare: number;
  finalFare?: number | null;
  paymentMethod: string;
  vehicle: string;
  customerName: string;
  passengerId?: string;
  driverId?: string | null;
  rejectedBy: string[];
  status: "pending" | "accepted" | "arrived" | "in_progress" | "rejected" | "cancelled" | "completed";
}

export interface DriverLocation {
  lat: number;
  lon: number;
  updatedAt: string;
}

const now = new Date();
const todayAt = (h: number, m: number) => {
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

let store: RideRequest[] = [];

// In-memory location stores (exported for socket.io in index.ts)
export const driverLocations = new Map<string, DriverLocation>();
export const customerLocations = new Map<string, DriverLocation>();

const router = Router();

router.get("/rides", (_req, res) => {
  res.json(store);
});

router.post("/rides", (req, res) => {
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
  store.unshift(newReq);
  res.status(201).json(newReq);
});

router.patch("/rides/:id/status", (req, res) => {
  const { id } = req.params;
  const { status, finalFare, driverId } = req.body as {
    status: RideRequest["status"];
    finalFare?: number;
    driverId?: string;
  };
  const idx = store.findIndex((r) => r.id === id);
  if (idx < 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  store[idx] = {
    ...store[idx],
    status,
    ...(finalFare != null ? { finalFare } : {}),
    ...(driverId != null ? { driverId } : {}),
  };
  res.json(store[idx]);
});

// Driver sends their current GPS location
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

// Customer polls driver GPS location
router.get("/rides/:id/driver-location", (req, res) => {
  const { id } = req.params;
  const loc = driverLocations.get(id);
  if (!loc) {
    res.status(404).json({ error: "no location yet" });
    return;
  }
  res.json(loc);
});

// Customer sends their GPS location (REST fallback)
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

// Driver polls customer GPS location (REST fallback)
router.get("/rides/:id/customer-location", (req, res) => {
  const { id } = req.params;
  const loc = customerLocations.get(id);
  if (!loc) {
    res.status(404).json({ error: "no location yet" });
    return;
  }
  res.json(loc);
});

router.post("/rides/:id/reject", (req, res) => {
  const { id } = req.params;
  const { driverId } = req.body as { driverId: string };
  const idx = store.findIndex((r) => r.id === id);
  if (idx < 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const existing = store[idx].rejectedBy ?? [];
  if (!existing.includes(driverId)) {
    store[idx] = {
      ...store[idx],
      rejectedBy: [...existing, driverId],
    };
  }
  res.json(store[idx]);
});

router.post("/rides/:id/driver-cancel", (req, res) => {
  const { id } = req.params;
  const { driverId } = req.body as { driverId: string };
  const idx = store.findIndex((r) => r.id === id);
  if (idx < 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const existing = store[idx].rejectedBy ?? [];
  store[idx] = {
    ...store[idx],
    status: "pending",
    driverId: null,
    rejectedBy: existing.includes(driverId) ? existing : [...existing, driverId],
  };
  res.json(store[idx]);
});

router.delete("/rides/demo", (_req, res) => {
  store = [...DEMO];
  driverLocations.clear();
  res.json({ ok: true });
});

export default router;
