import { Redirect } from "expo-router";

/**
 * Pfad für `Linking.createURL("google-auth")` nach Google-OAuth.
 * Die ASWebAuthenticationSession liefert die URL meist direkt an `openAuthSessionAsync`;
 * falls der Router den Link öffnet, landet man hier und wird zum Konto geleitet.
 */
export default function GoogleAuthRoute() {
  return <Redirect href="/profile" />;
}
