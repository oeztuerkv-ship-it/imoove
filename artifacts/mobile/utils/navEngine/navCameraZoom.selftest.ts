/**
 * Smoke: Speed-Zoom Bänder + Hysterese.
 *   npx tsx artifacts/mobile/utils/navEngine/navCameraZoom.selftest.ts
 */
import {
  createNavCameraZoomState,
  NAV_CAMERA_ZOOM_CITY,
  NAV_CAMERA_ZOOM_DEFAULT,
  NAV_CAMERA_ZOOM_HIGHWAY,
  NAV_CAMERA_ZOOM_UPDATE_MS,
  tickNavCameraZoom,
} from "./navCameraZoom";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

let st = createNavCameraZoomState();
let r = tickNavCameraZoom(st, { speedMps: 2, nowMs: 1000, force: true });
assert(r.state.band === "slow", "slow band");
assert(Math.abs(r.zoom - NAV_CAMERA_ZOOM_CITY) < 1.5, "slow zoom near city close");

st = r.state;
r = tickNavCameraZoom(st, { speedMps: 2, nowMs: 1500 });
assert(r.zoom === st.zoom, "no pump within update window");

r = tickNavCameraZoom(st, {
  speedMps: 12,
  nowMs: 1500 + NAV_CAMERA_ZOOM_UPDATE_MS,
  force: true,
});
assert(r.state.band === "city", "city band");

r = tickNavCameraZoom(r.state, {
  speedMps: 30,
  nowMs: 10_000,
  force: true,
});
assert(r.state.band === "highway", "highway band");
assert(r.zoom < NAV_CAMERA_ZOOM_DEFAULT || r.state.band === "highway", "highway zooms out");
assert(NAV_CAMERA_ZOOM_HIGHWAY < NAV_CAMERA_ZOOM_DEFAULT, "highway < default");
assert(NAV_CAMERA_ZOOM_CITY > NAV_CAMERA_ZOOM_DEFAULT, "city > default");

console.log("navCameraZoom.selftest: OK");
