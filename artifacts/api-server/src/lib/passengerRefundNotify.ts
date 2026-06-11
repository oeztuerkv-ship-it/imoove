import { listPassengerExpoPushTokens } from "../db/passengerExpoPushData";
import { sendExpoPushMessages } from "./expoPushGateway";
import { sendOnrodaMail } from "./onrodaSmtpMail";
import { findCustomerAccountById } from "../db/customerAccountsData";

export async function notifyPassengerRideRefunded(
  passengerId: string,
  rideId: string,
  amountEur: number,
): Promise<void> {
  const pax = passengerId.trim();
  if (!pax) return;

  const tokens = await listPassengerExpoPushTokens(pax);
  if (tokens.length > 0) {
    await sendExpoPushMessages(
      tokens.map((to) => ({
        to,
        title: "Rückerstattung",
        body: `Für deine Fahrt wurde ${amountEur.toFixed(2).replace(".", ",")} € zurückerstattet.`,
        data: { kind: "ride_refunded", rideId },
      })),
    );
  }

  const account = await findCustomerAccountById(pax);
  const email = account?.email?.trim();
  if (!email) return;

  void sendOnrodaMail({
    to: email,
    subject: "ONRODA — Rückerstattung",
    text: `Guten Tag,\n\nfür Ihre Fahrt (${rideId.slice(0, 8)}) wurde eine Rückerstattung von ${amountEur.toFixed(2)} EUR veranlasst.\n\nIhr ONRODA-Team`,
    html: `<p>Guten Tag,</p><p>für Ihre Fahrt wurde eine Rückerstattung von <strong>${amountEur.toFixed(2)}&nbsp;EUR</strong> veranlasst.</p><p>Ihr ONRODA-Team</p>`,
    logEvent: "passenger_ride_refund",
  });
}
