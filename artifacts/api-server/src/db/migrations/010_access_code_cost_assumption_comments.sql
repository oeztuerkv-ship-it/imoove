-- Klarstellung: Zugangscodes = digitale Kostenübernahme (Kommentare für bestehende DBs nach 009).
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/migrations/010_access_code_cost_assumption_comments.sql

COMMENT ON TABLE access_codes IS 'Digitale Freigabe/Kostenübernahme; code_type klassifiziert Kanal; company_id = Abrechnungs-Mandant';
COMMENT ON COLUMN access_codes.company_id IS 'Kostenträger (admin_companies); NULL = global einlösbar, dann payer_kind third_party auf der Fahrt';
COMMENT ON COLUMN access_codes.meta IS 'Optional: z. B. interne Vorgangsnummer, Hinweis „für Person X“ (nur Verwaltung, keine Pflicht)';

COMMENT ON COLUMN rides.authorization_source IS 'passenger_direct | access_code (digitale Kostenübernahme)';
COMMENT ON COLUMN rides.access_code_id IS 'Ein gelöster Freigabe-Code; Nachvollziehbarkeit zur Abrechnung';
COMMENT ON COLUMN rides.final_fare IS 'Realer Fahrpreis nach Abschluss; bei access_code + company_id Abrechnungsbetrag gegen Mandanten';
