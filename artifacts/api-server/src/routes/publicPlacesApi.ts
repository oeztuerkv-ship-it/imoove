import { Router, type IRouter } from "express";
import { fetchGooglePlacesApi } from "../lib/googlePlacesClient";

const router: IRouter = Router();

function queryString(name: string, value: unknown): string {
  return String(value ?? "").trim();
}

/** Orte-Tab: Nearby Search (Proxy — Client-Key mit iOS-Restriction funktioniert nicht). */
router.get("/public/v1/places/nearbysearch", async (req, res, next) => {
  try {
    const location = queryString("location", req.query.location);
    const type = queryString("type", req.query.type);
    const language = queryString("language", req.query.language) || "de";
    if (!location || !type) {
      res.status(400).json({ error: "location_and_type_required", status: "INVALID_REQUEST" });
      return;
    }
    const params = new URLSearchParams({ location, type, language });
    const keyword = queryString("keyword", req.query.keyword);
    if (keyword) params.set("keyword", keyword);
    const rankby = queryString("rankby", req.query.rankby);
    if (rankby === "distance") {
      params.set("rankby", "distance");
    } else {
      params.set("radius", queryString("radius", req.query.radius) || "5000");
    }
    if (req.query.opennow === "true") params.set("opennow", "true");

    const proxied = await fetchGooglePlacesApi(`nearbysearch/json?${params.toString()}`);
    res.status(proxied.ok ? 200 : proxied.status === 503 ? 503 : 502).json(proxied.body);
  } catch (e) {
    next(e);
  }
});

router.get("/public/v1/places/textsearch", async (req, res, next) => {
  try {
    const query = queryString("query", req.query.query);
    const type = queryString("type", req.query.type);
    const location = queryString("location", req.query.location);
    const language = queryString("language", req.query.language) || "de";
    if (!query || !type || !location) {
      res.status(400).json({ error: "query_type_location_required", status: "INVALID_REQUEST" });
      return;
    }
    const params = new URLSearchParams({
      query,
      type,
      location,
      radius: queryString("radius", req.query.radius) || "500000",
      language,
    });
    if (req.query.opennow === "true") params.set("opennow", "true");

    const proxied = await fetchGooglePlacesApi(`textsearch/json?${params.toString()}`);
    res.status(proxied.ok ? 200 : proxied.status === 503 ? 503 : 502).json(proxied.body);
  } catch (e) {
    next(e);
  }
});

router.get("/public/v1/places/details", async (req, res, next) => {
  try {
    const placeId = queryString("place_id", req.query.place_id);
    const fields =
      queryString("fields", req.query.fields) ||
      "name,formatted_address,formatted_phone_number,website,opening_hours,geometry,types";
    const language = queryString("language", req.query.language) || "de";
    if (!placeId) {
      res.status(400).json({ error: "place_id_required", status: "INVALID_REQUEST" });
      return;
    }
    const params = new URLSearchParams({ place_id: placeId, fields, language });
    const proxied = await fetchGooglePlacesApi(`details/json?${params.toString()}`);
    res.status(proxied.ok ? 200 : proxied.status === 503 ? 503 : 502).json(proxied.body);
  } catch (e) {
    next(e);
  }
});

export default router;
