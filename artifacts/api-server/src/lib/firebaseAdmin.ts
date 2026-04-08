import admin from "firebase-admin";

/**
 * Firebase Admin nur über Umgebungsvariablen — niemals Service-Account-JSON committen.
 *
 * Variante A (empfohlen lokal/Server mit Datei):
 *   GOOGLE_APPLICATION_CREDENTIALS=/absoluter/pfad/zur-service-account.json
 *
 * Variante B (Container/Secrets: ein Zeichenketten-Secret):
 *   FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
 *
 * Hinweis: Nach einem Leak den Schlüssel in der Google Cloud Console rotieren.
 */
export function isFirebaseAdminConfigured(): boolean {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT ?? "").trim();
  const path = (process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "").trim();
  return raw.length > 0 || path.length > 0;
}

function ensureFirebaseApp(): admin.app.App {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const rawJson = (process.env.FIREBASE_SERVICE_ACCOUNT ?? "").trim();
  const credPath = (process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "").trim();

  if (rawJson) {
    let parsed: admin.ServiceAccount;
    try {
      parsed = JSON.parse(rawJson) as admin.ServiceAccount;
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT ist kein gültiges JSON.");
    }
    return admin.initializeApp({ credential: admin.credential.cert(parsed) });
  }

  if (credPath) {
    return admin.initializeApp({ credential: admin.credential.cert(credPath) });
  }

  throw new Error(
    "Firebase Admin nicht konfiguriert: GOOGLE_APPLICATION_CREDENTIALS oder FIREBASE_SERVICE_ACCOUNT setzen.",
  );
}

export function getFirebaseAuth(): admin.auth.Auth {
  return admin.auth(ensureFirebaseApp());
}
