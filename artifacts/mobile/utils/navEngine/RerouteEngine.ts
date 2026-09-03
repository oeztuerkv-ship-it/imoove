/**
 * RerouteEngine (Schritt 5 / P5) — genau ein autorisierter Route-Request pro Session.
 *
 * Policy: neuer autorisierter Request invalidiert den vorherigen.
 * Ausnahme Request-Sturm: off_route und recover starten nicht, solange bereits inFlight.
 * `initial` (Phase/Ziel) darf superseden.
 *
 * Side-Effects (fetch) bleiben im Screen.
 */

/** Mindestabstand zwischen Reroute-Versuchen (auch nach Fehler). */
export const NAV_REROUTE_COOLDOWN_MS = 3_000;

export type NavRouteRequestReason = "initial" | "off_route" | "recover" | "recenter";

export type NavRouteRequest = {
  requestId: number;
  navigationSessionId: number;
  routeGenerationAtStart: number;
  expectedCommitGeneration: number;
  reason: NavRouteRequestReason;
  rerouteEpoch: number;
};

export type RouteDropReason =
  | "not_active"
  | "stale_request"
  | "stale_session"
  | "stale_epoch"
  | "stale_generation"
  | "unmounted"
  | "superseded";

export type RouteResponseDecision =
  | { ok: true }
  | { ok: false; dropReason: RouteDropReason };

export type RerouteEngineState = {
  activeRequest: NavRouteRequest | null;
  nextRequestId: number;
  lastRerouteAtMs: number | null;
  /**
   * Generation, auf die der aktive Request gebunden ist (Snapshot vor Start).
   */
  requestBoundGeneration: number | null;
  /**
   * Generation, die der Commit setzen soll (genau einmal, nicht schon bei begin).
   */
  invalidateToGeneration: number | null;
  rerouteEpoch: number;
  navigationSessionId: number | null;
};

export function createRerouteEngineState(
  navigationSessionId: number | null = null,
): RerouteEngineState {
  return {
    activeRequest: null,
    nextRequestId: 1,
    lastRerouteAtMs: null,
    requestBoundGeneration: null,
    invalidateToGeneration: null,
    rerouteEpoch: 1,
    navigationSessionId,
  };
}

export function isRerouteInFlight(state: RerouteEngineState): boolean {
  return state.activeRequest != null;
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
  reason: NavRouteRequestReason = "off_route",
): boolean {
  if (reason === "initial" || reason === "recenter") return true;
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
  request: NavRouteRequest;
  /** Engine-Commit-Generation nach Erfolg. */
  invalidateToGeneration: number;
  supersededRequestId: number | null;
};

function mayBeginRouteRequest(
  state: RerouteEngineState,
  reason: NavRouteRequestReason,
  nowMs: number,
  cooldownMs?: number,
): { ok: boolean; supersede: boolean } {
  const inFlight = isRerouteInFlight(state);
  if (reason === "initial" || reason === "recenter") {
    return { ok: true, supersede: inFlight };
  }
  if (inFlight) return { ok: false, supersede: false };
  if (
    !canStartReroute({
      inFlight: false,
      lastRerouteAtMs: state.lastRerouteAtMs,
      nowMs,
      cooldownMs,
    })
  ) {
    return { ok: false, supersede: false };
  }
  return { ok: true, supersede: false };
}

/**
 * Startet genau einen autorisierten Request. `initial`/`recenter` dürfen den aktiven ersetzen.
 */
export function beginRouteRequest(
  state: RerouteEngineState,
  opts: {
    nowMs: number;
    currentBoundGeneration: number;
    navigationSessionId: number;
    reason: NavRouteRequestReason;
    cooldownMs?: number;
  },
): BeginRerouteResult | null {
  const gate = mayBeginRouteRequest(state, opts.reason, opts.nowMs, opts.cooldownMs);
  if (!gate.ok) return null;

  const supersededRequestId = gate.supersede ? state.activeRequest?.requestId ?? null : null;
  const requestId = state.nextRequestId;
  const bound = Math.max(0, opts.currentBoundGeneration);
  const expectedCommitGeneration = bound + 1;
  const rerouteEpoch = gate.supersede ? state.rerouteEpoch + 1 : state.rerouteEpoch;
  const request: NavRouteRequest = {
    requestId,
    navigationSessionId: opts.navigationSessionId,
    routeGenerationAtStart: bound,
    expectedCommitGeneration,
    reason: opts.reason,
    rerouteEpoch,
  };

  return {
    requestId,
    request,
    invalidateToGeneration: expectedCommitGeneration,
    supersededRequestId,
    state: {
      activeRequest: request,
      nextRequestId: requestId + 1,
      lastRerouteAtMs: opts.nowMs,
      requestBoundGeneration: bound,
      invalidateToGeneration: expectedCommitGeneration,
      rerouteEpoch,
      navigationSessionId: opts.navigationSessionId,
    },
  };
}

/**
 * Startet genau einen Request. Alte Guidance/Generation invalidieren bleibt Caller
 * über `rerouteInFlight` (Generation erst beim Commit).
 */
export function beginReroute(
  state: RerouteEngineState,
  opts: {
    nowMs: number;
    currentBoundGeneration: number;
    cooldownMs?: number;
    navigationSessionId?: number;
    reason?: NavRouteRequestReason;
  },
): BeginRerouteResult | null {
  return beginRouteRequest(state, {
    nowMs: opts.nowMs,
    currentBoundGeneration: opts.currentBoundGeneration,
    navigationSessionId: opts.navigationSessionId ?? state.navigationSessionId ?? 0,
    reason: opts.reason ?? "off_route",
    cooldownMs: opts.cooldownMs,
  });
}

export function evaluateRouteResponse(
  state: RerouteEngineState,
  incoming: {
    requestId: number;
    navigationSessionId: number;
    mounted: boolean;
    currentRouteGeneration?: number;
  },
): RouteResponseDecision {
  if (!incoming.mounted) return { ok: false, dropReason: "unmounted" };
  const active = state.activeRequest;
  if (active == null) return { ok: false, dropReason: "not_active" };
  if (incoming.requestId !== active.requestId) {
    return { ok: false, dropReason: "stale_request" };
  }
  if (incoming.navigationSessionId !== active.navigationSessionId) {
    return { ok: false, dropReason: "stale_session" };
  }
  if (state.navigationSessionId != null && incoming.navigationSessionId !== state.navigationSessionId) {
    return { ok: false, dropReason: "stale_session" };
  }
  if (incoming.requestId === active.requestId && active.rerouteEpoch !== state.rerouteEpoch) {
    return { ok: false, dropReason: "stale_epoch" };
  }
  if (
    incoming.currentRouteGeneration != null &&
    incoming.currentRouteGeneration !== active.routeGenerationAtStart
  ) {
    return { ok: false, dropReason: "stale_generation" };
  }
  return { ok: true };
}

/** Response gehört noch zum aktiven Request? */
export function shouldAcceptRerouteResponse(
  state: RerouteEngineState,
  requestId: number,
  navigationSessionId?: number,
): boolean {
  const decision = evaluateRouteResponse(state, {
    requestId,
    navigationSessionId: navigationSessionId ?? state.activeRequest?.navigationSessionId ?? 0,
    mounted: true,
  });
  return decision.ok;
}

/**
 * Erfolgreiche atomare Übernahme — Caller apply't Route mit expectedCommitGeneration.
 */
export function completeReroute(
  state: RerouteEngineState,
  requestId: number,
  nowMs: number,
): RerouteEngineState {
  if (!shouldAcceptRerouteResponse(state, requestId)) return state;
  return {
    ...state,
    activeRequest: null,
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
    activeRequest: null,
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

/** Resume: inFlight aus pre-resync State darf nicht mehr committen. */
export function invalidateInFlightRouteRequests(state: RerouteEngineState): RerouteEngineState {
  if (state.activeRequest == null) {
    return { ...state, rerouteEpoch: state.rerouteEpoch + 1 };
  }
  return {
    ...state,
    activeRequest: null,
    requestBoundGeneration: null,
    invalidateToGeneration: null,
    rerouteEpoch: state.rerouteEpoch + 1,
  };
}

/** Navigation-Ende / neue Session: nichts Altes ist commitbar. */
export function invalidateAllRouteRequests(state: RerouteEngineState): RerouteEngineState {
  return {
    ...createRerouteEngineState(null),
    nextRequestId: state.nextRequestId,
    rerouteEpoch: state.rerouteEpoch + 1,
  };
}
