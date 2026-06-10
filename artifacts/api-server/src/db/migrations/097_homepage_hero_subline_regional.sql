-- Homepage-CMS: regionaler Hero-Subtext (Marketing)

UPDATE homepage_content
SET
  hero_subline = 'Ihr Taxi- und Krankenfahrten-Service in Stuttgart, Leinfelden-Echterdingen, Filderstadt, Echterdingen und Umgebung. Jetzt Fahrt buchen oder als Taxiunternehmen Partner werden – schnell, zuverlässig, 24/7.',
  updated_at = NOW()
WHERE id = 'homepage-main';
