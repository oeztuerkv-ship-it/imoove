-- Mandanten-Art `medical` (Krankenfahrt / Leistungspartner) — Freigabe aus Partner-Registrierung setzt company_kind = medical.
ALTER TABLE admin_companies DROP CONSTRAINT IF EXISTS admin_companies_company_kind_chk;
ALTER TABLE admin_companies
  ADD CONSTRAINT admin_companies_company_kind_chk
  CHECK (
    company_kind IN (
      'general',
      'taxi',
      'voucher_client',
      'insurer',
      'hotel',
      'corporate',
      'medical'
    )
  );
