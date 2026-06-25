-- Homepage: Fixpreise in Hauptnavigation + Anker-Bereich (Admin-CMS).

ALTER TABLE homepage_content
  ADD COLUMN IF NOT EXISTS nav_promo JSONB NOT NULL DEFAULT '{
    "label": "Fixpreise",
    "href": "#fixpreise",
    "isActive": true,
    "badge": "",
    "highlight": true
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS fixpreis_section JSONB NOT NULL DEFAULT '{
    "title": "Festpreis-Fahrten",
    "body": "Transparente Pauschalpreise für Ihre Strecke außerhalb des Pflichtfahrgebiets — Grundgebühr plus Kilometer nach ONRODA-Tarif. In der App buchen oder Festpreis-Gutschein über Hotel und Partner.",
    "ctaText": "Jetzt in der App buchen",
    "ctaLink": "#jetzt-buchen",
    "isActive": true
  }'::jsonb;

COMMENT ON COLUMN homepage_content.nav_promo IS 'Promo-Link in der Marketing-Header-Navigation (z. B. Fixpreise / Werbung).';
COMMENT ON COLUMN homepage_content.fixpreis_section IS 'Anker-Bereich #fixpreis auf onroda.de Startseite.';
