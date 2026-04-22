import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Response } from "express";
import type { RideRequest } from "../domain/rideRequest";
import {
  DEFAULT_PAYER_KIND,
  DEFAULT_RIDE_KIND,
  parseOptionalBillingTag,
  parsePayerKind,
  parseRideKind,
} from "../domain/rideBillingProfile";
import { isPostgresConfigured } from "../db/client";
import { insertPanelAuditLog } from "../db/panelAuditData";
import { findActivePanelUserById, findActivePanelUserProfileById } from "../db/panelAuthData";
import {
  getPanelCompanyById,
  patchPanelCompanyProfile,
  type PanelCompanyKind,
  type PanelCompanyProfilePatch,
} from "../db/panelCompanyData";
import {
  insertCompanyChangeRequest,
  listCompanyChangeRequestsByCompany,
} from "../db/companyChangeRequestsData";
import { getCompanyGovernanceGate } from "../db/companyGovernanceData";
import {
  deleteInactivePanelUserInCompany,
  findPanelUserInCompany,
  insertPanelUser,
  listPanelUsersInCompany,
  patchPanelUserInCompany,
  getPanelUsernamesInCompany,
  panelUsernameTaken,
  updatePanelUserPasswordInCompany,
} from "../db/panelUsersData";
import {
  attachAccessCodeSummariesToRides,
  accessCodeRowForPanel,
  insertAccessCodeAdmin,
  listAccessCodesForCompany,
  loadAccessCodesForTraceByIds,
  patchAccessCodeForCompany,
} from "../db/accessCodesData";
import {
  findRide,
  getPanelCompanyOverviewMetrics,
  insertRideWithOptionalAccessCode,
  insertRidesWithSharedAccessCode,
  listRidesForCompany,
  listRidesForCompanyFiltered,
  type CompanyRideListFilters,
} from "../db/ridesData";
import { initialPanelRideStatus } from "../lib/dispatchStatus";
import { insertPartnerRideSeries, listPartnerRideSeriesForCompany } from "../db/partnerRideSeriesData";
import type { PartnerBookingFlow, PartnerBookingMeta } from "../domain/partnerBookingMeta";
import { DEFAULT_AUTHORIZATION_SOURCE } from "../domain/rideAuthorization";
import type { PanelModuleId } from "../domain/panelModules";
import { accessCodeTripOutcomeFromRide, computeAccessCodeDefinitionState } from "../domain/accessCodeTrace";
import { resolveEffectivePanelModules } from "../domain/panelModules";
import type { PanelUserProfileRow } from "../db/panelAuthData";
import type { PanelRole } from "../lib/panelJwt";
import {
  canPartnerAssignPanelRole,
  isPanelRoleString,
  permissionsForRole,
} from "../lib/panelPermissions";
import { hashPassword, verifyPassword } from "../lib/password";
import { generateTemporaryPassword } from "../lib/tempPassword";
import { denyUnlessPanelPermission } from "../middleware/panelAccess";
import { requirePanelAuth, type PanelAuthRequest } from "../middleware/requirePanelAuth";

const router: IRouter = Router();

async function assertActivePanelProfile(
  req: PanelAuthRequest,
  res: Response,
  opts?: { allowPasswordChangeRequired?: boolean },
) {
  if (!isPostgresConfigured()) {
    res.status(503).json({ error: "database_not_configured" });
    return null;
  }
  const claims = req.panelAuth;
  if (!claims) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }
  const profile = await findActivePanelUserProfileById(claims.panelUserId);
  if (!profile || !isPanelRoleString(profile.role)) {
    res.status(401).json({ error: "user_inactive_or_missing" });
    return null;
  }
  if (profile.companyId !== claims.companyId || profile.username !== claims.username) {
    res.status(401).json({ error: "token_out_of_sync" });
    return null;
  }
  if (profile.mustChangePassword && !opts?.allowPasswordChangeRequired) {
    res.status(403).json({ error: "password_change_required" });
    return null;
  }
  return { claims, profile };
}

function enabledPanelModules(profile: PanelUserProfileRow): PanelModuleId[] {
  return resolveEffectivePanelModules(profile.panelModules, profile.companyKind);
}

function denyUnlessPanelModule(res: Response, profile: PanelUserProfileRow, mod: PanelModuleId): boolean {
  if (!enabledPanelModules(profile).includes(mod)) {
    res.status(403).json({ error: "module_disabled", hint: mod });
    return false;
  }
  return true;
}

/** Firmenstammdaten: Modul Profil oder Übersicht (dort Kurzinfos). */
function denyUnlessCompanyOrOverview(res: Response, profile: PanelUserProfileRow): boolean {
  const e = enabledPanelModules(profile);
  if (e.includes("overview") || e.includes("company_profile")) return true;
  res.status(403).json({ error: "module_disabled", hint: "overview_or_company_profile" });
  return false;
}

function permissionFlag(obj: Record<string, unknown> | undefined, key: string, fallback = false): boolean {
  if (!obj) return fallback;
  const v = obj[key];
  return typeof v === "boolean" ? v : fallback;
}

function normalizeAreaAssignments(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length > 0);
}

function isRouteCoveredByAreas(
  areas: string[],
  route: { from?: string | null; fromFull?: string | null; to?: string | null; toFull?: string | null },
): boolean {
  if (areas.length === 0) return true;
  const haystack = [
    route.from,
    route.fromFull,
    route.to,
    route.toFull,
  ]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.toLowerCase());
  if (haystack.length === 0) return false;
  return areas.some((a) => haystack.some((h) => h.includes(a)));
}

function checkCompanyBookingGovernance(
  gate: Awaited<ReturnType<typeof getCompanyGovernanceGate>>,
  input: { rideKind: string; payerKind: string; routeChecks?: Array<{ from?: string | null; fromFull?: string | null; to?: string | null; toFull?: string | null }> },
): { ok: true } | { ok: false; error: string } {
  if (!gate) return { ok: true };
  if (input.payerKind === "insurance" && !permissionFlag(gate.insurerPermissions, "book", false)) {
    return { ok: false, error: "insurer_booking_not_allowed" };
  }
  if (input.rideKind === "voucher" && !permissionFlag(gate.farePermissions, "voucher", false)) {
    return { ok: false, error: "voucher_booking_not_allowed" };
  }
  const areas = normalizeAreaAssignments(gate.areaAssignments);
  if ((input.routeChecks ?? []).length > 0) {
    const allCovered = input.routeChecks.every((r) => isRouteCoveredByAreas(areas, r));
    if (!allCovered) return { ok: false, error: "route_outside_assigned_area" };
  }
  return { ok: true };
}

async function enrichPanelRidesForResponse(rides: RideRequest[]): Promise<RideRequest[]> {
  const enriched = await attachAccessCodeSummariesToRides(rides);
  const codeIds = [...new Set(enriched.map((r) => r.accessCodeId).filter((x): x is string => Boolean(x)))];
  const traceById = await loadAccessCodesForTraceByIds(codeIds);
  const now = new Date();
  return enriched.map((r) => ({
    ...r,
    accessCodeTripOutcome: accessCodeTripOutcomeFromRide(r),
    accessCodeDefinitionState:
      r.accessCodeId && traceById.has(r.accessCodeId)
        ? computeAccessCodeDefinitionState(traceById.get(r.accessCodeId)!, now)
        : null,
  }));
}

function reqRideId(): string {
  return `REQ-${randomUUID()}`;
}

function parsePartnerFlowParam(v: unknown): PartnerBookingFlow | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  if (s === "hotel_guest" || s === "medical_patient" || s === "medical_series_leg") return s;
  return null;
}

function monthBoundsUtc(ym: string): { from: Date; to: Date } | null {
  const t = ym.trim();
  const m = /^(\d{4})-(\d{2})$/.exec(t);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12) return null;
  const from = new Date(Date.UTC(y, mo - 1, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(y, mo, 0, 23, 59, 59, 999));
  return { from, to };
}

function currentMonthYmUtc(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth() + 1;
  return `${y}-${String(mo).padStart(2, "0")}`;
}

function parseHasAccessCodeQuery(v: unknown): boolean | undefined {
  if (v === "true" || v === true) return true;
  if (v === "false" || v === false) return false;
  return undefined;
}

function csvEscapeCell(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rideToBillingCsvRow(r: RideRequest): string {
  const m = r.partnerBookingMeta;
  const h = m?.hotel;
  const med = m?.medical;
  const cols = [
    r.id,
    r.createdAt,
    r.scheduledAt ?? "",
    r.status,
    r.rideKind,
    r.payerKind,
    r.billingReference ?? "",
    r.accessCodeId ?? "",
    r.accessCodeNormalizedSnapshot ?? "",
    r.customerName,
    m?.flow ?? "",
    h?.roomNumber ?? "",
    h?.reservationRef ?? "",
    h?.billedTo ?? "",
    med?.patientReference ?? "",
    med?.tripLeg ?? "",
    med?.seriesId ?? "",
    med?.seriesSequence != null ? String(med.seriesSequence) : "",
    med?.seriesTotal != null ? String(med.seriesTotal) : "",
    med?.linkedRideId ?? "",
    r.from,
    r.to,
    String(r.estimatedFare),
    r.finalFare != null ? String(r.finalFare) : "",
  ];
  return cols.map((c) => csvEscapeCell(c)).join(",");
}

const BILLING_CSV_HEADER =
  "id,createdAt,scheduledAt,status,rideKind,payerKind,billingReference,accessCodeId,accessCodeNormalized,customerName,partnerFlow,roomNumber,reservationRef,hotelBilledTo,patientReference,tripLeg,seriesId,seriesSequence,seriesTotal,linkedRideId,fromLabel,toLabel,estimatedFare,finalFare";

type RouteLegParsed = {
  from: string;
  fromFull: string;
  to: string;
  toFull: string;
  distanceKm: number;
  durationMinutes: number;
  estimatedFare: number;
  paymentMethod: string;
  vehicle: string;
  fromLat?: number;
  fromLon?: number;
  toLat?: number;
  toLon?: number;
  scheduledAt: string | null;
};

function optBodyNum(body: Record<string, unknown>, k: string): number | undefined {
  const v = body[k];
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return v;
}

function readBodyStr(body: Record<string, unknown>, k: string): string {
  return typeof body[k] === "string" ? (body[k] as string) : "";
}

function isBodyRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function parseRouteLeg(body: Record<string, unknown>, label: string): RouteLegParsed | { error: string } {
  const from = readBodyStr(body, "from").trim();
  const fromFull = readBodyStr(body, "fromFull").trim();
  const to = readBodyStr(body, "to").trim();
  const toFull = readBodyStr(body, "toFull").trim();
  const distanceKm = optBodyNum(body, "distanceKm");
  const durationMinutes = optBodyNum(body, "durationMinutes");
  const estimatedFare = optBodyNum(body, "estimatedFare");
  const paymentMethod = readBodyStr(body, "paymentMethod").trim();
  const vehicle = readBodyStr(body, "vehicle").trim();
  if (!from || !fromFull || !to || !toFull) {
    return { error: `${label}_route_fields_required` };
  }
  if (
    distanceKm === undefined ||
    durationMinutes === undefined ||
    estimatedFare === undefined ||
    !paymentMethod ||
    !vehicle
  ) {
    return { error: `${label}_pricing_or_vehicle_invalid` };
  }
  const schedRaw = readBodyStr(body, "scheduledAt").trim();
  return {
    from,
    fromFull,
    to,
    toFull,
    distanceKm,
    durationMinutes,
    estimatedFare,
    paymentMethod,
    vehicle,
    fromLat: optBodyNum(body, "fromLat"),
    fromLon: optBodyNum(body, "fromLon"),
    toLat: optBodyNum(body, "toLat"),
    toLon: optBodyNum(body, "toLon"),
    scheduledAt: schedRaw.length > 0 ? schedRaw : null,
  };
}

function billingFiltersFromQuery(
  query: Record<string, unknown>,
):
  | { ok: true; ym: string; filters: CompanyRideListFilters }
  | { ok: false; error: string } {
  const ymRaw = typeof query.month === "string" && query.month.trim() ? query.month.trim() : currentMonthYmUtc();
  const bounds = monthBoundsUtc(ymRaw);
  if (!bounds) return { ok: false, error: "month_invalid" };
  const rideKind =
    typeof query.rideKind === "string" && query.rideKind.trim()
      ? parseRideKind(query.rideKind.trim())
      : null;
  if (typeof query.rideKind === "string" && query.rideKind.trim() && rideKind === null) {
    return { ok: false, error: "ride_kind_invalid" };
  }
  const payerKind =
    typeof query.payerKind === "string" && query.payerKind.trim()
      ? parsePayerKind(query.payerKind.trim())
      : null;
  if (typeof query.payerKind === "string" && query.payerKind.trim() && payerKind === null) {
    return { ok: false, error: "payer_kind_invalid" };
  }
  const billingReferenceContains =
    typeof query.billingReference === "string" && query.billingReference.trim()
      ? query.billingReference.trim()
      : undefined;
  const accessCodeId =
    typeof query.accessCodeId === "string" && query.accessCodeId.trim() ? query.accessCodeId.trim() : undefined;
  const hasAccessCode = parseHasAccessCodeQuery(query.hasAccessCode);
  const partnerFlow = parsePartnerFlowParam(query.partnerFlow);
  const filters: CompanyRideListFilters = {
    createdFrom: bounds.from,
    createdTo: bounds.to,
    ...(rideKind ? { rideKind } : {}),
    ...(payerKind ? { payerKind } : {}),
    ...(billingReferenceContains ? { billingReferenceContains } : {}),
    ...(accessCodeId ? { accessCodeId } : {}),
    ...(hasAccessCode !== undefined ? { hasAccessCode } : {}),
    ...(partnerFlow ? { partnerFlow } : {}),
  };
  return { ok: true, ym: ymRaw, filters };
}

function parseDayStartUtc(isoDay: string): Date | null {
  const t = isoDay.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
}

function parseDayEndUtc(isoDay: string): Date | null {
  const t = isoDay.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999));
}

function normalizeCompanyRidesQueryRecord(raw: Record<string, unknown>): Record<string, unknown> {
  const q: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    q[k] = Array.isArray(v) ? v[0] : v;
  }
  return q;
}

/** Query für GET /panel/v1/company-rides — Zeitraum default 90 Tage. */
function companyRidesFiltersFromQuery(
  query: Record<string, unknown>,
): { ok: true; filters: CompanyRideListFilters } | { ok: false; error: string } {
  const q = normalizeCompanyRidesQueryRecord(query);
  const fromStr = typeof q.createdFrom === "string" ? q.createdFrom.trim() : "";
  const toStr = typeof q.createdTo === "string" ? q.createdTo.trim() : "";

  let createdFrom: Date | undefined;
  let createdTo: Date | undefined;

  if (fromStr) {
    const d = parseDayStartUtc(fromStr);
    if (!d) return { ok: false, error: "created_from_invalid" };
    createdFrom = d;
  }
  if (toStr) {
    const d = parseDayEndUtc(toStr);
    if (!d) return { ok: false, error: "created_to_invalid" };
    createdTo = d;
  }

  const now = new Date();
  if (!createdFrom && !createdTo) {
    createdTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    createdFrom = new Date(createdTo);
    createdFrom.setUTCDate(createdFrom.getUTCDate() - 89);
    createdFrom.setUTCHours(0, 0, 0, 0);
  } else if (createdFrom && !createdTo) {
    createdTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  } else if (!createdFrom && createdTo) {
    createdFrom = new Date(createdTo);
    createdFrom.setUTCDate(createdFrom.getUTCDate() - 89);
    createdFrom.setUTCHours(0, 0, 0, 0);
  }

  if (createdFrom && createdTo && createdFrom.getTime() > createdTo.getTime()) {
    return { ok: false, error: "date_range_invalid" };
  }

  const rideKind =
    typeof q.rideKind === "string" && q.rideKind.trim() ? parseRideKind(q.rideKind.trim()) : null;
  if (typeof q.rideKind === "string" && q.rideKind.trim() && rideKind === null) {
    return { ok: false, error: "ride_kind_invalid" };
  }

  const payerRaw = typeof q.payerKind === "string" ? q.payerKind.trim() : "";
  let payerKind: ReturnType<typeof parsePayerKind> | null = null;
  if (payerRaw !== "" && payerRaw !== "all") {
    payerKind = parsePayerKind(payerRaw);
    if (payerKind === null) return { ok: false, error: "payer_kind_invalid" };
  }

  const status = typeof q.status === "string" && q.status.trim() ? q.status.trim() : undefined;
  const searchContains = typeof q.q === "string" && q.q.trim() ? q.q.trim() : undefined;
  const billingReferenceContains =
    typeof q.billingReference === "string" && q.billingReference.trim() ? q.billingReference.trim() : undefined;
  const partnerFlow = parsePartnerFlowParam(q.partnerFlow);

  const filters: CompanyRideListFilters = {
    createdFrom,
    createdTo,
    ...(rideKind ? { rideKind } : {}),
    ...(payerKind ? { payerKind } : {}),
    ...(status ? { status } : {}),
    ...(searchContains ? { searchContains } : {}),
    ...(billingReferenceContains ? { billingReferenceContains } : {}),
    ...(partnerFlow ? { partnerFlow } : {}),
  };
  return { ok: true, filters };
}

router.get("/panel/v1/health", requirePanelAuth, (_req, res) => {
  res.json({ ok: true, service: "onroda-panel-api" });
});

router.get("/panel/v1/me", requirePanelAuth, async (req, res) => {
  const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res, {
    allowPasswordChangeRequired: true,
  });
  if (!ctx) return;
  const { profile } = ctx;
  const role = profile.role as PanelRole;

  res.json({
    ok: true,
    user: {
      id: profile.id,
      companyId: profile.companyId,
      companyName: profile.companyName,
      companyKind: profile.companyKind,
      username: profile.username,
      email: profile.email,
      role: profile.role,
      mustChangePassword: profile.mustChangePassword,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
      permissions: permissionsForRole(role),
      panelModules: enabledPanelModules(profile),
    },
  });
});

router.get("/panel/v1/company", requirePanelAuth, async (req, res) => {
  const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
  if (!ctx) return;
  if (!denyUnlessCompanyOrOverview(res, ctx.profile)) return;
  const { claims } = ctx;

  const company = await getPanelCompanyById(claims.companyId);
  if (!company) {
    res.status(404).json({ error: "company_not_found" });
    return;
  }

  res.json({ ok: true, company });
});

router.get("/panel/v1/overview/metrics", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "overview")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "rides.read")) return;
    const company = await getPanelCompanyById(ctx.claims.companyId);
    const companyKind: PanelCompanyKind = company?.companyKind ?? ctx.profile.companyKind;
    const metrics = await getPanelCompanyOverviewMetrics(ctx.claims.companyId, companyKind);
    res.json({ ok: true, metrics });
  } catch (e) {
    next(e);
  }
});

router.patch("/panel/v1/company", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "company_profile")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "company.update")) return;

    const body = req.body as Record<string, unknown>;
    const str = (k: string) => (typeof body[k] === "string" ? body[k] : undefined);

    const patch: PanelCompanyProfilePatch = {};
    const dispoPhone = str("dispoPhone");
    const supportEmail = str("supportEmail");
    const logoUrl = str("logoUrl");
    const openingHours = str("openingHours");
    const name = str("name");
    const contactName = str("contactName");
    const email = str("email");
    const phone = str("phone");
    const addressLine1 = str("addressLine1");
    const addressLine2 = str("addressLine2");
    const postalCode = str("postalCode");
    const city = str("city");
    const country = str("country");
    const legalForm = str("legalForm");
    const ownerName = str("ownerName");
    const concessionNumber = str("concessionNumber");
    const taxId = str("taxId");
    const bankIban = str("bankIban");
    if (dispoPhone !== undefined) patch.dispoPhone = dispoPhone;
    if (supportEmail !== undefined) patch.supportEmail = supportEmail;
    if (logoUrl !== undefined) patch.logoUrl = logoUrl;
    if (openingHours !== undefined) patch.openingHours = openingHours;
    if (name !== undefined) patch.name = name;
    if (contactName !== undefined) patch.contactName = contactName;
    if (email !== undefined) patch.email = email;
    if (phone !== undefined) patch.phone = phone;
    if (addressLine1 !== undefined) patch.addressLine1 = addressLine1;
    if (addressLine2 !== undefined) patch.addressLine2 = addressLine2;
    if (postalCode !== undefined) patch.postalCode = postalCode;
    if (city !== undefined) patch.city = city;
    if (country !== undefined) patch.country = country;
    if (legalForm !== undefined) patch.legalForm = legalForm;
    if (ownerName !== undefined) patch.ownerName = ownerName;
    if (concessionNumber !== undefined) patch.concessionNumber = concessionNumber;
    if (taxId !== undefined) patch.taxId = taxId;
    if (bankIban !== undefined) patch.bankIban = bankIban;

    const result = await patchPanelCompanyProfile(ctx.claims.companyId, patch);
    if (!result.ok) {
      const code = result.error;
      if (code === "company_not_found") {
        res.status(404).json({ error: code });
        return;
      }
      if (code === "no_changes") {
        res.status(400).json({ error: code });
        return;
      }
      if (code === "email_invalid") {
        res.status(400).json({ error: code });
        return;
      }
      if (code === "partner_basics_locked") {
        res.status(403).json({
          error: code,
          hint: "Stammdaten sind abgeschlossen. Weitere Änderungen nur über eine Anfrage zur Freigabe durch die Plattform-Administration (Menüpunkt Änderungsanfragen / Support).",
        });
        return;
      }
      res.status(503).json({ error: code });
      return;
    }

    await insertPanelAuditLog({
      id: randomUUID(),
      companyId: ctx.claims.companyId,
      actorPanelUserId: ctx.claims.panelUserId,
      action: "company.profile_updated",
      subjectType: "admin_company",
      subjectId: ctx.claims.companyId,
      meta: { fields: Object.keys(patch) },
    });

    res.json({ ok: true, company: result.company });
  } catch (e) {
    next(e);
  }
});

router.get("/panel/v1/company/change-requests", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "company.update")) return;
    const rows = await listCompanyChangeRequestsByCompany(ctx.claims.companyId);
    res.json({ ok: true, requests: rows });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/company/change-requests", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "company.update")) return;
    const b = req.body as { requestType?: unknown; reason?: unknown; payload?: unknown };
    const requestType = typeof b.requestType === "string" ? b.requestType.trim() : "";
    const reason = typeof b.reason === "string" ? b.reason.trim() : "";
    const payload =
      b.payload && typeof b.payload === "object" && !Array.isArray(b.payload)
        ? (b.payload as Record<string, unknown>)
        : {};
    if (!requestType) {
      res.status(400).json({ error: "request_type_required" });
      return;
    }
    const created = await insertCompanyChangeRequest({
      id: randomUUID(),
      companyId: ctx.claims.companyId,
      requestedByPanelUserId: ctx.claims.panelUserId,
      requestType,
      reason,
      payload,
    });
    if (!created) {
      res.status(503).json({ error: "create_failed" });
      return;
    }
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId: ctx.claims.companyId,
      actorPanelUserId: ctx.claims.panelUserId,
      action: "company.change_request.created",
      subjectType: "company_change_request",
      subjectId: created.id,
      meta: { requestType },
    });
    res.status(201).json({ ok: true, request: created });
  } catch (e) {
    next(e);
  }
});

router.get("/panel/v1/rides", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "rides_list")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "rides.read")) return;
    const rides = await listRidesForCompany(ctx.claims.companyId);
    const ids = rides.map((r) => r.createdByPanelUserId).filter((x): x is string => Boolean(x));
    const names = await getPanelUsernamesInCompany(ctx.claims.companyId, ids);
    const ridesOut = rides.map((r) => ({
      ...r,
      createdByUsername: r.createdByPanelUserId ? (names[r.createdByPanelUserId] ?? null) : null,
    }));
    const withTrace = await enrichPanelRidesForResponse(ridesOut);
    res.json({ ok: true, rides: withTrace });
  } catch (e) {
    next(e);
  }
});

router.get("/panel/v1/company-rides", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "company_rides")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "rides.read")) return;

    const parsed = companyRidesFiltersFromQuery(
      normalizeCompanyRidesQueryRecord(req.query as Record<string, unknown>),
    );
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const list = await listRidesForCompanyFiltered(ctx.claims.companyId, parsed.filters);
    const ids = list.map((r) => r.createdByPanelUserId).filter((x): x is string => Boolean(x));
    const names = await getPanelUsernamesInCompany(ctx.claims.companyId, ids);
    const ridesOut = list.map((r) => ({
      ...r,
      createdByUsername: r.createdByPanelUserId ? (names[r.createdByPanelUserId] ?? null) : null,
    }));
    const withTrace = await enrichPanelRidesForResponse(ridesOut);
    res.json({
      ok: true,
      filters: parsed.filters,
      rides: withTrace,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/rides", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "rides_create")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "rides.create")) return;

      const body = req.body as Record<string, unknown>;
      const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
      if (!customerName) {
        res.status(400).json({ error: "customer_name_required" });
        return;
      }

      const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
      const num = (k: string) =>
        typeof body[k] === "number" && Number.isFinite(body[k] as number) ? (body[k] as number) : NaN;
      const optStr = (k: string) => {
        const v = body[k];
        if (v == null) return undefined;
        return typeof v === "string" ? v : undefined;
      };
      const optNum = (k: string) => {
        const v = body[k];
        if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
        return v;
      };

      const from = str("from").trim();
      const fromFull = str("fromFull").trim();
      const to = str("to").trim();
      const toFull = str("toFull").trim();
      const distanceKm = num("distanceKm");
      const durationMinutes = num("durationMinutes");
      const estimatedFare = num("estimatedFare");
      const paymentMethod = str("paymentMethod").trim();
      const vehicle = str("vehicle").trim();

      if (!from || !fromFull || !to || !toFull) {
        res.status(400).json({ error: "route_fields_required" });
        return;
      }
      if (
        !Number.isFinite(distanceKm) ||
        !Number.isFinite(durationMinutes) ||
        !Number.isFinite(estimatedFare) ||
        !paymentMethod ||
        !vehicle
      ) {
        res.status(400).json({ error: "pricing_or_vehicle_invalid" });
        return;
      }

      const scheduledRaw = optStr("scheduledAt");
      const passengerId = optStr("passengerId");

      const rawRk = body.rideKind;
      const rawPk = body.payerKind;
      if (
        rawRk != null &&
        rawRk !== "" &&
        (typeof rawRk !== "string" || parseRideKind(rawRk) === null)
      ) {
        res.status(400).json({ error: "ride_kind_invalid" });
        return;
      }
      if (
        rawPk != null &&
        rawPk !== "" &&
        (typeof rawPk !== "string" || parsePayerKind(rawPk) === null)
      ) {
        res.status(400).json({ error: "payer_kind_invalid" });
        return;
      }
      const rideKind = parseRideKind(rawRk) ?? DEFAULT_RIDE_KIND;
      const payerKind = parsePayerKind(rawPk) ?? DEFAULT_PAYER_KIND;
      const g = await getCompanyGovernanceGate(ctx.claims.companyId);
      const gov = checkCompanyBookingGovernance(g, {
        rideKind,
        payerKind,
        routeChecks: [{ from, fromFull, to, toFull }],
      });
      if (!gov.ok) {
        res.status(403).json({ error: gov.error });
        return;
      }
      const voucherCode = parseOptionalBillingTag(body.voucherCode, 64);
      const billingReference = parseOptionalBillingTag(body.billingReference, 256);

      const scheduledAtVal = scheduledRaw && scheduledRaw.length > 0 ? scheduledRaw : null;
      const newReq: RideRequest = {
        id: reqRideId(),
        companyId: ctx.claims.companyId,
        createdByPanelUserId: ctx.claims.panelUserId,
        createdAt: new Date().toISOString(),
        scheduledAt: scheduledAtVal,
        status: initialPanelRideStatus(scheduledAtVal),
        rejectedBy: [],
        driverId: null,
        customerName,
        ...(passengerId ? { passengerId } : {}),
        from,
        fromFull,
        fromLat: optNum("fromLat"),
        fromLon: optNum("fromLon"),
        to,
        toFull,
        toLat: optNum("toLat"),
        toLon: optNum("toLon"),
        distanceKm,
        durationMinutes,
        estimatedFare,
        finalFare: null,
        paymentMethod,
        vehicle,
        rideKind,
        payerKind,
        voucherCode,
        billingReference,
        authorizationSource: DEFAULT_AUTHORIZATION_SOURCE,
        accessCodeId: null,
      };

      const accessCodeRaw = body.accessCode;
      const accessCodePlain = typeof accessCodeRaw === "string" ? accessCodeRaw : undefined;
      if (
        accessCodePlain &&
        accessCodePlain.trim() &&
        !enabledPanelModules(ctx.profile).includes("access_codes")
      ) {
        res.status(403).json({ error: "module_disabled", hint: "access_codes" });
        return;
      }
      const ins = await insertRideWithOptionalAccessCode(newReq, accessCodePlain);
      if (!ins.ok) {
        const err = ins.error;
        if (err === "access_code_wrong_company") {
          res.status(403).json({ error: err });
          return;
        }
        res.status(400).json({ error: err });
        return;
      }
      const saved = await findRide(newReq.id);
      const rideOut = saved ? (await enrichPanelRidesForResponse([saved]))[0]! : newReq;
      await insertPanelAuditLog({
        id: randomUUID(),
        companyId: ctx.claims.companyId,
        actorPanelUserId: ctx.claims.panelUserId,
        action: "ride.created",
        subjectType: "ride",
        subjectId: newReq.id,
        meta: {
          customerName: rideOut.customerName,
          rideKind: rideOut.rideKind,
          payerKind: rideOut.payerKind,
          authorizationSource: rideOut.authorizationSource,
          accessCodeId: rideOut.accessCodeId ?? undefined,
        },
      });
      res.status(201).json({ ok: true, ride: rideOut });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/bookings/hotel-guest", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "hotel_mode")) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "rides_create")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "rides.create")) return;

    const body = req.body as Record<string, unknown>;
    const guestName =
      typeof body.guestName === "string"
        ? body.guestName.trim()
        : typeof body.customerName === "string"
          ? body.customerName.trim()
          : "";
    if (!guestName) {
      res.status(400).json({ error: "guest_name_required" });
      return;
    }

    const leg = parseRouteLeg(body, "hotel");
    if ("error" in leg) {
      res.status(400).json({ error: leg.error });
      return;
    }

    const roomNumber = parseOptionalBillingTag(body.roomNumber, 64);
    const reservationRef = parseOptionalBillingTag(body.reservationRef, 128);
    const billedToRaw = body.billedTo;
    const billedTo =
      billedToRaw === "guest" || billedToRaw === "room_ledger" || billedToRaw === "company"
        ? billedToRaw
        : null;

    const rawRk = body.rideKind;
    const rawPk = body.payerKind;
    if (rawRk != null && rawRk !== "" && (typeof rawRk !== "string" || parseRideKind(rawRk) === null)) {
      res.status(400).json({ error: "ride_kind_invalid" });
      return;
    }
    if (rawPk != null && rawPk !== "" && (typeof rawPk !== "string" || parsePayerKind(rawPk) === null)) {
      res.status(400).json({ error: "payer_kind_invalid" });
      return;
    }
    const rideKind = parseRideKind(rawRk) ?? "standard";
    const payerKind = parsePayerKind(rawPk) ?? "company";
    const g = await getCompanyGovernanceGate(ctx.claims.companyId);
    const gov = checkCompanyBookingGovernance(g, {
      rideKind,
      payerKind,
      routeChecks: [{ from: leg.from, fromFull: leg.fromFull, to: leg.to, toFull: leg.toFull }],
    });
    if (!gov.ok) {
      res.status(403).json({ error: gov.error });
      return;
    }
    const voucherCode = parseOptionalBillingTag(body.voucherCode, 64);
    const billingReference = parseOptionalBillingTag(body.billingReference, 256);

    const partnerBookingMeta: PartnerBookingMeta = {
      flow: "hotel_guest",
      hotel: {
        roomNumber: roomNumber ?? null,
        reservationRef: reservationRef ?? null,
        billedTo,
      },
    };

    const passengerId = readBodyStr(body, "passengerId").trim();
    const newReq: RideRequest = {
      id: reqRideId(),
      companyId: ctx.claims.companyId,
      createdByPanelUserId: ctx.claims.panelUserId,
      createdAt: new Date().toISOString(),
      scheduledAt: leg.scheduledAt,
      status: initialPanelRideStatus(leg.scheduledAt),
      rejectedBy: [],
      driverId: null,
      customerName: guestName,
      ...(passengerId ? { passengerId } : {}),
      from: leg.from,
      fromFull: leg.fromFull,
      fromLat: leg.fromLat,
      fromLon: leg.fromLon,
      to: leg.to,
      toFull: leg.toFull,
      toLat: leg.toLat,
      toLon: leg.toLon,
      distanceKm: leg.distanceKm,
      durationMinutes: leg.durationMinutes,
      estimatedFare: leg.estimatedFare,
      finalFare: null,
      paymentMethod: leg.paymentMethod,
      vehicle: leg.vehicle,
      rideKind,
      payerKind,
      voucherCode,
      billingReference,
      authorizationSource: DEFAULT_AUTHORIZATION_SOURCE,
      accessCodeId: null,
      partnerBookingMeta,
    };

    const accessCodeRaw = body.accessCode;
    const accessCodePlain = typeof accessCodeRaw === "string" ? accessCodeRaw : undefined;
    if (
      accessCodePlain &&
      accessCodePlain.trim() &&
      !enabledPanelModules(ctx.profile).includes("access_codes")
    ) {
      res.status(403).json({ error: "module_disabled", hint: "access_codes" });
      return;
    }
    const ins = await insertRideWithOptionalAccessCode(newReq, accessCodePlain);
    if (!ins.ok) {
      const err = ins.error;
      if (err === "access_code_wrong_company") {
        res.status(403).json({ error: err });
        return;
      }
      res.status(400).json({ error: err });
      return;
    }
    const saved = await findRide(newReq.id);
    const rideOut = saved ? (await enrichPanelRidesForResponse([saved]))[0]! : newReq;
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId: ctx.claims.companyId,
      actorPanelUserId: ctx.claims.panelUserId,
      action: "booking.hotel_guest_created",
      subjectType: "ride",
      subjectId: newReq.id,
      meta: { flow: "hotel_guest" },
    });
    res.status(201).json({ ok: true, ride: rideOut });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/bookings/medical-round-trip", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "rides_create")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "rides.create")) return;

    const body = req.body as Record<string, unknown>;
    const patientReference =
      typeof body.patientReference === "string" ? body.patientReference.trim() : "";
    if (!patientReference) {
      res.status(400).json({ error: "patient_reference_required" });
      return;
    }
    const customerName =
      typeof body.customerName === "string" ? body.customerName.trim() : "";
    if (!customerName) {
      res.status(400).json({ error: "customer_name_required" });
      return;
    }

    const outboundRaw = body.outbound;
    const returnRaw = body.return;
    if (!isBodyRecord(outboundRaw) || !isBodyRecord(returnRaw)) {
      res.status(400).json({ error: "outbound_return_required" });
      return;
    }
    const outLeg = parseRouteLeg(outboundRaw, "outbound");
    const retLeg = parseRouteLeg(returnRaw, "return");
    if ("error" in outLeg) {
      res.status(400).json({ error: outLeg.error });
      return;
    }
    if ("error" in retLeg) {
      res.status(400).json({ error: retLeg.error });
      return;
    }

    const rawRk = body.rideKind;
    const rawPk = body.payerKind;
    if (rawRk != null && rawRk !== "" && (typeof rawRk !== "string" || parseRideKind(rawRk) === null)) {
      res.status(400).json({ error: "ride_kind_invalid" });
      return;
    }
    if (rawPk != null && rawPk !== "" && (typeof rawPk !== "string" || parsePayerKind(rawPk) === null)) {
      res.status(400).json({ error: "payer_kind_invalid" });
      return;
    }
    const rideKind = parseRideKind(rawRk) ?? "medical";
    const payerKind = parsePayerKind(rawPk) ?? "insurance";
    const g = await getCompanyGovernanceGate(ctx.claims.companyId);
    const gov = checkCompanyBookingGovernance(g, {
      rideKind,
      payerKind,
      routeChecks: [
        { from: outLeg.from, fromFull: outLeg.fromFull, to: outLeg.to, toFull: outLeg.toFull },
        { from: retLeg.from, fromFull: retLeg.fromFull, to: retLeg.to, toFull: retLeg.toFull },
      ],
    });
    if (!gov.ok) {
      res.status(403).json({ error: gov.error });
      return;
    }
    const voucherCode = parseOptionalBillingTag(body.voucherCode, 64);
    const billingReference = parseOptionalBillingTag(body.billingReference, 256);

    const idOut = reqRideId();
    const idRet = reqRideId();
    const nowIso = new Date().toISOString();

    const base = {
      companyId: ctx.claims.companyId,
      createdByPanelUserId: ctx.claims.panelUserId,
      createdAt: nowIso,
      rejectedBy: [] as string[],
      driverId: null as string | null,
      customerName,
      rideKind,
      payerKind,
      voucherCode,
      billingReference,
      authorizationSource: DEFAULT_AUTHORIZATION_SOURCE,
      accessCodeId: null as string | null,
      accessCodeNormalizedSnapshot: null as string | null,
    };

    const rideOut: RideRequest = {
      ...base,
      id: idOut,
      status: initialPanelRideStatus(outLeg.scheduledAt),
      scheduledAt: outLeg.scheduledAt,
      from: outLeg.from,
      fromFull: outLeg.fromFull,
      fromLat: outLeg.fromLat,
      fromLon: outLeg.fromLon,
      to: outLeg.to,
      toFull: outLeg.toFull,
      toLat: outLeg.toLat,
      toLon: outLeg.toLon,
      distanceKm: outLeg.distanceKm,
      durationMinutes: outLeg.durationMinutes,
      estimatedFare: outLeg.estimatedFare,
      finalFare: null,
      paymentMethod: outLeg.paymentMethod,
      vehicle: outLeg.vehicle,
      partnerBookingMeta: {
        flow: "medical_patient",
        medical: {
          patientReference,
          tripLeg: "outbound",
          linkedRideId: idRet,
        },
      },
    };

    const rideRet: RideRequest = {
      ...base,
      id: idRet,
      status: initialPanelRideStatus(retLeg.scheduledAt),
      scheduledAt: retLeg.scheduledAt,
      from: retLeg.from,
      fromFull: retLeg.fromFull,
      fromLat: retLeg.fromLat,
      fromLon: retLeg.fromLon,
      to: retLeg.to,
      toFull: retLeg.toFull,
      toLat: retLeg.toLat,
      toLon: retLeg.toLon,
      distanceKm: retLeg.distanceKm,
      durationMinutes: retLeg.durationMinutes,
      estimatedFare: retLeg.estimatedFare,
      finalFare: null,
      paymentMethod: retLeg.paymentMethod,
      vehicle: retLeg.vehicle,
      partnerBookingMeta: {
        flow: "medical_patient",
        medical: {
          patientReference,
          tripLeg: "return",
          linkedRideId: idOut,
        },
      },
    };

    const accessCodeRaw = body.accessCode;
    const accessCodePlain = typeof accessCodeRaw === "string" ? accessCodeRaw : undefined;
    if (
      accessCodePlain &&
      accessCodePlain.trim() &&
      !enabledPanelModules(ctx.profile).includes("access_codes")
    ) {
      res.status(403).json({ error: "module_disabled", hint: "access_codes" });
      return;
    }

    const ins = await insertRidesWithSharedAccessCode([rideOut, rideRet], accessCodePlain);
    if (!ins.ok) {
      const err = ins.error;
      if (err === "access_code_wrong_company") {
        res.status(403).json({ error: err });
        return;
      }
      res.status(400).json({ error: err });
      return;
    }

    const [savedOut, savedRet] = await Promise.all([findRide(idOut), findRide(idRet)]);
    const enriched = await enrichPanelRidesForResponse(
      [savedOut, savedRet].filter((x): x is RideRequest => Boolean(x)),
    );
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId: ctx.claims.companyId,
      actorPanelUserId: ctx.claims.panelUserId,
      action: "booking.medical_round_trip_created",
      subjectType: "ride",
      subjectId: idOut,
      meta: { returnRideId: idRet, patientReference },
    });
    res.status(201).json({ ok: true, rides: enriched });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/bookings/medical-series", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "recurring_rides")) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "rides_create")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "rides.create")) return;

    const body = req.body as Record<string, unknown>;
    const patientReference =
      typeof body.patientReference === "string" ? body.patientReference.trim() : "";
    if (!patientReference) {
      res.status(400).json({ error: "patient_reference_required" });
      return;
    }
    const totalRides =
      typeof body.totalRides === "number" && Number.isFinite(body.totalRides)
        ? Math.floor(body.totalRides)
        : NaN;
    if (!Number.isFinite(totalRides) || totalRides < 1 || totalRides > 100) {
      res.status(400).json({ error: "total_rides_invalid" });
      return;
    }

    const tplRaw = body.template;
    if (!isBodyRecord(tplRaw)) {
      res.status(400).json({ error: "template_required" });
      return;
    }
    const leg = parseRouteLeg(tplRaw, "series");
    if ("error" in leg) {
      res.status(400).json({ error: leg.error });
      return;
    }
    const customerName =
      typeof tplRaw.customerName === "string"
        ? tplRaw.customerName.trim()
        : typeof body.customerName === "string"
          ? body.customerName.trim()
          : "";
    if (!customerName) {
      res.status(400).json({ error: "customer_name_required" });
      return;
    }

    let validFrom: Date | null = null;
    let validUntil: Date | null = null;
    if (typeof body.validFrom === "string" && body.validFrom.trim()) {
      validFrom = new Date(body.validFrom.trim());
      if (!Number.isFinite(validFrom.getTime())) {
        res.status(400).json({ error: "valid_from_invalid" });
        return;
      }
    }
    if (typeof body.validUntil === "string" && body.validUntil.trim()) {
      validUntil = new Date(body.validUntil.trim());
      if (!Number.isFinite(validUntil.getTime())) {
        res.status(400).json({ error: "valid_until_invalid" });
        return;
      }
    }

    const rawRk = body.rideKind;
    const rawPk = body.payerKind;
    if (rawRk != null && rawRk !== "" && (typeof rawRk !== "string" || parseRideKind(rawRk) === null)) {
      res.status(400).json({ error: "ride_kind_invalid" });
      return;
    }
    if (rawPk != null && rawPk !== "" && (typeof rawPk !== "string" || parsePayerKind(rawPk) === null)) {
      res.status(400).json({ error: "payer_kind_invalid" });
      return;
    }
    const rideKind = parseRideKind(rawRk) ?? "medical";
    const payerKind = parsePayerKind(rawPk) ?? "insurance";
    const g = await getCompanyGovernanceGate(ctx.claims.companyId);
    const gov = checkCompanyBookingGovernance(g, {
      rideKind,
      payerKind,
      routeChecks: [{ from: leg.from, fromFull: leg.fromFull, to: leg.to, toFull: leg.toFull }],
    });
    if (!gov.ok) {
      res.status(403).json({ error: gov.error });
      return;
    }
    const voucherCode = parseOptionalBillingTag(body.voucherCode, 64);
    const billingReference = parseOptionalBillingTag(body.billingReference, 256);

    const seriesRow = await insertPartnerRideSeries({
      companyId: ctx.claims.companyId,
      createdByPanelUserId: ctx.claims.panelUserId,
      patientReference,
      billingReference,
      validFrom,
      validUntil,
      totalRides,
      meta: {},
    });

    const vf = seriesRow.validFrom;
    const vu = seriesRow.validUntil;
    const nowIso = new Date().toISOString();
    const rides: RideRequest[] = [];
    for (let i = 1; i <= totalRides; i += 1) {
      const id = reqRideId();
      rides.push({
        id,
        companyId: ctx.claims.companyId,
        createdByPanelUserId: ctx.claims.panelUserId,
        createdAt: nowIso,
        scheduledAt: leg.scheduledAt,
        status: initialPanelRideStatus(leg.scheduledAt),
        rejectedBy: [],
        driverId: null,
        customerName,
        from: leg.from,
        fromFull: leg.fromFull,
        fromLat: leg.fromLat,
        fromLon: leg.fromLon,
        to: leg.to,
        toFull: leg.toFull,
        toLat: leg.toLat,
        toLon: leg.toLon,
        distanceKm: leg.distanceKm,
        durationMinutes: leg.durationMinutes,
        estimatedFare: leg.estimatedFare,
        finalFare: null,
        paymentMethod: leg.paymentMethod,
        vehicle: leg.vehicle,
        rideKind,
        payerKind,
        voucherCode,
        billingReference,
        authorizationSource: DEFAULT_AUTHORIZATION_SOURCE,
        accessCodeId: null,
        accessCodeNormalizedSnapshot: null,
        partnerBookingMeta: {
          flow: "medical_series_leg",
          medical: {
            patientReference,
            tripLeg: null,
            seriesId: seriesRow.id,
            seriesSequence: i,
            seriesTotal: totalRides,
            seriesValidFrom: vf,
            seriesValidUntil: vu,
          },
        },
      });
    }

    const accessCodeRaw = body.accessCode;
    const accessCodePlain = typeof accessCodeRaw === "string" ? accessCodeRaw : undefined;
    if (
      accessCodePlain &&
      accessCodePlain.trim() &&
      !enabledPanelModules(ctx.profile).includes("access_codes")
    ) {
      res.status(403).json({ error: "module_disabled", hint: "access_codes" });
      return;
    }

    const ins = await insertRidesWithSharedAccessCode(rides, accessCodePlain);
    if (!ins.ok) {
      const err = ins.error;
      if (err === "access_code_wrong_company") {
        res.status(403).json({ error: err });
        return;
      }
      res.status(400).json({ error: err });
      return;
    }

    const loaded = await Promise.all(rides.map((r) => findRide(r.id)));
    const enriched = await enrichPanelRidesForResponse(loaded.filter((x): x is RideRequest => Boolean(x)));
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId: ctx.claims.companyId,
      actorPanelUserId: ctx.claims.panelUserId,
      action: "booking.medical_series_created",
      subjectType: "partner_ride_series",
      subjectId: seriesRow.id,
      meta: { totalRides, patientReference },
    });
    res.status(201).json({ ok: true, series: seriesRow, rides: enriched });
  } catch (e) {
    next(e);
  }
});

function normalizeQueryRecord(raw: Record<string, unknown>): Record<string, unknown> {
  const q: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    q[k] = Array.isArray(v) ? v[0] : v;
  }
  return q;
}

router.get("/panel/v1/billing/rides", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "billing")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "rides.read")) return;

    const parsed = billingFiltersFromQuery(normalizeQueryRecord(req.query as Record<string, unknown>));
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const list = await listRidesForCompanyFiltered(ctx.claims.companyId, parsed.filters);
    const ids = list.map((r) => r.createdByPanelUserId).filter((x): x is string => Boolean(x));
    const names = await getPanelUsernamesInCompany(ctx.claims.companyId, ids);
    const ridesOut = list.map((r) => ({
      ...r,
      createdByUsername: r.createdByPanelUserId ? (names[r.createdByPanelUserId] ?? null) : null,
    }));
    const withTrace = await enrichPanelRidesForResponse(ridesOut);
    res.json({
      ok: true,
      month: parsed.ym,
      filters: parsed.filters,
      rides: withTrace,
    });
  } catch (e) {
    next(e);
  }
});

router.get("/panel/v1/billing/rides.csv", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "billing")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "rides.read")) return;

    const parsed = billingFiltersFromQuery(normalizeQueryRecord(req.query as Record<string, unknown>));
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const list = await listRidesForCompanyFiltered(ctx.claims.companyId, parsed.filters);
    const lines = [BILLING_CSV_HEADER, ...list.map((r) => rideToBillingCsvRow(r))];
    const csv = `\uFEFF${lines.join("\n")}\n`;
    const safeYm = parsed.ym.replace(/[^0-9-]/g, "");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="onroda-billing-${safeYm || "export"}.csv"`);
    res.status(200).send(csv);
  } catch (e) {
    next(e);
  }
});

router.get("/panel/v1/partner-ride-series", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "recurring_rides")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "rides.read")) return;
    const items = await listPartnerRideSeriesForCompany(ctx.claims.companyId);
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

router.get("/panel/v1/access-codes", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "access_codes")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "access_codes.read")) return;
    const items = await listAccessCodesForCompany(ctx.claims.companyId);
    res.json({ ok: true, items: items.map(accessCodeRowForPanel) });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/access-codes", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "access_codes")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "access_codes.manage")) return;
    const body = req.body as Record<string, unknown>;
    const generateCode = body.generateCode === true;
    const result = await insertAccessCodeAdmin({
      generate: generateCode,
      code: typeof body.code === "string" ? body.code : "",
      codeType: typeof body.codeType === "string" ? body.codeType : "",
      companyId: ctx.claims.companyId,
      label: typeof body.label === "string" ? body.label : undefined,
      internalNote: typeof body.internalNote === "string" ? body.internalNote : undefined,
      maxUses: typeof body.maxUses === "number" ? body.maxUses : undefined,
      validFrom: typeof body.validFrom === "string" ? body.validFrom : undefined,
      validUntil: typeof body.validUntil === "string" ? body.validUntil : undefined,
    });
    if (!result.ok) {
      const err = result.error;
      if (err === "code_duplicate") {
        res.status(409).json({ error: err });
        return;
      }
      if (err === "code_generate_failed") {
        res.status(503).json({ error: err });
        return;
      }
      res.status(400).json({ error: err });
      return;
    }
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId: ctx.claims.companyId,
      actorPanelUserId: ctx.claims.panelUserId,
      action: "access_code.created",
      subjectType: "access_code",
      subjectId: result.item.id,
      meta: {
        codeType: result.item.codeType,
        label: result.item.label,
        generated: Boolean(generateCode),
      },
    });
    res.status(201).json({
      ok: true,
      item: accessCodeRowForPanel(result.item),
      ...(result.revealedCode ? { revealedCode: result.revealedCode } : {}),
    });
  } catch (e) {
    next(e);
  }
});

router.patch("/panel/v1/access-codes/:id", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "access_codes")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "access_codes.manage")) return;
    const id = typeof req.params.id === "string" ? req.params.id : "";
    if (!id) {
      res.status(400).json({ error: "id_required" });
      return;
    }
    const body = req.body as { isActive?: unknown };
    if (typeof body.isActive !== "boolean") {
      res.status(400).json({ error: "isActive_boolean_required" });
      return;
    }
    const result = await patchAccessCodeForCompany(ctx.claims.companyId, id, { isActive: body.isActive });
    if (!result.ok) {
      if (result.error === "not_found") {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.status(400).json({ error: result.error });
      return;
    }
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId: ctx.claims.companyId,
      actorPanelUserId: ctx.claims.panelUserId,
      action: "access_code.updated",
      subjectType: "access_code",
      subjectId: id,
      meta: { isActive: result.item.isActive },
    });
    res.json({ ok: true, item: accessCodeRowForPanel(result.item) });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/me/change-password", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res, {
      allowPasswordChangeRequired: true,
    });
    if (!ctx) return;
    if (!denyUnlessCompanyOrOverview(res, ctx.profile)) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "self.change_password")) return;
      const body = req.body as { currentPassword?: string; newPassword?: string };
      const cur = typeof body.currentPassword === "string" ? body.currentPassword : "";
      const neu = typeof body.newPassword === "string" ? body.newPassword : "";
      if (!cur || neu.length < 10) {
        res.status(400).json({ error: "password_fields_invalid", hint: "newPassword min length 10" });
        return;
      }
      const row = await findActivePanelUserById(ctx.claims.panelUserId);
      if (!row) {
        res.status(401).json({ error: "user_not_found" });
        return;
      }
      const ok = await verifyPassword(cur, row.password_hash);
      if (!ok) {
        res.status(401).json({ error: "invalid_current_password" });
        return;
      }
      const hash = await hashPassword(neu);
      const updated = await updatePanelUserPasswordInCompany(row.id, row.company_id, hash, false);
      if (!updated) {
        res.status(500).json({ error: "password_update_failed" });
        return;
      }
      await insertPanelAuditLog({
        id: randomUUID(),
        companyId: ctx.claims.companyId,
        actorPanelUserId: ctx.claims.panelUserId,
        action: "user.self_password_change",
        subjectType: "panel_user",
        subjectId: row.id,
        meta: {},
      });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get("/panel/v1/users", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "team")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "users.read")) return;
    const users = await listPanelUsersInCompany(ctx.claims.companyId);
    res.json({ ok: true, users });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/users", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "team")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "users.manage")) return;
    const body = req.body as { username?: string; email?: string; role?: string; password?: string };
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const rawPassword = typeof body.password === "string" ? body.password : "";
    const generatedPassword = rawPassword ? "" : generateTemporaryPassword();
    const password = rawPassword || generatedPassword;
    const roleRaw = typeof body.role === "string" ? body.role.trim() : "";
    if (!username || !password || password.length < 10) {
      res.status(400).json({ error: "username_password_required", hint: "password min length 10" });
      return;
    }
    if (!isPanelRoleString(roleRaw)) {
      res.status(400).json({ error: "invalid_role" });
      return;
    }
    const targetRole = roleRaw as PanelRole;
    if (!canPartnerAssignPanelRole(ctx.profile.role as PanelRole, targetRole)) {
      res.status(403).json({ error: "forbidden_role_assignment" });
      return;
    }
    if (await panelUsernameTaken(username.toLowerCase())) {
      res.status(409).json({ error: "username_taken" });
      return;
    }
    const hash = await hashPassword(password);
    const created = await insertPanelUser({
      companyId: ctx.claims.companyId,
      username,
      email,
      role: targetRole,
      passwordHash: hash,
      mustChangePassword: true,
    });
    if (!created) {
      res.status(409).json({ error: "username_taken" });
      return;
    }
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId: ctx.claims.companyId,
      actorPanelUserId: ctx.claims.panelUserId,
      action: "user.created",
      subjectType: "panel_user",
      subjectId: created.id,
      meta: { username, role: targetRole },
    });
    res.status(201).json({
      ok: true,
      user: { id: created.id, username, email, role: targetRole, mustChangePassword: true },
      onboarding: {
        username,
        ...(generatedPassword ? { initialPassword: generatedPassword } : {}),
        mustChangePassword: true,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.patch("/panel/v1/users/:id", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "team")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "users.manage")) return;
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: "id_required" });
        return;
      }
      const target = await findPanelUserInCompany(id, ctx.claims.companyId);
      if (!target) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (target.id === ctx.claims.panelUserId) {
        res.status(400).json({ error: "cannot_modify_self_here" });
        return;
      }
      if (ctx.profile.role === "manager" && target.role === "owner") {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const body = req.body as {
        isActive?: boolean;
        role?: string;
        email?: string;
        username?: string;
      };
      const patch: {
        isActive?: boolean;
        role?: string;
        email?: string;
        username?: string;
      } = {};
      if (typeof body.isActive === "boolean") patch.isActive = body.isActive;
      if (typeof body.role === "string" && body.role.trim()) {
        if (!isPanelRoleString(body.role.trim())) {
          res.status(400).json({ error: "invalid_role" });
          return;
        }
        const tr = body.role.trim() as PanelRole;
        if (!canPartnerAssignPanelRole(ctx.profile.role as PanelRole, tr)) {
          res.status(403).json({ error: "forbidden_role_assignment" });
          return;
        }
        patch.role = tr;
      }
      if (typeof body.email === "string") {
        patch.email = body.email.trim();
      }
      if (typeof body.username === "string") {
        const u = body.username.trim();
        if (u.length < 2) {
          res.status(400).json({ error: "username_invalid" });
          return;
        }
        if (u.toLowerCase() !== target.username.toLowerCase()) {
          if (await panelUsernameTaken(u.toLowerCase(), id)) {
            res.status(409).json({ error: "username_taken" });
            return;
          }
        }
        patch.username = u;
      }
      if (
        patch.isActive === undefined &&
        patch.role === undefined &&
        patch.email === undefined &&
        patch.username === undefined
      ) {
        res.status(400).json({ error: "no_changes" });
        return;
      }
      const updated = await patchPanelUserInCompany(id, ctx.claims.companyId, patch);
      if (!updated) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      await insertPanelAuditLog({
        id: randomUUID(),
        companyId: ctx.claims.companyId,
        actorPanelUserId: ctx.claims.panelUserId,
        action: patch.isActive === false ? "user.deactivated" : "user.updated",
        subjectType: "panel_user",
        subjectId: id,
        meta: {
          ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
          ...(patch.role ? { role: patch.role } : {}),
          ...(patch.email !== undefined ? { email: true } : {}),
          ...(patch.username !== undefined ? { username: true } : {}),
        },
      });
    res.json({ ok: true, user: updated });
  } catch (e) {
    next(e);
  }
});

router.delete("/panel/v1/users/:id", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "team")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "users.manage")) return;
    const id = typeof req.params.id === "string" ? req.params.id : "";
    if (!id) {
      res.status(400).json({ error: "id_required" });
      return;
    }
    const target = await findPanelUserInCompany(id, ctx.claims.companyId);
    if (!target) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (target.id === ctx.claims.panelUserId) {
      res.status(400).json({ error: "cannot_modify_self_here" });
      return;
    }
    if (ctx.profile.role === "manager" && target.role === "owner") {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (target.is_active) {
      res.status(400).json({
        error: "user_must_be_inactive",
        hint: "Zuerst deaktivieren, dann endgültig entfernen.",
      });
      return;
    }
    const removed = await deleteInactivePanelUserInCompany(id, ctx.claims.companyId);
    if (!removed) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId: ctx.claims.companyId,
      actorPanelUserId: ctx.claims.panelUserId,
      action: "user.deleted",
      subjectType: "panel_user",
      subjectId: id,
      meta: { username: target.username },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/users/:id/reset-password", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "team")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "users.reset_password")) return;
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: "id_required" });
        return;
      }
      const target = await findPanelUserInCompany(id, ctx.claims.companyId);
      if (!target || !target.is_active) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (target.id === ctx.claims.panelUserId) {
        res.status(400).json({ error: "use_change_password_for_self" });
        return;
      }
      if (ctx.profile.role === "manager" && target.role === "owner") {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const body = req.body as { newPassword?: string };
      const neu = typeof body.newPassword === "string" ? body.newPassword : "";
      if (neu.length < 10) {
        res.status(400).json({ error: "password_fields_invalid", hint: "newPassword min length 10" });
        return;
      }
      const hash = await hashPassword(neu);
      const ok = await updatePanelUserPasswordInCompany(id, ctx.claims.companyId, hash, true);
      if (!ok) {
        res.status(500).json({ error: "password_update_failed" });
        return;
      }
      await insertPanelAuditLog({
        id: randomUUID(),
        companyId: ctx.claims.companyId,
        actorPanelUserId: ctx.claims.panelUserId,
        action: "user.password_reset",
        subjectType: "panel_user",
        subjectId: id,
        meta: {},
      });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
