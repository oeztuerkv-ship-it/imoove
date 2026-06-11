-- No-Show-Flow + Wartezeit-Basis: Zeitstempel auf rides
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS driver_waiting_started_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS no_show_countdown_started_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS no_show_evidence_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN rides.driver_waiting_started_at IS 'Fahrer am Abholort (Status driver_waiting) — für Wartezeit/No-Show';
COMMENT ON COLUMN rides.no_show_countdown_started_at IS 'Start des No-Show-Countdowns nach Tipp „Kunde nicht da“';
COMMENT ON COLUMN rides.no_show_evidence_at IS 'Zeitpunkt der dokumentierten No-Show-Abfahrt (Fahrer-Nachweis)';
