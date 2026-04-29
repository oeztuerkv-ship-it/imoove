import { Router } from "express";
import { findRideForPassenger, listRidesForPassenger } from "../db/ridesData";
import { toCustomerRideView } from "../domain/ridePublic";
import {
  customerPassengerId,
  requireCustomerSession,
  type CustomerSessionRequest,
} from "../middleware/requireCustomerSession";

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
    res.json({ ok: true, items: rides.map(toCustomerRideView) });
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
    res.json({ ok: true, item: toCustomerRideView(ride) });
  } catch (e) {
    next(e);
  }
});

export default router;
