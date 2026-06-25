-- Nav-Promo „Fixpreise“: Anker #fixpreise → eigene Seite /fixpreise

UPDATE homepage_content
SET nav_promo = jsonb_set(
  COALESCE(nav_promo, '{}'::jsonb),
  '{href}',
  '"/fixpreise"'::jsonb
)
WHERE COALESCE(nav_promo->>'href', '') IN ('#fixpreise', '/#fixpreise');

UPDATE homepage_content
SET fixpreis_section = jsonb_set(
  COALESCE(fixpreis_section, '{}'::jsonb),
  '{ctaLink}',
  '"/#jetzt-buchen"'::jsonb
)
WHERE COALESCE(fixpreis_section->>'ctaLink', '') IN ('#jetzt-buchen', '');
