-- Listen/Pagination für Plattform-Admin-Fahrten (GET /api/admin/rides)
CREATE INDEX IF NOT EXISTS rides_created_at_desc_idx ON public.rides (created_at DESC);
