-- Kunden-Identitäten (E-Mail, Google, Apple) — passenger_id = JWT sub.
CREATE TABLE IF NOT EXISTS passenger_profiles (
  passenger_id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  auth_provider TEXT NOT NULL DEFAULT 'google',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS passenger_profiles_email_idx ON passenger_profiles (email)
  WHERE email <> '';

CREATE INDEX IF NOT EXISTS passenger_profiles_auth_provider_idx ON passenger_profiles (auth_provider);

CREATE INDEX IF NOT EXISTS passenger_profiles_first_seen_idx ON passenger_profiles (first_seen_at DESC);

-- Bestehende E-Mail-Konten
INSERT INTO passenger_profiles (passenger_id, name, email, auth_provider, first_seen_at, last_seen_at, updated_at)
SELECT id, name, email, 'email', created_at, updated_at, updated_at
FROM customer_accounts
ON CONFLICT (passenger_id) DO NOTHING;

-- OAuth-Nutzer aus Fahrten (Google/Apple ohne customer_accounts-Zeile)
INSERT INTO passenger_profiles (passenger_id, name, email, auth_provider, first_seen_at, last_seen_at, updated_at)
SELECT
  agg.passenger_id,
  COALESCE(agg.latest_name, ''),
  '',
  CASE WHEN agg.passenger_id LIKE 'apple:%' THEN 'apple' ELSE 'google' END,
  agg.first_ride_at,
  agg.last_ride_at,
  agg.last_ride_at
FROM (
  SELECT
    r.passenger_id,
    (ARRAY_AGG(r.customer_name ORDER BY r.created_at DESC))[1] AS latest_name,
    MIN(r.created_at) AS first_ride_at,
    MAX(r.created_at) AS last_ride_at
  FROM rides r
  WHERE r.passenger_id IS NOT NULL
    AND r.passenger_id NOT IN (SELECT id FROM customer_accounts)
  GROUP BY r.passenger_id
) agg
ON CONFLICT (passenger_id) DO NOTHING;
