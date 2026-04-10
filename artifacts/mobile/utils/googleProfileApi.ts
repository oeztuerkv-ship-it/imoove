export type GoogleProfileApiResponse = {
  googleId: string;
  name: string;
  email: string;
  photoUri: string | null;
  idToken?: string | null;
  accessToken?: string | null;
  accessTokenExpiresAt?: number | null;
};

/** Payload für `loginWithGoogle` aus `/auth/google/profile` (ohne Import aus UserContext = kein Require-Zyklus). */
export function mapGoogleProfileToLogin(data: GoogleProfileApiResponse): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: data.name,
    email: data.email,
    photoUri: data.photoUri,
    googleId: data.googleId,
  };
  if (data.idToken != null) out.googleIdToken = data.idToken;
  if (data.accessToken != null) out.googleAccessToken = data.accessToken;
  if (data.accessTokenExpiresAt != null) out.googleAccessTokenExpiresAt = data.accessTokenExpiresAt;
  return out;
}
