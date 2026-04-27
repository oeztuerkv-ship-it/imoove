-- Kunden-Telefon auf Fahrt; Geofence-Vorbereitung an Service-Gebieten (ohne Runtime-Enforcement).

ALTER TABLE rides ADD COLUMN IF NOT EXISTS customer_phone TEXT;

ALTER TABLE app_service_regions ADD COLUMN IF NOT EXISTS match_mode TEXT NOT NULL DEFAULT 'substring';
ALTER TABLE app_service_regions ADD COLUMN IF NOT EXISTS geo_fence_json JSONB;

COMMENT ON COLUMN rides.customer_phone IS 'Optional: Kunden-Telefon bei Buchung (Pflicht je bookingRules.requirePhone).';
COMMENT ON COLUMN app_service_regions.match_mode IS 'substring (Default) | geofence (wenn geo_fence_json gesetzt, später).';
COMMENT ON COLUMN app_service_regions.geo_fence_json IS 'Optional: { "type":"circle","center":{"lat":,"lon":},"radiusM": } oder Polygon-Ringe — Auswertung folgt.';
