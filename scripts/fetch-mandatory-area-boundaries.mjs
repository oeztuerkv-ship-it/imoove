#!/usr/bin/env node
/**
 * Lädt Verwaltungsgrenzen (OSM / Overpass) für das Taxameter-Pflichtgebiet,
 * vereinfacht sie und schreibt GeoJSON ins API-Repo.
 *
 * Quelle: OpenStreetMap (ODbL) — relation de:regionalschluessel 08111 (Stuttgart Stadtkreis),
 * 08116 (Landkreis Esslingen).
 *
 * Ausführen: node scripts/fetch-mandatory-area-boundaries.mjs
 * (Internet erforderlich; Ergebnis committen.)
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(
  __dirname,
  "../artifacts/api-server/src/data/mandatory-area-boundaries",
);

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const QUERIES = {
  stuttgart: `[out:json][timeout:180];relation["boundary"="administrative"]["de:amtlicher_gemeindeschluessel"="08111000"];out geom;`,
  esslingen: `[out:json][timeout:180];relation["boundary"="administrative"]["de:regionalschluessel"="08116"];out geom;`,
};

/** Douglas-Peucker Vereinfachung (lon/lat Ring). */
function simplifyRing(ring, toleranceDeg) {
  if (ring.length <= 4) return ring;

  function perpDist(p, a, b) {
    const [x, y] = p;
    const [x1, y1] = a;
    const [x2, y2] = b;
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
    const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
    const px = x1 + t * dx;
    const py = y1 + t * dy;
    return Math.hypot(x - px, y - py);
  }

  function dp(points, eps) {
    if (points.length <= 2) return points;
    let maxD = 0;
    let idx = 0;
    const end = points.length - 1;
    for (let i = 1; i < end; i++) {
      const d = perpDist(points[i], points[0], points[end]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > eps) {
      const left = dp(points.slice(0, idx + 1), eps);
      const right = dp(points.slice(idx), eps);
      return left.slice(0, -1).concat(right);
    }
    return [points[0], points[end]];
  }

  const open = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  const work = open ? ring.slice(0, -1) : ring.slice();
  const simplified = dp(work, toleranceDeg);
  if (open && simplified.length > 0) simplified.push([...simplified[0]]);
  return simplified;
}

function closeRing(ring) {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, [...first]];
}

function nearCoord(a, b, eps = 1e-6) {
  return Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;
}

/** Verkettet OSM-Outer-Ways zu geschlossenen Ringen. */
function joinWaySegments(members, role) {
  const segments = (members ?? [])
    .filter((m) => m.role === role && Array.isArray(m.geometry))
    .map((m) => m.geometry.map((p) => [p.lon, p.lat]));
  const rings = [];
  const pending = segments.slice();

  while (pending.length > 0) {
    let ring = pending.shift();
    if (!ring || ring.length < 2) continue;
    let extended = true;
    while (extended) {
      extended = false;
      for (let i = pending.length - 1; i >= 0; i--) {
        const seg = pending[i];
        if (!seg?.length) continue;
        const rs = ring[0];
        const re = ring[ring.length - 1];
        const ss = seg[0];
        const se = seg[seg.length - 1];
        if (nearCoord(re, ss)) {
          ring = ring.concat(seg.slice(1));
          pending.splice(i, 1);
          extended = true;
        } else if (nearCoord(re, se)) {
          ring = ring.concat(seg.slice(0, -1).reverse());
          pending.splice(i, 1);
          extended = true;
        } else if (nearCoord(rs, se)) {
          ring = seg.slice(0, -1).concat(ring);
          pending.splice(i, 1);
          extended = true;
        } else if (nearCoord(rs, ss)) {
          ring = seg.slice(1).reverse().concat(ring);
          pending.splice(i, 1);
          extended = true;
        }
      }
    }
    rings.push(closeRing(ring));
  }
  return rings;
}

function relationToPolygonGeometry(relation) {
  const outerRings = joinWaySegments(relation.members, "outer").map((r) => simplifyRing(r, 0.00015));
  const innerRings = joinWaySegments(relation.members, "inner").map((r) => simplifyRing(r, 0.00015));
  if (outerRings.length === 0) throw new Error(`Relation ${relation.id}: keine outer-Geometrie`);

  if (outerRings.length === 1) {
    const coords = [outerRings[0], ...innerRings];
    return { type: "Polygon", coordinates: coords };
  }

  // Mehrere Inseln — Löcher den größten Ringen zuordnen (Heuristik: Zentroid in Outer).
  const polygons = outerRings.map((outer) => {
    const holes = innerRings.filter((inner) => pointInRing(ringCentroid(inner)[0], ringCentroid(inner)[1], outer));
    return [outer, ...holes];
  });
  return { type: "MultiPolygon", coordinates: polygons };
}

function ringCentroid(ring) {
  let sx = 0;
  let sy = 0;
  const n = Math.max(1, ring.length - 1);
  for (let i = 0; i < n; i++) {
    sx += ring[i][0];
    sy += ring[i][1];
  }
  return [sx / n, sy / n];
}

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInGeometry(lon, lat, geom) {
  if (geom.type === "Polygon") {
    if (!pointInRing(lon, lat, geom.coordinates[0])) return false;
    for (let h = 1; h < geom.coordinates.length; h++) {
      if (pointInRing(lon, lat, geom.coordinates[h])) return false;
    }
    return true;
  }
  if (geom.type === "MultiPolygon") {
    return geom.coordinates.some((poly) => pointInGeometry(lon, lat, { type: "Polygon", coordinates: poly }));
  }
  return false;
}

async function fetchOverpass(query) {
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "application/json",
      "User-Agent": "imoove-boundary-fetch/1.0 (onroda.de; dev@onroda.de)",
    },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Overpass HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchRelation(query) {
  const data = await fetchOverpass(query);
  const rel = data.elements?.find((e) => e.type === "relation");
  if (!rel) throw new Error("Keine Relation in Overpass-Antwort");
  return rel;
}

const VALIDATION = [
  { name: "Stuttgart Schlossplatz", lon: 9.18, lat: 48.778, expect: { stuttgart: true, esslingen: false } },
  { name: "Leinfelden (Photon)", lon: 9.1427508, lat: 48.6966965, expect: { stuttgart: false, esslingen: true } },
  { name: "Flughafen STR", lon: 9.2053925, lat: 48.688422, expect: { stuttgart: false, esslingen: true } },
  { name: "Ludwigsburg Zentrum", lon: 9.1922, lat: 48.8975, expect: { stuttgart: false, esslingen: false } },
  { name: "Tübingen", lon: 9.011, lat: 48.399, expect: { stuttgart: false, esslingen: false } },
  { name: "Nürtingen", lon: 9.34, lat: 48.626, expect: { stuttgart: false, esslingen: true } },
  { name: "Kornwestheim (nördl. Nachbar)", lon: 9.187, lat: 48.861, expect: { stuttgart: false, esslingen: false } },
];

async function main() {
  console.log("[fetch] Overpass Stuttgart …");
  const stuttgartRel = await fetchRelation(QUERIES.stuttgart);
  console.log("[fetch] Overpass Landkreis Esslingen …");
  const esslingenRel = await fetchRelation(QUERIES.esslingen);

  const features = [
    {
      type: "Feature",
      properties: {
        id: "stuttgart-stadtkreis",
        name: "Stuttgart",
        deAmtlicherGemeindeschluessel: "08111000",
        source: "OpenStreetMap via Overpass API (ODbL)",
        fetchedAt: new Date().toISOString().slice(0, 10),
      },
      geometry: relationToPolygonGeometry(stuttgartRel),
    },
    {
      type: "Feature",
      properties: {
        id: "landkreis-esslingen",
        name: "Landkreis Esslingen",
        deRegionalschluessel: "08116",
        source: "OpenStreetMap via Overpass API (ODbL)",
        fetchedAt: new Date().toISOString().slice(0, 10),
      },
      geometry: relationToPolygonGeometry(esslingenRel),
    },
  ];

  const collection = {
    type: "FeatureCollection",
    properties: {
      description: "Taxameter-Pflichtgebiet — amtliche Verwaltungsgrenzen (vereinfacht)",
      license: "OpenStreetMap ODbL — https://www.openstreetmap.org/copyright",
    },
    features,
  };

  for (const v of VALIDATION) {
    const stuttgart = pointInGeometry(v.lon, v.lat, features[0].geometry);
    const esslingen = pointInGeometry(v.lon, v.lat, features[1].geometry);
    const ok =
      stuttgart === v.expect.stuttgart && esslingen === v.expect.esslingen;
    console.log(
      ok ? "  OK" : " FAIL",
      v.name,
      `{ stuttgart: ${stuttgart}, esslingen: ${esslingen} }`,
    );
    if (!ok) {
      console.error("Validierung fehlgeschlagen für", v.name);
      process.exit(1);
    }
  }

  await mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, "mandatory-taxi-areas.geojson");
  const json = JSON.stringify(collection);
  await writeFile(outPath, json, "utf8");
  console.log(`[fetch] geschrieben: ${outPath} (${(json.length / 1024).toFixed(1)} KiB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
