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
import { logger } from "../lib/logger";
import { rateLimitPanelLogin } from "../lib/panelLoginRateLimit";
import {
  rateLimitPartnerRegistrationEmail,
  rateLimitPartnerRegistrationIp,
  rateLimitPartnerRegistrationPublicLookup,
} from "../lib/partnerRegistrationPublicRateLimit";
import {
  toPublicPartnerRegistrationDocument,
  toPublicPartnerRegistrationSnapshot,
  toPublicPartnerRegistrationTimeline,
} from "../lib/partnerRegistrationPublicDto";
import { getPartnerRegistrationPolicy } from "../domain/partnerRegistrationPolicies";
import { isPanelRoleString } from "../lib/panelPermissions";
import { verifyPassword } from "../lib/password";
import { isPanelJwtConfigured, signPanelJwt, type PanelRole } from "../lib/panelJwt";

/** Öffentliches Taxi-Formular: eine Konzession + optional Gewerbe/Versicherung, jeweils max. 4 MiB roh. */
const MAX_TAXI_REG_PDF_BYTES = 4 * 1024 * 1024;

type TaxiRegDocSlot = { category: string; fileName: string; mimeType: string; contentBase64: string };

function parseTaxiRegistrationPdfSlot(v: unknown): { fileName: string; mimeType: string; contentBase64: string } | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const fileName = typeof o.fileName === "string" ? o.fileName.trim() : "";
  const mimeRaw = typeof o.mimeType === "string" ? o.mimeType.trim().toLowerCase() : "";
  const mimeType = mimeRaw || "application/pdf";
  const raw64 = typeof o.contentBase64 === "string" ? o.contentBase64.trim() : "";
  if (!fileName || !raw64) return null;
  if (mimeType !== "application/pdf") return null;
  if (!fileName.toLowerCase().endsWith(".pdf")) return null;
  const cleaned = raw64.includes(",") ? (raw64.split(",").pop() ?? "").trim() : raw64;
  const buf = Buffer.from(cleaned, "base64");
  if (!buf.byteLength || buf.byteLength > MAX_TAXI_REG_PDF_BYTES) return null;
  if (buf[0] !== 0x25 || buf[1] !== 0x50 || buf[2] !== 0x44 || buf[3] !== 0x46) return null;
  return { fileName, mimeType: "application/pdf", contentBase64: cleaned };
}

function parseOptionalTaxiPdfSlot(v: unknown): { fileName: string; mimeType: string; contentBase64: string } | null | "invalid" {
  if (v == null) return null;
  const slot = parseTaxiRegistrationPdfSlot(v);
  return slot ?? "invalid";
}

function parseTaxiRegistrationDocumentsFromBody(body: Record<string, unknown>):
  | { ok: false; error: string }
  | { ok: true; docs: TaxiRegDocSlot[] } {
  const td = body.taxiDocuments;
  if (!td || typeof td !== "object" || Array.isArray(td)) {
    return { ok: false, error: "taxi_documents_required" };
  }
  const o = td as Record<string, unknown>;
  const concession = parseTaxiRegistrationPdfSlot(o.concession);
  if (!concession) {
    return { ok: false, error: "taxi_concession_pdf_required" };
  }
  const docs: TaxiRegDocSlot[] = [{ category: "concession", ...concession }];
  const gewerbe = parseOptionalTaxiPdfSlot(o.gewerbe);
  if (gewerbe === "invalid") return { ok: false, error: "taxi_pdf_invalid" };
  if (gewerbe) docs.push({ category: "gewerbe", ...gewerbe });
  const insurance = parseOptionalTaxiPdfSlot(o.insurance);
  if (insurance === "invalid") return { ok: false, error: "taxi_pdf_invalid" };
  if (insurance) docs.push({ category: "insurance", ...insurance });
  return { ok: true, docs };
}

const TAXI_DOC_ERROR_HINTS: Record<string, string> = {
  taxi_documents_required: "Bitte laden Sie für Taxiunternehmen die Nachweise als PDF mit.",
  taxi_concession_pdf_required: "Bitte laden Sie die Konzession als PDF hoch (Pflicht).",
  taxi_pdf_invalid:
    "Mindestens eine PDF-Datei ist ungültig oder zu groß (max. 4 MB pro Datei, nur PDF).",
};

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
  const loginAudit = process.env.PANEL_AUTH_LOGIN_AUDIT === "1";

  if (!row || !isPanelRoleString(row.role)) {
    if (loginAudit) {
      logger.warn(
        {
          event: "panel.auth.login",
          outcome: "fail",
          username: username || "(empty)",
          clientIp: req.ip,
          reason: "no_active_panel_user_or_role",
        },
        "panel password login failed",
      );
    }
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }

  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) {
    if (loginAudit) {
      logger.warn(
        {
          event: "panel.auth.login",
          outcome: "fail",
          username,
          clientIp: req.ip,
          reason: "password_mismatch",
        },
        "panel password login failed",
      );
    }
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

  if (loginAudit) {
    logger.info(
      {
        event: "panel.auth.login",
        outcome: "ok",
        username: row.username,
        panelUserId: row.id,
        companyId: row.company_id,
        clientIp: req.ip,
      },
      "panel password login ok",
    );
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

const PENDING_PUBLIC_REGISTRATION = new Set(["open", "in_review", "documents_required"]);

router.post("/panel-auth/registration-request", async (req, res) => {
  const ip = (req.ip || req.socket?.remoteAddress || "").toString();
  const rlIp = rateLimitPartnerRegistrationIp(ip);
  if (!rlIp.ok) {
    res.setHeader("Retry-After", String(rlIp.retryAfterSec));
    res.status(429).json({ error: "rate_limited", retryAfterSec: rlIp.retryAfterSec });
    return;
  }

  if (!isPostgresConfigured()) {
    res.status(503).json({ error: "database_not_configured" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const hpVal = typeof body.hp_company_website === "string" ? body.hp_company_website.trim() : "";
  if (hpVal.length > 0) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }

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

  const registrationPolicy = getPartnerRegistrationPolicy(partnerTypeRaw);
  if (!registrationPolicy) {
    res.status(400).json({ error: "partner_type_invalid" });
    return;
  }
  const publicPolicyError = registrationPolicy.validatePublicRegistration(body);
  if (publicPolicyError) {
    res.status(400).json({ error: "partner_registration_incomplete", hint: publicPolicyError });
    return;
  }

  let taxiPdfDocs: TaxiRegDocSlot[] | null = null;
  if (partnerTypeRaw === "taxi") {
    const parsedDocs = parseTaxiRegistrationDocumentsFromBody(body);
    if (!parsedDocs.ok) {
      res.status(400).json({
        error: parsedDocs.error,
        hint: TAXI_DOC_ERROR_HINTS[parsedDocs.error] ?? "Ungültige Unterlagen.",
      });
      return;
    }
    taxiPdfDocs = parsedDocs.docs;
  }

  const taxId = str("taxId");
  const vatId = str("vatId");
  const concessionNumber = str("concessionNumber");
  const ownerName = str("ownerName");
  const addressLine2 = str("addressLine2");
  const dispoPhone = str("dispoPhone");

  const rlEmail = rateLimitPartnerRegistrationEmail(email);
  if (!rlEmail.ok) {
    res.setHeader("Retry-After", String(rlEmail.retryAfterSec));
    res.status(429).json({ error: "rate_limited_email", retryAfterSec: rlEmail.retryAfterSec });
    return;
  }

  const existingPanel = await findActivePanelUserByEmailNormalized(email);
  if (existingPanel) {
    res.status(409).json({
      error: "already_panel_user",
      hint: "Für diese E-Mail existiert bereits ein Zugang zum Partner-Portal. Bitte dort anmelden oder den Support kontaktieren.",
    });
    return;
  }

  const latest = await findLatestPartnerRegistrationRequestByEmail(email);
  if (latest) {
    if (PENDING_PUBLIC_REGISTRATION.has(latest.registrationStatus)) {
      res.status(409).json({
        error: "duplicate_pending",
        request: {
          id: latest.id,
          registrationStatus: latest.registrationStatus,
          createdAt: latest.createdAt,
        },
      });
      return;
    }
    if (latest.registrationStatus === "approved") {
      res.status(409).json({
        error: "duplicate_approved",
        hint: "Zu dieser E-Mail liegt bereits eine freigegebene Anfrage vor. Bitte nutzen Sie das Partner-Portal oder kontaktieren Sie uns.",
      });
      return;
    }
  }

  const usesVouchers = typeof body.usesVouchers === "boolean" ? body.usesVouchers : false;
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
    addressLine2,
    ownerName,
    dispoPhone,
    postalCode,
    city,
    country,
    taxId,
    vatId,
    concessionNumber,
    desiredRegion: str("desiredRegion"),
    requestedUsage,
    documentsMeta,
    notes: str("notes"),
  });
  if (!created) {
    res.status(503).json({ error: "create_failed" });
    return;
  }

  if (taxiPdfDocs && taxiPdfDocs.length > 0) {
    for (const d of taxiPdfDocs) {
      const doc = await addPartnerRegistrationDocument({
        requestId: created.id,
        category: d.category,
        originalFileName: d.fileName,
        mimeType: d.mimeType,
        contentBase64: d.contentBase64,
        uploadedByActorType: "partner",
        uploadedByActorLabel: email,
      });
      if (!doc) {
        logger.error(
          { event: "partner.registration.taxi_doc_failed", requestId: created.id, category: d.category },
          "partner registration taxi document persist failed",
        );
        res.status(503).json({
          error: "document_persist_failed",
          requestId: created.id,
          hint:
            "Die Anfrage wurde angelegt, aber ein Dokument konnte nicht gespeichert werden. Bitte notieren Sie die Referenz-ID und kontaktieren Sie uns — oder versuchen Sie es später erneut.",
        });
        return;
      }
    }
  }

  logger.info(
    { event: "partner.registration.submitted", requestId: created.id, email, clientIp: ip },
    "partner registration request created",
  );
  res.status(201).json({ ok: true, request: created });
});

router.get("/panel-auth/registration-request-status", async (req, res) => {
  const ip = (req.ip || req.socket?.remoteAddress || "").toString();
  const rl = rateLimitPartnerRegistrationPublicLookup(ip);
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfterSec));
    res.status(429).json({ error: "rate_limited", retryAfterSec: rl.retryAfterSec });
    return;
  }
  if (!isPostgresConfigured()) {
    res.status(503).json({ error: "database_not_configured" });
    return;
  }
  const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
  const requestId =
    typeof req.query.requestId === "string"
      ? req.query.requestId.trim()
      : typeof req.query.id === "string"
        ? req.query.id.trim()
        : "";
  if (!email || !requestId) {
    res.status(400).json({ error: "email_and_requestId_required" });
    return;
  }
  const row = await findPartnerRegistrationRequestById(requestId);
  if (!row || (row.email ?? "").toLowerCase() !== email) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ ok: true, request: toPublicPartnerRegistrationSnapshot(row) });
});

router.get("/panel-auth/registration-request/:id", async (req, res) => {
  const ip = (req.ip || req.socket?.remoteAddress || "").toString();
  const rl = rateLimitPartnerRegistrationPublicLookup(ip);
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfterSec));
    res.status(429).json({ error: "rate_limited", retryAfterSec: rl.retryAfterSec });
    return;
  }
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
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({
    ok: true,
    request: toPublicPartnerRegistrationSnapshot(detail.request),
    documents: detail.documents.map(toPublicPartnerRegistrationDocument),
    timeline: toPublicPartnerRegistrationTimeline(detail.timeline),
  });
});

router.post("/panel-auth/registration-request/:id/messages", async (req, res) => {
  const ip = (req.ip || req.socket?.remoteAddress || "").toString();
  const rlIp = rateLimitPartnerRegistrationIp(ip);
  if (!rlIp.ok) {
    res.setHeader("Retry-After", String(rlIp.retryAfterSec));
    res.status(429).json({ error: "rate_limited", retryAfterSec: rlIp.retryAfterSec });
    return;
  }
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
  if (message.length > 12_000) {
    res.status(400).json({ error: "message_too_long" });
    return;
  }
  const rlEmail = rateLimitPartnerRegistrationEmail(email);
  if (!rlEmail.ok) {
    res.setHeader("Retry-After", String(rlEmail.retryAfterSec));
    res.status(429).json({ error: "rate_limited_email", retryAfterSec: rlEmail.retryAfterSec });
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
  const st = row.registrationStatus;
  if (st === "rejected" || st === "blocked" || st === "approved") {
    res.status(409).json({ error: "registration_closed", hint: "Für diese Anfrage sind keine weiteren Nachrichten möglich." });
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
  const ip = (req.ip || req.socket?.remoteAddress || "").toString();
  const rlIp = rateLimitPartnerRegistrationIp(ip);
  if (!rlIp.ok) {
    res.setHeader("Retry-After", String(rlIp.retryAfterSec));
    res.status(429).json({ error: "rate_limited", retryAfterSec: rlIp.retryAfterSec });
    return;
  }
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
  const rlEmail = rateLimitPartnerRegistrationEmail(email);
  if (!rlEmail.ok) {
    res.setHeader("Retry-After", String(rlEmail.retryAfterSec));
    res.status(429).json({ error: "rate_limited_email", retryAfterSec: rlEmail.retryAfterSec });
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
  const st = row.registrationStatus;
  if (st === "rejected" || st === "blocked" || st === "approved") {
    res.status(409).json({ error: "registration_closed", hint: "Für diese Anfrage sind keine Uploads mehr möglich." });
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
  res.status(201).json({ ok: true, document: toPublicPartnerRegistrationDocument(doc) });
});

export default router;
