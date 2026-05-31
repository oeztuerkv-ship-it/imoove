const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normIban(raw) {
  return String(raw || "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

export function isValidIbanOptional(raw) {
  const iban = normIban(raw);
  if (!iban) return true;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = "";
  for (const ch of rearranged) {
    const chunk = remainder + (ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch);
    remainder = String(parseInt(chunk, 10) % 97);
  }
  return parseInt(remainder, 10) === 1;
}

export function isValidEmailOptional(raw) {
  const e = String(raw || "").trim();
  if (!e) return true;
  return EMAIL_RE.test(e);
}

export function commissionPercentFromRate(rate) {
  const r = typeof rate === "number" ? rate : Number(rate);
  if (!Number.isFinite(r) || r < 0) return 10;
  return Math.round(r * 1000) / 10;
}

export function commissionRateFromPercent(pct) {
  const p = Number(pct);
  if (!Number.isFinite(p)) return 0.1;
  return Math.min(1, Math.max(0, p / 100));
}
