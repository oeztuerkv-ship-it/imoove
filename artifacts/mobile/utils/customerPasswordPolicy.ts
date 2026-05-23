/** Kunden-Passwort (muss mit API `validateCustomerPassword` übereinstimmen). */
export const CUSTOMER_PASSWORD_HINT =
  "Mindestens 8 Zeichen, davon mindestens ein Sonderzeichen (z. B. . ! ? @ #)";

export function validateCustomerPasswordClient(plain: string): string | null {
  const p = typeof plain === "string" ? plain : "";
  if (p.length < 8) return "Mindestens 8 Zeichen eingeben.";
  if (!/[^a-zA-Z0-9]/.test(p)) {
    return "Mindestens ein Sonderzeichen (z. B. Punkt oder !) eingeben.";
  }
  return null;
}

export function passwordsMatchClient(plain: string, confirm: string): boolean {
  return plain === confirm;
}
