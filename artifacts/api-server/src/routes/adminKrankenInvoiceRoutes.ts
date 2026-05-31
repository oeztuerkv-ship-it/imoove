import { Router, type IRouter } from "express";
import {
  getKrankenInvoiceAdminKpis,
  getKrankenInvoiceById,
  listAllKrankenInvoicesAdmin,
  markKrankenInvoicePaidAdmin,
} from "../db/krankenInvoicesData.js";
import { readKrankenInvoicePdfBuffer } from "../lib/krankenInvoicePdfService.js";

const router: IRouter = Router();

router.get("/kranken-invoices", async (req, res, next) => {
  try {
    const invoices = await listAllKrankenInvoicesAdmin();
    const kpis = await getKrankenInvoiceAdminKpis();
    res.json({ ok: true, invoices, kpis });
  } catch (e) {
    next(e);
  }
});

router.get("/kranken-invoices/:invoiceId/pdf", async (req, res, next) => {
  try {
    const invoiceId = String(req.params.invoiceId ?? "").trim();
    const detail = await getKrankenInvoiceById(invoiceId);
    if (!detail) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }
    const buffer = await readKrankenInvoicePdfBuffer(invoiceId);
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

router.patch("/kranken-invoices/:invoiceId/paid", async (req, res, next) => {
  try {
    const invoiceId = String(req.params.invoiceId ?? "").trim();
    const updated = await markKrankenInvoicePaidAdmin(invoiceId);
    if (!updated) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }
    res.json({ ok: true, invoice: updated });
  } catch (e) {
    next(e);
  }
});

export default router;
