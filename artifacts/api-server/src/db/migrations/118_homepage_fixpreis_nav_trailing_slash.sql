-- Nav-Ziel mit Trailing-Slash (Nginx-Verzeichnis /fixpreise/).

UPDATE homepage_content
SET nav_promo = jsonb_set(
  COALESCE(nav_promo, '{}'::jsonb),
  '{href}',
  '"/fixpreise/"'::jsonb
)
WHERE COALESCE(nav_promo->>'href', '') IN ('/fixpreise', '#fixpreise', '/#fixpreise');
