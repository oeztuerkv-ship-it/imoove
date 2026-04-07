import { Redirect } from "expo-router";

/** Alte URL aus Dokumentation/Bookmarks → aktuelle Fahrer-Route. */
export default function FahrerLoginAlias() {
  return <Redirect href="/driver/login" />;
}
