import { Router, type IRouter } from "express";
import { isPostgresConfigured } from "../db/client";
import {
  findFleetDriverInCompany,
  fleetDriverTableRowToList,
  touchFleetDriverHeartbeat,
  updateFleetDriverPassword,
} from "../db/fleetDriversData";
import { listAssignmentsForCompany, setDriverVehicleAssignment } from "../db/fleetAssignmentsData";
import { listFleetVehiclesForCompany } from "../db/fleetVehiclesData";
import { attachAccessCodeSummariesToRides } from "../db/accessCodesData";
import { buildFleetDriverMeClientHints, deriveDriverWorkflowLabel, getFleetDriverReadinessById } from "../db/fleetDriverReadiness";
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
  const [assignments, vehicles] = await Promise.all([
    listAssignmentsForCompany(a.companyId),
    listFleetVehiclesForCompany(a.companyId),
  ]);
  const assigned = assignments.find((x) => x.driverId === a.fleetDriverId) ?? null;
  const assignedVehicle = assigned ? vehicles.find((v) => v.id === assigned.vehicleId) ?? null : null;
  const assignedVehicleVisible =
    assignedVehicle && assignedVehicle.isActive && assignedVehicle.approvalStatus === "approved"
      ? assignedVehicle
      : null;
  const listRow = fleetDriverTableRowToList(row);
  const readinessR = await getFleetDriverReadinessById(a.fleetDriverId, a.companyId);
  const einsatzbereit = "error" in readinessR ? false : readinessR.ready;
  const driverWorkflow = deriveDriverWorkflowLabel(listRow);
  const hints =
    "error" in readinessR
      ? {
          notFreigegebenMessage: "Einsatzbereitschaft konnte nicht geladen werden.",
          blockBannerTitle: "Hinweis",
          driverBlockKind: "other" as const,
        }
      : einsatzbereit
        ? { notFreigegebenMessage: "", blockBannerTitle: "", driverBlockKind: "other" as const }
        : buildFleetDriverMeClientHints(readinessR, listRow);
  res.json({
    ok: true,
    einsatzbereit,
    notFreigegebenMessage: einsatzbereit ? null : hints.notFreigegebenMessage,
    blockBannerTitle: einsatzbereit ? null : hints.blockBannerTitle || null,
    driverBlockKind: einsatzbereit ? null : hints.driverBlockKind,
    driverWorkflow,
    ...("error" in readinessR ? { readiness: { ready: false, blockReasons: [] } } : { readiness: readinessR }),
    driver: {
      id: row.id,
      companyId: row.company_id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      accessStatus: row.access_status,
      approvalStatus: listRow.approvalStatus,
      mustChangePassword: row.must_change_password,
      vehicleLegalType: row.vehicle_legal_type,
      vehicleClass: row.vehicle_class,
    },
    assignedVehicle: assignedVehicleVisible
      ? {
          vehicleId: assignedVehicleVisible.id,
          plate: assignedVehicleVisible.licensePlate,
          license_plate: assignedVehicleVisible.licensePlate,
          licensePlate: assignedVehicleVisible.licensePlate,
          model: assignedVehicleVisible.model,
          vehicleType: assignedVehicleVisible.vehicleType,
          vehicleClass: assignedVehicleVisible.vehicleClass,
        }
      : null,
  });
});

router.get("/fleet-driver/v1/vehicles", requireFleetDriverAuth, async (req, res) => {
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
  const [assignments, vehicles] = await Promise.all([
    listAssignmentsForCompany(a.companyId),
    listFleetVehiclesForCompany(a.companyId),
  ]);
  const currentAssignment = assignments.find((x) => x.driverId === a.fleetDriverId) ?? null;
  const items = vehicles
    .filter((v) => v.isActive && v.approvalStatus === "approved")
    .map((v) => ({
      id: v.id,
      plate: v.licensePlate,
      license_plate: v.licensePlate,
      licensePlate: v.licensePlate,
      model: v.model,
      vehicleType: v.vehicleType,
      vehicleClass: v.vehicleClass,
      isActive: v.isActive,
      approvalStatus: v.approvalStatus,
      selectable: true,
      selected: currentAssignment?.vehicleId === v.id,
    }));
  res.json({ ok: true, vehicles: items, selectedVehicleId: currentAssignment?.vehicleId ?? null });
});

router.post("/fleet-driver/v1/select-vehicle", requireFleetDriverAuth, async (req, res) => {
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
  const vehicleId = typeof req.body?.vehicleId === "string" ? req.body.vehicleId.trim() : "";
  if (!vehicleId) {
    res.status(400).json({ error: "vehicle_id_required" });
    return;
  }
  const vehicles = await listFleetVehiclesForCompany(a.companyId);
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) ?? null;
  if (!selectedVehicle) {
    res.status(400).json({ error: "vehicle_not_found" });
    return;
  }
  if (!selectedVehicle.isActive || selectedVehicle.approvalStatus !== "approved") {
    res.status(400).json({ error: "vehicle_not_selectable" });
    return;
  }
  const r = await setDriverVehicleAssignment({
    companyId: a.companyId,
    driverId: a.fleetDriverId,
    vehicleId,
  });
  if (!r.ok) {
    res.status(400).json({ error: r.error });
    return;
  }
  const refreshedVehicles = await listFleetVehiclesForCompany(a.companyId);
  const selectedVehicleAfter = refreshedVehicles.find((v) => v.id === vehicleId) ?? null;
  res.json({
    ok: true,
    selectedVehicle: selectedVehicleAfter
      ? {
          vehicleId: selectedVehicleAfter.id,
          plate: selectedVehicleAfter.licensePlate,
          license_plate: selectedVehicleAfter.licensePlate,
          licensePlate: selectedVehicleAfter.licensePlate,
          model: selectedVehicleAfter.model,
          vehicleType: selectedVehicleAfter.vehicleType,
          vehicleClass: selectedVehicleAfter.vehicleClass,
        }
      : null,
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
    const readinessR = await getFleetDriverReadinessById(a.fleetDriverId, a.companyId);
    if ("error" in readinessR) {
      res.status(401).json({ error: "not_found" });
      return;
    }
    if (!readinessR.ready) {
      res.json({
        ok: true,
        rides: [],
        einsatzbereit: false,
        readiness: readinessR,
        message:
          "Noch nicht freigegeben oder Voraussetzungen unvollständig. Aufträge sind gesperrt, bis alles erfüllt ist.",
      });
      return;
    }
    /** Gleiche Quelle wie bei `PATCH /rides/:id/status` (Annahme): Zuweisung Fahrer↔Fahrzeug, sonst Fallback Fahrerprofil. */
    const capability = await getFleetDriverCapability(a.fleetDriverId, a.companyId);
    if (!capability?.vehicleLegalType) {
      res.json({
        ok: true,
        rides: [],
        einsatzbereit: false,
        message:
          "Kein fahrbereites Fahrzeug: Zuweisung prüfen und Freigabe durch Onroda abwarten (nur freigegebene Fahrzeuge).",
      });
      return;
    }
    const all = await listRides();
    const marketRows = all.filter((ride) => {
      if (ride.status === "scheduled" || ride.status === "scheduled_assigned") return false;
      const isAssignedToDriver = ride.driverId === a.fleetDriverId;
      const isAssignedToOtherDriver = !!ride.driverId && !isAssignedToDriver;
      if (isAssignedToOtherDriver) return false;
      // Mandantenfilter: wenn companyId gesetzt ist, muss sie zur Fahrerfirma passen.
      // Legacy/Test-Fahrten können ohne companyId erstellt sein; die Capability-Prüfung
      // entscheidet dann weiterhin nach Taxi-Klasse.
      if (ride.companyId && ride.companyId !== a.companyId) return false;
      if (isAssignedToDriver) {
        return (
          ride.status === "accepted" ||
          ride.status === "driver_arriving" ||
          ride.status === "driver_waiting" ||
          ride.status === "passenger_onboard" ||
          ride.status === "arrived" ||
          ride.status === "in_progress"
        );
      }
      if ((ride.rejectedBy ?? []).includes(a.fleetDriverId)) return false;
      const inMarket =
        ride.status === "pending" ||
        ride.status === "requested" ||
        ride.status === "searching_driver" ||
        ride.status === "offered";
      if (!inMarket) return false;
      return isRideCompatibleWithCapability(ride, capability);
    });
    const publicRows = marketRows.map(stripPartnerOnlyRideFields);
    const withCodes = await attachAccessCodeSummariesToRides(publicRows);
    res.json({
      ok: true,
      einsatzbereit: true,
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

router.get("/fleet-driver/v1/scheduled-rides", requireFleetDriverAuth, async (req, res, next) => {
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
    const readinessR = await getFleetDriverReadinessById(a.fleetDriverId, a.companyId);
    if ("error" in readinessR) {
      res.status(401).json({ error: "not_found" });
      return;
    }
    if (!readinessR.ready) {
      res.json({
        ok: true,
        rides: [],
        einsatzbereit: false,
        readiness: readinessR,
        message:
          "Noch nicht freigegeben oder Voraussetzungen unvollständig. Aufträge sind gesperrt, bis alles erfüllt ist.",
      });
      return;
    }
    const capability = await getFleetDriverCapability(a.fleetDriverId, a.companyId);
    if (!capability?.vehicleLegalType) {
      res.json({
        ok: true,
        rides: [],
        einsatzbereit: false,
        message:
          "Kein fahrbereites Fahrzeug: Zuweisung prüfen und Freigabe durch Onroda abwarten (nur freigegebene Fahrzeuge).",
      });
      return;
    }
    const all = await listRides();
    const pool = all.filter((ride) => {
      const isFutureReservationStatus =
        ride.status === "scheduled" || ride.status === "scheduled_assigned";
      if (!isFutureReservationStatus) return false;
      if (ride.companyId && ride.companyId !== a.companyId) return false;

      const assignedDriverId = typeof ride.driverId === "string" ? ride.driverId.trim() : "";
      const isAssignedToThisDriver = assignedDriverId === a.fleetDriverId;
      const isAssignedToOtherDriver = assignedDriverId.length > 0 && !isAssignedToThisDriver;
      if (isAssignedToOtherDriver) return false;

      if ((ride.rejectedBy ?? []).includes(a.fleetDriverId)) return false;
      return isRideCompatibleWithCapability(ride, capability);
    });
    const publicRows = pool.map(stripPartnerOnlyRideFields);
    const withCodes = await attachAccessCodeSummariesToRides(publicRows);
    res.json({
      ok: true,
      einsatzbereit: true,
      rides: withCodes,
      message: withCodes.length === 0 ? "Keine Vorbestellungen im Planer" : null,
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
