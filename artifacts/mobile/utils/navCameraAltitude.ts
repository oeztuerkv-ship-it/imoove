/**
 * Apple Maps (MapKit) Camera-Altitude aus Google-style Zoom.
 *
 * Postmortem: `156543/2^zoom` ist **Meter pro Pixel**, nicht Kamera-Höhe.
 * Das lieferte ~1,1 m bei Zoom 16.5 → setCamera mit altitude≈1 + Pitch 62 → iOS-Crash.
 */

/** Web-Mercator Bodenauflösung (m/px) bei Zoom z. */
export function metersPerPixelAtZoom(zoom: number, latitude: number): number {
  return (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
}

/**
 * Referenz-Viewport-Höhe (px), mit der m/px → Augenhöhe skaliert wird.
 * ~1000 → bei Zoom 16.5 / 48°N ca. 1100 m — typisch für Navi mit Pitch.
 */
export const NAV_ZOOM_TO_ALTITUDE_VIEWPORT_PX = 1000;

export const NAV_CAMERA_ALTITUDE_MIN_M = 150;
export const NAV_CAMERA_ALTITUDE_MAX_M = 20_000;

export function zoomLevelToAltitudeMeters(zoom: number, latitude: number): number {
  const mpp = metersPerPixelAtZoom(zoom, latitude);
  const raw = mpp * NAV_ZOOM_TO_ALTITUDE_VIEWPORT_PX;
  return clampNavCameraAltitudeM(raw);
}

export function clampNavCameraAltitudeM(altitudeM: number): number {
  if (!Number.isFinite(altitudeM)) return zoomLevelToAltitudeMeters(16.5, 48.5);
  return Math.min(NAV_CAMERA_ALTITUDE_MAX_M, Math.max(NAV_CAMERA_ALTITUDE_MIN_M, altitudeM));
}

/** true wenn Wert als MapKit-Altitude plausibel ist (nicht m/px-Artefakt ~1 m). */
export function isPlausibleNavCameraAltitudeM(altitudeM: number | null | undefined): altitudeM is number {
  return (
    altitudeM != null &&
    Number.isFinite(altitudeM) &&
    altitudeM >= NAV_CAMERA_ALTITUDE_MIN_M &&
    altitudeM <= NAV_CAMERA_ALTITUDE_MAX_M
  );
}
