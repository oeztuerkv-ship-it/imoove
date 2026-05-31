-- Onboarding-Dokumente in DB (bytea), optional pro Fahrzeug (090).

CREATE TABLE IF NOT EXISTS company_documents (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES admin_companies(id) ON DELETE CASCADE,
  vehicle_id TEXT REFERENCES company_vehicles(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_data BYTEA NOT NULL,
  mime_type TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by TEXT
);

CREATE INDEX IF NOT EXISTS company_documents_company_id_idx ON company_documents(company_id);
CREATE INDEX IF NOT EXISTS company_documents_vehicle_id_idx ON company_documents(vehicle_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_documents_doc_type_chk'
  ) THEN
    ALTER TABLE company_documents
      ADD CONSTRAINT company_documents_doc_type_chk
      CHECK (
        doc_type IN (
          'gewerbeschein',
          'konzession',
          'fahrzeugschein',
          'versicherung',
          'ik_nachweis',
          'personalausweis',
          'sepa',
          'kk_vertrag',
          'sonstige'
        )
      );
  END IF;
END $$;
