/**
 * Mobile-side payload selfcheck (Node) — Coords müssen im Body sein.
 * Run: node --experimental-strip-types artifacts/mobile/scripts/funkDispatchCreateBodySelftest.mjs
 * (or via tsx if available)
 */
import assert from "node:assert/strict";

/** Inline mirror of buildFunkDispatchCreateBody coord gate (no RN imports). */
function bodyOrNull(from, to) {
  const ok = (a) =>
    Boolean((a.fullName || a.name || "").trim()) &&
    Number.isFinite(a.lat) &&
    Number.isFinite(a.lon) &&
    !(a.lat === 0 && a.lon === 0);
  if (!ok(from) || !ok(to)) return null;
  return {
    fromFull: from.fullName,
    toFull: to.fullName,
    fromLat: from.lat,
    fromLon: from.lon,
    toLat: to.lat,
    toLon: to.lon,
  };
}

assert.equal(
  bodyOrNull({ fullName: "A", lat: 0, lon: 0 }, { fullName: "B", lat: 1, lon: 2 }),
  null,
);
assert.equal(
  bodyOrNull({ fullName: "A", lat: Number.NaN, lon: 9 }, { fullName: "B", lat: 1, lon: 2 }),
  null,
);

const ok = bodyOrNull(
  { fullName: "Startstr. 1, 70771 Leinfelden", lat: 48.69012, lon: 9.14034 },
  { fullName: "Zielstr. 2, 70771 Leinfelden", lat: 48.70111, lon: 9.15022 },
);
assert.ok(ok);
assert.equal(ok.fromLat, 48.69012);
assert.equal(ok.fromLon, 9.14034);
assert.equal(ok.toLat, 48.70111);
assert.equal(ok.toLon, 9.15022);
assert.ok(Number.isFinite(ok.fromLat) && Number.isFinite(ok.fromLon));

console.log("OK funkDispatchCreateBodySelftest (coords required on submit)");
