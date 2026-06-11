import type { UserProfile } from "@/context/UserContext";

export type CustomerAuthProvider = "google" | "apple" | "email";

/** Google-Hinweis nur bei echtem Google-OAuth — nicht bei Apple (nutzt ebenfalls googleId/passenger_id). */
export function isGoogleOAuthProfile(
  profile: Pick<UserProfile, "authProvider" | "googleIdToken" | "googleAccessToken">,
): boolean {
  if (profile.authProvider === "google") return true;
  if (profile.authProvider === "apple" || profile.authProvider === "email") return false;
  return Boolean(profile.googleIdToken?.trim() || profile.googleAccessToken?.trim());
}
