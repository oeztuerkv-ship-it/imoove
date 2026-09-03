/**
 * RerouteEngine (Schritt 5) — ein aktiver Request, Generation-Guard, späte Responses verwerfen.
 *
 * Side-Effects (fetch) bleiben im Screen; hier nur Lifecycle-State.
 */

/** Mindestabstand zwischen Reroute-Versuchen (auch nach Fehler). */
export const NAV_REROUTE_COOLDOWN_MS = 3_000;

export type RerouteEngineState = {
  /** Genau ein aktiver Request (null = idle). */
  activeRequestId: number | null;
  /** Monoton steigende Request-IDs. */
  nextRequestId: number;
  lastRerouteAtMs: number | null;
  /**
   * Generation, auf die der aktive Request gebunden ist (Snapshot vor Start).
   * Späte Responses mit anderem Token werden verworfen.
   */
  requestBoundGeneration: number | null;
  /**
   * Nach begin: Engine-Bound-Generation wird auf diesen Wert gesetzt
   * (alte Snapshot-Generation ist damit stale).
   */
  invalidateToGeneration: number | null;
};

export function createRerouteEngineState(): RerouteEngineState {
  return {
    activeRequestId: null,
    nextRequestId: 1,
    lastRerouteAtMs: null,
    requestBoundGeneration: null,
    invalidateToGeneration: null,
  };
}

export function isRerouteInFlight(state: RerouteEngineState): boolean {
  return state.activeRequestId != null;
}

export function canStartReroute(opts: {
  inFlight: boolean;
  lastRerouteAtMs: number | null;
  nowMs: number;
  cooldownMs?: number;
}): boolean {
  if (opts.inFlight) return false;
  const cooldown = opts.cooldownMs ?? NAV_REROUTE_COOLDOWN_MS;
  if (opts.lastRerouteAtMs != null && opts.nowMs - opts.lastRerouteAtMs < cooldown) {
    return false;
  }
  return true;
}

export function canBeginReroute(
  state: RerouteEngineState,
  nowMs: number,
  cooldownMs?: number,
): boolean {
  return canStartReroute({
    inFlight: isRerouteInFlight(state),
    lastRerouteAtMs: state.lastRerouteAtMs,
    nowMs,
    cooldownMs,
  });
}

export type BeginRerouteResult = {
  state: RerouteEngineState;
  requestId: number;
  /** Engine.routeGeneration auf diesen Wert setzen → alte Snapshots stale. */
  invalidateToGeneration: number;
};

/**
 * Startet genau einen Request. Alte Guidance/Generation invalidieren (Caller).
 */
export function beginReroute(
  state: RerouteEngineState,
  opts: { nowMs: number; currentBoundGeneration: number; cooldownMs?: number },
): BeginRerouteResult | null {
  if (!canBeginReroute(state, opts.nowMs, opts.cooldownMs)) return null;

  const requestId = state.nextRequestId;
  const bound = Math.max(0, opts.currentBoundGeneration);
  const invalidateToGeneration = bound + 1;

  return {
    requestId,
    invalidateToGeneration,
    state: {
      activeRequestId: requestId,
      nextRequestId: requestId + 1,
      lastRerouteAtMs: opts.nowMs,
      requestBoundGeneration: bound,
      invalidateToGeneration,
    },
  };
}

/** Response gehört noch zum aktiven Request? */
export function shouldAcceptRerouteResponse(
  state: RerouteEngineState,
  requestId: number,
): boolean {
  return state.activeRequestId != null && state.activeRequestId === requestId;
}

/**
 * Erfolgreiche atomare Übernahme — Caller apply't Route mit neuer Generation.
 */
export function completeReroute(
  state: RerouteEngineState,
  requestId: number,
  nowMs: number,
): RerouteEngineState {
  if (!shouldAcceptRerouteResponse(state, requestId)) return state;
  return {
    ...state,
    activeRequestId: null,
    requestBoundGeneration: null,
    invalidateToGeneration: null,
    lastRerouteAtMs: nowMs,
  };
}

/** Fehler / Abbruch nur für den aktiven Request. */
export function failReroute(
  state: RerouteEngineState,
  requestId: number,
  nowMs: number,
): RerouteEngineState {
  if (!shouldAcceptRerouteResponse(state, requestId)) return state;
  return {
    ...state,
    activeRequestId: null,
    requestBoundGeneration: null,
    invalidateToGeneration: null,
    lastRerouteAtMs: nowMs,
  };
}

/** Späte/fremde Response — State unverändert. */
export function discardStaleRerouteResponse(
  state: RerouteEngineState,
  requestId: number,
): { accepted: false; state: RerouteEngineState } | { accepted: true; state: RerouteEngineState } {
  if (!shouldAcceptRerouteResponse(state, requestId)) {
    return { accepted: false, state };
  }
  return { accepted: true, state };
}
