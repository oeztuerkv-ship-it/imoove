/** Deutsche Mobilnummer: nur Ziffern, ohne führende 0. */
export function normalizeDeNationalFromInput(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("49") && d.length >= 12) return d.slice(2);
  if (d.startsWith("0")) return d.slice(1);
  return d;
}

export function isValidDeMobileNational(national: string): boolean {
  return national.length >= 10 && national.length <= 11;
}

/** `null` wenn die Nummer ungültig ist. */
export function toGermanE164(rawInput: string): string | null {
  const national = normalizeDeNationalFromInput(rawInput);
  if (!isValidDeMobileNational(national)) return null;
  return `+49${national}`;
}
