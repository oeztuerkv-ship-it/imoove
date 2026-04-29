const PREFIX = "onroda.medical.v1|";

/** Entspricht `formatMedicalQrPayload` in der API. */
export function parseMedicalQrPayload(raw: string): { rideId: string; token: string } | null {
  const s = raw.trim();
  if (!s.startsWith(PREFIX)) return null;
  const rest = s.slice(PREFIX.length);
  const i = rest.indexOf("|");
  if (i <= 0 || i >= rest.length - 1) return null;
  const rideId = rest.slice(0, i).trim();
  const token = rest.slice(i + 1).trim();
  if (!rideId || !token) return null;
  return { rideId, token };
}
