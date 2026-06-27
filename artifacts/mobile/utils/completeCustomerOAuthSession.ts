import {
  fetchCustomerLegalStatus,
  mapCustomerLegalError,
} from "@/utils/customerLegalConsent";

export type PendingOAuthSession = {
  sessionToken: string;
  profile: Record<string, unknown>;
};

export type OAuthSessionGateResult =
  | { kind: "ready"; session: PendingOAuthSession }
  | { kind: "needs_consent"; session: PendingOAuthSession }
  | { kind: "error"; message: string };

/** Prüft nach Google/Apple-OAuth, ob AGB/Datenschutz noch fehlen. */
export async function gateCustomerOAuthSession(
  sessionToken: string,
  profile: Record<string, unknown>,
): Promise<OAuthSessionGateResult> {
  const outcome = await fetchCustomerLegalStatus(sessionToken);
  if (!outcome.ok) {
    return { kind: "error", message: mapCustomerLegalError(outcome.error) };
  }
  const session: PendingOAuthSession = { sessionToken, profile };
  if (outcome.status.hasConsent) {
    return { kind: "ready", session };
  }
  return { kind: "needs_consent", session };
}
