import { Router, type IRouter } from "express";
import { denyUnlessPanelPermission } from "../middleware/panelAccess.js";
import { requirePanelAuth, type PanelAuthRequest } from "../middleware/requirePanelAuth.js";
import { findCompanyById } from "../db/adminData.js";
import {
  generateKrankenInvoice,
  getInsurerBillingContactsForCompany,
  getKrankenInvoiceById,
  listKrankenInvoicesForCompany,
  listOpenTransportVouchersForCompany,
  markKrankenInvoiceSent,
} from "../db/krankenInvoicesData.js";
import { buildAndStoreKrankenInvoicePdf, readKrankenInvoicePdfBuffer } from "../lib/krankenInvoicePdfService.js";
import { sendKrankenInvoiceMail } from "../lib/krankenInvoiceMail.js";
import { assertActivePanelProfile, denyUnlessPanelModule } from "./panelRouteContext.js";

const router: IRouter = Router();

function requireTaxiCompany(res: import("express").Response, companyKind: string | undefined): boolean {
  if (companyKind !== "taxi") {
    res.status(403).json({ ok: false, error: "taxi_company_only" });
    return false;
  }
  return true;
}

router.get("/panel/v1/kranken-invoices", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!requireTaxiCompany(res, ctx.profile.companyKind)) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "billing")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "rides.read")) return;
    const invoices = await listKrankenInvoicesForCompany(ctx.claims.companyId);
    res.json({ ok: true, invoices });
  } catch (e) {
    next(e);
  }
});

router.get("/panel/v1/kranken-invoices/open-vouchers", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!requireTaxiCompany(res, ctx.profile.companyKind)) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "billing")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "rides.read")) return;
    const periodFrom = String(req.query.periodFrom ?? "").trim();
    const periodTo = String(req.query.periodTo ?? "").trim();
    const insurerName = String(req.query.insurerName ?? "").trim();
    const insurerIk = String(req.query.insurerIk ?? "").trim();
    if (!periodFrom || !periodTo) {
      res.status(400).json({ ok: false, error: "period_from_to_required" });
      return;
    }
    const vouchers = await listOpenTransportVouchersForCompany(ctx.claims.companyId, {
      periodFrom,
      periodTo,
      insurerName: insurerName || undefined,
      insurerIk: insurerIk || undefined,
    });
    const insurerContacts = await getInsurerBillingContactsForCompany(ctx.claims.companyId);
    res.json({ ok: true, vouchers, insurerContacts });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/kranken-invoices/generate", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!requireTaxiCompany(res, ctx.profile.companyKind)) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "billing")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "rides.write")) return;

    const body = req.body as Record<string, unknown>;
    const periodFrom = String(body.periodFrom ?? "").trim();
    const periodTo = String(body.periodTo ?? "").trim();
    const insurerName = String(body.insurerName ?? "").trim();
    const insurerIk = String(body.insurerIk ?? "").trim();
    const insurerEmail = String(body.insurerEmail ?? "").trim();
    if (!periodFrom || !periodTo || !insurerName) {
      res.status(400).json({ ok: false, error: "period_insurer_required" });
      return;
    }

    const result = await generateKrankenInvoice({
      companyId: ctx.claims.companyId,
      periodFrom,
      periodTo,
      insurerName,
      insurerIk,
      insurerEmail,
    });
    if ("error" in result) {
      const code = result.error;
      res.status(code === "no_open_vouchers" ? 409 : 400).json({ ok: false, error: code });
      return;
    }

    await buildAndStoreKrankenInvoicePdf(result.invoice.id, ctx.claims.companyId);
    res.status(201).json({ ok: true, invoice: result.invoice, vouchers: result.vouchers });
  } catch (e) {
    next(e);
  }
});

router.post("/panel/v1/kranken-invoices/:invoiceId/send", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!requireTaxiCompany(res, ctx.profile.companyKind)) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "billing")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "rides.write")) return;

    const invoiceId = String(req.params.invoiceId ?? "").trim();
    const detail = await getKrankenInvoiceById(invoiceId, ctx.claims.companyId);
    if (!detail) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }
    const to =
      String((req.body as Record<string, unknown>)?.insurerEmail ?? "").trim() ||
      detail.invoice.insurerEmail.trim();
    if (!to || !to.includes("@")) {
      res.status(400).json({ ok: false, error: "insurer_email_required" });
      return;
    }

    const built = await buildAndStoreKrankenInvoicePdf(invoiceId, ctx.claims.companyId);
    if (!built) {
      res.status(500).json({ ok: false, error: "pdf_failed" });
      return;
    }

    const company = await findCompanyById(ctx.claims.companyId);
    const mail = await sendKrankenInvoiceMail({
      to,
      companyName: company?.name ?? "",
      invoiceNumber: detail.invoice.invoiceNumber,
      insurerName: detail.invoice.insurerName,
      periodFrom: detail.invoice.periodFrom,
      periodTo: detail.invoice.periodTo,
      totalAmount: `${detail.invoice.totalAmount.toFixed(2)} EUR`,
      pdfBuffer: built.buffer,
    });
    if (!mail.ok) {
      res.status(503).json({ ok: false, error: mail.reason });
      return;
    }

    const updated = await markKrankenInvoiceSent(invoiceId, to, ctx.claims.companyId);
    res.json({ ok: true, invoice: updated, sentTo: to });
  } catch (e) {
    next(e);
  }
});

router.get("/panel/v1/kranken-invoices/:invoiceId/pdf", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!requireTaxiCompany(res, ctx.profile.companyKind)) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "billing")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "rides.read")) return;

    const invoiceId = String(req.params.invoiceId ?? "").trim();
    const detail = await getKrankenInvoiceById(invoiceId, ctx.claims.companyId);
    if (!detail) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }
    const buffer = await readKrankenInvoicePdfBuffer(invoiceId, ctx.claims.companyId);
    if (!buffer) {
      res.status(500).json({ ok: false, error: "pdf_failed" });
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${detail.invoice.invoiceNumber.replace(/[^\w-]+/g, "_")}.pdf"`,
    );
    res.send(buffer);
  } catch (e) {
    next(e);
  }
});

export default router;
