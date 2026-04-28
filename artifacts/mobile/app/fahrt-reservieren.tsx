import { Redirect } from "expo-router";

/** @deprecated Einheitlicher Einstieg: `booking-center` (Buchungszentrale). */
export default function FahrtReservierenRedirect() {
  return <Redirect href="/booking-center" />;
}
