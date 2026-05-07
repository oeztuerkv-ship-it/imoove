import { Router } from "express";
import { listAssignmentsForCompany } from "../db/fleetAssignmentsData";
import { listFleetVehiclesForCompany } from "../db/fleetVehiclesData";
import { findRideForPassenger, listRidesForPassenger, updateRide } from "../db/ridesData";
import { toCustomerRideView } from "../domain/ridePublic";
import {
  customerPassengerId,
  requireCustomerSession,
  type CustomerSessionRequest,
} from "../middleware/requireCustomerSession";

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

export default router;
