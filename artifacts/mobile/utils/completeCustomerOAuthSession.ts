import {
  fetchCustomerLegalStatus,
  mapCustomerLegalError,
  recordCustomerLegalAcceptance,
} from "@/utils/customerLegalConsent";

export type PendingOAuthSession = {
  sessionToken: string;
  profile: Record<string, unknown>;
};

export type OAuthSessionGateResult =
  | { kind: "ready"; session: PendingOAuthSession }
  | { kind: "needs_consent"; session: PendingOAuthSession }
  | { kind: "error"; message: string };

/**
 * OAuth abschließen: optional lokale AGB-Checkbox direkt auf dem Server speichern,
 * danach Legal-Gate prüfen.
 */
export async function finalizeCustomerOAuthSession(opts: {
  sessionToken: string;
  profile: Record<string, unknown>;
  /** Social-Login: Nutzer hat AGB-Checkbox bereits gesetzt. */
  localLegalAccepted?: boolean;
}): Promise<OAuthSessionGateResult> {
  const token = opts.sessionToken.trim();
  if (opts.localLegalAccepted) {
    const recorded = await recordCustomerLegalAcceptance(token);
    if (!recorded.ok) {
      return { kind: "error", message: mapCustomerLegalError(recorded.error) };
    }
  }
  return gateCustomerOAuthSession(token, opts.profile);
}

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
