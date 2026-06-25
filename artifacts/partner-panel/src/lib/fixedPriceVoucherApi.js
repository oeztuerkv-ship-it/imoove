import { API_BASE } from "./apiBase.js";

const BASE = `${API_BASE}/panel/v1/fixed-price-vouchers`;

export function panelVoucherAuthHeaders(token) {
  const t = typeof token === "string" ? token.trim() : "";
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function estimateFixedPriceVoucher(token, body) {
  const res = await fetch(`${BASE}/estimate`, {
    method: "POST",
    headers: { ...panelVoucherAuthHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    throw new Error(data?.message || data?.estimate?.message || data?.error || "estimate_failed");
  }
  return data.estimate;
}

export async function startFixedPriceVoucherCheckout(token, body) {
  const res = await fetch(`${BASE}/checkout`, {
    method: "POST",
    headers: { ...panelVoucherAuthHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok || !data.checkoutUrl) {
    throw new Error(data?.message || data?.error || "checkout_failed");
  }
  return data;
}

export async function fetchFixedPriceVoucherOrders(token) {
  const res = await fetch(`${BASE}/orders`, { headers: panelVoucherAuthHeaders(token) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) throw new Error(data?.error || "orders_load_failed");
  return Array.isArray(data.orders) ? data.orders : [];
}

export async function fetchFixedPriceVoucherOrderBySession(token, sessionId) {
  const res = await fetch(`${BASE}/orders/by-session/${encodeURIComponent(sessionId)}`, {
    headers: panelVoucherAuthHeaders(token),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) throw new Error(data?.error || "order_load_failed");
  return data.order;
}

export function fixedPriceVoucherPdfUrl(orderId) {
  return `${BASE}/orders/${encodeURIComponent(orderId)}/pdf`;
}

export async function downloadFixedPriceVoucherPdf(token, orderId) {
  const res = await fetch(fixedPriceVoucherPdfUrl(orderId), { headers: panelVoucherAuthHeaders(token) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `pdf_failed:${res.status}`);
  }
  return res.blob();
}
