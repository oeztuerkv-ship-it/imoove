/**
 * Partner-Monatsrechnungen (echte API, kein Frontend-PDF).
 * Ersetzt schrittweise den Demo-PDF-Button im Hotel-Panel.
 */

export function panelInvoicesUrl(apiBase) {
  return `${String(apiBase).replace(/\/+$/, "")}/panel/v1/invoices`;
}

export function panelInvoiceDetailUrl(apiBase, invoiceId) {
  return `${panelInvoicesUrl(apiBase)}/${encodeURIComponent(invoiceId)}`;
}

export function panelInvoicePdfUrl(apiBase, invoiceId) {
  return `${panelInvoiceDetailUrl(apiBase, invoiceId)}/pdf`;
}

/** @param {string | null | undefined} token */
export function panelInvoiceAuthHeaders(token) {
  const t = typeof token === "string" ? token.trim() : "";
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** @param {string} apiBase @param {string | null | undefined} token */
export async function fetchPanelInvoices(apiBase, token) {
  const res = await fetch(panelInvoicesUrl(apiBase), { headers: panelInvoiceAuthHeaders(token) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `invoices_list_failed:${res.status}`);
  }
  return data;
}

/** @param {string} apiBase @param {string} invoiceId @param {string | null | undefined} token */
export async function fetchPanelInvoice(apiBase, invoiceId, token) {
  const res = await fetch(panelInvoiceDetailUrl(apiBase, invoiceId), {
    headers: panelInvoiceAuthHeaders(token),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `invoice_detail_failed:${res.status}`);
  }
  return data;
}

/**
 * @param {string} apiBase
 * @param {string} invoiceId
 * @param {string | null | undefined} token
 */
export async function downloadPanelInvoicePdf(apiBase, invoiceId, token) {
  const res = await fetch(panelInvoicePdfUrl(apiBase, invoiceId), {
    headers: panelInvoiceAuthHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `invoice_pdf_failed:${res.status}`);
  }
  return res.blob();
}
