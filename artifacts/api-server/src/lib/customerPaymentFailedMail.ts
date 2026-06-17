import { findCustomerAccountById } from "../db/customerAccountsData";
import { escapeHtmlMail, isOnrodaSmtpConfigured, sendOnrodaMail } from "./onrodaSmtpMail";

function formatEur(amount: number): string {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

export async function sendCustomerPaymentFailedEmail(
  passengerId: string,
  rideId: string,
  amountEur: number,
): Promise<void> {
  const account = await findCustomerAccountById(passengerId.trim());
  const to = account?.email?.trim() ?? "";
  if (!to || !to.includes("@")) return;
  if (!isOnrodaSmtpConfigured()) return;

  const name = (account?.name ?? "Kunde").trim() || "Kunde";
  const amountLabel = formatEur(amountEur);
  const subject = "ONRODA – Zahlung fehlgeschlagen";
  const text = [
    `Hallo ${name},`,
    "",
    "Die Abbuchung für Ihre abgeschlossene Fahrt ist fehlgeschlagen.",
    `Betrag: ${amountLabel}`,
    `Fahrt-ID: ${rideId}`,
    "",
    "Bitte öffnen Sie die ONRODA-App, aktualisieren Sie Ihre Zahlungsmethode in der Geldbörse",
    "und begleichen Sie die offene Zahlung.",
    "",
    "Ohne Begleichung können weitere Buchungen vorübergehend nicht möglich sein.",
    "",
    "Ihr ONRODA-Team",
  ].join("\n");
  const html = `
    <p>Hallo ${escapeHtmlMail(name)},</p>
    <p>Die Abbuchung für Ihre abgeschlossene Fahrt ist <strong>fehlgeschlagen</strong>.</p>
    <p>Betrag: <strong>${escapeHtmlMail(amountLabel)}</strong><br/>Fahrt-ID: ${escapeHtmlMail(rideId)}</p>
    <p>Bitte öffnen Sie die ONRODA-App, aktualisieren Sie Ihre Zahlungsmethode in der <strong>Geldbörse</strong>
    und begleichen Sie die offene Zahlung.</p>
    <p>Ohne Begleichung können weitere Buchungen vorübergehend nicht möglich sein.</p>
    <p>Ihr ONRODA-Team</p>
  `.trim();

  await sendOnrodaMail({
    to,
    subject,
    text,
    html,
    logEvent: "customer.payment_failed",
  });
}

export async function sendCustomerPaymentBlockedEmail(
  passengerId: string,
  rideId: string,
): Promise<void> {
  const account = await findCustomerAccountById(passengerId.trim());
  const to = account?.email?.trim() ?? "";
  if (!to || !to.includes("@")) return;
  if (!isOnrodaSmtpConfigured()) return;

  const name = (account?.name ?? "Kunde").trim() || "Kunde";
  const subject = "ONRODA – Buchung gesperrt (offene Zahlung)";
  const text = [
    `Hallo ${name},`,
    "",
    "Wir konnten die Zahlung für eine abgeschlossene Fahrt mehrfach nicht einziehen.",
    `Fahrt-ID: ${rideId}`,
    "",
    "Neue Buchungen sind vorübergehend nicht möglich, bis die offene Zahlung beglichen ist.",
    "Bitte aktualisieren Sie Ihre Zahlungsmethode in der Geldbörse.",
    "",
    "Ihr ONRODA-Team",
  ].join("\n");
  const html = `
    <p>Hallo ${escapeHtmlMail(name)},</p>
    <p>Wir konnten die Zahlung für eine abgeschlossene Fahrt mehrfach nicht einziehen.</p>
    <p>Fahrt-ID: ${escapeHtmlMail(rideId)}</p>
    <p><strong>Neue Buchungen sind vorübergehend nicht möglich</strong>, bis die offene Zahlung beglichen ist.</p>
    <p>Bitte aktualisieren Sie Ihre Zahlungsmethode in der Geldbörse.</p>
    <p>Ihr ONRODA-Team</p>
  `.trim();

  await sendOnrodaMail({
    to,
    subject,
    text,
    html,
    logEvent: "customer.payment_blocked",
  });
}
