import { Router, type IRouter } from "express";
import {
  findActivePanelUserByEmailNormalized,
  findActivePanelUserByUsername,
} from "../db/panelAuthData";
import { isPostgresConfigured } from "../db/client";
import {
  addPartnerRegistrationDocument,
  addPartnerRegistrationMessage,
  addPartnerRegistrationTimelineEvent,
  createPartnerRegistrationRequest,
  findPartnerRegistrationRequestById,
  findLatestPartnerRegistrationRequestByEmail,
  getPartnerRegistrationDetailAdmin,
  isPartnerType,
  patchPartnerRegistrationRequest,
} from "../db/partnerRegistrationRequestsData";
import { rateLimitPanelLogin } from "../lib/panelLoginRateLimit";
import { isPanelRoleString } from "../lib/panelPermissions";
import { verifyPassword } from "../lib/password";
import { isPanelJwtConfigured, signPanelJwt, type PanelRole } from "../lib/panelJwt";

const router: IRouter = Router();

router.post("/panel-auth/login", async (req, res) => {
  const ip = (req.ip || req.socket?.remoteAddress || "").toString();
  const rl = rateLimitPanelLogin(ip);
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfterSec));
    res.status(429).json({ error: "rate_limited", retryAfterSec: rl.retryAfterSec });
    return;
  }

  if (!isPostgresConfigured()) {
    res.status(503).json({
      error: "database_not_configured",
      hint: "Set DATABASE_URL and apply init-onroda.sql (table panel_users).",
    });
    return;
  }
  if (!isPanelJwtConfigured()) {
    res.status(503).json({
      error: "panel_jwt_not_configured",
      hint:
        process.env.NODE_ENV === "production"
          ? "Set PANEL_JWT_SECRET in the API environment (required in production for panel login)."
          : "Set PANEL_JWT_SECRET, or for local dev only AUTH_JWT_SECRET.",
    });
    return;
  }

  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!username || !password) {
    res.status(400).json({ error: "username_and_password_required" });
    return;
  }

  let row = await findActivePanelUserByUsername(username);
  if (!row && username.includes("@")) {
    row = await findActivePanelUserByEmailNormalized(username);
  }
  if (!row || !isPanelRoleString(row.role)) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }

  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }

  let token: string;
  try {
    token = await signPanelJwt({
      panelUserId: row.id,
      companyId: row.company_id,
      username: row.username,
      email: row.email,
      role: row.role as PanelRole,
    });
  } catch (e) {
    console.error("[panel-auth/login] signPanelJwt:", e);
    res.status(500).json({ error: "token_sign_failed" });
    return;
  }

  res.json({
    ok: true,
    token,
    passwordChangeRequired: row.must_change_password,
    user: {
      id: row.id,
      companyId: row.company_id,
      username: row.username,
      email: row.email,
      role: row.role,
      mustChangePassword: row.must_change_password,
    },
  });
});

/**
 * Stateless JWT: Server speichert keine Session. Client verwirft das Token.
 */
router.post("/panel-auth/logout", (_req, res) => {
  res.json({ ok: true });
});

router.post("/panel-auth/registration-request", async (req, res) => {
  if (!isPostgresConfigured()) {
    res.status(503).json({ error: "database_not_configured" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof body[k] === "string" ? body[k].trim() : "");
  const companyName = str("companyName");
  const legalForm = str("legalForm");
  const partnerTypeRaw = str("partnerType");
  const contactFirstName = str("contactFirstName");
  const contactLastName = str("contactLastName");
  const email = str("email").toLowerCase();
  const phone = str("phone");
  const addressLine1 = str("addressLine1");
  const postalCode = str("postalCode");
  const city = str("city");
  const country = str("country");
  if (
    !companyName ||
    !partnerTypeRaw ||
    !contactFirstName ||
    !contactLastName ||
    !email ||
    !phone ||
    !addressLine1 ||
    !postalCode ||
    !city ||
    !country
  ) {
    res.status(400).json({ error: "required_fields_missing" });
    return;
  }
  if (!isPartnerType(partnerTypeRaw)) {
    res.status(400).json({ error: "partner_type_invalid" });
    return;
  }
  const usesVouchers = body.usesVouchers === true;
  const requestedUsage =
    body.requestedUsage && typeof body.requestedUsage === "object" && !Array.isArray(body.requestedUsage)
      ? (body.requestedUsage as Record<string, unknown>)
      : {};
  const documentsMeta =
    body.documentsMeta && typeof body.documentsMeta === "object" && !Array.isArray(body.documentsMeta)
      ? (body.documentsMeta as Record<string, unknown>)
      : {};
  const created = await createPartnerRegistrationRequest({
    companyName,
    legalForm,
    partnerType: partnerTypeRaw,
    usesVouchers,
    contactFirstName,
    contactLastName,
    email,
    phone,
    addressLine1,
    postalCode,
    city,
    country,
    taxId: str("taxId"),
    vatId: str("vatId"),
    concessionNumber: str("concessionNumber"),
    desiredRegion: str("desiredRegion"),
    requestedUsage,
    documentsMeta,
    notes: str("notes"),
  });
  if (!created) {
    res.status(503).json({ error: "create_failed" });
    return;
  }
  res.status(201).json({ ok: true, request: created });
});

router.get("/panel-auth/registration-request-status", async (req, res) => {
  if (!isPostgresConfigured()) {
    res.status(503).json({ error: "database_not_configured" });
    return;
  }
  const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
  if (!email) {
    res.status(400).json({ error: "email_required" });
    return;
  }
  const row = await findLatestPartnerRegistrationRequestByEmail(email);
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ ok: true, request: row });
});

router.get("/panel-auth/registration-request/:id", async (req, res) => {
  if (!isPostgresConfigured()) {
    res.status(503).json({ error: "database_not_configured" });
    return;
  }
  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
  if (!id || !email) {
    res.status(400).json({ error: "id_and_email_required" });
    return;
  }
  const detail = await getPartnerRegistrationDetailAdmin(id);
  if (!detail) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if ((detail.request.email ?? "").toLowerCase() !== email) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  res.json({ ok: true, ...detail });
});

router.post("/panel-auth/registration-request/:id/messages", async (req, res) => {
  if (!isPostgresConfigured()) {
    res.status(503).json({ error: "database_not_configured" });
    return;
  }
  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!id || !email || !message) {
    res.status(400).json({ error: "id_email_message_required" });
    return;
  }
  const row = await findPartnerRegistrationRequestById(id);
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if ((row.email ?? "").toLowerCase() !== email) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  await addPartnerRegistrationMessage(id, "partner", email, message);
  res.status(201).json({ ok: true });
});

router.post("/panel-auth/registration-request/:id/change-request", async (req, res) => {
  if (!isPostgresConfigured()) {
    res.status(503).json({ error: "database_not_configured" });
    return;
  }
  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  const payload =
    req.body?.payload && typeof req.body.payload === "object" && !Array.isArray(req.body.payload)
      ? (req.body.payload as Record<string, unknown>)
      : {};
  if (!id || !email || !reason) {
    res.status(400).json({ error: "id_email_reason_required" });
    return;
  }
  const row = await findPartnerRegistrationRequestById(id);
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if ((row.email ?? "").toLowerCase() !== email) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  await addPartnerRegistrationTimelineEvent({
    requestId: id,
    actorType: "partner",
    actorLabel: email,
    eventType: "master_data_change_requested",
    message: reason,
    payload,
  });
  await patchPartnerRegistrationRequest(id, { status: "in_review" });
  res.status(201).json({ ok: true });
});

router.post("/panel-auth/registration-request/:id/documents", async (req, res) => {
  if (!isPostgresConfigured()) {
    res.status(503).json({ error: "database_not_configured" });
    return;
  }
  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const category = typeof req.body?.category === "string" ? req.body.category.trim() : "general";
  const fileName = typeof req.body?.fileName === "string" ? req.body.fileName.trim() : "";
  const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType.trim() : "application/octet-stream";
  const contentBase64 =
    typeof req.body?.contentBase64 === "string" ? req.body.contentBase64.trim() : "";
  if (!id || !email || !fileName || !contentBase64) {
    res.status(400).json({ error: "id_email_file_required" });
    return;
  }
  const row = await findPartnerRegistrationRequestById(id);
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if ((row.email ?? "").toLowerCase() !== email) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const doc = await addPartnerRegistrationDocument({
    requestId: id,
    category,
    originalFileName: fileName,
    mimeType,
    contentBase64,
    uploadedByActorType: "partner",
    uploadedByActorLabel: email,
  });
  if (!doc) {
    res.status(503).json({ error: "upload_failed" });
    return;
  }
  res.status(201).json({ ok: true, document: doc });
});

export default router;
