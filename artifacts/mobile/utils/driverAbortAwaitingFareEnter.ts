/**
 * Mid-Trip-Abbruch: wiederholte Poll/Socket-Eintritte in `customer_abort_pending_fare`.
 * Seed von Fare-Input + Alert nur beim ersten Eintritt — sonst löscht Polling die Tippeingabe.
 */

export type AbortAwaitingFareEnterPlan = {
  /** Default-Betrag ins Eingabefeld (nur erster Eintritt). */
  seedFareInput: boolean;
  /** Alert / Haptik / TTS (nur erster Eintritt). */
  promptDriver: boolean;
  /** `abortFarePromptedRef` setzen. */
  markPrompted: boolean;
};

/**
 * Plant Side-Effects für `enterAbortAwaitingFare`.
 * Status/Modal dürfen bei jedem Tick gesetzt bleiben; Input/Prompt nicht.
 */
export function planAbortAwaitingFareEnter(alreadyPrompted: boolean): AbortAwaitingFareEnterPlan {
  if (alreadyPrompted) {
    return { seedFareInput: false, promptDriver: false, markPrompted: false };
  }
  return { seedFareInput: true, promptDriver: true, markPrompted: true };
}
