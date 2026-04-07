/**
 * Google OAuth 2.0 (Installed/Web clients in Google Cloud Console).
 * Optional per .env überschreiben, sonst die Projekt-Standard-IDs.
 */
export const GOOGLE_OAUTH_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ||
  "584139886361-scvjrt3atv70t5r8n6m7isom08u5p2ia.apps.googleusercontent.com";

export const GOOGLE_OAUTH_ANDROID_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim() ||
  "584139886361-9f170un46v32n9j8v26o775825o06708.apps.googleusercontent.com";

export const GOOGLE_OAUTH_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ||
  "584139886361-e016n1h8356n5675n6n78n9n0n1n2n3.apps.googleusercontent.com";
