import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { findCompanyById } from "../db/adminData.js";
import {
  companySenderLines,
  getKrankenInvoiceById,
  updateKrankenInvoicePdfKey,
} from "../db/krankenInvoicesData.js";
import { renderKrankenInvoicePdf } from "./invoice/krankenInvoicePdf.js";

const KRANKEN_INVOICE_UPLOAD_ROOT =
  (process.env.KRANKEN_INVOICE_UPLOAD_DIR ?? "").trim() ||
  path.resolve(process.cwd(), "artifacts/api-server/uploads/kranken-invoices");

function pdfAbsPath(storageKey: string): string {
  const rel = storageKey.replace(/^\/+/, "");
  const resolved = path.resolve(KRANKEN_INVOICE_UPLOAD_ROOT, rel);
  const root = path.resolve(KRANKEN_INVOICE_UPLOAD_ROOT);
  if (!resolved.startsWith(root)) throw new Error("invalid_storage_key");
  return resolved;
}

function defaultPdfKey(companyId: string, invoiceNumber: string): string {
  const companyKey = companyId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(companyKey, `${invoiceNumber}.pdf`).replace(/\\/g, "/");
}

export async function buildAndStoreKrankenInvoicePdf(
  invoiceId: string,
  companyId: string,
): Promise<{ buffer: Buffer; storageKey: string } | null> {
  const detail = await getKrankenInvoiceById(invoiceId, companyId);
  if (!detail) return null;
  const company = await findCompanyById(companyId);
  if (!company) return null;

  const inv = detail.invoice;
  const ratePct = Math.round(inv.commissionRateSnap * 10000) / 100;

  const buffer = await renderKrankenInvoicePdf({
    invoiceNumber: inv.invoiceNumber,
    issueDate: inv.createdAt,
    periodFrom: inv.periodFrom,
    periodTo: inv.periodTo,
    senderName: company.name,
    senderLines: companySenderLines(company),
    recipientName: inv.insurerName || "Krankenkasse",
    recipientLines: [
      inv.insurerIk ? `IK: ${inv.insurerIk}` : "",
      inv.insurerEmail ? `E-Mail: ${inv.insurerEmail}` : "",
    ].filter(Boolean),
    vouchers: detail.vouchers,
    totalAmount: inv.totalAmount,
    commissionAmount: inv.commissionAmount,
    netAmount: inv.netAmount,
    commissionRatePercent: ratePct,
  });

  const storageKey = inv.pdfStorageKey?.trim() || defaultPdfKey(companyId, inv.invoiceNumber);
  const abs = pdfAbsPath(storageKey);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buffer);
  if (!inv.pdfStorageKey?.trim()) {
    await updateKrankenInvoicePdfKey(invoiceId, storageKey);
  }

  return { buffer, storageKey };
}

export async function readKrankenInvoicePdfBuffer(
  invoiceId: string,
  companyId?: string,
): Promise<Buffer | null> {
  const detail = await getKrankenInvoiceById(invoiceId, companyId);
  if (!detail) return null;
  if (!detail.invoice.pdfStorageKey) {
    const built = await buildAndStoreKrankenInvoicePdf(invoiceId, detail.invoice.companyId);
    return built?.buffer ?? null;
  }
  try {
    const { readFile } = await import("node:fs/promises");
    return await readFile(pdfAbsPath(detail.invoice.pdfStorageKey));
  } catch {
    const built = await buildAndStoreKrankenInvoicePdf(invoiceId, detail.invoice.companyId);
    return built?.buffer ?? null;
  }
}
