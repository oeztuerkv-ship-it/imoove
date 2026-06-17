import { Router, type IRouter } from "express";
import { isPostgresConfigured } from "../db/client";
import {
  findFleetDriverInCompany,
  fleetDriverTableRowToList,
  getFleetDriverMarketOnline,
  setFleetDriverMarketOnline,
  syncFleetDriverDispatchPriorityFromAdminEmail,
  touchFleetDriverHeartbeat,
  updateFleetDriverMarketLocation,
  updateFleetDriverPassword,
} from "../db/fleetDriversData";
import { listAssignmentsForCompany, setDriverVehicleAssignment } from "../db/fleetAssignmentsData";
import { listFleetVehiclesForCompany } from "../db/fleetVehiclesData";
import { attachAccessCodeSummariesToRides } from "../db/accessCodesData";
import { buildFleetDriverMeClientHints, deriveDriverWorkflowLabel, getFleetDriverReadinessById } from "../db/fleetDriverReadiness";
import { findFollowUpOfferForDriver } from "../db/fleetFollowUpOfferData";
import { filterOpenInstantMarketRides, listMarketRidesForFleetDriver } from "../db/fleetDriverMarketPool";
import { getFleetDriverCapability, isRideCompatibleWithCapability } from "../db/fleetMatchingData";
import { dismissDriverMessage, listDriverMessagesForFleetDriver } from "../db/driverMessagesData";
import {
  listFleetDriverExpoPushTokens,
  upsertFleetDriverExpoPushToken,
} from "../db/fleetDriverExpoPushData";
import {
  isInstantDispatchRideStatus,
  recordDispatchOfferSeen,
  recordDispatchOffersSentForDriver,
} from "../db/rideDispatchOfferData";
import { getFleetDriverRideEarnings } from "../lib/fleetDriverRideEarnings.js";
import { submitDriverPassengerRating } from "../lib/fleetDriverRatings.js";
import { averageFleetDriverRating } from "../lib/fleetDriverRatings.js";
import { createFleetDriverReservation } from "../lib/fleetDriverCreateReservation.js";
import { releaseInstantRideDispatchOffer } from "../db/rideDispatchTierData";
import { listRides, listRidesForDriver } from "../db/ridesData";
import { stripPartnerOnlyRideFields } from "../domain/ridePublic";
import { listActualDurationMinutesByRideIds } from "../lib/rideActualDuration";
import { hashPassword, verifyPassword } from "../lib/password";
import {
  getOperationalConfigPayload,
  listServiceRegionsForApi,
  resolveFinancePricingContextForRide,
} from "../db/appOperationalData";
import { previewDriverSettlementFromGross } from "../lib/financeCalculationService";
import { runMedicalTransportDocumentScan, runMedicalTransportDocumentScanTest } from "../lib/medical/medicalScanService";
import { resolveMedicalTransportAuthorizationForFleetDriver } from "../lib/medical/medicalTransportAuthorization";
import { getCompanyFeatureKkModule, resolveKkModuleAccessForFleetDriver } from "../lib/kkModuleAccess.js";
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
  void syncFleetDriverDispatchPriorityFromAdminEmail(a.fleetDriverId, a.companyId);
  const rowFresh = (await findFleetDriverInCompany(a.fleetDriverId, a.companyId)) ?? row;
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
  const listRow = fleetDriverTableRowToList(rowFresh);
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
  const isMarketOnline = Boolean(row.is_market_online);
  const opPayload = await getOperationalConfigPayload();
  const regions = await listServiceRegionsForApi();
  const pricingCtx = await resolveFinancePricingContextForRide(
    { rideKind: "standard", companyId: a.companyId, driverId: a.fleetDriverId },
    opPayload,
    regions,
  );
  const effectiveCommissionRate =
    pricingCtx.commissionType === "percentage" || pricingCtx.commissionType === "hybrid"
      ? pricingCtx.commissionValue
      : 0;
  const medicalTransportAuth = await resolveMedicalTransportAuthorizationForFleetDriver(
    a.companyId,
    a.fleetDriverId,
  );
  const kkAccess = await resolveKkModuleAccessForFleetDriver(a.companyId, a.fleetDriverId);
  res.json({
    ok: true,
    einsatzbereit,
    isMarketOnline,
    featureKkModule: kkAccess?.companyEnabled ?? false,
    permissionKkModule: kkAccess?.permissionKkModule ?? false,
    isOwner: kkAccess?.isOwner ?? false,
    kkModuleAuthorized: kkAccess?.canAccess ?? false,
    dispatchPriority: listRow.dispatchPriority,
    medicalTransportAuthorized: medicalTransportAuth?.authorized ?? false,
    medicalTransportCompanyEnabled: medicalTransportAuth?.companyEnabled ?? false,
    companyCommission: {
      rate: effectiveCommissionRate,
      ratePercent: Math.round(effectiveCommissionRate * 1000) / 10,
      minCommissionEur: pricingCtx.minCommissionEur ?? null,
    },
    notFreigegebenMessage: einsatzbereit ? null : hints.notFreigegebenMessage,
    blockBannerTitle: einsatzbereit ? null : hints.blockBannerTitle || null,
    driverBlockKind: einsatzbereit ? null : hints.driverBlockKind,
    driverWorkflow,
    ...("error" in readinessR ? { readiness: { ready: false, blockReasons: [] } } : { readiness: readinessR }),
    driver: {
      id: rowFresh.id,
      companyId: rowFresh.company_id,
      email: rowFresh.email,
      firstName: rowFresh.first_name,
      lastName: rowFresh.last_name,
      accessStatus: rowFresh.access_status,
      approvalStatus: listRow.approvalStatus,
      mustChangePassword: rowFresh.must_change_password,
      vehicleLegalType: rowFresh.vehicle_legal_type,
      vehicleClass: rowFresh.vehicle_class,
      dispatchPriority: listRow.dispatchPriority,
      ratingAverage: averageFleetDriverRating(listRow.ratingSum, listRow.ratingCount),
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

/** Live-Vorschau Fahrer-Anteil (gleiche Logik wie ride_financials bei completed). */
router.get("/fleet-driver/v1/fare-settlement-preview", requireFleetDriverAuth, async (req, res, next) => {
  try {
    const a = (req as FleetDriverAuthRequest).fleetDriverAuth;
    if (!a) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const raw = String(req.query.grossEur ?? req.query.gross ?? "0").replace(",", ".");
    const grossEur = Number.parseFloat(raw);
    if (!Number.isFinite(grossEur) || grossEur < 0) {
      res.status(400).json({ error: "invalid_gross_eur" });
      return;
    }
    const opPayload = await getOperationalConfigPayload();
    const regions = await listServiceRegionsForApi();
    const pc = await resolveFinancePricingContextForRide(
      { rideKind: "standard", companyId: a.companyId, driverId: a.fleetDriverId },
      opPayload,
      regions,
    );
    const preview = previewDriverSettlementFromGross(grossEur, pc);
    res.json({ ok: true, ...preview });
  } catch (e) {
    next(e);
  }
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
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");

    const latRaw = typeof req.query.lat === "string" ? Number(req.query.lat) : NaN;
    const lonRaw = typeof req.query.lon === "string" ? Number(req.query.lon) : NaN;
    const hasPos = Number.isFinite(latRaw) && Number.isFinite(lonRaw);
    if (hasPos) {
      await updateFleetDriverMarketLocation(a.fleetDriverId, a.companyId, latRaw, lonRaw);
    } else {
      await touchFleetDriverHeartbeat(a.fleetDriverId);
    }

    const pool = await listMarketRidesForFleetDriver(a.fleetDriverId, a.companyId);
    if (!pool.ok) {
      res.status(401).json({ error: "not_found" });
      return;
    }
    if (!pool.einsatzbereit) {
      res.json({
        ok: true,
        rides: [],
        einsatzbereit: false,
        ...("readiness" in pool && pool.readiness ? { readiness: pool.readiness } : {}),
        message: pool.message,
      });
      return;
    }

    let marketRows = pool.rides;
    if (hasPos) {
      const { haversineDistanceKm } = await import("../lib/serviceRegionMatch.js");
      const openInstant = filterOpenInstantMarketRides(marketRows, a.fleetDriverId);
      const openIds = new Set(openInstant.map((r) => r.id));
      const sortedOpen = [...openInstant].sort((a, b) => {
        const da =
          a.fromLat != null && a.fromLon != null
            ? haversineDistanceKm(latRaw, lonRaw, a.fromLat, a.fromLon)
            : Infinity;
        const db =
          b.fromLat != null && b.fromLon != null
            ? haversineDistanceKm(latRaw, lonRaw, b.fromLat, b.fromLon)
            : Infinity;
        return da - db;
      });
      const assigned = marketRows.filter((r) => !openIds.has(r.id));
      marketRows = [...sortedOpen, ...assigned];
    }

    const publicRows = marketRows.map(stripPartnerOnlyRideFields);
    const withCodes = await attachAccessCodeSummariesToRides(publicRows);
    const openInstantIds = pool.rides
      .filter((r) => !r.driverId && isInstantDispatchRideStatus(r.status))
      .map((r) => r.id);
    void recordDispatchOffersSentForDriver(a.fleetDriverId, a.companyId, openInstantIds);
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

router.get("/fleet-driver/v1/follow-up-offer", requireFleetDriverAuth, async (req, res, next) => {
  try {
    const a = (req as FleetDriverAuthRequest).fleetDriverAuth;
    if (!a) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const lat = typeof req.query.lat === "string" ? Number(req.query.lat) : NaN;
    const lon = typeof req.query.lon === "string" ? Number(req.query.lon) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      res.status(400).json({ error: "lat_lon_required" });
      return;
    }
    const excludeRideId =
      typeof req.query.excludeRideId === "string" ? req.query.excludeRideId.trim() : undefined;
    const lastRideId =
      typeof req.query.lastRideId === "string" ? req.query.lastRideId.trim() : undefined;

    const offer = await findFollowUpOfferForDriver({
      fleetDriverId: a.fleetDriverId,
      companyId: a.companyId,
      lat,
      lon,
      excludeRideId,
      lastRideId,
    });

    if (!offer) {
      res.json({ ok: true, suggestion: null });
      return;
    }

    const [publicRide] = await attachAccessCodeSummariesToRides([
      stripPartnerOnlyRideFields(offer.ride),
    ]);
    res.json({
      ok: true,
      suggestion: {
        ride: publicRide,
        distanceKm: Math.round(offer.distanceKm * 10) / 10,
        directionMatch: offer.directionMatch,
      },
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
    const medicalTransportAuth = await resolveMedicalTransportAuthorizationForFleetDriver(
      a.companyId,
      a.fleetDriverId,
    );
    const medicalTransportAuthorized = medicalTransportAuth?.authorized ?? false;
    const companyKkModuleEnabled = await getCompanyFeatureKkModule(a.companyId);
    const all = await listRides();
    const pool = all.filter((ride) => {
      const isFutureReservationStatus =
        ride.status === "scheduled" || ride.status === "scheduled_assigned";
      if (!isFutureReservationStatus) return false;

      if (ride.status === "scheduled" && ride.scheduledAt) {
        const scheduledMs = new Date(ride.scheduledAt).getTime();
        if (Number.isFinite(scheduledMs) && scheduledMs < Date.now()) return false;
      }

      if (ride.companyId && ride.companyId !== a.companyId) return false;

      const assignedDriverId = typeof ride.driverId === "string" ? ride.driverId.trim() : "";
      const isAssignedToThisDriver = assignedDriverId === a.fleetDriverId;
      const isAssignedToOtherDriver = assignedDriverId.length > 0 && !isAssignedToThisDriver;
      if (isAssignedToOtherDriver) return false;

      if ((ride.rejectedBy ?? []).includes(a.fleetDriverId)) return false;
      if (ride.rideKind === "medical") {
        if (!companyKkModuleEnabled || !medicalTransportAuthorized) return false;
      }
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

router.get("/fleet-driver/v1/admin-messages", requireFleetDriverAuth, async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const a = (req as FleetDriverAuthRequest).fleetDriverAuth;
    if (!a) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const items = await listDriverMessagesForFleetDriver(a.fleetDriverId);
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

router.delete("/fleet-driver/v1/admin-messages/:messageId", requireFleetDriverAuth, async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const a = (req as FleetDriverAuthRequest).fleetDriverAuth;
    if (!a) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const messageId = req.params.messageId?.trim();
    if (!messageId) {
      res.status(400).json({ error: "message_id_required" });
      return;
    }
    await dismissDriverMessage(a.fleetDriverId, messageId);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get("/fleet-driver/v1/rides/:rideId/earnings", requireFleetDriverAuth, async (req, res, next) => {
  try {
    const a = (req as FleetDriverAuthRequest).fleetDriverAuth;
    if (!a) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const rideId = String(req.params.rideId ?? "").trim();
    if (!rideId) {
      res.status(400).json({ error: "ride_id_required" });
      return;
    }
    const result = await getFleetDriverRideEarnings({
      rideId,
      fleetDriverId: a.fleetDriverId,
      companyId: a.companyId,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true, ...result.earnings });
  } catch (e) {
    next(e);
  }
});

router.post("/fleet-driver/v1/rides/:rideId/passenger-rating", requireFleetDriverAuth, async (req, res, next) => {
  try {
    const a = (req as FleetDriverAuthRequest).fleetDriverAuth;
    if (!a) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const rideId = String(req.params.rideId ?? "").trim();
    const starsRaw = (req.body as { stars?: unknown })?.stars;
    const stars = typeof starsRaw === "number" ? starsRaw : Number(starsRaw);
    const result = await submitDriverPassengerRating({
      rideId,
      fleetDriverId: a.fleetDriverId,
      companyId: a.companyId,
      stars,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      ok: true,
      rating: result.rating,
      passengerRatingAverage: result.passengerRatingAverage,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/fleet-driver/v1/rides/:rideId/dispatch-offer-seen", requireFleetDriverAuth, async (req, res, next) => {
  try {
    const a = (req as FleetDriverAuthRequest).fleetDriverAuth;
    if (!a) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const rideId = String(req.params.rideId ?? "").trim();
    if (!rideId) {
      res.status(400).json({ error: "ride_id_required" });
      return;
    }
    const result = await recordDispatchOfferSeen(a.fleetDriverId, a.companyId, rideId);
    if (!result.ok) {
      res.status(503).json({ error: result.error });
      return;
    }
    res.json({ ok: true, rideId });
  } catch (e) {
    next(e);
  }
});

/** Premium A: Angebot freigeben → Stufe B am Markt (ohne persönliche Ablehnung). */
router.post("/fleet-driver/v1/rides/:rideId/release-dispatch-offer", requireFleetDriverAuth, async (req, res, next) => {
  try {
    const a = (req as FleetDriverAuthRequest).fleetDriverAuth;
    if (!a) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const rideId = String(req.params.rideId ?? "").trim();
    if (!rideId) {
      res.status(400).json({ error: "ride_id_required" });
      return;
    }
    const result = await releaseInstantRideDispatchOffer({
      rideId,
      fleetDriverId: a.fleetDriverId,
      companyId: a.companyId,
    });
    if (!result.ok) {
      const status =
        result.error === "not_found"
          ? 404
          : result.error === "driver_not_priority_a" || result.error === "release_only_tier_a"
            ? 403
            : 409;
      res.status(status).json({ error: result.error });
      return;
    }
    res.json({ ok: true, rideId, dispatchTier: result.ride.dispatchTier ?? "B" });
  } catch (e) {
    next(e);
  }
});

router.post("/fleet-driver/v1/expo-push-token", requireFleetDriverAuth, async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const a = (req as FleetDriverAuthRequest).fleetDriverAuth;
    if (!a) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const raw = (req.body as { expoPushToken?: unknown })?.expoPushToken;
    const expoPushToken = typeof raw === "string" ? raw.trim() : "";
    if (!expoPushToken.startsWith("ExponentPushToken[")) {
      res.status(400).json({ error: "invalid_expo_push_token" });
      return;
    }
    await upsertFleetDriverExpoPushToken(a.fleetDriverId, a.companyId, expoPushToken);
    res.json({ ok: true, fleetDriverId: a.fleetDriverId, companyId: a.companyId });
  } catch (e) {
    next(e);
  }
});

router.post("/fleet-driver/v1/reservations", requireFleetDriverAuth, async (req, res, next) => {
  try {
    const a = (req as FleetDriverAuthRequest).fleetDriverAuth;
    if (!a) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
    const from = typeof body.from === "string" ? body.from.trim() : "";
    const fromFull = typeof body.fromFull === "string" ? body.fromFull.trim() : from;
    const to = typeof body.to === "string" ? body.to.trim() : "";
    const toFull = typeof body.toFull === "string" ? body.toFull.trim() : to;
    const scheduledAt = typeof body.scheduledAt === "string" ? body.scheduledAt.trim() : "";
    const customerPhone = typeof body.customerPhone === "string" ? body.customerPhone.trim() : "";
    const paymentMethod = typeof body.paymentMethod === "string" ? body.paymentMethod.trim() : "cash";
    const num = (k: string) => {
      const v = body[k];
      return typeof v === "number" && Number.isFinite(v) ? v : NaN;
    };
    const result = await createFleetDriverReservation({
      fleetDriverId: a.fleetDriverId,
      companyId: a.companyId,
      customerName,
      customerPhone: customerPhone || undefined,
      from,
      fromFull,
      to,
      toFull,
      scheduledAt,
      fromLat: num("fromLat"),
      fromLon: num("fromLon"),
      toLat: num("toLat"),
      toLon: num("toLon"),
      distanceKm: num("distanceKm"),
      durationMinutes: num("durationMinutes"),
      estimatedFare: num("estimatedFare"),
      paymentMethod,
      vehicle: typeof body.vehicle === "string" ? body.vehicle.trim() : undefined,
    });
    if (!result.ok) {
      const status =
        result.error === "scheduled_at_too_soon" || result.error === "required_fields_missing"
          ? 400
          : result.error === "driver_not_ready" || result.error === "vehicle_not_assigned"
            ? 403
            : 400;
      res.status(status).json({ error: result.error });
      return;
    }
    res.status(201).json({ ok: true, ride: stripPartnerOnlyRideFields(result.ride) });
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
  const body = (req.body ?? {}) as { lat?: unknown; lon?: unknown };
  const lat = typeof body.lat === "number" ? body.lat : Number(body.lat);
  const lon = typeof body.lon === "number" ? body.lon : Number(body.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    await updateFleetDriverMarketLocation(a.fleetDriverId, a.companyId, lat, lon);
  } else {
    await touchFleetDriverHeartbeat(a.fleetDriverId);
  }
  const marketOnline = await getFleetDriverMarketOnline(a.fleetDriverId, a.companyId);
  res.json({ ok: true, marketOnline });
});

/** ONLINE/OFFLINE am Auftragsmarkt — ohne diesen Schalter liefert market-rides keine neuen Sofortaufträge. */
router.patch("/fleet-driver/v1/market-availability", requireFleetDriverAuth, async (req, res) => {
  const a = (req as FleetDriverAuthRequest).fleetDriverAuth;
  if (!a) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const body = req.body as { available?: unknown };
  if (typeof body.available !== "boolean") {
    res.status(400).json({ error: "available_boolean_required" });
    return;
  }
  const updated = await setFleetDriverMarketOnline(a.fleetDriverId, a.companyId, body.available);
  if (!updated) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  await touchFleetDriverHeartbeat(a.fleetDriverId);
  const pushTokens =
    body.available && isPostgresConfigured()
      ? await listFleetDriverExpoPushTokens(a.fleetDriverId, a.companyId)
      : [];
  res.json({
    ok: true,
    marketOnline: body.available,
    hasPushToken: pushTokens.length > 0,
  });
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

router.post("/fleet-driver/v1/medical/scan", requireFleetDriverAuth, async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ ok: false, error: "database_not_configured" });
      return;
    }
    const auth = (req as FleetDriverAuthRequest).fleetDriverAuth;
    if (!auth) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    const body = req.body as {
      rideId?: unknown;
      imageBase64?: unknown;
      dateLogicType?: unknown;
      seriesId?: unknown;
      returnRideId?: unknown;
    };
    const rideId = typeof body.rideId === "string" ? body.rideId.trim() : "";
    const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
    if (!rideId) {
      res.status(400).json({ ok: false, error: "ride_id_required" });
      return;
    }

    const result = await runMedicalTransportDocumentScan({
      fleetDriverId: auth.fleetDriverId,
      companyId: auth.companyId,
      rideId,
      imageBase64,
      dateLogicType: typeof body.dateLogicType === "string" ? body.dateLogicType : undefined,
      seriesId: typeof body.seriesId === "string" ? body.seriesId : undefined,
      returnRideId: typeof body.returnRideId === "string" ? body.returnRideId : undefined,
    });

    if (!result.ok) {
      res.status(result.status).json({
        ok: false,
        error: result.error,
        ...(typeof (result as { message?: string }).message === "string"
          ? { message: (result as { message: string }).message }
          : {}),
      });
      return;
    }

    res.json({
      ok: true,
      caseId: result.caseId,
      documentId: result.documentId,
      reviewId: result.reviewId,
      trafficLight: result.trafficLight,
      warnings: result.warnings,
      extracted: result.extracted,
      dateLogic: result.dateLogic,
      insuranceRules: result.insuranceRules,
      storageKey: result.storageKey,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/fleet-driver/v1/medical/scan-test", requireFleetDriverAuth, async (req, res, next) => {
  try {
    const auth = (req as FleetDriverAuthRequest).fleetDriverAuth;
    if (!auth) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    const body = req.body as { imageBase64?: unknown };
    const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
    const result = await runMedicalTransportDocumentScanTest({
      fleetDriverId: auth.fleetDriverId,
      companyId: auth.companyId,
      imageBase64,
    });
    if (!result.ok) {
      res.status(result.status).json({
        ok: false,
        error: result.error,
        ...(typeof (result as { message?: string }).message === "string"
          ? { message: (result as { message: string }).message }
          : {}),
      });
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
    });
  } catch (err) {
    next(err);
  }
});

router.get("/fleet-driver/v1/completed-rides", requireFleetDriverAuth, async (req, res, next) => {
  try {
    const a = req.fleetDriverAuth!;
    const rides = await listRidesForDriver(a.fleetDriverId);
    const durationByRideId = await listActualDurationMinutesByRideIds(rides.map((r) => r.id));
    const withDuration = rides.map((r) => ({
      ...r,
      actualDurationMinutes: durationByRideId.get(r.id) ?? null,
    }));
    res.json({ rides: withDuration });
  } catch (err) {
    next(err);
  }
});

export default router;
