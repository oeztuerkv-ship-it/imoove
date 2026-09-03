/**
 * Geschwindigkeitsabhängiger Navi-Zoom mit Hysterese — kein Pumpen pro GPS-Tick.
 */

/** Stadt / langsam — näher, aber nicht „hineinzoomen“ (~16.6, nicht 18). */
export const NAV_CAMERA_ZOOM_CITY = 16.6;
/** Ausgangspunkt Fahrerperspektive. */
export const NAV_CAMERA_ZOOM_DEFAULT = 16.3;
/** Höhere Speed — weiter heraus. */
export const NAV_CAMERA_ZOOM_HIGHWAY = 15.0;

/** Pitch laut Zielarchitektur (60–65°). */
export const NAV_CAMERA_PITCH_NAV = 62;

/** Max. Zoom-Wechsel-Rate (nur alle N ms neu bewerten). */
export const NAV_CAMERA_ZOOM_UPDATE_MS = 2500;

/** EMA auf Zielzoom (0…1). */
export const NAV_CAMERA_ZOOM_EMA_ALPHA = 0.28;

/** Hysterese: Band wechseln erst wenn Speed klar im neuen Bereich. */
export const NAV_CAMERA_ZOOM_BAND_HYSTERESIS_MPS = 1.5;

export type NavCameraZoomState = {
  zoom: number;
  lastUpdateMs: number | null;
  band: "slow" | "city" | "highway";
};

export function createNavCameraZoomState(initialZoom: number = NAV_CAMERA_ZOOM_DEFAULT): NavCameraZoomState {
  return { zoom: initialZoom, lastUpdateMs: null, band: "city" };
}

function bandForSpeedMps(speedMps: number | null, prev: NavCameraZoomState["band"]): NavCameraZoomState["band"] {
  const s = speedMps != null && Number.isFinite(speedMps) && speedMps >= 0 ? speedMps : 0;
  const h = NAV_CAMERA_ZOOM_BAND_HYSTERESIS_MPS;
  // slow < ~25 km/h, highway > ~72 km/h, dazwischen city — mit Hysterese
  if (prev === "slow") {
    if (s >= 8 + h) return s >= 20 + h ? "highway" : "city";
    return "slow";
  }
  if (prev === "highway") {
    if (s < 20 - h) return s < 8 - h ? "slow" : "city";
    return "highway";
  }
  // city
  if (s < 8 - h) return "slow";
  if (s >= 20 + h) return "highway";
  return "city";
}

function zoomForBand(band: NavCameraZoomState["band"]): number {
  if (band === "slow") return NAV_CAMERA_ZOOM_CITY;
  if (band === "highway") return NAV_CAMERA_ZOOM_HIGHWAY;
  return NAV_CAMERA_ZOOM_DEFAULT;
}

/**
 * Zielzoom aus Speed; nur alle UPDATE_MS anpassen, dazwischen gehalten.
 * Nutzer-Pinch: preferredZoom von außen setzen und hier nur sanft nachziehen wenn follow.
 */
export function tickNavCameraZoom(
  state: NavCameraZoomState,
  opts: {
    speedMps: number | null;
    nowMs: number;
    /** Wenn Nutzer gezoomt hat: als Soft-Anker (wird langsam an Speed-Band angeglichen). */
    userPreferredZoom?: number | null;
    force?: boolean;
  },
): { state: NavCameraZoomState; zoom: number } {
  const now = opts.nowMs;
  const band = bandForSpeedMps(opts.speedMps, state.band);
  const targetBase = zoomForBand(band);
  const userZ =
    opts.userPreferredZoom != null && Number.isFinite(opts.userPreferredZoom)
      ? opts.userPreferredZoom
      : null;
  // Nutzer-Zoom hat Vorrang, aber Speed-Band zieht langsam nach (nicht hart überschreiben)
  const target = userZ != null ? userZ * 0.65 + targetBase * 0.35 : targetBase;

  if (
    !opts.force &&
    state.lastUpdateMs != null &&
    now - state.lastUpdateMs < NAV_CAMERA_ZOOM_UPDATE_MS
  ) {
    return { state: { ...state, band }, zoom: state.zoom };
  }

  const alpha = NAV_CAMERA_ZOOM_EMA_ALPHA;
  const zoom = state.zoom + (target - state.zoom) * alpha;
  return {
    state: { zoom, lastUpdateMs: now, band },
    zoom,
  };
}
