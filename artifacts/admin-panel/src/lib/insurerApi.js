import { API_BASE } from "./apiBase.js";

const BASE = `${API_BASE}/admin/insurance`;

function qs(p) {
  const q = new URLSearchParams();
  Object.entries(p || {}).forEach(([k, v]) => {
    if (v != null && v !== "") q.set(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function insurerSummaryUrl(params) {
  return `${BASE}/summary${qs({ from: params?.from, to: params?.to, companyId: params?.companyId })}`;
}

export function insurerRidesUrl(params) {
  return `${BASE}/rides${qs({
    from: params?.from,
    to: params?.to,
    page: params?.page,
    pageSize: params?.pageSize,
    companyId: params?.companyId,
    status: params?.status,
  })}`;
}

export function insurerRideDetailUrl(rideId) {
  return `${BASE}/rides/${encodeURIComponent(rideId)}`;
}

export function insurerExportsListUrl(params) {
  return `${BASE}/exports${qs({ limit: params?.limit })}`;
}

export function insurerExportDownloadUrl(batchId) {
  return `${BASE}/exports/${encodeURIComponent(batchId)}/download`;
}

export const insurerExportsPostUrl = `${BASE}/exports`;
