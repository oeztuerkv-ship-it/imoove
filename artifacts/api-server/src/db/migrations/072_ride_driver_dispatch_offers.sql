-- Dispatch: welcher ONLINE-Fahrer hat welches Sofort-Angebot erhalten / gesehen / angenommen?

CREATE TABLE IF NOT EXISTS ride_driver_dispatch_offers (
  id TEXT PRIMARY KEY,
  ride_id TEXT NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  fleet_driver_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  CONSTRAINT ride_driver_dispatch_offers_ride_driver_unique UNIQUE (ride_id, fleet_driver_id)
);

CREATE INDEX IF NOT EXISTS ride_driver_dispatch_offers_ride_idx
  ON ride_driver_dispatch_offers (ride_id);

CREATE INDEX IF NOT EXISTS ride_driver_dispatch_offers_driver_sent_idx
  ON ride_driver_dispatch_offers (fleet_driver_id, sent_at DESC);

COMMENT ON TABLE ride_driver_dispatch_offers IS 'Pro Fahrer+Sofortfahrt: offer_sent (sent_at), offer_seen (seen_at), Annahme (accepted_at). rides.status bleibt unverändert.';
