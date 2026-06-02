-- Repariert ae-Schreibweisen in Homepage-CMS (Fahrgaeste → Fahrgäste, fuer → für, …).
-- Idempotent: erneutes Ausführen ändert bereits korrekte Texte nicht.

CREATE OR REPLACE FUNCTION onroda_fix_marketing_umlauts(t TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  t := COALESCE(t, '');
  t := regexp_replace(t, 'Für Fahrgaeste', 'Für Fahrgäste', 'gi');
  t := regexp_replace(t, '\mFahrgaeste\M', 'Fahrgäste', 'gi');
  t := regexp_replace(t, '\mFahrgaste\M', 'Fahrgäste', 'gi');
  t := regexp_replace(t, '\mfuer\M', 'für', 'gi');
  t := regexp_replace(t, '\mGaeste\M', 'Gäste', 'gi');
  RETURN t;
END;
$$;

UPDATE homepage_content
SET
  hero_headline = onroda_fix_marketing_umlauts(hero_headline),
  hero_subline = onroda_fix_marketing_umlauts(hero_subline),
  cta1_text = onroda_fix_marketing_umlauts(cta1_text),
  cta2_text = onroda_fix_marketing_umlauts(cta2_text),
  notice_text = onroda_fix_marketing_umlauts(notice_text),
  section2_title = onroda_fix_marketing_umlauts(section2_title),
  services_kicker = onroda_fix_marketing_umlauts(services_kicker),
  services_title = onroda_fix_marketing_umlauts(services_title),
  services_subline = onroda_fix_marketing_umlauts(services_subline),
  manifest_kicker = onroda_fix_marketing_umlauts(manifest_kicker),
  manifest_title = onroda_fix_marketing_umlauts(manifest_title),
  manifest_subline = onroda_fix_marketing_umlauts(manifest_subline),
  section2_cards = onroda_fix_marketing_umlauts(section2_cards::text)::jsonb,
  services_cards = onroda_fix_marketing_umlauts(services_cards::text)::jsonb,
  manifest_cards = onroda_fix_marketing_umlauts(manifest_cards::text)::jsonb,
  updated_at = NOW()
WHERE id = 'homepage-main';

UPDATE homepage_faq_items
SET
  question = onroda_fix_marketing_umlauts(question),
  answer = onroda_fix_marketing_umlauts(answer),
  updated_at = NOW()
WHERE question ILIKE '%fahrgaest%'
   OR question ILIKE '%fahrgaste%'
   OR answer ILIKE '%fahrgaest%'
   OR answer ILIKE '%fahrgaste%'
   OR question ~* '\mfuer\M'
   OR answer ~* '\mfuer\M';

UPDATE homepage_how_steps
SET
  title = onroda_fix_marketing_umlauts(title),
  body = onroda_fix_marketing_umlauts(body),
  updated_at = NOW()
WHERE title ILIKE '%fahrgaest%'
   OR title ILIKE '%fahrgaste%'
   OR body ILIKE '%fahrgaest%'
   OR body ILIKE '%fahrgaste%'
   OR title ~* '\mfuer\M'
   OR body ~* '\mfuer\M';

UPDATE homepage_trust_metrics
SET
  value = onroda_fix_marketing_umlauts(value),
  label = onroda_fix_marketing_umlauts(label),
  description = onroda_fix_marketing_umlauts(description),
  updated_at = NOW()
WHERE value ILIKE '%fahrgaest%'
   OR value ILIKE '%fahrgaste%'
   OR label ILIKE '%fahrgaest%'
   OR label ILIKE '%fahrgaste%'
   OR description ILIKE '%fahrgaest%'
   OR description ILIKE '%fahrgaste%';

UPDATE homepage_placeholders
SET
  title = onroda_fix_marketing_umlauts(title),
  message = onroda_fix_marketing_umlauts(message),
  updated_at = NOW()
WHERE title ILIKE '%fahrgaest%'
   OR title ILIKE '%fahrgaste%'
   OR message ILIKE '%fahrgaest%'
   OR message ILIKE '%fahrgaste%'
   OR title ~* '\mfuer\M'
   OR message ~* '\mfuer\M';

DROP FUNCTION onroda_fix_marketing_umlauts(TEXT);
