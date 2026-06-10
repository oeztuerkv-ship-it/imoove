import { findCustomerAccountById } from "../db/customerAccountsData";
import { CUSTOMER_CANCELLATION_SUSPENSION_MESSAGE_DE } from "./customerCancellationSuspensionPolicy";
import { escapeHtmlMail, isOnrodaSmtpConfigured, sendOnrodaMail } from "./onrodaSmtpMail";

export async function sendCustomerCancellationSuspensionEmail(
  passengerId: string,
  passengerName?: string,
): Promise<void> {
  const account = await findCustomerAccountById(passengerId.trim());
  const to = account?.email?.trim() ?? "";
  if (!to || !to.includes("@")) return;
  if (!isOnrodaSmtpConfigured()) return;

  const name = (passengerName ?? account?.name ?? "Kunde").trim() || "Kunde";
  const subject = "ONRODA – Vorübergehende Kontosperre";
  const text = [
    `Hallo ${name},`,
    "",
    CUSTOMER_CANCELLATION_SUSPENSION_MESSAGE_DE,
    "",
    "Die Sperre gilt 24 Stunden. Danach können Sie wieder Fahrten buchen.",
    "",
    "Bei Fragen wenden Sie sich an unseren Support.",
    "",
    "Ihr ONRODA-Team",
  ].join("\n");
  const html = `
    <p>Hallo ${escapeHtmlMail(name)},</p>
    <p><strong>${escapeHtmlMail(CUSTOMER_CANCELLATION_SUSPENSION_MESSAGE_DE)}</strong></p>
    <p>Die Sperre gilt <strong>24 Stunden</strong>. Danach können Sie wieder Fahrten buchen.</p>
    <p>Bei Fragen wenden Sie sich an unseren Support.</p>
    <p>Ihr ONRODA-Team</p>
  `.trim();

  await sendOnrodaMail({
    to,
    subject,
    text,
    html,
    logEvent: "customer.cancellation_suspension",
  });
}
