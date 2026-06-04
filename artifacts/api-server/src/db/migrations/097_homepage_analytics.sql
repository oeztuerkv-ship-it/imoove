-- Marketing-Homepage: datenschutzfreundliche Besucherstatistik (anonym, ohne IP)

CREATE TABLE IF NOT EXISTS homepage_analytics_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  page_path TEXT NOT NULL DEFAULT '/',
  referrer TEXT,
  device_type TEXT,
  browser TEXT,
  country TEXT,
  anonymous_visitor_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS homepage_analytics_events_created_at_idx
  ON homepage_analytics_events (created_at DESC);

CREATE INDEX IF NOT EXISTS homepage_analytics_events_type_created_idx
  ON homepage_analytics_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS homepage_analytics_events_page_created_idx
  ON homepage_analytics_events (page_path, created_at DESC);

CREATE INDEX IF NOT EXISTS homepage_analytics_events_visitor_created_idx
  ON homepage_analytics_events (anonymous_visitor_id, created_at DESC);
