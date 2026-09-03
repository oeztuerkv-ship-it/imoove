/**
 * CameraEngine — Follow, Zoom-Hysterese, Lookahead, finite Commands.
 *   npx tsx artifacts/mobile/utils/navEngine/CameraEngine.selftest.ts
 */
import {
  NAV_CAMERA_LOOKAHEAD_M,
  NAV_CAMERA_ZOOM_APPLY_MIN_DELTA,
  applyCameraCommand,
  consumePendingCamera,
  createCameraEngineState,
  isFiniteCameraCommand,
  offsetLatLonByBearingM,
  tickCameraEngine,
} from "./CameraEngine";
import {
  NAV_CAMERA_PITCH_NAV,
  NAV_CAMERA_ZOOM_CITY,
  NAV_CAMERA_ZOOM_DEFAULT,
  NAV_CAMERA_ZOOM_HIGHWAY,
  NAV_CAMERA_ZOOM_UPDATE_MS,
} from "./navCameraZoom";
import { NAV_CAMERA_FOLLOW_MIN_INTERVAL_MS } from "../navHeadingSmoother";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function runSim(
  label: string,
  points: Array<{
    lat: number;
    lon: number;
    heading: number;
    speedMps: number;
    dtMs: number;
  }>,
): void {
  let st = createCameraEngineState();
  let t = 1_000;
  let lastHeading: number | null = null;
  let zoomChanges = 0;
  let lastZoom: number | null = null;
  let cmds = 0;

  for (const p of points) {
    t += p.dtMs;
    const r = tickCameraEngine(st, {
      display: { lat: p.lat, lon: p.lon },
      heading: p.heading,
      speedMps: p.speedMps,
      nowMs: t,
      followEnabled: true,
      mapReady: true,
      force: cmds === 0,
      still: p.speedMps < 1.4,
    });
    st = r.state;
    if (r.command) {
      cmds += 1;
      assert(isFiniteCameraCommand(r.command), `${label}: finite cmd`);
      assert(r.command.pitch === NAV_CAMERA_PITCH_NAV, `${label}: pitch stable`);
      if (lastHeading != null) {
        const d = Math.abs(
          ((r.command.heading - lastHeading + 540) % 360) - 180,
        );
        // Kein 180°-Flip zwischen benachbarten Fixes
        assert(d < 90, `${label}: bearing jump ${d}°`);
      }
      lastHeading = r.command.heading;
      if (lastZoom != null && Math.abs(r.command.zoom - lastZoom) >= NAV_CAMERA_ZOOM_APPLY_MIN_DELTA) {
        zoomChanges += 1;
      }
      lastZoom = r.command.zoom;
    }
  }
  assert(cmds >= 1, `${label}: at least one camera cmd`);
  // Zoom darf nicht bei jedem Fix pumpen
  assert(zoomChanges <= Math.max(2, Math.floor(points.length / 4)), `${label}: zoom pump ${zoomChanges}`);
}

// Lookahead
{
  const a = offsetLatLonByBearingM(48.74, 9.31, 0, NAV_CAMERA_LOOKAHEAD_M);
  assert(a.lat > 48.74, "lookahead north");
  assert(Math.abs(a.lon - 9.31) < 0.001, "lookahead lon stable");
}

// Pending bis MapReady
{
  let st = createCameraEngineState();
  let r = tickCameraEngine(st, {
    display: { lat: 48.74, lon: 9.31 },
    heading: 90,
    speedMps: 5,
    nowMs: 1000,
    followEnabled: true,
    mapReady: false,
  });
  assert(r.command == null && r.state.pending != null, "pending while not ready");
  st = r.state;
  r = consumePendingCamera(st, { nowMs: 1100 });
  assert(r.command != null, "pending consumed");
  assert(r.command!.pitch === NAV_CAMERA_PITCH_NAV, "pending pitch");
}

// Follow-Interval: kein Spam
{
  let st = createCameraEngineState();
  let r = tickCameraEngine(st, {
    display: { lat: 48.74, lon: 9.31 },
    heading: 0,
    speedMps: 10,
    nowMs: 2000,
    followEnabled: true,
    mapReady: true,
    force: true,
  });
  st = r.state;
  assert(r.command != null, "force cmd");
  r = tickCameraEngine(st, {
    display: { lat: 48.74005, lon: 9.31 },
    heading: 2,
    speedMps: 10,
    nowMs: 2100,
    followEnabled: true,
    mapReady: true,
  });
  assert(r.command == null, "interval blocks");
  r = tickCameraEngine(r.state, {
    display: { lat: 48.7402, lon: 9.31 },
    heading: 5,
    speedMps: 10,
    nowMs: 2100 + NAV_CAMERA_FOLLOW_MIN_INTERVAL_MS,
    followEnabled: true,
    mapReady: true,
  });
  assert(r.command != null, "after interval");
}

// Follow disabled
{
  const r = tickCameraEngine(createCameraEngineState(), {
    display: { lat: 48.74, lon: 9.31 },
    heading: 0,
    speedMps: 8,
    nowMs: 3000,
    followEnabled: false,
    mapReady: true,
  });
  assert(r.command == null, "no follow");
}

// Ungültige Pose
{
  const r = tickCameraEngine(createCameraEngineState(), {
    display: { lat: NaN, lon: 9.31 },
    heading: 0,
    speedMps: 8,
    nowMs: 3000,
    followEnabled: true,
    mapReady: true,
    force: true,
  });
  assert(r.command == null, "reject nan pose");
}

// applyCameraCommand try/catch + finite
{
  let calls = 0;
  const ok = applyCameraCommand(
    {
      setCamera: () => {
        calls += 1;
      },
    },
    {
      center: { latitude: 48.74, longitude: 9.31 },
      heading: 10,
      pitch: 62,
      zoom: 16.3,
      altitude: 500,
      mode: "set",
      durationMs: 0,
    },
    { useAltitude: true },
  );
  assert(ok && calls === 1, "apply setCamera");
  const bad = applyCameraCommand(
    { setCamera: () => {} },
    {
      center: { latitude: NaN, longitude: 9.31 },
      heading: 10,
      pitch: 62,
      zoom: 16.3,
      altitude: 500,
      mode: "set",
      durationMs: 0,
    },
  );
  assert(!bad, "reject nan command");
}

// Zoom-Bänder über Speed (CameraEngine tick)
{
  let st = createCameraEngineState();
  let r = tickCameraEngine(st, {
    display: { lat: 48.74, lon: 9.31 },
    heading: 0,
    speedMps: 2,
    nowMs: 4000,
    followEnabled: true,
    mapReady: true,
    force: true,
    resetZoom: true,
  });
  st = r.state;
  assert(Math.abs(r.command!.zoom - NAV_CAMERA_ZOOM_CITY) < 0.8, "slow ~city zoom");
  r = tickCameraEngine(st, {
    display: { lat: 48.741, lon: 9.31 },
    heading: 0,
    speedMps: 28,
    nowMs: 4000 + NAV_CAMERA_ZOOM_UPDATE_MS + 50,
    followEnabled: true,
    mapReady: true,
    force: true,
  });
  assert(r.command!.zoom <= NAV_CAMERA_ZOOM_DEFAULT + 0.2, "highway/city not too close");
  assert(NAV_CAMERA_ZOOM_CITY < 17, "city zoom not 18");
  assert(NAV_CAMERA_ZOOM_DEFAULT >= 16 && NAV_CAMERA_ZOOM_DEFAULT <= 16.5, "default 16–16.5");
  assert(NAV_CAMERA_ZOOM_HIGHWAY < NAV_CAMERA_ZOOM_DEFAULT, "highway out");
}

// Simulierte GPS-Pfade
runSim("straight", [
  { lat: 48.74, lon: 9.31, heading: 0, speedMps: 11, dtMs: 0 },
  { lat: 48.7402, lon: 9.31, heading: 1, speedMps: 11, dtMs: 1000 },
  { lat: 48.7404, lon: 9.31, heading: 0, speedMps: 12, dtMs: 1000 },
  { lat: 48.7406, lon: 9.31, heading: 2, speedMps: 12, dtMs: 1000 },
]);

runSim("right curve", [
  { lat: 48.75, lon: 9.32, heading: 0, speedMps: 10, dtMs: 0 },
  { lat: 48.7502, lon: 9.32, heading: 15, speedMps: 10, dtMs: 1000 },
  { lat: 48.7503, lon: 9.3202, heading: 45, speedMps: 10, dtMs: 1000 },
  { lat: 48.7503, lon: 9.3205, heading: 80, speedMps: 10, dtMs: 1000 },
  { lat: 48.7503, lon: 9.3208, heading: 90, speedMps: 10, dtMs: 1000 },
]);

runSim("left curve", [
  { lat: 48.76, lon: 9.33, heading: 0, speedMps: 9, dtMs: 0 },
  { lat: 48.7602, lon: 9.33, heading: 350, speedMps: 9, dtMs: 1000 },
  { lat: 48.7603, lon: 9.3297, heading: 315, speedMps: 9, dtMs: 1000 },
  { lat: 48.7603, lon: 9.3294, heading: 280, speedMps: 9, dtMs: 1000 },
  { lat: 48.7603, lon: 9.3291, heading: 270, speedMps: 9, dtMs: 1000 },
]);

runSim("roundabout", [
  { lat: 48.77, lon: 9.34, heading: 0, speedMps: 7, dtMs: 0 },
  { lat: 48.77015, lon: 9.3401, heading: 40, speedMps: 7, dtMs: 1000 },
  { lat: 48.7702, lon: 9.3403, heading: 90, speedMps: 7, dtMs: 1000 },
  { lat: 48.77015, lon: 9.3405, heading: 140, speedMps: 7, dtMs: 1000 },
  { lat: 48.77, lon: 9.3406, heading: 180, speedMps: 7, dtMs: 1000 },
]);

runSim("0-10 km/h", [
  { lat: 48.78, lon: 9.35, heading: 90, speedMps: 0.5, dtMs: 0 },
  { lat: 48.78, lon: 9.35005, heading: 92, speedMps: 1.2, dtMs: 2300 },
  { lat: 48.78, lon: 9.3501, heading: 88, speedMps: 2.5, dtMs: 2300 },
]);

runSim("30-50 km/h", [
  { lat: 48.79, lon: 9.36, heading: 0, speedMps: 10, dtMs: 0 },
  { lat: 48.7904, lon: 9.36, heading: 3, speedMps: 12, dtMs: 1000 },
  { lat: 48.7908, lon: 9.36, heading: 1, speedMps: 14, dtMs: 1000 },
]);

runSim("70-100 km/h", [
  { lat: 48.8, lon: 9.37, heading: 0, speedMps: 22, dtMs: 0 },
  { lat: 48.801, lon: 9.37, heading: 2, speedMps: 25, dtMs: 1000 },
  { lat: 48.802, lon: 9.37, heading: 0, speedMps: 28, dtMs: 1000 },
]);

// P2: no heading → pending heading null (not 0 / north)
{
  const r = tickCameraEngine(createCameraEngineState(), {
    display: { lat: 48.74, lon: 9.31 },
    heading: null,
    headingState: "LOST",
    speedMps: 0,
    nowMs: 9000,
    followEnabled: true,
    mapReady: false,
  });
  assert(r.command == null, "LOST pending no cmd");
  assert(r.state.pending != null, "LOST pending stored");
  assert(r.state.pending!.heading == null, "pending heading null not 0");
  const consumed = consumePendingCamera(r.state, { nowMs: 9100 });
  assert(consumed.command == null, "consume LOST without heading → no rotate");
}

// P2: LOST keeps last camera heading, does not rotate to a new direction
{
  let st = createCameraEngineState();
  let r = tickCameraEngine(st, {
    display: { lat: 48.74, lon: 9.31 },
    heading: 90,
    headingState: "VALID",
    speedMps: 8,
    nowMs: 10000,
    followEnabled: true,
    mapReady: true,
    force: true,
  });
  st = r.state;
  assert(r.command != null && r.command.heading === 90, "VALID 90");
  r = tickCameraEngine(st, {
    display: { lat: 48.7403, lon: 9.31 },
    heading: 180,
    headingState: "LOST",
    speedMps: 0,
    nowMs: 10000 + NAV_CAMERA_FOLLOW_MIN_INTERVAL_MS,
    followEnabled: true,
    mapReady: true,
    force: true,
  });
  assert(r.command != null, "LOST may still follow position");
  assert(r.command!.heading === 90, "LOST does not rotate to 180");
}

// Bootstrap: no VALID heading, map ready → no invented north command
{
  const r = tickCameraEngine(createCameraEngineState(), {
    display: { lat: 48.74, lon: 9.31 },
    heading: null,
    headingState: "LOST",
    speedMps: 0,
    nowMs: 11000,
    followEnabled: true,
    mapReady: true,
    force: true,
  });
  assert(r.command == null, "bootstrap without VALID heading → no camera rotate");
}

console.log("CameraEngine.selftest: ok");


// --- P2: no heading 0 pending; LOST does not rotate ---
{
  let st = createCameraEngineState();
  let r = tickCameraEngine(st, {
    display: { lat: 48.74, lon: 9.31 },
    heading: null,
    headingState: "LOST",
    speedMps: 0,
    nowMs: 1000,
    followEnabled: true,
    mapReady: false,
  });
  if (r.command != null) throw new Error("LOST + no heading: no command");
  if (r.state.pending && r.state.pending.heading === 0) throw new Error("pending must not use heading 0");
  st = r.state;
  r = consumePendingCamera(st, { nowMs: 1100 });
  if (r.command != null && r.command.heading === 0) throw new Error("consumePending must not force north");
}

{
  let st = createCameraEngineState();
  let r = tickCameraEngine(st, {
    display: { lat: 48.74, lon: 9.31 },
    heading: 90,
    headingState: "VALID",
    speedMps: 8,
    nowMs: 2000,
    followEnabled: true,
    mapReady: true,
    force: true,
  });
  if (!r.command) throw new Error("VALID should command");
  const applied = r.command.heading;
  st = r.state;
  r = tickCameraEngine(st, {
    display: { lat: 48.7403, lon: 9.31 },
    heading: 200,
    headingState: "LOST",
    speedMps: 0,
    nowMs: 5000,
    followEnabled: true,
    mapReady: true,
    force: true,
  });
  if (!r.command) throw new Error("LOST may still follow position with last heading");
  if (Math.abs(r.command.heading - applied) > 1) throw new Error("LOST must not rotate to a new heading");
}

console.log("CameraEngine.selftest P2: OK");
