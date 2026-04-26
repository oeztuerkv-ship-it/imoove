-- Homepage-Hinweise: visuelle Typen info | success | warning | important (Spalte tone)
-- Legacy neutral / unbekannte Werte → info

UPDATE homepage_placeholders
SET tone = 'info'
WHERE tone IS NULL OR tone = '' OR lower(trim(tone)) = 'neutral';

UPDATE homepage_placeholders
SET tone = 'info'
WHERE lower(trim(tone)) NOT IN ('info', 'success', 'warning', 'important');
