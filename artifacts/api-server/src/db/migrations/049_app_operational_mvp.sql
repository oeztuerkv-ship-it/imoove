-- Plattform: App / Betrieb — zentrale Regeln (MVP) für Kunden-App, ohne Code-Deploy.
-- Service-Gebiete: Text-Matching in Start-/Zieladresse; Konfig-JSON: Provision, Meldungen, Platzhalter.

CREATE TABLE IF NOT EXISTS app_operational_config (
  id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  payload JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_operational_config (id, payload)
VALUES (
  'default',
  '{"version":1,"commission":{"defaultRate":0.07,"active":true},"messages":{"outOfServiceAreaDe":"ONRODA ist in deiner Stadt momentan noch nicht verfügbar."},"tariffs":{"info":"MVP: Detaillierte Tarifspalten folgen. Bestehende Gebiets-Tarife: Admin Tarife / Preise (fare_areas)."}}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS app_service_regions (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  match_terms JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_service_regions (id, label, match_terms, is_active, sort_order) VALUES
  ('asr-stuttgart', 'Stuttgart', '["stuttgart"]', true, 1),
  ('asr-esslingen', 'Esslingen', '["esslingen", "esslingen am neckar"]', true, 2)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS app_service_regions_active_sort_idx
  ON app_service_regions (is_active, sort_order);

COMMENT ON TABLE app_operational_config IS 'Singleton JSON: Provision, Texte, Platzhalter für App/Betrieb.';
COMMENT ON TABLE app_service_regions IS 'Aktive Städte/Gebiete: Adresse muss mindestens einen match_term (Substring) enthalten.';
