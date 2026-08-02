import { Router, type IRouter } from "express";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { denyUnlessPanelPermission } from "../middleware/panelAccess";
import { requirePanelAuth, type PanelAuthRequest } from "../middleware/requirePanelAuth";
import {
  getPanelInvoiceForCompany,
  listPanelInvoicesForCompany,
  setPanelInvoicePdfStorageKey,
} from "../db/panelInvoicesData";
import { invoicePdfNeutralStatusLabel } from "../lib/invoiceWorkflow.js";
import { mapPanelInvoiceItemsForPdf } from "../lib/invoice/mapInvoiceItemForPdf.js";
import { buildPartnerMonthlyInvoicePdf } from "../lib/invoicePdfServer.js";
import { assertActivePanelProfile, denyUnlessPanelModule } from "./panelRouteContext";

const router: IRouter = Router();

const INVOICE_UPLOAD_ROOT =
  (process.env.PANEL_INVOICE_UPLOAD_DIR ?? "").trim() ||
  path.resolve(process.cwd(), "artifacts/api-server/uploads/panel-invoices");

function invoicePdfAbsPath(storageKey: string): string {
  const rel = storageKey.replace(/^\/+/, "");
  const resolved = path.resolve(INVOICE_UPLOAD_ROOT, rel);
  const root = path.resolve(INVOICE_UPLOAD_ROOT);
  if (!resolved.startsWith(root)) {
    throw new Error("invalid_storage_key");
  }
  return resolved;
}

function defaultMonthlyPdfKey(companyId: string, invoiceNumber: string): string {
  const companyKey = companyId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(companyKey, "monthly-invoices", `${invoiceNumber}.pdf`).replace(/\\/g, "/");
}

router.get("/panel/v1/invoices", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "billing")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "rides.read")) return;
    const invoices = await listPanelInvoicesForCompany(ctx.claims.companyId);
    res.json({ ok: true, invoices });
  } catch (e) {
    next(e);
  }
});

router.get("/panel/v1/invoices/:invoiceId", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "billing")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "rides.read")) return;
    const invoiceId = String(req.params.invoiceId ?? "").trim();
    if (!invoiceId) {
      res.status(400).json({ error: "invoice_id_required" });
      return;
    }
    const invoice = await getPanelInvoiceForCompany(ctx.claims.companyId, invoiceId);
    if (!invoice) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true, invoice });
  } catch (e) {
    next(e);
  }
});

router.get("/panel/v1/invoices/:invoiceId/pdf", requirePanelAuth, async (req, res, next) => {
  try {
    const ctx = await assertActivePanelProfile(req as PanelAuthRequest, res);
    if (!ctx) return;
    if (!denyUnlessPanelModule(res, ctx.profile, "billing")) return;
    if (!denyUnlessPanelPermission(res, ctx.profile.role, "rides.read")) return;
    const invoiceId = String(req.params.invoiceId ?? "").trim();
    if (!invoiceId) {
      res.status(400).json({ error: "invoice_id_required" });
      return;
    }
    const invoice = await getPanelInvoiceForCompany(ctx.claims.companyId, invoiceId);
    if (!invoice) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    let storageKey = invoice.pdfStorageKey.trim();
    let pdfBuffer: Buffer | null = null;

    if (storageKey) {
      try {
        pdfBuffer = await readFile(invoicePdfAbsPath(storageKey));
      } catch {
        pdfBuffer = null;
      }
    }

    if (!pdfBuffer) {
      const taxRatePercent =
        invoice.subtotalNet > 0
          ? Math.round((invoice.vatTotal / invoice.subtotalNet) * 10000) / 100
          : 19;
      // Gleicher Baustein wie Monats-/Partner-Rechnungen (partnerInvoicePdf) — kein Sondertyp-Layout.
      pdfBuffer = await buildPartnerMonthlyInvoicePdf({
        invoiceNumber: invoice.invoiceNumber,
        statusLabel: invoicePdfNeutralStatusLabel(),
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        periodFrom: invoice.periodFrom,
        periodTo: invoice.periodTo,
        recipientName: invoice.recipient.billingName,
        recipientLines: invoice.recipient.billingLines,
        items: mapPanelInvoiceItemsForPdf(invoice.items),
        subtotalNet: invoice.subtotalNet,
        vatTotal: invoice.vatTotal,
        totalGross: invoice.totalGross,
        taxRatePercent,
        notes: invoice.notes,
        paymentReference: invoice.paymentReference,
      });
      if (!storageKey) {
        storageKey = defaultMonthlyPdfKey(ctx.claims.companyId, invoice.invoiceNumber);
      }
      const absPath = invoicePdfAbsPath(storageKey);
      await mkdir(path.dirname(absPath), { recursive: true });
      await writeFile(absPath, pdfBuffer);
      if (!invoice.pdfStorageKey.trim()) {
        await setPanelInvoicePdfStorageKey(ctx.claims.companyId, invoiceId, storageKey);
      }
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="ONRODA-Rechnung-${invoice.invoiceNumber}.pdf"`,
    );
    res.send(pdfBuffer);
  } catch (e) {
    if (e instanceof Error && e.message === "invalid_storage_key") {
      res.status(400).json({ error: "invalid_pdf_storage_key" });
      return;
    }
    next(e);
  }
});

export default router;
