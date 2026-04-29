#!/usr/bin/env node
/**
 * Optional gegen laufende API (gleiche Builds wie Produktion).
 * Setzt z. B.:
 *   EMAIL_VERIFICATION_E2E_URL=http://127.0.0.1:3000/api
 * Server braucht DATABASE_URL und idealerweise SMTP_URL — sonst 503 bei /start erwartbar.
 *
 * Prüft: Start liefert definierten Status; Verify mit falschem Code erhält 400; Resend strukturell gleich wie Start.
 */
const baseRaw = (process.env.EMAIL_VERIFICATION_E2E_URL ?? "").trim().replace(/\/+$/, "");

if (!baseRaw) {
  console.log(
    "Skip HTTP test: export EMAIL_VERIFICATION_E2E_URL=http://127.0.0.1:3000/api (API muss laufen).",
  );
  process.exit(0);
}

const testEmail = `e2e-email-ver-${Date.now()}@example.invalid`;
const purpose = "customer_registration";

async function json(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

async function main() {
  const start = await fetch(`${baseRaw}/auth/email/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, purpose }),
  });
  await json(start);
  if (![200, 429, 503, 502, 400].includes(start.status)) {
    throw new Error(`unexpected /auth/email/start status ${start.status}`);
  }

  const verifyBad = await fetch(`${baseRaw}/auth/email/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, code: "000000", purpose }),
  });
  const vj = await json(verifyBad);
  if (verifyBad.status !== 400 || vj?.ok !== false) {
    throw new Error(
      `expected 400 invalid verify for wrong code, got ${verifyBad.status} ${JSON.stringify(vj)}`,
    );
  }

  const resend = await fetch(`${baseRaw}/auth/email/resend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, purpose }),
  });
  await json(resend);
  if (![200, 429, 503, 502, 400].includes(resend.status)) {
    throw new Error(`unexpected /auth/email/resend status ${resend.status}`);
  }

  console.log("email-verification-http: OK", { start: start.status, verifyWrong: verifyBad.status, resend: resend.status });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
