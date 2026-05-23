/** Passwort-Regeln Kunden-App (E-Mail-Registrierung / Reset). */
export function validateCustomerPassword(plain: string): { ok: true } | { ok: false; error: string } {
  const p = typeof plain === "string" ? plain : "";
  if (p.length < 8) {
    return { ok: false, error: "password_too_short" };
  }
  if (!/[^a-zA-Z0-9]/.test(p)) {
    return { ok: false, error: "password_needs_special" };
  }
  return { ok: true };
}

export function passwordsMatch(plain: string, confirm: string): boolean {
  return plain === confirm;
}
