-- Private Merkliste: pro Fleet-Fahrer (eigene Notizen, nicht geteilt).

ALTER TABLE partner_private_reminders
  ADD COLUMN IF NOT EXISTS fleet_driver_id TEXT REFERENCES fleet_drivers (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS partner_private_reminders_fleet_driver_sched_idx
  ON partner_private_reminders (company_id, fleet_driver_id, scheduled_at);

COMMENT ON COLUMN partner_private_reminders.fleet_driver_id IS
  'Fahrer-eigene Notiz (NULL = Panel-Merkliste der Firma, nicht für Fleet sichtbar).';
