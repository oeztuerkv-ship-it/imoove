import { Router, type IRouter, type Response } from "express";
import { isPostgresConfigured } from "../db/client";
import {
  findFleetDriverInCompany,
  touchFleetDriverHeartbeat,
  updateFleetDriverPassword,
} from "../db/fleetDriversData";
import { attachAccessCodeSummariesToRides } from "../db/accessCodesData";
import { getFleetDriverCapability, isRideCompatibleWithCapability } from "../db/fleetMatchingData";
import { listRides } from "../db/ridesData";
import { stripPartnerOnlyRideFields } from "../domain/ridePublic";
import { hashPassword, verifyPassword } from "../lib/password";
import { requireFleetDriverAuth, type FleetDriverAuthRequest } from "../middleware/requireFleetDriverAuth";

const router: IRouter = Router();

router.get("/fleet-driver/v1/me", requireFleetDriverAuth, async (req, res) => {
  if (!isPostgresConfigured()) {
    res.status(503).json({ error: "database_not_configured" });
    return;
  }
  const a = (req as FleetDriverAuthRequest).fleetDriverAuth;
  if (!a) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const row = await findFleetDriverInCompany(a.fleetDriverId, a.companyId);
  if (!row) {
    res.status(401).json({ error: "not_found" });
    return;
  }
  res.json({
    ok: true,
    driver: {
      id: row.id,
      companyId: row.company_id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      accessStatus: row.access_status,
      mustChangePassword: row.must_change_password,
      vehicleLegalType: row.vehicle_legal_type,
      vehicleClass: row.vehicle_class,
    },
  });
});

router.get("/fleet-driver/v1/market-rides", requireFleetDriverAuth, async (req, res, next) => {
  try {
    const a = (req as FleetDriverAuthRequest).fleetDriverAuth;
    if (!a) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const row = await findFleetDriverInCompany(a.fleetDriverId, a.companyId);
    if (!row) {
      res.status(401).json({ error: "not_found" });
      return;
    }
    /** Gleiche Quelle wie bei `PATCH /rides/:id/status` (Annahme): Zuweisung Fahrer↔Fahrzeug, sonst Fallback Fahrerprofil. */
    const capability = await getFleetDriverCapability(a.fleetDriverId, a.companyId);
    if (!capability?.vehicleLegalType) {
      res.json({
        ok: true,
        rides: [],
        message:
          "Keine Rechtsart (Taxi/Mietwagen) am aktiven Fahrzeug erkannt. Bitte im Partner-Panel Fahrzeug anlegen/zuweisen und Rechtsart setzen.",
      });
      return;
    }
    const all = await listRides();
    const marketRows = all.filter((ride) => {
      if (ride.driverId) return false;
      if ((ride.rejectedBy ?? []).includes(a.fleetDriverId)) return false;
      if (ride.companyId && ride.companyId !== a.companyId) return false;
      const active =
        ride.status === "pending" ||
        ride.status === "requested" ||
        ride.status === "searching_driver" ||
        ride.status === "offered";
      if (!active) return false;
      return isRideCompatibleWithCapability(ride, capability);
    });
    const publicRows = marketRows.map(stripPartnerOnlyRideFields);
    const withCodes = await attachAccessCodeSummariesToRides(publicRows);
    res.json({
      ok: true,
      rides: withCodes,
      message:
        withCodes.length === 0
          ? "Aktuell kein passendes Fahrzeug verfügbar"
          : null,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/fleet-driver/v1/ping", requireFleetDriverAuth, async (req, res) => {
  const a = (req as FleetDriverAuthRequest).fleetDriverAuth;
  if (!a) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  await touchFleetDriverHeartbeat(a.fleetDriverId);
  res.json({ ok: true });
});

router.post("/fleet-driver/v1/change-password", requireFleetDriverAuth, async (req, res) => {
  const a = (req as FleetDriverAuthRequest).fleetDriverAuth;
  if (!a) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const body = req.body as { currentPassword?: string; newPassword?: string };
  const cur = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const neu = typeof body.newPassword === "string" ? body.newPassword : "";
  if (neu.length < 10) {
    res.status(400).json({ error: "password_fields_invalid", hint: "newPassword min length 10" });
    return;
  }
  const row = await findFleetDriverInCompany(a.fleetDriverId, a.companyId);
  if (!row) {
    res.status(401).json({ error: "not_found" });
    return;
  }
  const okCur = await verifyPassword(cur, row.password_hash);
  if (!okCur) {
    res.status(400).json({ error: "current_password_invalid" });
    return;
  }
  const hash = await hashPassword(neu);
  const ok = await updateFleetDriverPassword(row.id, row.company_id, hash, false);
  if (!ok) {
    res.status(500).json({ error: "password_update_failed" });
    return;
  }
  res.json({ ok: true });
});

export default router;
