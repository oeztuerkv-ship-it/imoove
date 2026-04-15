-- =============================================================================
-- Onroda: Mandanten wipe — nur EIN Admin-Login (admin_auth_users) bleibt
-- =============================================================================
--
-- VORHER: Backup (pg_dump). Nur auf der gewollten Datenbank ausführen.
--
-- VOR dem Ausführen: Ersetze im GESAMTEN Skript jedes Vorkommen von
--     __KEEP_LOGIN__
-- durch deinen exakten admin_auth_users.username (ein Wort, kein Leerzeichen).
--
-- Ausführung:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/onroda-wipe-tenants-keep-one-admin.sql
--
-- Danach: keine Firmen, keine Panel-/Fleet-User. Neuen Mandanten in der Admin-
-- Konsole anlegen, Partner-User / Fleet neu anlegen.
--
-- Mobile (AsyncStorage): pro Gerät — nicht per SQL. App-Daten in den
-- Systemeinstellungen löschen oder App neu installieren (z. B. @Onroda_driver_session).
-- =============================================================================

BEGIN;

DO $$
DECLARE
  keep_login constant text := '__KEEP_LOGIN__';
  n int;
BEGIN
  IF keep_login = '__KEEP_LOGIN__' THEN
    RAISE EXCEPTION 'Ersetze im Skript __KEEP_LOGIN__ durch deinen Admin-Benutzernamen.';
  END IF;
  SELECT count(*)::int INTO n FROM admin_auth_users WHERE lower(username) = lower(keep_login);
  IF n <> 1 THEN
    RAISE EXCEPTION 'admin_auth_users: für Login % erwartet genau 1 Zeile, gefunden %', keep_login, n;
  END IF;
END $$;

DELETE FROM ride_events;
DELETE FROM rides;

DELETE FROM access_codes;

DELETE FROM company_change_requests;

DELETE FROM panel_audit_log;

DELETE FROM partner_ride_series;

DELETE FROM driver_vehicle_assignments;
DELETE FROM fleet_drivers;
DELETE FROM fleet_vehicles;

DELETE FROM panel_users;

DELETE FROM admin_companies;

DELETE FROM admin_auth_password_resets
WHERE admin_user_id IN (
  SELECT id FROM admin_auth_users
  WHERE lower(username) <> lower('__KEEP_LOGIN__')
);

DELETE FROM admin_auth_audit_log;

DELETE FROM admin_auth_users
WHERE lower(username) <> lower('__KEEP_LOGIN__');

DO $$
DECLARE n int;
BEGIN
  SELECT count(*)::int INTO n FROM admin_auth_users;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Nach Wipe: admin_auth_users soll 1 Zeile haben, ist %', n;
  END IF;
END $$;

COMMIT;
