-- Service-Regionen: explizite Kreis-Geometrie (Mittelpunkt + km) neben match_mode=substring (Migration 050).

ALTER TABLE app_service_regions ADD COLUMN IF NOT EXISTS center_lat DOUBLE PRECISION;
ALTER TABLE app_service_regions ADD COLUMN IF NOT EXISTS center_lng DOUBLE PRECISION;
ALTER TABLE app_service_regions ADD COLUMN IF NOT EXISTS radius_km DOUBLE PRECISION;

COMMENT ON COLUMN app_service_regions.center_lat IS 'WGS84, für match_mode=radius (alternativ geo_fence_json).';
COMMENT ON COLUMN app_service_regions.center_lng IS 'WGS84, für match_mode=radius.';
COMMENT ON COLUMN app_service_regions.radius_km IS 'Kreisradius in km (match_mode=radius).';
