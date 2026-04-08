import { Redirect } from "expo-router";

/**
 * Route `google-auth` — muss mit `AuthSession.makeRedirectUri({ path: 'google-auth' })` übereinstimmen.
 * Die ASWebAuthenticationSession liefert die URL meist direkt an `openAuthSessionAsync`;
 * falls der Router den Link öffnet, landet man hier und wird zum Konto geleitet.
 */
export default function GoogleAuthRoute() {
  return <Redirect href="/profile" />;
}
