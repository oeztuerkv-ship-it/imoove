import { Redirect } from "expo-router";

/** @deprecated Einheitlicher Einstieg: `reserve-ride` (kanonischer Buchungsflow). */
export default function FahrtReservierenRedirect() {
  return <Redirect href="/reserve-ride" />;
}
