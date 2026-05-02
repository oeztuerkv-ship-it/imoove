import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router, type IRouter, type Request, type Response } from "express";
import { forbiddenPanelModulesForCompanyKind } from "../domain/adminCompanyKindPanelModules";
import { computeAccessCodePublicStatus } from "../domain/accessCodeLifecycle";
import { normalizeStoredPanelModules, PANEL_MODULE_DEFINITIONS } from "../domain/panelModules";
import { getPartnerRegistrationPolicy } from "../domain/partnerRegistrationPolicies";
import { parsePayerKind, parseRideKind } from "../domain/rideBillingProfile";
import {
  addFareArea,
  type AdminCompanyUpdateBody,
  deleteFareArea,
  type FareAreaPatchBody,
  getAdminStats,
  getCompanyKpis,
  getPublicFareProfile,
  findCompanyById,
  insertAdminCompany,
  listCompanies,
  listFareAreas,
  patchCompanyPanelModules,
  patchCompanyPriority,
  updateAdminCompany,
  updateFareArea,
} from "../db/adminData";
import {
  countFinancialAuditAdmin,
  countInvoicesAdmin,
  countPaymentsAdmin,
  countRideFinancialsAdmin,
  countSettlementsAdmin,
  findInvoiceAdmin,
  findSettlementAdmin,
  getAdminFinanceSummary,
  getFinanceEligibilitySummaryForRide,
  getRideFinancialDetailAdmin,
  listFinancialAuditAdmin,
  listInvoicesAdmin,
  listPaymentsAdmin,
  listRideFinancialsAdmin,
  listSettlementsAdmin,
} from "../db/adminFinanceData";
import { attachAccessCodeSummariesToRides, insertAccessCodeAdmin, listAccessCodesAdmin } from "../db/accessCodesData";
import { insertPanelAuditLog, listPanelAuditForCompany } from "../db/panelAuditData";
import {
  findPanelUserInCompany,
  insertPanelUser,
  listPanelUsersInCompany,
  patchPanelUserInCompany,
  panelUsernameTaken,
  updatePanelUserPasswordInCompany,
} from "../db/panelUsersData";
import {
  decideCompanyChangeRequest,
  listCompanyChangeRequestsAdmin,
} from "../db/companyChangeRequestsData";
import {
  getSupportThreadAdmin,
  insertAdminSupportMessage,
  listSupportThreadsAdmin,
  patchSupportThreadStatusAdmin,
  parseSupportCategory,
  parseSupportThreadStatus,
} from "../db/supportThreadsData";
import { setCurrentComplianceDocumentReview } from "../db/companyComplianceDocumentsData";
import { getHomepageContentAdmin, patchHomepageContentAdmin } from "../db/homepageContentData";
import {
  getOperationalConfigPayload,
  insertServiceRegion,
  listServiceRegionsForApi,
  updateOperationalConfigPayload,
  updateServiceRegionById,
} from "../db/appOperationalData";
import {
  estimateTaxiFromMergedTariff,
  isPlainTariffObject,
  mergeTariffsForServiceRegion,
  mergedTariffToPublicProfile,
} from "../lib/operationalTariffEngine";
import {
  createHomepageFaqItem,
  createHomepageHowStep,
  createHomepageTrustMetric,
  deleteHomepageFaqItem,
  deleteHomepageHowStep,
  deleteHomepageTrustMetric,
  listHomepageFaqAdmin,
  listHomepageHowAdmin,
  listHomepageTrustAdmin,
  patchHomepageFaqItem,
  patchHomepageHowStep,
  patchHomepageTrustMetric,
} from "../db/homepageModulesData";
import {
  createHomepagePlaceholder,
  listHomepagePlaceholdersAdmin,
  patchHomepagePlaceholder,
} from "../db/homepagePlaceholdersData";
import { getAdminOperatorSnapshot } from "../db/adminOperatorSnapshotData";
import { getCompanyMandateRead } from "../db/adminMandateDetailData";
import {
  addPartnerRegistrationDocument,
  addPartnerRegistrationMessage,
  addPartnerRegistrationTimelineEvent,
  attachCompanyToPartnerRegistrationRequest,
  findPartnerRegistrationDocumentById,
  findPartnerRegistrationRequestById,
  getPartnerRegistrationDetailAdmin,
  isPartnerType,
  isRegistrationStatus,
  listPartnerRegistrationPendingQueueAdmin,
  listPartnerRegistrationRequestsAdmin,
  mapDocRowForAdminList,
  type PartnerRegistrationAdminPatch,
  patchPartnerRegistrationRequest,
  resolvePartnerRegistrationStorageAbsolutePath,
} from "../db/partnerRegistrationRequestsData";
import {
  countActiveAdminRoleUsers,
  createAdminPasswordResetToken,
  createAdminAuthUser,
  deleteAdminAuthUserById,
  findActiveAdminAuthUserByIdentity,
  findActiveAdminAuthUserByUsername,
  findAdminAuthUserRowById,
  findUsableAdminPasswordResetByTokenHash,
  insertAdminAuthAuditLog,
  listAdminAuthUsers,
  markAdminPasswordResetUsed,
  patchAdminAuthUserById,
  updateAdminAuthPasswordByUsername,
} from "../db/adminAuthData";
import { isPostgresConfigured } from "../db/client";
import {
  adminPreviousDayBounds,
  adminReleaseRide,
  countRidesAdmin,
  findRideAdminById,
  listAdminPartnerDayStats,
  listAdminRidesAgendaForDay,
  listAdminRideEventsByRideId,
  listRidesAdminPage,
  parseAdminDashboardDayBounds,
  type AdminRideListQuery,
} from "../db/ridesData";
import {
  getAdminTaxiFleetVehicleDetail,
  listAdminTaxiFleetVehicleRows,
} from "../db/adminTaxiFleetVehiclesData";
import {
  adminPatchFleetVehicleFields,
  findFleetVehicleInCompany,
  forceBlockFleetVehicleByAdmin,
  getFleetVehicleAdminDetail,
  listFleetVehicleDocumentStorageKeysAdmin,
  listFleetVehicleDocumentStorageKeysInCompany,
  listPendingFleetVehiclesForAdmin,
  setFleetVehicleApprovalByAdmin,
  setFleetVehicleMissingDocumentsByAdmin,
  unblockFleetVehicleByAdmin,
} from "../db/fleetVehiclesData";
import {
  adminActivateFleetDriver,
  adminPatchFleetDriverAdminFields,
  adminSuspendFleetDriver,
  approveFleetDriverForCompany,
  markFleetDriverMissingDocumentsForCompany,
  rejectFleetDriverForCompany,
  setFleetDriverApprovalByAdmin,
  setFleetDriverApprovalStatusOnlyForCompany,
  setFleetDriverReadinessOverrideSystem,
  type FleetDriverApprovalStatus,
} from "../db/fleetDriversData";
import {
  getAdminTaxiFleetDriverDetail,
  listAdminTaxiFleetDriverRows,
} from "../db/fleetDriverReadiness";
import { hashPassword } from "../lib/password";
import { isPanelRoleString } from "../lib/panelPermissions";
import { generateTemporaryPassword } from "../lib/tempPassword";
import type { PanelRole } from "../lib/panelJwt";
import { buildAdminPasswordResetLink, sendAdminPasswordResetMail } from "../lib/adminPasswordResetMail";
import {
  sendPartnerRegistrationAdminMessageEmail,
  sendPartnerRegistrationApprovedEmail,
  sendPartnerRegistrationRejectionEmail,
} from "../lib/partnerApprovalMail";
import { logger } from "../lib/logger";
import adminInsuranceRouter from "./adminInsuranceApi";
import { requireAdminApiBearer } from "../middleware/requireAdminApiBearer";
import { authenticateAdminCredentials, signAdminSessionJwt } from "../middleware/requireAdminApiBearer";
import {
  adminRideRowVisibleToPrincipal,
  canAccessAdminAccessCodes,
  canAccessAdminDashboardOverview,
  canAccessAdminStats,
  canAdminReleaseRide,
  canMutateAdminCompanies,
  canMutateAdminFareAreas,
  canMutateScopedTaxiAdminCompany,
  canReadAdminCompaniesList,
  mergeAdminRideListQueryForPrincipal,
  parseAdminRole,
  type AdminRole,
} from "../lib/adminConsoleRoles";

export type { AdminAccessCodeRow, AdminDashboardStats, CompanyRow, FareAreaRow } from "./adminApi.types";

async function requireCompanyRowForMutation(req: Request, res: Response, companyId: string) {
  const company = await findCompanyById(companyId);
  if (!company) {
    res.status(404).json({ error: "company_not_found" });
    return null;
  }
  const role = adminConsoleRole(req);
  if (canMutateAdminCompanies(role)) return company;
  if (canMutateScopedTaxiAdminCompany(role, req.adminAuth?.scopeCompanyId, company)) return company;
  res.status(403).json({ error: "forbidden" });
  return null;
}

/** Mandant muss existieren, Bearbeitung erlaubt (wie Panel-User), und `company_kind === taxi`. */
async function requireTaxiCompanyForAdminPanel(req: Request, res: Response, companyId: string) {
  const c = await requireCompanyRowForMutation(req, res, companyId);
  if (!c) return null;
  if (c.company_kind !== "taxi") {
    res.status(400).json({ error: "not_taxi_company" });
    return null;
  }
  return c;
}

function parseStatsRevenueBound(v: unknown): Date | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseIsoDateParam(v: unknown, endOfDay: boolean): Date | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  if (endOfDay) {
    d.setHours(23, 59, 59, 999);
  }
  return d;
}

function parseBooleanParam(v: unknown): boolean | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "no") return false;
  return undefined;
}

function parsePagination(req: Request): { page: number; pageSize: number; offset: number } {
  const page = Math.min(500, Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1));
  const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "20"), 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function parseAdminRideListQuery(req: Request): { ok: true; query: AdminRideListQuery } | { ok: false; error: string } {
  const q = req.query as Record<string, string | undefined>;
  const query: AdminRideListQuery = {};
  if (typeof q.companyId === "string" && q.companyId.trim()) query.companyId = q.companyId.trim();
  if (typeof q.status === "string" && q.status.trim()) query.status = q.status.trim();
  const cf = parseIsoDateParam(q.createdFrom, false);
  const ct = parseIsoDateParam(q.createdTo, true);
  if (cf) query.createdFrom = cf;
  if (ct) query.createdTo = ct;
  if (typeof q.rideKind === "string" && q.rideKind.trim()) {
    const rk = parseRideKind(q.rideKind.trim());
    if (!rk) return { ok: false, error: "ride_kind_invalid" };
    query.rideKind = rk;
  }
  if (typeof q.payerKind === "string" && q.payerKind.trim()) {
    const pk = parsePayerKind(q.payerKind.trim());
    if (!pk) return { ok: false, error: "payer_kind_invalid" };
    query.payerKind = pk;
  }
  if (typeof q.driverId === "string" && q.driverId.trim()) query.driverId = q.driverId.trim();
  if (typeof q.q === "string" && q.q.trim()) query.q = q.q.trim();
  const sortRaw = typeof q.sortCreated === "string" ? q.sortCreated.trim().toLowerCase() : "";
  if (sortRaw === "asc") query.sortCreated = "asc";
  else if (sortRaw === "desc") query.sortCreated = "desc";
  return { ok: true, query };
}

function isAdminPrincipal(req: Request): boolean {
  return req.adminAuth?.role === "admin";
}

function adminConsoleRole(req: Request): AdminRole {
  return req.adminAuth?.role ?? "admin";
}

async function resolveAdminAuthUserIdForSupport(req: Request): Promise<string | null> {
  const u = req.adminAuth?.username?.trim();
  if (!u || u === "api_bearer" || u === "dev_local") return null;
  const row = await findActiveAdminAuthUserByUsername(u);
  return row?.id ?? null;
}

function partnerTypeToCompanyKind(
  partnerType: string,
): "taxi" | "hotel" | "insurer" | "corporate" | "voucher_client" | "general" | "medical" {
  switch (partnerType) {
    case "taxi":
      return "taxi";
    case "hotel":
      return "hotel";
    case "insurance":
      return "insurer";
    case "medical":
    case "care":
      return "medical";
    case "business":
      return "corporate";
    case "voucher_partner":
      return "voucher_client";
    default:
      return "general";
  }
}

function sanitizePreferredPanelUsernameBase(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const local = trimmed.includes("@") ? (trimmed.split("@")[0] ?? trimmed) : trimmed;
  let s = local.replace(/[^a-z0-9._-]+/g, "_").replace(/_+/g, "_");
  s = s.replace(/^\.+|\.+$/g, "").replace(/^[_-]+|[_-]+$/g, "");
  if (s.length < 3) {
    s = `partner${randomBytes(3).toString("hex")}`;
  }
  return s.slice(0, 36);
}

async function allocateUniquePanelUsername(preferred: string): Promise<string> {
  const base = sanitizePreferredPanelUsernameBase(preferred || "partner");
  for (let attempt = 0; attempt < 40; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
    if (!(await panelUsernameTaken(candidate.toLowerCase()))) {
      return candidate;
    }
  }
  throw new Error("panel_username_exhausted");
}

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const router: IRouter = Router();

router.post("/admin/auth/login", async (req, res) => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const ok = await authenticateAdminCredentials(username, password);
  const loginAudit = process.env.ADMIN_AUTH_LOGIN_AUDIT === "1";
  if (!ok.ok) {
    if (loginAudit) {
      const detail = !ok.ok && ok.error === "invalid_credentials" ? ok.detail : undefined;
      logger.warn(
        {
          event: "admin.auth.login",
          outcome: "fail",
          username: username || "(empty)",
          clientIp: req.ip,
          reason: ok.error,
          detail,
        },
        "admin password login failed",
      );
    }
    if (ok.error === "bootstrap_persist_failed") {
      res.status(503).json({ error: "auth_bootstrap_persist_failed" });
      return;
    }
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }
  const token = await signAdminSessionJwt({ username, role: ok.role });
  const row = await findActiveAdminAuthUserByUsername(username);
  const scopeCompanyId = row?.scopeCompanyId?.trim() ? row.scopeCompanyId.trim() : null;
  if (loginAudit) {
    logger.info(
      {
        event: "admin.auth.login",
        outcome: "ok",
        username,
        clientIp: req.ip,
        role: ok.role,
        source: ok.source,
      },
      "admin password login ok",
    );
  }
  res.json({
    ok: true,
    token,
    user: { username, role: ok.role, scopeCompanyId },
    authSource: ok.source,
  });
});

router.get("/admin/auth/me", requireAdminApiBearer, (req, res) => {
  const role = req.adminAuth?.role ?? "admin";
  const username = req.adminAuth?.username ?? "admin";
  const scopeCompanyId =
    typeof req.adminAuth?.scopeCompanyId === "string" && req.adminAuth.scopeCompanyId.trim()
      ? req.adminAuth.scopeCompanyId.trim()
      : null;
  res.json({ ok: true, user: { username, role, scopeCompanyId } });
});

router.post("/admin/auth/change-password", requireAdminApiBearer, async (req, res) => {
  const principal = req.adminAuth;
  if (!principal || principal.kind !== "session") {
    res.status(403).json({ error: "session_required" });
    return;
  }
  const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  const nextPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  if (currentPassword.length < 8 || nextPassword.length < 10) {
    res.status(400).json({ error: "password_fields_invalid", hint: "currentPassword min 8, newPassword min 10" });
    return;
  }
  const auth = await authenticateAdminCredentials(principal.username, currentPassword);
  if (!auth.ok) {
    res.status(401).json({ error: "invalid_current_password" });
    return;
  }
  const passwordHash = await hashPassword(nextPassword);
  if (!isPostgresConfigured()) {
    res.status(503).json({ error: "admin_auth_store_unavailable" });
    return;
  }
  const updated = await updateAdminAuthPasswordByUsername({
    username: principal.username,
    passwordHash,
  });
  if (!updated) {
    res.status(500).json({ error: "password_update_failed" });
    return;
  }
  await insertAdminAuthAuditLog({
    username: principal.username,
    action: "admin.auth.password_changed",
  });
  res.json({ ok: true });
});

router.post("/admin/auth/password-reset/request", async (req, res) => {
  const identity = typeof req.body?.identity === "string" ? req.body.identity.trim() : "";
  const generic = {
    ok: true,
    message:
      "Wenn ein passender Zugang existiert, erhalten Sie in Kürze eine E-Mail mit einem Link zum Zurücksetzen des Passworts.",
  };
  if (!identity || !isPostgresConfigured()) {
    res.json(generic);
    return;
  }
  const user = await findActiveAdminAuthUserByIdentity(identity);
  if (!user) {
    await insertAdminAuthAuditLog({
      username: identity,
      action: "admin.auth.password_reset_requested_unknown_identity",
    });
    res.json(generic);
    return;
  }
  const recipient = (user.email ?? "").trim();
  if (!recipient.includes("@")) {
    await insertAdminAuthAuditLog({
      adminUserId: user.id,
      username: user.username,
      action: "admin.auth.password_reset_requested_no_recipient_email",
    });
    res.json(generic);
    return;
  }
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashResetToken(rawToken);
  const configuredTtlMin = Number(process.env.ADMIN_AUTH_RESET_TOKEN_TTL_MINUTES ?? "30");
  const ttlMsDefault = Math.max(1, Number.isFinite(configuredTtlMin) ? configuredTtlMin : 30) * 60 * 1000;
  let ttlMs = ttlMsDefault;
  if (process.env.NODE_ENV !== "production") {
    const debugExpires = Number(req.body?.debugExpiresInSeconds);
    if (Number.isFinite(debugExpires) && debugExpires >= 1) ttlMs = debugExpires * 1000;
  }
  const expiresAt = new Date(Date.now() + ttlMs);
  await createAdminPasswordResetToken({
    adminUserId: user.id,
    tokenHash,
    expiresAt,
  });
  const resetLink = buildAdminPasswordResetLink(rawToken);
  const mailResult = await sendAdminPasswordResetMail({
    to: recipient,
    resetLink,
    username: user.username,
    expiresAt,
  });
  await insertAdminAuthAuditLog({
    adminUserId: user.id,
    username: user.username,
    action: "admin.auth.password_reset_requested",
    meta: {
      expiresAt: expiresAt.toISOString(),
      mailSent: mailResult.ok,
      ...(mailResult.ok ? {} : { mailFailureReason: mailResult.reason }),
    },
  });
  res.json(generic);
});

router.post("/admin/auth/password-reset/confirm", async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  if (!token || newPassword.length < 10) {
    res.status(400).json({ error: "reset_payload_invalid", hint: "token + newPassword(min10)" });
    return;
  }
  if (!isPostgresConfigured()) {
    res.status(503).json({ error: "admin_auth_store_unavailable" });
    return;
  }
  const reset = await findUsableAdminPasswordResetByTokenHash(hashResetToken(token));
  if (!reset) {
    await insertAdminAuthAuditLog({
      username: "",
      action: "admin.auth.password_reset_confirm_failed",
      meta: { reason: "invalid_or_expired" },
    });
    res.status(400).json({ error: "invalid_or_expired_reset_token" });
    return;
  }
  const passwordHash = await hashPassword(newPassword);
  const updated = await patchAdminAuthUserById({
    id: reset.adminUserId,
    passwordHash,
  });
  await markAdminPasswordResetUsed(reset.id);
  if (!updated) {
    res.status(500).json({ error: "password_update_failed" });
    return;
  }
  await insertAdminAuthAuditLog({
    adminUserId: updated.id,
    username: updated.username,
    action: "admin.auth.password_reset_completed",
    meta: { resetId: reset.id },
  });
  res.json({ ok: true });
});

router.post("/admin/auth/password-reset/issue-link", requireAdminApiBearer, async (req, res) => {
  if (!isAdminPrincipal(req)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const identity = typeof req.body?.identity === "string" ? req.body.identity.trim() : "";
  if (!identity || !isPostgresConfigured()) {
    res.status(400).json({ error: "identity_required" });
    return;
  }
  const user = await findActiveAdminAuthUserByIdentity(identity);
  if (!user) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashResetToken(rawToken);
  const expiresRaw = Number(req.body?.expiresInSeconds);
  const ttlSeconds = Number.isFinite(expiresRaw) && expiresRaw >= 1 ? expiresRaw : 30 * 60;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  await createAdminPasswordResetToken({
    adminUserId: user.id,
    tokenHash,
    expiresAt,
  });
  await insertAdminAuthAuditLog({
    adminUserId: user.id,
    username: user.username,
    action: "admin.auth.password_reset_link_issued_by_admin",
    meta: {
      issuedBy: req.adminAuth?.username ?? "admin",
      expiresAt: expiresAt.toISOString(),
    },
  });
  res.json({
    ok: true,
    delivery: "manual_email_link_phase_a",
    resetToken: rawToken,
    expiresAt: expiresAt.toISOString(),
  });
});

router.get("/admin/auth/users", requireAdminApiBearer, async (req, res, next) => {
  try {
    if (!isAdminPrincipal(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "admin_auth_store_unavailable" });
      return;
    }
    const users = await listAdminAuthUsers();
    res.json({ ok: true, users });
  } catch (e) {
    next(e);
  }
});

router.post("/admin/auth/users", requireAdminApiBearer, async (req, res, next) => {
  try {
    if (!isAdminPrincipal(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "admin_auth_store_unavailable" });
      return;
    }
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const roleRaw = typeof req.body?.role === "string" ? req.body.role.trim() : "";
    const isActive = typeof req.body?.isActive === "boolean" ? req.body.isActive : true;
    const scopeRaw = typeof req.body?.scopeCompanyId === "string" ? req.body.scopeCompanyId.trim() : "";
    const role = parseAdminRole(roleRaw);
    if (!username || password.length < 10 || !role) {
      res.status(400).json({
        error: "user_payload_invalid",
        hint: "username, password(min10), role(admin|service|taxi|insurance|hotel), optional email, optional scopeCompanyId (Hotel)",
      });
      return;
    }
    if (role === "hotel" && !scopeRaw) {
      res.status(400).json({ error: "scope_company_id_required_for_hotel" });
      return;
    }
    const hash = await hashPassword(password);
    const created = await createAdminAuthUser({
      username,
      email,
      passwordHash: hash,
      role,
      isActive,
      scopeCompanyId: scopeRaw || null,
    });
    if (!created) {
      res.status(409).json({ error: "username_taken" });
      return;
    }
    await insertAdminAuthAuditLog({
      adminUserId: created.id,
      username: created.username,
      action: "admin.auth.user_created",
      meta: { role: created.role, isActive: created.isActive },
    });
    res.status(201).json({ ok: true, user: created });
  } catch (e) {
    next(e);
  }
});

router.patch("/admin/auth/users/:id", requireAdminApiBearer, async (req, res, next) => {
  try {
    if (!isAdminPrincipal(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "admin_auth_store_unavailable" });
      return;
    }
    const roleRaw = typeof req.body?.role === "string" ? req.body.role.trim() : undefined;
    const emailRaw = typeof req.body?.email === "string" ? req.body.email.trim() : undefined;
    const role = roleRaw ? parseAdminRole(roleRaw) : undefined;
    const isActive = typeof req.body?.isActive === "boolean" ? req.body.isActive : undefined;
    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    const scopeBody = req.body as { scopeCompanyId?: unknown };
    const scopeCompanyIdPatch =
      Object.prototype.hasOwnProperty.call(scopeBody, "scopeCompanyId") &&
      (typeof scopeBody.scopeCompanyId === "string" || scopeBody.scopeCompanyId === null)
        ? typeof scopeBody.scopeCompanyId === "string"
          ? scopeBody.scopeCompanyId.trim() || null
          : null
        : undefined;
    if (roleRaw && !role) {
      res.status(400).json({ error: "invalid_role" });
      return;
    }
    if (newPassword && newPassword.length < 10) {
      res.status(400).json({ error: "password_fields_invalid", hint: "newPassword min length 10" });
      return;
    }
    if (
      role === undefined &&
      isActive === undefined &&
      emailRaw === undefined &&
      !newPassword &&
      scopeCompanyIdPatch === undefined
    ) {
      res.status(400).json({ error: "no_changes" });
      return;
    }
    const user = await patchAdminAuthUserById({
      id: req.params.id,
      role,
      ...(emailRaw !== undefined ? { email: emailRaw } : {}),
      isActive,
      ...(scopeCompanyIdPatch !== undefined ? { scopeCompanyId: scopeCompanyIdPatch } : {}),
      ...(newPassword ? { passwordHash: await hashPassword(newPassword) } : {}),
    });
    if (!user) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await insertAdminAuthAuditLog({
      adminUserId: user.id,
      username: user.username,
      action: "admin.auth.user_updated",
      meta: {
        role: role ?? null,
        isActive: isActive ?? null,
        emailUpdated: emailRaw !== undefined,
        passwordChanged: Boolean(newPassword),
      },
    });
    res.json({ ok: true, user });
  } catch (e) {
    next(e);
  }
});

router.delete("/admin/auth/users/:id", requireAdminApiBearer, async (req, res, next) => {
  try {
    if (!isAdminPrincipal(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "admin_auth_store_unavailable" });
      return;
    }
    const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!id) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    const target = await findAdminAuthUserRowById(id);
    if (!target) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const principal = req.adminAuth;
    if (principal?.kind === "session" && principal.username === target.username) {
      res.status(400).json({ error: "cannot_delete_self" });
      return;
    }
    if (target.role === "admin" && target.isActive) {
      const activeAdmins = await countActiveAdminRoleUsers();
      if (activeAdmins <= 1) {
        res.status(400).json({ error: "last_active_admin" });
        return;
      }
    }
    const removed = await deleteAdminAuthUserById(id);
    if (!removed) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await insertAdminAuthAuditLog({
      username: principal?.username ?? "",
      action: "admin.auth.user_deleted",
      meta: { deletedId: id, deletedUsername: target.username, deletedRole: target.role },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/**
 * Bearer nur für `/admin/*`-JSON — nicht `router.use()` auf die ganze Router-Instanz,
 * sonst würde jede später im Index gemountete Route (z. B. `GET /rides`) fälschlich 401 bekommen.
 */
const adminJson: IRouter = Router();
adminJson.use(requireAdminApiBearer);
/** Krankenkassen-Modus: nur Whitelist-DTO, kein Mix mit /panel/v1. */
adminJson.use("/insurance", adminInsuranceRouter);

const adminFleetUploadRoot =
  (process.env.FLEET_UPLOAD_DIR ?? "").trim() ||
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "fleet-uploads");

adminJson.get("/stats", async (req, res, next) => {
  try {
    if (!canAccessAdminStats(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const q = req.query as Record<string, unknown>;
    const revenueFrom = parseStatsRevenueBound(q.revenueFrom);
    const revenueTo = parseStatsRevenueBound(q.revenueTo);
    const stats = await getAdminStats(
      revenueFrom && revenueTo ? { revenueFrom, revenueTo } : {},
    );
    res.json({ ok: true, stats });
  } catch (e) {
    next(e);
  }
});

/** Operatives Tages-Dashboard: Agenda, Partner-Top, letzte Abschlüsse (camelCase wie /admin/rides). */
adminJson.get("/dashboard/overview", async (req, res, next) => {
  try {
    if (!canAccessAdminDashboardOverview(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const q = req.query as Record<string, string | undefined>;
    const bounds = parseAdminDashboardDayBounds(q.date);
    const prev = adminPreviousDayBounds(bounds);
    const dayRaw = typeof q.date === "string" ? q.date.trim() : "";
    const dayStr =
      /^\d{4}-\d{2}-\d{2}$/.test(dayRaw) ? dayRaw : bounds.start.toISOString().slice(0, 10);

    const [agendaRaw, partnerRaw, recentRaw, companies] = await Promise.all([
      listAdminRidesAgendaForDay(bounds),
      listAdminPartnerDayStats(bounds, prev),
      listRidesAdminPage({ status: "completed" }, 20, 0),
      listCompanies(),
    ]);

    const nameById = new Map(companies.map((c) => [c.id, c.name]));
    const agenda = await attachAccessCodeSummariesToRides(agendaRaw);
    const recentCompleted = await attachAccessCodeSummariesToRides(recentRaw);
    const partnerDay = partnerRaw.map((p) => ({
      companyId: p.companyId,
      companyName: nameById.get(p.companyId) ?? p.companyName,
      ridesToday: p.ridesCount,
      revenueToday: p.completedRevenue,
      ridesPrevDay: p.ridesPrev,
      trend: p.ridesCount > p.ridesPrev ? "up" : p.ridesCount < p.ridesPrev ? "down" : "flat",
    }));

    res.json({
      ok: true,
      day: dayStr,
      agenda,
      partnerDay,
      recentCompleted,
    });
  } catch (e) {
    next(e);
  }
});

/** Operator-Cockpit: offene Warteschlangen & letzte eingehende Aufgaben (Admin/Service). */
adminJson.get("/dashboard/operator-snapshot", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const snapshot = await getAdminOperatorSnapshot();
    res.json({ ok: true, snapshot });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/finance/summary", async (req, res, next) => {
  try {
    if (!canAccessAdminStats(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const q = req.query as Record<string, unknown>;
    const dateFrom = parseStatsRevenueBound(q.date_from);
    const dateTo = parseStatsRevenueBound(q.date_to);
    const summary = await getAdminFinanceSummary({ dateFrom, dateTo });
    res.json({
      ok: true,
      dateFrom: dateFrom?.toISOString() ?? null,
      dateTo: dateTo?.toISOString() ?? null,
      summary,
    });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/finance/ride-financials", async (req, res, next) => {
  try {
    if (!canAccessAdminStats(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const q = req.query as Record<string, string | undefined>;
    const { page, pageSize, offset } = parsePagination(req);
    const filters = {
      dateFrom: parseIsoDateParam(q.date_from, false),
      dateTo: parseIsoDateParam(q.date_to, true),
      payerType: q.payer_type,
      billingStatus: q.billing_status,
      settlementStatus: q.settlement_status,
      partnerCompanyId: q.partner_company_id,
      serviceProviderCompanyId: q.service_provider_company_id,
      locked: parseBooleanParam(q.locked),
      hasInvoice: parseBooleanParam(q.has_invoice),
      search: q.search,
    };
    const [total, items] = await Promise.all([
      countRideFinancialsAdmin(filters),
      listRideFinancialsAdmin({ filters, limit: pageSize, offset }),
    ]);
    res.json({ ok: true, total, page, pageSize, items });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/finance/ride-financials/:rideId", async (req, res, next) => {
  try {
    if (!canAccessAdminStats(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const detail = await getRideFinancialDetailAdmin(req.params.rideId);
    if (!detail) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const eligibility = await getFinanceEligibilitySummaryForRide(req.params.rideId);
    res.json({
      ok: true,
      snapshot: detail,
      invoiceLinkage: detail.invoice_links,
      settlementLinkage: detail.settlement_links,
      auditEntries: detail.audit_entries,
      eligibility,
    });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/finance/invoices", async (req, res, next) => {
  try {
    if (!canAccessAdminStats(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const q = req.query as Record<string, string | undefined>;
    const filters = {
      companyId: q.company_id,
      status: q.status,
      type: q.invoice_type,
    };
    const { page, pageSize, offset } = parsePagination(req);
    const [total, items] = await Promise.all([
      countInvoicesAdmin(filters),
      listInvoicesAdmin({ filters, limit: pageSize, offset }),
    ]);
    res.json({ ok: true, total, page, pageSize, items });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/finance/invoices/:invoiceId", async (req, res, next) => {
  try {
    if (!canAccessAdminStats(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const item = await findInvoiceAdmin(req.params.invoiceId);
    if (!item) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/finance/settlements", async (req, res, next) => {
  try {
    if (!canAccessAdminStats(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const q = req.query as Record<string, string | undefined>;
    const filters = {
      companyId: q.company_id,
      status: q.status,
    };
    const { page, pageSize, offset } = parsePagination(req);
    const [total, items] = await Promise.all([
      countSettlementsAdmin(filters),
      listSettlementsAdmin({ filters, limit: pageSize, offset }),
    ]);
    res.json({ ok: true, total, page, pageSize, items });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/finance/settlements/:settlementId", async (req, res, next) => {
  try {
    if (!canAccessAdminStats(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const item = await findSettlementAdmin(req.params.settlementId);
    if (!item) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/finance/payments", async (req, res, next) => {
  try {
    if (!canAccessAdminStats(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const q = req.query as Record<string, string | undefined>;
    const filters = {
      targetType: q.target_type,
      status: q.status,
      companyId: q.company_id,
    };
    const { page, pageSize, offset } = parsePagination(req);
    const [total, items] = await Promise.all([
      countPaymentsAdmin(filters),
      listPaymentsAdmin({ filters, limit: pageSize, offset }),
    ]);
    res.json({ ok: true, total, page, pageSize, items });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/finance/audit", async (req, res, next) => {
  try {
    if (!canAccessAdminStats(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const q = req.query as Record<string, string | undefined>;
    const filters = {
      entityType: q.entity_type,
      action: q.action,
      entityId: q.entity_id,
    };
    const { page, pageSize, offset } = parsePagination(req);
    const [total, items] = await Promise.all([
      countFinancialAuditAdmin(filters),
      listFinancialAuditAdmin({ filters, limit: pageSize, offset }),
    ]);
    res.json({ ok: true, total, page, pageSize, items });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/companies", async (req, res, next) => {
  try {
    const role = adminConsoleRole(req);
    if (!canReadAdminCompaniesList(role)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const items = await listCompanies();
    const scope = req.adminAuth?.scopeCompanyId?.trim();
    const filtered =
      role === "hotel" && scope ? items.filter((c) => c.id === scope) : items;
    res.json({ ok: true, items: filtered, panelModuleCatalog: PANEL_MODULE_DEFINITIONS });
  } catch (e) {
    next(e);
  }
});

/** Plattform-Admin: Mandantenzentrale (Lese-Modell, ein Objekt; kein PII/keine Diagnosen). */
adminJson.get("/companies/:companyId/mandate-read", async (req, res, next) => {
  try {
    const role = adminConsoleRole(req);
    if (!canReadAdminCompaniesList(role)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const companyId = String(req.params.companyId ?? "").trim();
    const scope = req.adminAuth?.scopeCompanyId?.trim();
    if (role === "hotel" && scope && companyId !== scope) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const data = await getCompanyMandateRead(companyId);
    if (!data) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, ...data });
  } catch (e) {
    next(e);
  }
});

/** Plattform-Admin: Taxi-Mandanten (Filter serverseitig, gleiche Rollen-Logik wie `/companies`). */
adminJson.get("/taxi-fleet-drivers/taxi-companies", async (req, res, next) => {
  try {
    const role = adminConsoleRole(req);
    if (!canReadAdminCompaniesList(role)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const all = await listCompanies();
    const scope = req.adminAuth?.scopeCompanyId?.trim();
    let items = all.filter((c) => c.company_kind === "taxi");
    if (role === "hotel" && scope) items = items.filter((c) => c.id === scope);
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/taxi-fleet-drivers/:companyId/drivers", async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const companyId = String(req.params.companyId ?? "").trim();
    const allowed = await requireTaxiCompanyForAdminPanel(req, res, companyId);
    if (!allowed) return;
    const drivers = await listAdminTaxiFleetDriverRows(companyId);
    res.json({ ok: true, companyId, drivers });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/taxi-fleet-drivers/:companyId/drivers/:driverId", async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const companyId = String(req.params.companyId ?? "").trim();
    const driverId = String(req.params.driverId ?? "").trim();
    const allowed = await requireTaxiCompanyForAdminPanel(req, res, companyId);
    if (!allowed) return;
    const driver = await getAdminTaxiFleetDriverDetail(companyId, driverId);
    if (!driver) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, companyId, driver });
  } catch (e) {
    next(e);
  }
});

/** Audit (`panel_audit_log`) für den Mandanten; optional `subject` = Fahrer-ID. */
adminJson.get("/taxi-fleet-drivers/:companyId/audit", async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const companyId = String(req.params.companyId ?? "").trim();
    const allowed = await requireTaxiCompanyForAdminPanel(req, res, companyId);
    if (!allowed) return;
    const subject = typeof req.query?.subjectId === "string" ? req.query.subjectId.trim() : undefined;
    const limit = typeof req.query?.limit === "string" ? Number(req.query.limit) : undefined;
    const entries = await listPanelAuditForCompany(companyId, { subjectId: subject, limit: Number.isFinite(limit) ? limit : undefined });
    res.json({ ok: true, companyId, entries });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/taxi-fleet-drivers/:companyId/drivers/:driverId/approval", async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const companyId = String(req.params.companyId ?? "").trim();
    const driverId = String(req.params.driverId ?? "").trim();
    const allowed = await requireTaxiCompanyForAdminPanel(req, res, companyId);
    if (!allowed) return;
    const body = (req.body ?? {}) as {
      status?: unknown;
      reason?: unknown;
      acknowledgeIncompleteDocuments?: unknown;
    };
    const raw = typeof body.status === "string" ? body.status.trim().toLowerCase() : "";
    const ackIncomplete = body.acknowledgeIncompleteDocuments === true;
    const adminId = await resolveAdminAuthUserIdForSupport(req);

    if (raw === "approved") {
      const r = await approveFleetDriverForCompany(companyId, driverId, {
        acknowledgeIncompleteDocuments: ackIncomplete,
      });
      if (!r.ok) {
        const m: Record<string, number> = {
          not_found: 404,
          not_pending: 409,
          incomplete_documents_ack_required: 409,
        };
        const gaps = !r.ok && r.error === "incomplete_documents_ack_required" && Array.isArray((r as { gaps?: string[] }).gaps)
          ? (r as { gaps: string[] }).gaps
          : undefined;
        res.status(m[r.error] ?? 400).json(
          gaps ? { error: r.error, gaps } : { error: r.error },
        );
        return;
      }
      await insertPanelAuditLog({
        id: randomUUID(),
        companyId,
        actorPanelUserId: null,
        action: "admin.fleet_driver.approval",
        subjectType: "fleet_driver",
        subjectId: driverId,
        meta: {
          nextStatus: raw,
          adminUserId: adminId,
          incompleteDocumentsAcknowledged: ackIncomplete,
        },
      });
      res.json({ ok: true });
      return;
    }

    if (raw === "rejected") {
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      const r = await rejectFleetDriverForCompany(companyId, driverId, reason);
      if (!r.ok) {
        const m: Record<string, number> = {
          not_found: 404,
          not_pending: 409,
          rejection_reason_required: 400,
        };
        res.status(m[r.error] ?? 400).json({ error: r.error });
        return;
      }
      await insertPanelAuditLog({
        id: randomUUID(),
        companyId,
        actorPanelUserId: null,
        action: "admin.fleet_driver.approval",
        subjectType: "fleet_driver",
        subjectId: driverId,
        meta: { nextStatus: raw, reason: reason.slice(0, 500), adminUserId: adminId },
      });
      res.json({ ok: true });
      return;
    }

    if (raw === "missing_documents") {
      const r = await markFleetDriverMissingDocumentsForCompany(companyId, driverId);
      if (!r.ok) {
        res.status(r.error === "not_found" ? 404 : r.error === "invalid_state" ? 409 : 400).json({
          error: r.error,
        });
        return;
      }
      await insertPanelAuditLog({
        id: randomUUID(),
        companyId,
        actorPanelUserId: null,
        action: "admin.fleet_driver.missing_documents",
        subjectType: "fleet_driver",
        subjectId: driverId,
        meta: { adminUserId: adminId },
      });
      res.json({ ok: true });
      return;
    }

    const allowedS: FleetDriverApprovalStatus[] = ["pending", "in_review"];
    if (!allowedS.includes(raw as FleetDriverApprovalStatus)) {
      res.status(400).json({ error: "status_invalid" });
      return;
    }
    const r = await setFleetDriverApprovalStatusOnlyForCompany(companyId, driverId, raw as FleetDriverApprovalStatus);
    if (!r.ok) {
      res.status(r.error === "not_found" ? 404 : 400).json({ error: r.error });
      return;
    }
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId,
      actorPanelUserId: null,
      action: "admin.fleet_driver.approval",
      subjectType: "fleet_driver",
      subjectId: driverId,
      meta: { nextStatus: raw, adminUserId: adminId },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/taxi-fleet-drivers/:companyId/drivers/:driverId/suspend", async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const companyId = String(req.params.companyId ?? "").trim();
    const driverId = String(req.params.driverId ?? "").trim();
    const allowed = await requireTaxiCompanyForAdminPanel(req, res, companyId);
    if (!allowed) return;
    const b = (req.body ?? {}) as { reason?: unknown; adminInternalNote?: unknown };
    const reason = typeof b.reason === "string" ? b.reason : "";
    const adminNote = typeof b.adminInternalNote === "string" ? b.adminInternalNote : undefined;
    const ok = await adminSuspendFleetDriver(companyId, driverId, reason);
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (adminNote !== undefined) {
      await adminPatchFleetDriverAdminFields(companyId, driverId, { adminInternalNote: adminNote });
    }
    const adminId = await resolveAdminAuthUserIdForSupport(req);
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId,
      actorPanelUserId: null,
      action: "admin.fleet_driver.suspended",
      subjectType: "fleet_driver",
      subjectId: driverId,
      meta: { reason: String(reason).slice(0, 500), adminUserId: adminId },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/taxi-fleet-drivers/:companyId/drivers/:driverId/activate", async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const companyId = String(req.params.companyId ?? "").trim();
    const driverId = String(req.params.driverId ?? "").trim();
    const allowed = await requireTaxiCompanyForAdminPanel(req, res, companyId);
    if (!allowed) return;
    const ok = await adminActivateFleetDriver(companyId, driverId);
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const adminId = await resolveAdminAuthUserIdForSupport(req);
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId,
      actorPanelUserId: null,
      action: "admin.fleet_driver.activated",
      subjectType: "fleet_driver",
      subjectId: driverId,
      meta: { adminUserId: adminId },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** Operator: Einsatzbereitschaft in der Fahrer-App trotz fehlender Nachweise (nur harte Stopps bleiben). */
adminJson.post("/taxi-fleet-drivers/:companyId/drivers/:driverId/readiness-override-system", async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const companyId = String(req.params.companyId ?? "").trim();
    const driverId = String(req.params.driverId ?? "").trim();
    const allowed = await requireTaxiCompanyForAdminPanel(req, res, companyId);
    if (!allowed) return;
    const raw = (req.body as { enabled?: unknown })?.enabled;
    const enabled = raw === true;
    const disabled = raw === false;
    if (!enabled && !disabled) {
      res.status(400).json({ error: "body_enabled_boolean_required", hint: "Send {\"enabled\": true} or false." });
      return;
    }
    const ok = await setFleetDriverReadinessOverrideSystem(companyId, driverId, enabled);
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const adminId = await resolveAdminAuthUserIdForSupport(req);
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId,
      actorPanelUserId: null,
      action: "admin.fleet_driver.readiness_override_system",
      subjectType: "fleet_driver",
      subjectId: driverId,
      meta: { enabled, adminUserId: adminId },
    });
    res.json({ ok: true, enabled });
  } catch (e) {
    next(e);
  }
});

adminJson.patch("/taxi-fleet-drivers/:companyId/drivers/:driverId/notes", async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const companyId = String(req.params.companyId ?? "").trim();
    const driverId = String(req.params.driverId ?? "").trim();
    const allowed = await requireTaxiCompanyForAdminPanel(req, res, companyId);
    if (!allowed) return;
    const b = (req.body ?? {}) as { adminInternalNote?: unknown; suspensionReason?: unknown };
    const adminInternalNote = typeof b.adminInternalNote === "string" ? b.adminInternalNote : undefined;
    const suspensionReason = typeof b.suspensionReason === "string" ? b.suspensionReason : undefined;
    if (adminInternalNote === undefined && suspensionReason === undefined) {
      res.status(400).json({ error: "no_fields" });
      return;
    }
    const ok = await adminPatchFleetDriverAdminFields(companyId, driverId, {
      adminInternalNote,
      suspensionReason,
    });
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const adminId = await resolveAdminAuthUserIdForSupport(req);
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId,
      actorPanelUserId: null,
      action: "admin.fleet_driver.notes_patched",
      subjectType: "fleet_driver",
      subjectId: driverId,
      meta: {
        hasAdminNote: adminInternalNote !== undefined,
        hasSuspensionReason: suspensionReason !== undefined,
        adminUserId: adminId,
      },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** Gleiche Mandanten-Audit-Logik wie Fahrer: Fahrzeuge pro Taxi-Firma. */
adminJson.get("/taxi-fleet-vehicles/:companyId/vehicles", async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const companyId = String(req.params.companyId ?? "").trim();
    const allowed = await requireTaxiCompanyForAdminPanel(req, res, companyId);
    if (!allowed) return;
    const items = await listAdminTaxiFleetVehicleRows(companyId);
    res.json({ ok: true, companyId, items });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/taxi-fleet-vehicles/:companyId/vehicles/:vehicleId", async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const companyId = String(req.params.companyId ?? "").trim();
    const vehicleId = String(req.params.vehicleId ?? "").trim();
    const allowed = await requireTaxiCompanyForAdminPanel(req, res, companyId);
    if (!allowed) return;
    const detail = await getAdminTaxiFleetVehicleDetail(companyId, vehicleId);
    if (!detail) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, ...detail });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/taxi-fleet-vehicles/:companyId/audit", async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const companyId = String(req.params.companyId ?? "").trim();
    const allowed = await requireTaxiCompanyForAdminPanel(req, res, companyId);
    if (!allowed) return;
    const subject = typeof req.query?.subjectId === "string" ? req.query.subjectId.trim() : undefined;
    const limit = typeof req.query?.limit === "string" ? Number(req.query.limit) : undefined;
    const entries = await listPanelAuditForCompany(companyId, {
      subjectId: subject,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    res.json({ ok: true, companyId, entries });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/taxi-fleet-vehicles/:companyId/vehicles/:vehicleId/approve", async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const companyId = String(req.params.companyId ?? "").trim();
    const vehicleId = String(req.params.vehicleId ?? "").trim();
    const allowed = await requireTaxiCompanyForAdminPanel(req, res, companyId);
    if (!allowed) return;
    if (!(await findFleetVehicleInCompany(vehicleId, companyId))) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const adminId = await resolveAdminAuthUserIdForSupport(req);
    const ack =
      (req.body as { acknowledgeIncompleteDocuments?: unknown } | undefined)?.acknowledgeIncompleteDocuments === true;
    const r = await setFleetVehicleApprovalByAdmin(vehicleId, {
      nextStatus: "approved",
      adminUserId: adminId,
      acknowledgeIncompleteDocuments: ack,
    });
    if (!r.ok) {
      const m: Record<string, number> = {
        not_found: 404,
        not_pending: 409,
        incomplete_documents_ack_required: 409,
      };
      const gaps =
        !r.ok && r.error === "incomplete_documents_ack_required" && Array.isArray((r as { gaps?: string[] }).gaps)
          ? (r as { gaps: string[] }).gaps
          : undefined;
      res.status(m[r.error] ?? 400).json(gaps ? { error: r.error, gaps } : { error: r.error });
      return;
    }
    const d0 = await getFleetVehicleAdminDetail(vehicleId);
    if (d0) {
      await insertPanelAuditLog({
        id: randomUUID(),
        companyId,
        actorPanelUserId: null,
        action: "admin.fleet_vehicle.approved",
        subjectType: "fleet_vehicle",
        subjectId: vehicleId,
        meta: { adminUserId: adminId, incompleteDocumentsAcknowledged: ack },
      });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/taxi-fleet-vehicles/:companyId/vehicles/:vehicleId/reject", async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const companyId = String(req.params.companyId ?? "").trim();
    const vehicleId = String(req.params.vehicleId ?? "").trim();
    const allowed = await requireTaxiCompanyForAdminPanel(req, res, companyId);
    if (!allowed) return;
    if (!(await findFleetVehicleInCompany(vehicleId, companyId))) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const reason = typeof (req.body as { reason?: unknown })?.reason === "string"
      ? (req.body as { reason: string }).reason.trim()
      : "";
    const adminId = await resolveAdminAuthUserIdForSupport(req);
    const r = await setFleetVehicleApprovalByAdmin(vehicleId, {
      nextStatus: "rejected",
      rejectionReason: reason,
      adminUserId: adminId,
    });
    if (!r.ok) {
      const m: Record<string, number> = {
        not_found: 404,
        not_pending: 409,
        rejection_reason_required: 400,
      };
      res.status(m[r.error] ?? 400).json({ error: r.error });
      return;
    }
    const d0 = await getFleetVehicleAdminDetail(vehicleId);
    if (d0) {
      await insertPanelAuditLog({
        id: randomUUID(),
        companyId,
        actorPanelUserId: null,
        action: "admin.fleet_vehicle.rejected",
        subjectType: "fleet_vehicle",
        subjectId: vehicleId,
        meta: { reason: reason.slice(0, 500), adminUserId: adminId },
      });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/taxi-fleet-vehicles/:companyId/vehicles/:vehicleId/mark-missing-documents", async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const companyId = String(req.params.companyId ?? "").trim();
    const vehicleId = String(req.params.vehicleId ?? "").trim();
    const allowed = await requireTaxiCompanyForAdminPanel(req, res, companyId);
    if (!allowed) return;
    if (!(await findFleetVehicleInCompany(vehicleId, companyId))) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const adminId = await resolveAdminAuthUserIdForSupport(req);
    const r = await setFleetVehicleMissingDocumentsByAdmin(vehicleId, { adminUserId: adminId });
    if (!r.ok) {
      res.status(r.error === "not_found" ? 404 : r.error === "invalid_state" ? 409 : 400).json({ error: r.error });
      return;
    }
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId,
      actorPanelUserId: null,
      action: "admin.fleet_vehicle.missing_documents",
      subjectType: "fleet_vehicle",
      subjectId: vehicleId,
      meta: { adminUserId: adminId },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/taxi-fleet-vehicles/:companyId/vehicles/:vehicleId/block", async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const companyId = String(req.params.companyId ?? "").trim();
    const vehicleId = String(req.params.vehicleId ?? "").trim();
    const allowed = await requireTaxiCompanyForAdminPanel(req, res, companyId);
    if (!allowed) return;
    if (!(await findFleetVehicleInCompany(vehicleId, companyId))) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const b = (req.body ?? {}) as { blockReason?: unknown; adminInternalNote?: unknown };
    const blockReason = typeof b.blockReason === "string" ? b.blockReason : "";
    const adminNote = typeof b.adminInternalNote === "string" ? b.adminInternalNote : undefined;
    const adminId = await resolveAdminAuthUserIdForSupport(req);
    const r = await forceBlockFleetVehicleByAdmin(vehicleId, {
      adminUserId: adminId,
      blockReason,
      adminInternalNote: adminNote,
    });
    if (!r.ok) {
      res
        .status(r.error === "not_found" ? 404 : r.error === "already_blocked" ? 409 : 400)
        .json({ error: r.error });
      return;
    }
    const d0 = await getFleetVehicleAdminDetail(vehicleId);
    if (d0) {
      await insertPanelAuditLog({
        id: randomUUID(),
        companyId,
        actorPanelUserId: null,
        action: "admin.fleet_vehicle.blocked",
        subjectType: "fleet_vehicle",
        subjectId: vehicleId,
        meta: { blockReason: String(blockReason).slice(0, 500), adminUserId: adminId },
      });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/taxi-fleet-vehicles/:companyId/vehicles/:vehicleId/unblock", async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const companyId = String(req.params.companyId ?? "").trim();
    const vehicleId = String(req.params.vehicleId ?? "").trim();
    const allowed = await requireTaxiCompanyForAdminPanel(req, res, companyId);
    if (!allowed) return;
    if (!(await findFleetVehicleInCompany(vehicleId, companyId))) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const adminId = await resolveAdminAuthUserIdForSupport(req);
    const r = await unblockFleetVehicleByAdmin(vehicleId, adminId);
    if (!r.ok) {
      res.status(r.error === "not_found" ? 404 : r.error === "not_blocked" ? 409 : 400).json({ error: r.error });
      return;
    }
    const d0 = await getFleetVehicleAdminDetail(vehicleId);
    if (d0) {
      await insertPanelAuditLog({
        id: randomUUID(),
        companyId,
        actorPanelUserId: null,
        action: "admin.fleet_vehicle.unblocked",
        subjectType: "fleet_vehicle",
        subjectId: vehicleId,
        meta: { adminUserId: adminId },
      });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminJson.patch("/taxi-fleet-vehicles/:companyId/vehicles/:vehicleId/notes", async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const companyId = String(req.params.companyId ?? "").trim();
    const vehicleId = String(req.params.vehicleId ?? "").trim();
    const allowed = await requireTaxiCompanyForAdminPanel(req, res, companyId);
    if (!allowed) return;
    const b = (req.body ?? {}) as { adminInternalNote?: unknown; blockReason?: unknown };
    const adminInternalNote = typeof b.adminInternalNote === "string" ? b.adminInternalNote : undefined;
    const blockReason = typeof b.blockReason === "string" ? b.blockReason : undefined;
    if (adminInternalNote === undefined && blockReason === undefined) {
      res.status(400).json({ error: "no_fields" });
      return;
    }
    const ok = await adminPatchFleetVehicleFields(companyId, vehicleId, { adminInternalNote, blockReason });
    if (!ok.ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const adminId = await resolveAdminAuthUserIdForSupport(req);
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId,
      actorPanelUserId: null,
      action: "admin.fleet_vehicle.notes_patched",
      subjectType: "fleet_vehicle",
      subjectId: vehicleId,
      meta: {
        hasAdminNote: adminInternalNote !== undefined,
        hasBlockReason: blockReason !== undefined,
        adminUserId: adminId,
      },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

function parseOptionalIsoTs(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Request-Feld `type` (optional Legacy: `tone`). Ungültig → null. */
function normalizeHomepageHintTypeBody(v: unknown): string | null {
  const raw = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (!raw || raw === "neutral") return "info";
  if (raw === "info" || raw === "success" || raw === "warning" || raw === "important") return raw;
  return null;
}

adminJson.get("/homepage-placeholders", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const items = await listHomepagePlaceholdersAdmin();
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/homepage-content", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const item = await getHomepageContentAdmin();
    res.json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

adminJson.patch("/homepage-content", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const b = (req.body ?? {}) as Record<string, unknown>;
    const toText = (v: unknown): string | undefined => {
      if (v === undefined) return undefined;
      return typeof v === "string" ? v.trim() : undefined;
    };
    const section2Cards =
      b.section2Cards === undefined
        ? undefined
        : Array.isArray(b.section2Cards)
          ? b.section2Cards.slice(0, 4).map((raw) => {
              const r = (raw ?? {}) as Record<string, unknown>;
              return {
                icon: typeof r.icon === "string" ? r.icon.trim() : "",
                title: typeof r.title === "string" ? r.title.trim() : "",
                body: typeof r.body === "string" ? r.body.trim() : "",
                ctaText: typeof r.ctaText === "string" ? r.ctaText.trim() : "",
                ctaLink: typeof r.ctaLink === "string" ? r.ctaLink.trim() : "",
                isActive: r.isActive !== false,
              };
            })
          : undefined;
    const servicesCards =
      b.servicesCards === undefined
        ? undefined
        : Array.isArray(b.servicesCards)
          ? b.servicesCards.slice(0, 3).map((raw) => {
              const r = (raw ?? {}) as Record<string, unknown>;
              return {
                icon: typeof r.icon === "string" ? r.icon.trim() : "",
                title: typeof r.title === "string" ? r.title.trim() : "",
                body: typeof r.body === "string" ? r.body.trim() : "",
                isActive: r.isActive !== false,
              };
            })
          : undefined;
    const manifestCards =
      b.manifestCards === undefined
        ? undefined
        : Array.isArray(b.manifestCards)
          ? b.manifestCards.slice(0, 4).map((raw) => {
              const r = (raw ?? {}) as Record<string, unknown>;
              return {
                num: typeof r.num === "string" ? r.num.trim() : "",
                icon: typeof r.icon === "string" ? r.icon.trim() : "",
                title: typeof r.title === "string" ? r.title.trim() : "",
                body: typeof r.body === "string" ? r.body.trim() : "",
                ctaText: typeof r.ctaText === "string" ? r.ctaText.trim() : "",
                ctaLink: typeof r.ctaLink === "string" ? r.ctaLink.trim() : "",
                isActive: r.isActive !== false,
              };
            })
          : undefined;
    const item = await patchHomepageContentAdmin(
      {
        section2Title: toText(b.section2Title),
        section2Cards,
        servicesKicker: toText(b.servicesKicker),
        servicesTitle: toText(b.servicesTitle),
        servicesSubline: toText(b.servicesSubline),
        servicesCards,
        manifestKicker: toText(b.manifestKicker),
        manifestTitle: toText(b.manifestTitle),
        manifestSubline: toText(b.manifestSubline),
        manifestCards,
        heroHeadline: toText(b.heroHeadline),
        heroSubline: toText(b.heroSubline),
        cta1Text: toText(b.cta1Text),
        cta1Link: toText(b.cta1Link),
        cta2Text: toText(b.cta2Text),
        cta2Link: toText(b.cta2Link),
        noticeText: toText(b.noticeText),
        noticeActive: typeof b.noticeActive === "boolean" ? b.noticeActive : undefined,
      },
      req.adminAuth?.adminUserId ?? null,
    );
    if (!item) {
      res.status(503).json({ error: "patch_failed" });
      return;
    }
    res.json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/homepage-faq", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const items = await listHomepageFaqAdmin();
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/homepage-faq", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const b = (req.body ?? {}) as Record<string, unknown>;
    const question = typeof b.question === "string" ? b.question.trim() : "";
    const answer = typeof b.answer === "string" ? b.answer.trim() : "";
    if (!question || !answer) {
      res.status(400).json({ error: "question_answer_required" });
      return;
    }
    const sortOrder = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 0;
    const item = await createHomepageFaqItem({
      question,
      answer,
      sortOrder,
      isActive: b.isActive !== false,
      actorAdminUserId: req.adminAuth?.adminUserId ?? null,
    });
    if (!item) {
      res.status(503).json({ error: "create_failed" });
      return;
    }
    res.status(201).json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

adminJson.patch("/homepage-faq/:id", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const b = (req.body ?? {}) as Record<string, unknown>;
    const patch: {
      question?: string;
      answer?: string;
      sortOrder?: number;
      isActive?: boolean;
    } = {};
    if (typeof b.question === "string") patch.question = b.question.trim();
    if (typeof b.answer === "string") patch.answer = b.answer.trim();
    if (Number.isFinite(Number(b.sortOrder))) patch.sortOrder = Number(b.sortOrder);
    if (typeof b.isActive === "boolean") patch.isActive = b.isActive;
    const item = await patchHomepageFaqItem(req.params.id, patch, req.adminAuth?.adminUserId ?? null);
    if (!item) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

adminJson.delete("/homepage-faq/:id", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const ok = await deleteHomepageFaqItem(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/homepage-how", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const items = await listHomepageHowAdmin();
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/homepage-how", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const b = (req.body ?? {}) as Record<string, unknown>;
    const title = typeof b.title === "string" ? b.title.trim() : "";
    const body = typeof b.body === "string" ? b.body.trim() : "";
    if (!title || !body) {
      res.status(400).json({ error: "title_body_required" });
      return;
    }
    const sortOrder = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 0;
    const item = await createHomepageHowStep({
      icon: typeof b.icon === "string" ? b.icon.trim() : "",
      title,
      body,
      sortOrder,
      isActive: b.isActive !== false,
      actorAdminUserId: req.adminAuth?.adminUserId ?? null,
    });
    if (!item) {
      res.status(503).json({ error: "create_failed" });
      return;
    }
    res.status(201).json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

adminJson.patch("/homepage-how/:id", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const b = (req.body ?? {}) as Record<string, unknown>;
    const patch: {
      icon?: string;
      title?: string;
      body?: string;
      sortOrder?: number;
      isActive?: boolean;
    } = {};
    if (typeof b.icon === "string") patch.icon = b.icon.trim();
    if (typeof b.title === "string") patch.title = b.title.trim();
    if (typeof b.body === "string") patch.body = b.body.trim();
    if (Number.isFinite(Number(b.sortOrder))) patch.sortOrder = Number(b.sortOrder);
    if (typeof b.isActive === "boolean") patch.isActive = b.isActive;
    const item = await patchHomepageHowStep(req.params.id, patch, req.adminAuth?.adminUserId ?? null);
    if (!item) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

adminJson.delete("/homepage-how/:id", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const ok = await deleteHomepageHowStep(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/homepage-trust", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const items = await listHomepageTrustAdmin();
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/homepage-trust", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const b = (req.body ?? {}) as Record<string, unknown>;
    const value = typeof b.value === "string" ? b.value.trim() : "";
    const label = typeof b.label === "string" ? b.label.trim() : "";
    if (!value || !label) {
      res.status(400).json({ error: "value_label_required" });
      return;
    }
    const sortOrder = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 0;
    const item = await createHomepageTrustMetric({
      value,
      label,
      description: typeof b.description === "string" ? b.description.trim() : "",
      sortOrder,
      isActive: b.isActive !== false,
      actorAdminUserId: req.adminAuth?.adminUserId ?? null,
    });
    if (!item) {
      res.status(503).json({ error: "create_failed" });
      return;
    }
    res.status(201).json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

adminJson.patch("/homepage-trust/:id", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const b = (req.body ?? {}) as Record<string, unknown>;
    const patch: {
      value?: string;
      label?: string;
      description?: string;
      sortOrder?: number;
      isActive?: boolean;
    } = {};
    if (typeof b.value === "string") patch.value = b.value.trim();
    if (typeof b.label === "string") patch.label = b.label.trim();
    if (typeof b.description === "string") patch.description = b.description.trim();
    if (Number.isFinite(Number(b.sortOrder))) patch.sortOrder = Number(b.sortOrder);
    if (typeof b.isActive === "boolean") patch.isActive = b.isActive;
    const item = await patchHomepageTrustMetric(req.params.id, patch, req.adminAuth?.adminUserId ?? null);
    if (!item) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

adminJson.delete("/homepage-trust/:id", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const ok = await deleteHomepageTrustMetric(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/homepage-placeholders", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const b = (req.body ?? {}) as Record<string, unknown>;
    const title = typeof b.title === "string" ? b.title.trim() : "";
    const message = typeof b.message === "string" ? b.message.trim() : "";
    if (!title || !message) {
      res.status(400).json({ error: "title_message_required" });
      return;
    }
    const typeRaw = b.type !== undefined ? b.type : b.tone;
    const hintType = normalizeHomepageHintTypeBody(typeRaw);
    if (!hintType) {
      res.status(400).json({ error: "type_invalid" });
      return;
    }
    const sortOrder = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 0;
    const visibleFrom = parseOptionalIsoTs(b.visibleFrom);
    const visibleUntil = parseOptionalIsoTs(b.visibleUntil);
    if (visibleFrom === undefined || visibleUntil === undefined) {
      res.status(400).json({ error: "visible_from_until_invalid" });
      return;
    }
    const item = await createHomepagePlaceholder({
      title,
      message,
      ctaLabel: typeof b.ctaLabel === "string" ? b.ctaLabel.trim() : null,
      ctaUrl: typeof b.ctaUrl === "string" ? b.ctaUrl.trim() : null,
      type: hintType as "info" | "success" | "warning" | "important",
      isActive: b.isActive !== false,
      sortOrder,
      visibleFrom,
      visibleUntil,
      dismissKey: typeof b.dismissKey === "string" ? b.dismissKey.trim() : null,
      actorAdminUserId: req.adminAuth?.adminUserId ?? null,
    });
    if (!item) {
      res.status(503).json({ error: "create_failed" });
      return;
    }
    res.status(201).json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

adminJson.patch("/homepage-placeholders/:id", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "id_required" });
      return;
    }
    const b = (req.body ?? {}) as Record<string, unknown>;
    const typeRaw =
      b.type !== undefined ? b.type : b.tone !== undefined ? b.tone : undefined;
    const hintType =
      typeRaw === undefined ? undefined : normalizeHomepageHintTypeBody(typeRaw);
    if (hintType === null) {
      res.status(400).json({ error: "type_invalid" });
      return;
    }
    const visibleFrom = parseOptionalIsoTs(b.visibleFrom);
    const visibleUntil = parseOptionalIsoTs(b.visibleUntil);
    if (visibleFrom === undefined || visibleUntil === undefined) {
      res.status(400).json({ error: "visible_from_until_invalid" });
      return;
    }
    const item = await patchHomepagePlaceholder(id, {
      title: typeof b.title === "string" ? b.title.trim() : undefined,
      message: typeof b.message === "string" ? b.message.trim() : undefined,
      ctaLabel: b.ctaLabel === undefined ? undefined : typeof b.ctaLabel === "string" ? b.ctaLabel.trim() : null,
      ctaUrl: b.ctaUrl === undefined ? undefined : typeof b.ctaUrl === "string" ? b.ctaUrl.trim() : null,
      type: hintType as "info" | "success" | "warning" | "important" | undefined,
      isActive: typeof b.isActive === "boolean" ? b.isActive : undefined,
      sortOrder: Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : undefined,
      visibleFrom,
      visibleUntil,
      dismissKey: b.dismissKey === undefined ? undefined : typeof b.dismissKey === "string" ? b.dismissKey.trim() : null,
      actorAdminUserId: req.adminAuth?.adminUserId ?? null,
    });
    if (!item) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/app-operational", async (req, res, next) => {
  try {
    if (!canReadAdminCompaniesList(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const [config, serviceRegions] = await Promise.all([
      getOperationalConfigPayload(),
      listServiceRegionsForApi(),
    ]);
    res.json({ ok: true, config, serviceRegions });
  } catch (e) {
    next(e);
  }
});

adminJson.patch("/app-operational", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const before = await getOperationalConfigPayload();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (body.messages !== undefined) patch.messages = body.messages as Record<string, unknown>;
    if (body.commission !== undefined) patch.commission = body.commission as Record<string, unknown>;
    if (body.tariffs !== undefined) patch.tariffs = body.tariffs as Record<string, unknown>;
    if (body.dispatch !== undefined) patch.dispatch = body.dispatch as Record<string, unknown>;
    if (body.features !== undefined) patch.features = body.features as Record<string, unknown>;
    if (body.driverRules !== undefined) patch.driverRules = body.driverRules as Record<string, unknown>;
    if (body.bookingRules !== undefined) patch.bookingRules = body.bookingRules as Record<string, unknown>;
    if (body.system !== undefined) patch.system = body.system as Record<string, unknown>;
    if (body.version !== undefined) patch.version = body.version;
    const out = await updateOperationalConfigPayload(patch);
    if ("error" in out) {
      res.status(503).json({ error: "unavailable" });
      return;
    }
    await insertAdminAuthAuditLog({
      username: req.adminAuth?.username ?? "",
      action: "admin.app_operational.config_patched",
      meta: { before, after: out, keys: Object.keys(patch) },
    });
    res.json({ ok: true, config: out });
  } catch (e) {
    next(e);
  }
});

adminJson.patch("/app-operational/service-regions/:id", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "id_required" });
      return;
    }
    const beforeList = await listServiceRegionsForApi();
    const before = beforeList.find((r) => r.id === id) ?? null;
    const b = (req.body ?? {}) as Record<string, unknown>;
    const matchTerms =
      b.matchTerms !== undefined
        ? Array.isArray(b.matchTerms)
          ? b.matchTerms.map((x) => (typeof x === "string" ? x.trim() : String(x))).filter((s) => s.length > 0)
          : undefined
        : undefined;
    const pickNum = (k: string): number | null | undefined => {
      if (!(k in b)) return undefined;
      if (b[k] === null) return null;
      const n = Number(b[k]);
      return Number.isFinite(n) ? n : undefined;
    };
    const upd = await updateServiceRegionById(id, {
      label: typeof b.label === "string" ? b.label : undefined,
      matchTerms,
      isActive: typeof b.isActive === "boolean" ? b.isActive : undefined,
      sortOrder: Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : undefined,
      matchMode: typeof b.matchMode === "string" ? b.matchMode : undefined,
      centerLat: pickNum("centerLat"),
      centerLng: pickNum("centerLng"),
      radiusKm: pickNum("radiusKm"),
    });
    if (!upd) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const after = (await listServiceRegionsForApi()).find((r) => r.id === id) ?? null;
    await insertAdminAuthAuditLog({
      username: req.adminAuth?.username ?? "",
      action: "admin.app_operational.service_region_patched",
      meta: { id, before, after },
    });
    res.json({ ok: true, serviceRegion: after });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/app-operational/service-regions", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const b = (req.body ?? {}) as Record<string, unknown>;
    const label = typeof b.label === "string" ? b.label.trim() : "";
    const matchTerms = Array.isArray(b.matchTerms)
      ? b.matchTerms.map((x) => (typeof x === "string" ? x.trim() : String(x))).filter((s) => s.length > 0)
      : [];
    const matchMode = typeof b.matchMode === "string" && b.matchMode.trim() ? b.matchMode.trim() : "substring";
    const cLat = b.centerLat != null && Number.isFinite(Number(b.centerLat)) ? Number(b.centerLat) : null;
    const cLng = b.centerLng != null && Number.isFinite(Number(b.centerLng)) ? Number(b.centerLng) : null;
    const rKm = b.radiusKm != null && Number.isFinite(Number(b.radiusKm)) ? Number(b.radiusKm) : null;
    const isRadius = matchMode === "radius";
    if (!label) {
      res.status(400).json({ error: "label_required" });
      return;
    }
    if (isRadius) {
      if (cLat == null || cLng == null || rKm == null || rKm <= 0) {
        res.status(400).json({ error: "radius_region_requires_center_and_radius" });
        return;
      }
    } else if (matchTerms.length === 0) {
      res.status(400).json({ error: "label_and_matchTerms_required" });
      return;
    }
    const id = await insertServiceRegion({
      label,
      matchTerms,
      isActive: b.isActive !== false,
      matchMode,
      centerLat: cLat,
      centerLng: cLng,
      radiusKm: rKm,
    });
    const serviceRegions = await listServiceRegionsForApi();
    const serviceRegion = serviceRegions.find((r) => r.id === id) ?? null;
    await insertAdminAuthAuditLog({
      username: req.adminAuth?.username ?? "",
      action: "admin.app_operational.service_region_created",
      meta: { id, serviceRegion },
    });
    res.status(201).json({ ok: true, id, serviceRegion });
  } catch (e) {
    next(e);
  }
});

/**
 * Vorschau-Rechnung: gleiche Engine wie GET /api/fare-estimate, ungespeichertes
 * `regionTariff` (optional) auf globalen Tarif mergen.
 */
adminJson.post("/app-operational/preview-tariff-estimate", async (req, res, next) => {
  try {
    if (!canReadAdminCompaniesList(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const b = (req.body ?? {}) as Record<string, unknown>;
    const op = await getOperationalConfigPayload();
    const tRaw = (op as { tariffs?: unknown }).tariffs;
    const tSec: Record<string, unknown> = isPlainTariffObject(tRaw) ? tRaw : {};
    const regionT = b.regionTariff;
    const merged = mergeTariffsForServiceRegion(
      tSec,
      isPlainTariffObject(regionT) ? (regionT as Record<string, unknown>) : null,
    );
    const atStr = typeof b.at === "string" ? b.at.trim() : "";
    const at = atStr ? new Date(atStr) : new Date();
    const n0 = (v: unknown) => {
      const x = typeof v === "number" ? v : Number(v);
      return Number.isFinite(x) ? x : 0;
    };
    const distanceKm = n0(b.distanceKm);
    const tripMinutes = n0(b.tripMinutes);
    const waitingMinutes = n0(b.waitingMinutes);
    const vehicle = typeof b.vehicle === "string" && b.vehicle.trim() ? b.vehicle.trim().toLowerCase() : "standard";
    const serviceRegionId = typeof b.serviceRegionId === "string" && b.serviceRegionId.trim() ? b.serviceRegionId.trim() : null;
    const applyHolidaySurcharge = b.applyHolidaySurcharge === true;
    const applyAirportFlat = b.applyAirportFlat === true;
    const est = estimateTaxiFromMergedTariff(merged, {
      distanceKm: Math.max(0, distanceKm),
      tripMinutes: Math.max(0, tripMinutes),
      waitingMinutes: Math.max(0, waitingMinutes),
      vehicle,
      at: Number.isFinite(at.getTime()) ? at : new Date(),
      applyHolidaySurcharge,
      applyAirportFlat,
    });
    const regions = await listServiceRegionsForApi();
    const label = serviceRegionId ? (regions.find((r) => r.id === serviceRegionId)?.label ?? "Region") : "Vorschau";
    const profile = mergedTariffToPublicProfile(merged, serviceRegionId, label, null);
    res.json({
      ok: true,
      profile,
      estimate: {
        total: est.finalRounded,
        taxiTotal: est.finalRounded,
        onrodaTotal: est.finalRounded,
        breakdown: est.breakdown,
        engine: { subtotal: est.subtotal, afterMinFare: est.afterMinFare, afterSurcharges: est.afterSurcharges },
      },
    });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/companies/:companyId/kpis", async (req, res, next) => {
  try {
    const role = adminConsoleRole(req);
    if (!canReadAdminCompaniesList(role)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const scope = req.adminAuth?.scopeCompanyId?.trim();
    if (role === "hotel" && scope && req.params.companyId !== scope) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const company = await findCompanyById(req.params.companyId);
    if (!company) {
      res.status(404).json({ error: "company_not_found" });
      return;
    }
    const kpis = await getCompanyKpis(req.params.companyId);
    res.json({ ok: true, kpis });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/companies", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const b = req.body as { name?: unknown } & AdminCompanyUpdateBody;
    const name = typeof b.name === "string" ? b.name : "";
    const { name: _drop, ...rest } = b;
    const result = await insertAdminCompany({ name, ...rest });
    if ("error" in result) {
      const e = result.error;
      if (e === "db_insert_admin_company_failed" && "hint" in result && result.hint) {
        res.status(503).json({ error: e, hint: result.hint });
        return;
      }
      if (e.startsWith("db_schema_")) {
        res.status(503).json({
          error: e,
          hint:
            e === "db_schema_partner_panel_profile_locked"
              ? "Migration 031 (partner_panel_profile_locked) einspielen."
              : "Migration 032 (company_kind medical) einspielen.",
        });
        return;
      }
      res.status(400).json({ error: e });
      return;
    }
    res.status(201).json({ ok: true, item: result });
  } catch (e) {
    next(e);
  }
});

adminJson.patch("/companies/:companyId", async (req, res, next) => {
  try {
    const allowed = await requireCompanyRowForMutation(req, res, req.params.companyId);
    if (!allowed) return;
    const body = req.body as AdminCompanyUpdateBody;
    const item = await updateAdminCompany(req.params.companyId, body);
    if (!item) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

/**
 * Prüfung des aktuellen Firmen-Compliance-Dokuments (Gewerbe bzw. Versicherung) — Freigabe/Ablehnung inkl. optionaler Notiz.
 */
adminJson.patch("/companies/:companyId/compliance-documents/:kind", async (req, res, next) => {
  try {
    const allowed = await requireCompanyRowForMutation(req, res, req.params.companyId);
    if (!allowed) return;
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const kind = req.params.kind;
    if (kind !== "gewerbe" && kind !== "insurance") {
      res.status(400).json({ error: "invalid_kind" });
      return;
    }
    const b = req.body as { reviewStatus?: unknown; reviewNote?: unknown };
    const raw = typeof b.reviewStatus === "string" ? b.reviewStatus.trim().toLowerCase() : "";
    if (raw !== "approved" && raw !== "rejected") {
      res.status(400).json({ error: "invalid_review_status" });
      return;
    }
    const note = typeof b.reviewNote === "string" ? b.reviewNote : "";
    const r = await setCurrentComplianceDocumentReview(req.params.companyId, kind, {
      reviewStatus: raw,
      reviewNote: note,
    });
    if (!r.ok) {
      if (r.error === "no_current_document") {
        res.status(400).json({ error: r.error, hint: "Zuerst Nachweis-Datei hinterlegen (Partner-Upload o. Admin-Speicherpfad mit Migration 033)." });
        return;
      }
      res.status(503).json({ error: r.error, hint: "Migration 033 (company_compliance_documents) prüfen." });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/company-change-requests", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const statusRaw = typeof req.query?.status === "string" ? req.query.status.trim() : "";
    const status =
      statusRaw === "pending" || statusRaw === "approved" || statusRaw === "rejected"
        ? statusRaw
        : undefined;
    const rows = await listCompanyChangeRequestsAdmin(status ? { status } : undefined);
    res.json({ ok: true, requests: rows });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/company-change-requests/:id/decision", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const b = req.body as { status?: unknown; note?: unknown };
    const statusRaw = typeof b.status === "string" ? b.status.trim() : "";
    if (statusRaw !== "approved" && statusRaw !== "rejected") {
      res.status(400).json({ error: "invalid_status" });
      return;
    }
    const note = typeof b.note === "string" ? b.note.trim() : "";
    const row = await decideCompanyChangeRequest({
      id: req.params.id,
      status: statusRaw,
      note,
      adminUserId: null,
    });
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, request: row });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/support/threads", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const { page, pageSize, offset } = parsePagination(req);
    const status = parseSupportThreadStatus(req.query?.status);
    const companyId = typeof req.query?.companyId === "string" ? req.query.companyId.trim() : "";
    const category = parseSupportCategory(req.query?.category);
    const q = typeof req.query?.q === "string" ? req.query.q.trim() : "";
    const threads = await listSupportThreadsAdmin({
      status: status ?? undefined,
      companyId: companyId || undefined,
      category: category ?? undefined,
      q: q || undefined,
      limit: pageSize,
      offset,
    });
    res.json({ ok: true, threads, page, pageSize });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/support/threads/:threadId", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const threadId = String(req.params.threadId ?? "").trim();
    if (!threadId) {
      res.status(400).json({ error: "id_required" });
      return;
    }
    const row = await getSupportThreadAdmin(threadId);
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, thread: row.thread, messages: row.messages, companyName: row.companyName });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/support/threads/:threadId/messages", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const threadId = String(req.params.threadId ?? "").trim();
    const b = req.body as { body?: unknown };
    const body = typeof b.body === "string" ? b.body.trim() : "";
    if (!threadId) {
      res.status(400).json({ error: "id_required" });
      return;
    }
    if (!body || body.length > 10000) {
      res.status(400).json({ error: "body_invalid" });
      return;
    }
    const senderAdminUserId = await resolveAdminAuthUserIdForSupport(req);
    const result = await insertAdminSupportMessage({
      messageId: randomUUID(),
      threadId,
      body,
      senderAdminUserId,
    });
    if (!result.ok) {
      if (result.error === "closed") {
        res.status(409).json({ error: "thread_closed" });
        return;
      }
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(201).json({ ok: true, message: result.message, threadStatus: result.threadStatus });
  } catch (e) {
    next(e);
  }
});

adminJson.patch("/support/threads/:threadId", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const threadId = String(req.params.threadId ?? "").trim();
    const b = req.body as { status?: unknown };
    const st = parseSupportThreadStatus(b.status);
    if (!threadId) {
      res.status(400).json({ error: "id_required" });
      return;
    }
    if (!st) {
      res.status(400).json({ error: "invalid_status" });
      return;
    }
    const updated = await patchSupportThreadStatusAdmin({ threadId, status: st });
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, thread: updated });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/company-registration-requests", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const pendingRaw = typeof req.query?.pending === "string" ? req.query.pending.trim() : "";
    const pendingQueue = pendingRaw === "1" || pendingRaw.toLowerCase() === "true";
    if (pendingQueue) {
      const items = await listPartnerRegistrationPendingQueueAdmin();
      res.json({ ok: true, items, pendingQueue: true });
      return;
    }
    const statusRaw = typeof req.query?.status === "string" ? req.query.status.trim() : "";
    if (statusRaw && !isRegistrationStatus(statusRaw)) {
      res.status(400).json({ error: "status_invalid" });
      return;
    }
    const items = await listPartnerRegistrationRequestsAdmin(
      statusRaw ? statusRaw : undefined,
    );
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

adminJson.patch("/company-registration-requests/:id", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const existing = await findPartnerRegistrationRequestById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const b = (req.body ?? {}) as Record<string, unknown>;
    const statusRaw = typeof b.status === "string" ? b.status.trim() : "";
    const verificationRaw = typeof b.verificationStatus === "string" ? b.verificationStatus.trim() : "";
    const complianceRaw = typeof b.complianceStatus === "string" ? b.complianceStatus.trim() : "";
    const contractRaw = typeof b.contractStatus === "string" ? b.contractStatus.trim() : "";
    if (statusRaw && !isRegistrationStatus(statusRaw)) {
      res.status(400).json({ error: "status_invalid" });
      return;
    }
    const verificationStatus =
      verificationRaw === "pending" ||
      verificationRaw === "in_review" ||
      verificationRaw === "verified" ||
      verificationRaw === "rejected"
        ? verificationRaw
        : undefined;
    const complianceStatus =
      complianceRaw === "pending" ||
      complianceRaw === "complete" ||
      complianceRaw === "missing_documents" ||
      complianceRaw === "rejected"
        ? complianceRaw
        : undefined;
    const contractStatus =
      contractRaw === "inactive" ||
      contractRaw === "pending" ||
      contractRaw === "active" ||
      contractRaw === "suspended" ||
      contractRaw === "terminated"
        ? contractRaw
        : undefined;

    const strField = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : undefined);
    const masterAttempted =
      b.partnerType !== undefined ||
      b.companyName !== undefined ||
      b.legalForm !== undefined ||
      b.usesVouchers !== undefined ||
      b.contactFirstName !== undefined ||
      b.contactLastName !== undefined ||
      b.email !== undefined ||
      b.phone !== undefined ||
      b.addressLine1 !== undefined ||
      b.addressLine2 !== undefined ||
      b.ownerName !== undefined ||
      b.dispoPhone !== undefined ||
      b.postalCode !== undefined ||
      b.city !== undefined ||
      b.country !== undefined ||
      b.taxId !== undefined ||
      b.vatId !== undefined ||
      b.concessionNumber !== undefined ||
      b.desiredRegion !== undefined ||
      b.notes !== undefined ||
      b.requestedUsage !== undefined;

    if (existing.linkedCompanyId && masterAttempted) {
      res.status(409).json({
        error: "registration_locked",
        hint:
          "Die Anfrage ist mit einem Mandanten verknüpft. Stammdaten und Anfrage-Typ können hier nicht mehr geändert werden — bitte im Unternehmensprofil anpassen.",
      });
      return;
    }

    const patchBody: PartnerRegistrationAdminPatch = {
      ...(statusRaw ? { status: statusRaw } : {}),
      ...(verificationStatus ? { verificationStatus } : {}),
      ...(complianceStatus ? { complianceStatus } : {}),
      ...(contractStatus ? { contractStatus } : {}),
      ...(typeof b.missingDocumentsNote === "string"
        ? { missingDocumentsNote: b.missingDocumentsNote.trim() }
        : {}),
      ...(typeof b.adminNote === "string" ? { adminNote: b.adminNote.trim() } : {}),
    };

    if (b.partnerType !== undefined) {
      const pt = typeof b.partnerType === "string" ? b.partnerType.trim() : "";
      if (!isPartnerType(pt)) {
        res.status(400).json({ error: "partner_type_invalid" });
        return;
      }
      patchBody.partnerType = pt;
    }
    if (b.companyName !== undefined) {
      if (typeof b.companyName !== "string") {
        res.status(400).json({ error: "company_name_invalid" });
        return;
      }
      patchBody.companyName = b.companyName;
    }
    if (b.legalForm !== undefined && typeof b.legalForm === "string") patchBody.legalForm = b.legalForm;
    if (typeof b.usesVouchers === "boolean") patchBody.usesVouchers = b.usesVouchers;
    if (b.contactFirstName !== undefined && typeof b.contactFirstName === "string") {
      patchBody.contactFirstName = b.contactFirstName;
    }
    if (b.contactLastName !== undefined && typeof b.contactLastName === "string") {
      patchBody.contactLastName = b.contactLastName;
    }
    if (b.email !== undefined) {
      if (typeof b.email !== "string") {
        res.status(400).json({ error: "email_invalid" });
        return;
      }
      patchBody.email = b.email;
    }
    const phone = strField("phone");
    if (phone !== undefined) patchBody.phone = phone;
    const addressLine1 = strField("addressLine1");
    if (addressLine1 !== undefined) patchBody.addressLine1 = addressLine1;
    const addressLine2 = strField("addressLine2");
    if (addressLine2 !== undefined) patchBody.addressLine2 = addressLine2;
    const ownerName = strField("ownerName");
    if (ownerName !== undefined) patchBody.ownerName = ownerName;
    const dispoPhone = strField("dispoPhone");
    if (dispoPhone !== undefined) patchBody.dispoPhone = dispoPhone;
    const postalCode = strField("postalCode");
    if (postalCode !== undefined) patchBody.postalCode = postalCode;
    const city = strField("city");
    if (city !== undefined) patchBody.city = city;
    const country = strField("country");
    if (country !== undefined) patchBody.country = country;
    const taxId = strField("taxId");
    if (taxId !== undefined) patchBody.taxId = taxId;
    const vatId = strField("vatId");
    if (vatId !== undefined) patchBody.vatId = vatId;
    const concessionNumber = strField("concessionNumber");
    if (concessionNumber !== undefined) patchBody.concessionNumber = concessionNumber;
    const desiredRegion = strField("desiredRegion");
    if (desiredRegion !== undefined) patchBody.desiredRegion = desiredRegion;
    const notes = strField("notes");
    if (notes !== undefined) patchBody.notes = notes;

    if (b.requestedUsage !== undefined) {
      if (b.requestedUsage === null) {
        patchBody.requestedUsage = {};
      } else if (typeof b.requestedUsage === "object" && !Array.isArray(b.requestedUsage)) {
        patchBody.requestedUsage = b.requestedUsage as Record<string, unknown>;
      } else {
        res.status(400).json({ error: "requested_usage_invalid" });
        return;
      }
    }

    if (patchBody.companyName !== undefined && !String(patchBody.companyName).trim()) {
      res.status(400).json({ error: "company_name_empty" });
      return;
    }
    if (patchBody.email !== undefined && !String(patchBody.email).trim()) {
      res.status(400).json({ error: "email_empty" });
      return;
    }

    const item = await patchPartnerRegistrationRequest(req.params.id, patchBody);
    if (!item) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (statusRaw === "rejected" && b.notifyApplicantOnReject !== false) {
      const reasonFromBody =
        typeof b.rejectionReasonToApplicant === "string" ? b.rejectionReasonToApplicant.trim() : "";
      const reason = reasonFromBody || (typeof item.adminNote === "string" ? item.adminNote.trim() : "") || "";
      void sendPartnerRegistrationRejectionEmail({
        to: item.email,
        companyName: item.companyName,
        requestId: item.id,
        reason: reason || "Ihre Registrierungsanfrage wurde abgelehnt. Bei Rückfragen wenden Sie sich an unsere Geschäftsführung, falls angegeben.",
      }).catch((err) => {
        logger.warn({ err, requestId: item.id }, "partner registration rejection mail async failed");
      });
    }
    res.json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/company-registration-requests/:id", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const detail = await getPartnerRegistrationDetailAdmin(req.params.id);
    if (!detail) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, ...detail });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/company-registration-requests/:id/messages", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message) {
      res.status(400).json({ error: "message_required" });
      return;
    }
    const row = await findPartnerRegistrationRequestById(req.params.id);
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const actorLabel = req.adminAuth?.username ?? "admin";
    await addPartnerRegistrationMessage(row.id, "admin", actorLabel, message);
    await patchPartnerRegistrationRequest(row.id, { status: "in_review" });
    const mail = await sendPartnerRegistrationAdminMessageEmail({
      to: row.email,
      requestId: row.id,
      companyName: row.companyName,
      message,
      adminLabel: actorLabel,
    });
    res.status(201).json({ ok: true, mail: { sent: mail.ok, reason: mail.ok ? null : mail.reason } });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/company-registration-requests/:id/documents", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const row = await findPartnerRegistrationRequestById(req.params.id);
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const category = typeof req.body?.category === "string" ? req.body.category.trim() : "general";
    const fileName = typeof req.body?.fileName === "string" ? req.body.fileName.trim() : "";
    const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType.trim() : "application/octet-stream";
    const contentBase64 =
      typeof req.body?.contentBase64 === "string" ? req.body.contentBase64.trim() : "";
    if (!fileName || !contentBase64) {
      res.status(400).json({ error: "file_required" });
      return;
    }
    const actorLabel = req.adminAuth?.username ?? "admin";
    const doc = await addPartnerRegistrationDocument({
      requestId: row.id,
      category,
      originalFileName: fileName,
      mimeType,
      contentBase64,
      uploadedByActorType: "admin",
      uploadedByActorLabel: actorLabel,
    });
    if (!doc) {
      res.status(503).json({ error: "upload_failed" });
      return;
    }
    await addPartnerRegistrationTimelineEvent({
      requestId: row.id,
      actorType: "admin",
      actorLabel,
      eventType: "admin_document_added",
      message: `Admin-Dokument hinzugefügt: ${fileName}`,
      payload: { category },
    });
    res.status(201).json({ ok: true, document: mapDocRowForAdminList(doc) });
  } catch (e) {
    next(e);
  }
});

function registrationDocAllowsInlinePreview(mimeType: string): boolean {
  const m = (mimeType || "").toLowerCase().trim();
  if (m === "application/pdf") return true;
  return m.startsWith("image/");
}

adminJson.get(
  "/company-registration-requests/:requestId/documents/:docId/download",
  async (req, res, next) => {
    try {
      if (!canMutateAdminCompanies(adminConsoleRole(req))) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      if (!isPostgresConfigured()) {
        res.status(503).json({ error: "database_not_configured" });
        return;
      }
      const doc = await findPartnerRegistrationDocumentById(req.params.docId);
      if (!doc || doc.requestId !== req.params.requestId) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      let abs: string;
      try {
        abs = resolvePartnerRegistrationStorageAbsolutePath(doc.storagePath);
      } catch {
        res.status(404).json({ error: "not_found" });
        return;
      }
      let buf: Buffer;
      try {
        buf = await readFile(abs);
      } catch (e) {
        const err = e as NodeJS.ErrnoException;
        if (err?.code === "ENOENT") {
          res.status(404).json({ error: "file_missing" });
          return;
        }
        throw e;
      }
      const mime = doc.mimeType || "application/octet-stream";
      res.setHeader("Content-Type", mime);
      const inlineRaw =
        typeof req.query?.inline === "string" ? req.query.inline.trim().toLowerCase() : "";
      const wantInline = inlineRaw === "1" || inlineRaw === "true";
      const disposition =
        wantInline && registrationDocAllowsInlinePreview(mime) ? "inline" : "attachment";
      res.setHeader(
        "Content-Disposition",
        `${disposition}; filename="${encodeURIComponent(doc.originalFileName || "document.bin")}"`,
      );
      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).send(buf);
    } catch (e) {
      next(e);
    }
  },
);

adminJson.post("/company-registration-requests/:id/approve", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const reqRow = await findPartnerRegistrationRequestById(req.params.id);
    if (!reqRow) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (reqRow.linkedCompanyId) {
      res.status(409).json({ error: "already_approved", companyId: reqRow.linkedCompanyId });
      return;
    }
    if (!isPartnerType(reqRow.partnerType)) {
      res.status(400).json({ error: "partner_type_invalid" });
      return;
    }
    const policy = getPartnerRegistrationPolicy(reqRow.partnerType);
    const approveIncomplete = policy?.approveIncompleteReason(reqRow) ?? null;
    if (approveIncomplete) {
      const isTaxi = reqRow.partnerType === "taxi";
      res.status(400).json({
        error: isTaxi ? "taxi_registration_incomplete" : "registration_incomplete",
        hint: approveIncomplete,
      });
      return;
    }
    const companyExtras = policy?.buildCompanyApproveExtras(reqRow) ?? {};
    const createdCompany = await insertAdminCompany({
      name: reqRow.companyName,
      legal_form: reqRow.legalForm,
      company_kind: partnerTypeToCompanyKind(reqRow.partnerType),
      contact_name: `${reqRow.contactFirstName} ${reqRow.contactLastName}`.trim(),
      email: reqRow.email,
      phone: reqRow.phone,
      address_line1: reqRow.addressLine1,
      address_line2: reqRow.addressLine2 ?? "",
      postal_code: reqRow.postalCode,
      city: reqRow.city,
      country: reqRow.country,
      tax_id: reqRow.taxId,
      vat_id: reqRow.vatId,
      concession_number: reqRow.concessionNumber,
      owner_name: reqRow.ownerName ?? "",
      dispo_phone: reqRow.dispoPhone ?? "",
      business_notes: reqRow.notes,
      contract_status: "active",
      verification_status: "verified",
      compliance_status: "compliant",
      is_active: true,
      partner_panel_profile_locked: true,
      ...companyExtras,
    });
    if ("error" in createdCompany) {
      const e = createdCompany.error;
      const extraHint = "hint" in createdCompany && typeof createdCompany.hint === "string" ? createdCompany.hint : "";
      if (e === "db_schema_partner_panel_profile_locked") {
        res.status(503).json({
          error: e,
          hint: "Datenbank-Migration 031 (partner_panel_profile_locked) fehlt oder wurde nicht eingespielt. Bitte Deploy-Skript mit Migrationen ausführen.",
        });
        return;
      }
      if (e === "db_schema_company_kind_constraint") {
        res.status(503).json({
          error: e,
          hint: "Datenbank-Constraint für company_kind veraltet. Migration 032 (medical) einspielen.",
        });
        return;
      }
      if (e === "db_insert_admin_company_failed") {
        res.status(503).json({
          error: e,
          hint: [
            "INSERT in admin_companies ist fehlgeschlagen (Schema/Constraint/Migration).",
            "Auf dem Server: ./scripts/deploy-onroda-production.sh (inkl. Migrationen 031 + 032) oder fehlende SQL-Migrationen manuell per psql einspielen.",
            extraHint ? `Postgres: ${extraHint}` : "",
          ]
            .filter(Boolean)
            .join(" "),
        });
        return;
      }
      res.status(400).json({ error: e });
      return;
    }
    const actorLabel = req.adminAuth?.username ?? "admin";
    let reviewerId: string | null = null;
    if (req.adminAuth?.username) {
      const authRow = await findActiveAdminAuthUserByUsername(req.adminAuth.username);
      reviewerId = authRow?.id ?? null;
    }
    const updatedReq = await attachCompanyToPartnerRegistrationRequest(reqRow.id, createdCompany.id, {
      reviewedByAdminUserId: reviewerId,
      eventActorLabel: actorLabel,
    });
    if (!updatedReq) {
      res.status(409).json({
        error: "attach_failed",
        hint: "Anfrage konnte nicht verknüpft werden (z. B. Stammdaten nicht gesperrt). Das Unternehmen wurde bereits angelegt.",
        companyId: createdCompany.id,
      });
      return;
    }

    const approveBody = (req.body ?? {}) as { createOwnerUser?: unknown; ownerUsername?: unknown };
    const createOwnerUser = approveBody.createOwnerUser !== false;
    let ownerOnboarding:
      | { username: string; email: string; initialPassword: string; mustChangePassword: true }
      | undefined;
    let ownerProvisioningWarning: string | undefined;

    if (createOwnerUser) {
      const ownerUsernameHint =
        typeof approveBody.ownerUsername === "string" && approveBody.ownerUsername.trim()
          ? approveBody.ownerUsername.trim()
          : reqRow.email;
      try {
        const username = await allocateUniquePanelUsername(ownerUsernameHint);
        const ownerEmail = reqRow.email.trim();
        const generatedPassword = generateTemporaryPassword();
        const pwHash = await hashPassword(generatedPassword);
        const createdUser = await insertPanelUser({
          companyId: createdCompany.id,
          username,
          email: ownerEmail,
          role: "owner",
          passwordHash: pwHash,
          mustChangePassword: true,
        });
        if (!createdUser) {
          ownerProvisioningWarning =
            "Owner-Zugang konnte nicht angelegt werden (Benutzername/E-Mail-Konflikt). Bitte im Unternehmen manuell einen Panel-Benutzer anlegen.";
        } else {
          await insertPanelAuditLog({
            id: randomUUID(),
            companyId: createdCompany.id,
            actorPanelUserId: null,
            action: "admin.panel_user.created",
            subjectType: "panel_user",
            subjectId: createdUser.id,
            meta: { username, role: "owner", source: "registration_request_approve" },
          });
          await addPartnerRegistrationTimelineEvent({
            requestId: reqRow.id,
            actorType: "admin",
            actorLabel,
            eventType: "panel_owner_provisioned",
            message: "Erstzugang Partner-Panel (Owner) angelegt.",
            payload: { panelUserId: createdUser.id, username },
          });
          ownerOnboarding = {
            username,
            email: ownerEmail,
            initialPassword: generatedPassword,
            mustChangePassword: true,
          };
          logger.info(
            {
              event: "admin.partner_registration.owner_provisioned",
              requestId: reqRow.id,
              companyId: createdCompany.id,
              panelUserId: createdUser.id,
              username,
            },
            "panel owner provisioned from registration approve",
          );
        }
      } catch (err) {
        ownerProvisioningWarning =
          err instanceof Error ? err.message : "owner_provisioning_failed";
        logger.warn({ err, requestId: reqRow.id }, "panel owner provisioning failed after approve");
      }
    }

    res.status(201).json({
      ok: true,
      company: createdCompany,
      request: updatedReq,
      ...(ownerOnboarding ? { ownerOnboarding } : {}),
      ...(ownerProvisioningWarning ? { ownerProvisioningWarning } : {}),
    });

    void sendPartnerRegistrationApprovedEmail({
      to: reqRow.email,
      companyName: reqRow.companyName,
      ownerUsername: ownerOnboarding?.username,
      ownerInitialPassword: ownerOnboarding?.initialPassword,
    }).catch((err) => {
      logger.warn({ err, requestId: reqRow.id }, "partner approval mail async failed");
    });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/companies/:companyId/panel-users", async (req, res, next) => {
  try {
    const company = await requireCompanyRowForMutation(req, res, req.params.companyId);
    if (!company) return;
    const users = await listPanelUsersInCompany(req.params.companyId);
    res.json({ ok: true, users });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/companies/:companyId/panel-users", async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const company = await requireCompanyRowForMutation(req, res, companyId);
    if (!company) return;
    if (!company.is_active) {
      res.status(400).json({ error: "company_inactive" });
      return;
    }
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
    if (await panelUsernameTaken(username.toLowerCase())) {
      res.status(409).json({ error: "username_taken" });
      return;
    }
    const hash = await hashPassword(password);
    const created = await insertPanelUser({
      companyId,
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
      companyId,
      actorPanelUserId: null,
      action: "admin.panel_user.created",
      subjectType: "panel_user",
      subjectId: created.id,
      meta: { username, role: targetRole, source: "platform_admin_api" },
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

adminJson.patch("/companies/:companyId/panel-users/:userId", async (req, res, next) => {
  try {
    const { companyId, userId } = req.params;
    const company = await requireCompanyRowForMutation(req, res, companyId);
    if (!company) return;
    const target = await findPanelUserInCompany(userId, companyId);
    if (!target) {
      res.status(404).json({ error: "not_found" });
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
      const tr = body.role.trim();
      if (!isPanelRoleString(tr)) {
        res.status(400).json({ error: "invalid_role" });
        return;
      }
      patch.role = tr;
    }
    if (typeof body.email === "string") patch.email = body.email.trim();
    if (typeof body.username === "string") {
      const u = body.username.trim();
      if (u.length < 2) {
        res.status(400).json({ error: "username_invalid" });
        return;
      }
      if (u.toLowerCase() !== target.username.toLowerCase()) {
        if (await panelUsernameTaken(u.toLowerCase(), userId)) {
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
    const updated = await patchPanelUserInCompany(userId, companyId, patch);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId,
      actorPanelUserId: null,
      action: patch.isActive === false ? "admin.panel_user.deactivated" : "admin.panel_user.updated",
      subjectType: "panel_user",
      subjectId: userId,
      meta: { source: "platform_admin_api" },
    });
    res.json({ ok: true, user: updated });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/companies/:companyId/panel-users/:userId/reset-password", async (req, res, next) => {
  try {
    const { companyId, userId } = req.params;
    const company = await requireCompanyRowForMutation(req, res, companyId);
    if (!company) return;
    const target = await findPanelUserInCompany(userId, companyId);
    if (!target || !target.is_active) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const body = req.body as { newPassword?: string };
    const neu = typeof body.newPassword === "string" ? body.newPassword : "";
    if (neu.length < 10) {
      res.status(400).json({ error: "password_fields_invalid", hint: "newPassword min length 10" });
      return;
    }
    const hash = await hashPassword(neu);
    const ok = await updatePanelUserPasswordInCompany(userId, companyId, hash, true);
    if (!ok) {
      res.status(500).json({ error: "password_update_failed" });
      return;
    }
    await insertPanelAuditLog({
      id: randomUUID(),
      companyId,
      actorPanelUserId: null,
      action: "admin.panel_user.password_reset",
      subjectType: "panel_user",
      subjectId: userId,
      meta: { source: "platform_admin_api" },
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/rides", async (req, res, next) => {
  try {
    const parsed = parseAdminRideListQuery(req);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const role = adminConsoleRole(req);
    const scopedQuery = mergeAdminRideListQueryForPrincipal(role, req.adminAuth?.scopeCompanyId, parsed.query);
    const page = Math.min(500, Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "20"), 10) || 20));
    const offset = (page - 1) * pageSize;
    const [total, rows] = await Promise.all([
      countRidesAdmin(scopedQuery),
      listRidesAdminPage(scopedQuery, pageSize, offset),
    ]);
    const items = await attachAccessCodeSummariesToRides(rows);
    res.json({ ok: true, items, total, page, pageSize });
  } catch (e) {
    next(e);
  }
});

/**
 * Fahrtakte: Ride + `ride_events` (chronologisch) + `panel_audit_log` (Mandant, `subject_id` = ride id) + Verknüpfungen.
 * Read-only; keine Fachlogik-Änderung.
 */
adminJson.get("/rides/:id/record", async (req, res, next) => {
  try {
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "ride_id_required" });
      return;
    }
    const row = await findRideAdminById(id);
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const role = adminConsoleRole(req);
    if (!adminRideRowVisibleToPrincipal(role, req.adminAuth?.scopeCompanyId, row)) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const [ride] = await attachAccessCodeSummariesToRides([row]);
    const [events, panelAudit] = await Promise.all([
      listAdminRideEventsByRideId(id),
      row.companyId
        ? listPanelAuditForCompany(row.companyId, { subjectId: id, limit: 200 })
        : Promise.resolve([]),
    ]);
    const auditAsc = [...panelAudit].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const meta = (row as { partnerBookingMeta?: Record<string, unknown> }).partnerBookingMeta;
    const supportThreadId =
      meta && typeof meta === "object" && typeof (meta as { supportThreadId?: string }).supportThreadId === "string"
        ? (meta as { supportThreadId: string }).supportThreadId
        : null;
    const supportTicketId =
      meta && typeof meta === "object" && typeof (meta as { supportTicketId?: string }).supportTicketId === "string"
        ? (meta as { supportTicketId: string }).supportTicketId
        : null;
    res.json({
      ok: true,
      ride,
      events,
      panelAudit: auditAsc,
      links: {
        billingReference: row.billingReference ?? null,
        supportTicketId: supportTicketId || null,
        supportThreadId: supportThreadId || null,
      },
    });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/rides/:id/medical-signature-file", async (req, res, next) => {
  try {
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "ride_id_required" });
      return;
    }
    const row = await findRideAdminById(id);
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const role = adminConsoleRole(req);
    if (!adminRideRowVisibleToPrincipal(role, req.adminAuth?.scopeCompanyId, row)) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const meta = (row as { partnerBookingMeta?: Record<string, unknown> }).partnerBookingMeta;
    const key =
      meta && typeof meta === "object" && typeof meta.signature_file_key === "string"
        ? meta.signature_file_key.trim()
        : "";
    if (!key) {
      res.status(404).json({ error: "signature_not_found" });
      return;
    }
    const uploadRoot = path.resolve(process.cwd(), "uploads", "medical-rides");
    const normalized = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
    const filePath = path.resolve(uploadRoot, normalized);
    if (!filePath.startsWith(uploadRoot + path.sep) && filePath !== uploadRoot) {
      res.status(400).json({ error: "invalid_signature_key" });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "";
    if (!contentType) {
      res.status(415).json({ error: "unsupported_signature_type" });
      return;
    }
    try {
      await readFile(filePath);
    } catch {
      res.status(404).json({ error: "signature_not_found" });
      return;
    }
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=60");
    res.sendFile(filePath);
  } catch (e) {
    next(e);
  }
});

adminJson.get("/rides/:id", async (req, res, next) => {
  try {
    const row = await findRideAdminById(req.params.id);
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const role = adminConsoleRole(req);
    if (!adminRideRowVisibleToPrincipal(role, req.adminAuth?.scopeCompanyId, row)) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const [ride] = await attachAccessCodeSummariesToRides([row]);
    res.json({ ok: true, ride });
  } catch (e) {
    next(e);
  }
});

adminJson.patch("/rides/:id/release", async (req, res, next) => {
  try {
    const role = adminConsoleRole(req);
    if (!canAdminReleaseRide(role)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const existing = await findRideAdminById(req.params.id);
    if (!existing || !adminRideRowVisibleToPrincipal(role, req.adminAuth?.scopeCompanyId, existing)) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const updated = await adminReleaseRide(req.params.id);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const full = await findRideAdminById(updated.id);
    const base = full ?? { ...updated, companyName: null };
    const [ride] = await attachAccessCodeSummariesToRides([base]);
    res.json({ ok: true, ride });
  } catch (e) {
    next(e);
  }
});

adminJson.patch("/companies/:companyId/panel-modules", async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const company = await requireCompanyRowForMutation(req, res, companyId);
    if (!company) return;
    const body = req.body as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(body, "panel_modules")) {
      res.status(400).json({ error: "panel_modules_required", hint: "null = alle Module, sonst string[]" });
      return;
    }
    const raw = body.panel_modules;
    let modules: string[] | null;
    if (raw === null) {
      modules = null;
    } else if (Array.isArray(raw)) {
      const n = normalizeStoredPanelModules(raw) ?? [];
      if (n.length === 0) {
        res.status(400).json({ error: "panel_modules_empty", hint: "Mindestens ein Modul, oder panel_modules: null für alle." });
        return;
      }
      modules = n;
    } else {
      res.status(400).json({ error: "panel_modules_invalid" });
      return;
    }
    if (modules != null) {
      const bad = forbiddenPanelModulesForCompanyKind(company.company_kind, modules);
      if (bad.length > 0) {
        res.status(400).json({
          error: "panel_modules_forbidden_for_company_kind",
          hint: `Für Mandanten-Typ „${company.company_kind}“ nicht erlaubt: ${bad.join(", ")}`,
          forbidden: bad,
        });
        return;
      }
    }
    const item = await patchCompanyPanelModules(companyId, modules);
    if (!item) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

adminJson.patch("/companies/:companyId/priority", async (req, res, next) => {
  try {
    const { companyId } = req.params;
    if ((await requireCompanyRowForMutation(req, res, companyId)) == null) return;
    const body = req.body as Partial<{
      is_priority_company: boolean;
      priority_for_live_rides: boolean;
      priority_for_reservations: boolean;
    }>;
    const item = await patchCompanyPriority(companyId, body);
    if (!item) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/fare-areas", async (_req, res, next) => {
  try {
    if (!canMutateAdminFareAreas(adminConsoleRole(_req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const items = await listFareAreas();
    const activeProfile = await getPublicFareProfile();
    res.json({ ok: true, items, activeProfile });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/access-codes", async (_req, res, next) => {
  try {
    if (!canAccessAdminAccessCodes(adminConsoleRole(_req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const items = await listAccessCodesAdmin();
    res.json({
      ok: true,
      items: items.map((row) => {
        const ps = computeAccessCodePublicStatus({
          isActive: row.isActive,
          lifecycleStatus: row.lifecycleStatus ?? "active",
          reservedRideId: row.reservedRideId ?? null,
          validFrom: row.validFrom,
          validUntil: row.validUntil,
          maxUses: row.maxUses,
          usesCount: row.usesCount,
        });
        return { ...row, publicStatus: ps.status, publicStatusLabel: ps.labelDe };
      }),
    });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/access-codes", async (req, res, next) => {
  try {
    if (!canAccessAdminAccessCodes(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const generateCode = body.generateCode === true;
    const code = typeof body.code === "string" ? body.code : "";
    const codeType = typeof body.codeType === "string" ? body.codeType : "";
    const result = await insertAccessCodeAdmin({
      generate: generateCode,
      code,
      codeType,
      companyId: typeof body.companyId === "string" ? body.companyId : undefined,
      label: typeof body.label === "string" ? body.label : undefined,
      maxUses: typeof body.maxUses === "number" ? body.maxUses : undefined,
      validFrom: typeof body.validFrom === "string" ? body.validFrom : undefined,
      validUntil: typeof body.validUntil === "string" ? body.validUntil : undefined,
      internalNote: typeof body.internalNote === "string" ? body.internalNote : undefined,
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
    res.status(201).json({
      ok: true,
      item: result.item,
      ...(result.revealedCode ? { revealedCode: result.revealedCode } : {}),
    });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/fare-areas", async (req, res, next) => {
  try {
    if (!canMutateAdminFareAreas(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const body = req.body as Partial<{
      name: string;
      ruleType: string;
      isRequiredArea: string;
      fixedPriceAllowed: string;
      status: string;
      isDefault: boolean;
      baseFareEur: number;
      rateFirstKmEur: number;
      rateAfterKmEur: number;
      thresholdKm: number;
      waitingPerHourEur: number;
      serviceFeeEur: number;
      onrodaBaseFareEur: number;
      onrodaPerKmEur: number;
      onrodaMinFareEur: number;
      manualFixedPriceEur: number | null;
    }>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      res.status(400).json({ error: "name_required" });
      return;
    }
    const items = await addFareArea({
      name,
      ruleType: typeof body.ruleType === "string" ? body.ruleType : "official_metered_tariff",
      isRequiredArea: typeof body.isRequiredArea === "string" ? body.isRequiredArea : "Ja",
      fixedPriceAllowed: typeof body.fixedPriceAllowed === "string" ? body.fixedPriceAllowed : "Prüfen",
      status: typeof body.status === "string" ? body.status : "aktiv",
      isDefault: body.isDefault === true,
      baseFareEur: typeof body.baseFareEur === "number" ? body.baseFareEur : undefined,
      rateFirstKmEur: typeof body.rateFirstKmEur === "number" ? body.rateFirstKmEur : undefined,
      rateAfterKmEur: typeof body.rateAfterKmEur === "number" ? body.rateAfterKmEur : undefined,
      thresholdKm: typeof body.thresholdKm === "number" ? body.thresholdKm : undefined,
      waitingPerHourEur: typeof body.waitingPerHourEur === "number" ? body.waitingPerHourEur : undefined,
      serviceFeeEur: typeof body.serviceFeeEur === "number" ? body.serviceFeeEur : undefined,
      onrodaBaseFareEur: typeof body.onrodaBaseFareEur === "number" ? body.onrodaBaseFareEur : undefined,
      onrodaPerKmEur: typeof body.onrodaPerKmEur === "number" ? body.onrodaPerKmEur : undefined,
      onrodaMinFareEur: typeof body.onrodaMinFareEur === "number" ? body.onrodaMinFareEur : undefined,
      manualFixedPriceEur:
        body.manualFixedPriceEur == null
          ? null
          : typeof body.manualFixedPriceEur === "number"
            ? body.manualFixedPriceEur
            : undefined,
    });
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

adminJson.patch("/fare-areas/:id", async (req, res, next) => {
  try {
    if (!canMutateAdminFareAreas(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const body = req.body as Partial<{
      name: string;
      ruleType: string;
      isRequiredArea: string;
      fixedPriceAllowed: string;
      status: string;
      isDefault: boolean;
      baseFareEur: number;
      rateFirstKmEur: number;
      rateAfterKmEur: number;
      thresholdKm: number;
      waitingPerHourEur: number;
      serviceFeeEur: number;
      onrodaBaseFareEur: number;
      onrodaPerKmEur: number;
      onrodaMinFareEur: number;
      manualFixedPriceEur: number | null;
    }>;
    const patch: FareAreaPatchBody = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (typeof body.ruleType === "string") patch.ruleType = body.ruleType;
    if (typeof body.isRequiredArea === "string") patch.isRequiredArea = body.isRequiredArea;
    if (typeof body.fixedPriceAllowed === "string") patch.fixedPriceAllowed = body.fixedPriceAllowed;
    if (typeof body.status === "string") patch.status = body.status;
    if (typeof body.isDefault === "boolean") patch.isDefault = body.isDefault;
    if (typeof body.baseFareEur === "number") patch.baseFareEur = body.baseFareEur;
    if (typeof body.rateFirstKmEur === "number") patch.rateFirstKmEur = body.rateFirstKmEur;
    if (typeof body.rateAfterKmEur === "number") patch.rateAfterKmEur = body.rateAfterKmEur;
    if (typeof body.thresholdKm === "number") patch.thresholdKm = body.thresholdKm;
    if (typeof body.waitingPerHourEur === "number") patch.waitingPerHourEur = body.waitingPerHourEur;
    if (typeof body.serviceFeeEur === "number") patch.serviceFeeEur = body.serviceFeeEur;
    if (typeof body.onrodaBaseFareEur === "number") patch.onrodaBaseFareEur = body.onrodaBaseFareEur;
    if (typeof body.onrodaPerKmEur === "number") patch.onrodaPerKmEur = body.onrodaPerKmEur;
    if (typeof body.onrodaMinFareEur === "number") patch.onrodaMinFareEur = body.onrodaMinFareEur;
    if (body.manualFixedPriceEur === null || typeof body.manualFixedPriceEur === "number") {
      patch.manualFixedPriceEur = body.manualFixedPriceEur;
    }
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "no_changes" });
      return;
    }
    const item = await updateFareArea(req.params.id, patch);
    if (!item) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const items = await listFareAreas();
    res.json({ ok: true, item, items });
  } catch (e) {
    next(e);
  }
});

adminJson.delete("/fare-areas/:id", async (req, res, next) => {
  try {
    if (!canMutateAdminFareAreas(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const result = await deleteFareArea(req.params.id);
    if (!result.ok) {
      if (result.error === "not_found") {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.status(409).json({
        error: "fare_area_in_use",
        message:
          "Dieses Gebiet kann nicht gelöscht werden, weil es noch Fahrten in Buchungsdaten zugeordnet ist (Meta-Verknüpfung fareAreaId). Bitte zuerst Zuordnungen entfernen.",
        rideCount: result.rideCount,
      });
      return;
    }
    const items = await listFareAreas();
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

/** Plattform: Fahrzeuge (Taxi-Flotte) prüfen — nur Admin/Service, alle Mandanten. */
adminJson.get("/fleet-vehicles/pending", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const items = await listPendingFleetVehiclesForAdmin();
    res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/fleet-vehicles/:vehicleId", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const vehicleId = String(req.params.vehicleId ?? "").trim();
    const row = await getFleetVehicleAdminDetail(vehicleId);
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, vehicle: row.vehicle, companyName: row.companyName });
  } catch (e) {
    next(e);
  }
});

/** Fahrer-Freigabestatus (Plattform) – wie Fahrzeuge, ohne Partner-UI-Pflicht in diesem Schritt. */
adminJson.post("/fleet-drivers/:driverId/approval", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const driverId = String(req.params.driverId ?? "").trim();
    if (!driverId) {
      res.status(400).json({ error: "driver_id_required" });
      return;
    }
    const body = (req.body ?? {}) as {
      status?: unknown;
      reason?: unknown;
      acknowledgeIncompleteDocuments?: unknown;
    };
    const raw = typeof body.status === "string" ? body.status.trim().toLowerCase() : "";
    const ackIncomplete = body.acknowledgeIncompleteDocuments === true;
    const allowed: FleetDriverApprovalStatus[] = [
      "pending",
      "in_review",
      "approved",
      "rejected",
      "missing_documents",
    ];
    if (!allowed.includes(raw as FleetDriverApprovalStatus)) {
      res.status(400).json({ error: "status_invalid" });
      return;
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const r = await setFleetDriverApprovalByAdmin(driverId, raw as FleetDriverApprovalStatus, {
      rejectionReason: reason,
      acknowledgeIncompleteDocuments: ackIncomplete,
    });
    if (!r.ok) {
      const m: Record<string, number> = {
        not_found: 404,
        not_pending: 409,
        invalid_state: 409,
        rejection_reason_required: 400,
        incomplete_documents_ack_required: 409,
        invalid_status: 400,
      };
      const gaps =
        !r.ok && r.error === "incomplete_documents_ack_required" && Array.isArray((r as { gaps?: string[] }).gaps)
          ? (r as { gaps: string[] }).gaps
          : undefined;
      res.status(m[r.error] ?? 400).json(gaps ? { error: r.error, gaps } : { error: r.error });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/fleet-vehicles/:vehicleId/approve", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const vehicleId = String(req.params.vehicleId ?? "").trim();
    const adminId = await resolveAdminAuthUserIdForSupport(req);
    const ack =
      (req.body as { acknowledgeIncompleteDocuments?: unknown } | undefined)?.acknowledgeIncompleteDocuments === true;
    const r = await setFleetVehicleApprovalByAdmin(vehicleId, {
      nextStatus: "approved",
      adminUserId: adminId,
      acknowledgeIncompleteDocuments: ack,
    });
    if (!r.ok) {
      const m: Record<string, number> = {
        not_found: 404,
        not_pending: 409,
        incomplete_documents_ack_required: 409,
      };
      const gaps =
        !r.ok && r.error === "incomplete_documents_ack_required" && Array.isArray((r as { gaps?: string[] }).gaps)
          ? (r as { gaps: string[] }).gaps
          : undefined;
      res.status(m[r.error] ?? 400).json(gaps ? { error: r.error, gaps } : { error: r.error });
      return;
    }
    const d0 = await getFleetVehicleAdminDetail(vehicleId);
    if (d0) {
      await insertPanelAuditLog({
        id: randomUUID(),
        companyId: d0.vehicle.companyId,
        actorPanelUserId: null,
        action: "admin.fleet_vehicle.approved",
        subjectType: "fleet_vehicle",
        subjectId: vehicleId,
        meta: {
          adminUserId: adminId,
          source: "fleet_vehicles_review",
          incompleteDocumentsAcknowledged: ack,
        },
      });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/fleet-vehicles/:vehicleId/reject", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const vehicleId = String(req.params.vehicleId ?? "").trim();
    const reason = typeof (req.body as { reason?: unknown })?.reason === "string"
      ? (req.body as { reason: string }).reason.trim()
      : "";
    const adminId = await resolveAdminAuthUserIdForSupport(req);
    const r = await setFleetVehicleApprovalByAdmin(vehicleId, {
      nextStatus: "rejected",
      rejectionReason: reason,
      adminUserId: adminId,
    });
    if (!r.ok) {
      const m: Record<string, number> = {
        not_found: 404,
        not_pending: 409,
        rejection_reason_required: 400,
      };
      res.status(m[r.error] ?? 400).json({ error: r.error });
      return;
    }
    const d0 = await getFleetVehicleAdminDetail(vehicleId);
    if (d0) {
      await insertPanelAuditLog({
        id: randomUUID(),
        companyId: d0.vehicle.companyId,
        actorPanelUserId: null,
        action: "admin.fleet_vehicle.rejected",
        subjectType: "fleet_vehicle",
        subjectId: vehicleId,
        meta: { reason: reason.slice(0, 500), adminUserId: adminId, source: "fleet_vehicles_review" },
      });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/fleet-vehicles/:vehicleId/mark-missing-documents", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const vehicleId = String(req.params.vehicleId ?? "").trim();
    const adminId = await resolveAdminAuthUserIdForSupport(req);
    const r = await setFleetVehicleMissingDocumentsByAdmin(vehicleId, { adminUserId: adminId });
    if (!r.ok) {
      res.status(r.error === "not_found" ? 404 : r.error === "invalid_state" ? 409 : 400).json({ error: r.error });
      return;
    }
    const d0 = await getFleetVehicleAdminDetail(vehicleId);
    if (d0) {
      await insertPanelAuditLog({
        id: randomUUID(),
        companyId: d0.vehicle.companyId,
        actorPanelUserId: null,
        action: "admin.fleet_vehicle.missing_documents",
        subjectType: "fleet_vehicle",
        subjectId: vehicleId,
        meta: { adminUserId: adminId, source: "fleet_vehicles_review" },
      });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminJson.post("/fleet-vehicles/:vehicleId/block", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const vehicleId = String(req.params.vehicleId ?? "").trim();
    const b = (req.body ?? {}) as { blockReason?: unknown; adminInternalNote?: unknown };
    const blockReason = typeof b.blockReason === "string" ? b.blockReason : "";
    const adminNote = typeof b.adminInternalNote === "string" ? b.adminInternalNote : undefined;
    const adminId = await resolveAdminAuthUserIdForSupport(req);
    const r = await forceBlockFleetVehicleByAdmin(vehicleId, {
      adminUserId: adminId,
      blockReason,
      adminInternalNote: adminNote,
    });
    if (!r.ok) {
      res
        .status(r.error === "not_found" ? 404 : r.error === "already_blocked" ? 409 : 400)
        .json({ error: r.error });
      return;
    }
    const d0 = await getFleetVehicleAdminDetail(vehicleId);
    if (d0) {
      await insertPanelAuditLog({
        id: randomUUID(),
        companyId: d0.vehicle.companyId,
        actorPanelUserId: null,
        action: "admin.fleet_vehicle.blocked",
        subjectType: "fleet_vehicle",
        subjectId: vehicleId,
        meta: { blockReason: String(blockReason).slice(0, 500), adminUserId: adminId, source: "fleet_vehicles_review" },
      });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

adminJson.get("/fleet-vehicles/:vehicleId/documents/file", async (req, res, next) => {
  try {
    if (!canMutateAdminCompanies(adminConsoleRole(req))) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const vehicleId = String(req.params.vehicleId ?? "").trim();
    const storageKey =
      typeof (req.query as { storageKey?: string }).storageKey === "string"
        ? (req.query as { storageKey: string }).storageKey.trim()
        : "";
    if (!storageKey || storageKey.includes("..")) {
      res.status(400).json({ error: "storage_key_invalid" });
      return;
    }
    const keys = await listFleetVehicleDocumentStorageKeysAdmin(vehicleId);
    if (keys === null) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (!keys.includes(storageKey)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const abs = path.resolve(path.join(adminFleetUploadRoot, storageKey));
    const base = path.resolve(adminFleetUploadRoot);
    if (!abs.startsWith(base + path.sep) && abs !== base) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    createReadStream(abs)
      .on("error", () => {
        if (!res.headersSent) res.status(404).end();
      })
      .pipe(res);
  } catch (e) {
    next(e);
  }
});

/** Wie `fleet-vehicles/.../documents/file`, aber mit Mandanten-Scope (Taxi-Rolle in der Konsole). */
adminJson.get("/taxi-fleet-vehicles/:companyId/vehicles/:vehicleId/documents/file", async (req, res, next) => {
  try {
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const companyId = String(req.params.companyId ?? "").trim();
    const vehicleId = String(req.params.vehicleId ?? "").trim();
    const allowed = await requireTaxiCompanyForAdminPanel(req, res, companyId);
    if (!allowed) return;
    const storageKey =
      typeof (req.query as { storageKey?: string }).storageKey === "string"
        ? (req.query as { storageKey: string }).storageKey.trim()
        : "";
    if (!storageKey || storageKey.includes("..")) {
      res.status(400).json({ error: "storage_key_invalid" });
      return;
    }
    const keys = await listFleetVehicleDocumentStorageKeysInCompany(companyId, vehicleId);
    if (keys === null) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (!keys.includes(storageKey)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const abs = path.resolve(path.join(adminFleetUploadRoot, storageKey));
    const base = path.resolve(adminFleetUploadRoot);
    if (!abs.startsWith(base + path.sep) && abs !== base) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    createReadStream(abs)
      .on("error", () => {
        if (!res.headersSent) res.status(404).end();
      })
      .pipe(res);
  } catch (e) {
    next(e);
  }
});

router.use("/admin", adminJson);

export default router;
