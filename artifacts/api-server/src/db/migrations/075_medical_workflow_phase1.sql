-- Medical-Modul Phase 1: Fälle, Dokument-Scans (OCR-Rohdaten), Ampel-Reviews (ohne Auto-Freigabe).
-- Partner-IK des Mandanten für Snapshot beim Scan.

ALTER TABLE admin_companies
  ADD COLUMN IF NOT EXISTS partner_ik_number TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN admin_companies.partner_ik_number IS
  'Institutionskennzeichen (IK) des Partners/Leistungserbringers; Snapshot in medical_cases.partner_ik_number.';

CREATE TABLE IF NOT EXISTS medical_cases (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES admin_companies (id) ON DELETE CASCADE,
  ride_id TEXT REFERENCES rides (id) ON DELETE SET NULL,
  series_id TEXT REFERENCES partner_ride_series (id) ON DELETE SET NULL,
  patient_display_name TEXT NOT NULL DEFAULT '',
  patient_reference TEXT NOT NULL DEFAULT '',
  insurance_name TEXT NOT NULL DEFAULT '',
  insurance_ik TEXT NOT NULL DEFAULT '',
  partner_ik_number TEXT NOT NULL DEFAULT '',
  case_type TEXT NOT NULL DEFAULT 'transport_sheet',
  date_logic_type TEXT NOT NULL DEFAULT 'today',
  date_logic_context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT medical_cases_case_type_chk
    CHECK (case_type IN ('transport_sheet', 'signature_image', 'other')),
  CONSTRAINT medical_cases_date_logic_type_chk
    CHECK (date_logic_type IN ('today', 'series', 'return_trip', 'long_term_treatment')),
  CONSTRAINT medical_cases_status_chk
    CHECK (status IN ('open', 'reviewed', 'closed'))
);

CREATE INDEX IF NOT EXISTS medical_cases_company_created_idx
  ON medical_cases (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS medical_cases_ride_idx
  ON medical_cases (ride_id)
  WHERE ride_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS medical_cases_series_idx
  ON medical_cases (series_id)
  WHERE series_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS medical_documents (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES medical_cases (id) ON DELETE CASCADE,
  ride_id TEXT REFERENCES rides (id) ON DELETE SET NULL,
  document_type TEXT NOT NULL DEFAULT 'transport_sheet',
  storage_key TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT '',
  ocr_provider TEXT NOT NULL DEFAULT '',
  ocr_model TEXT NOT NULL DEFAULT '',
  ocr_raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ocr_extracted_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ocr_confidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT medical_documents_document_type_chk
    CHECK (document_type IN ('transport_sheet', 'signature_image', 'other'))
);

CREATE INDEX IF NOT EXISTS medical_documents_case_created_idx
  ON medical_documents (case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS medical_documents_ride_idx
  ON medical_documents (ride_id)
  WHERE ride_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS medical_reviews (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES medical_cases (id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES medical_documents (id) ON DELETE CASCADE,
  traffic_light TEXT NOT NULL DEFAULT 'yellow',
  warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  date_logic_result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewer_actor_kind TEXT NOT NULL DEFAULT 'system',
  reviewer_actor_id TEXT,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  auto_approved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT medical_reviews_traffic_light_chk
    CHECK (traffic_light IN ('green', 'yellow', 'red')),
  CONSTRAINT medical_reviews_reviewer_actor_kind_chk
    CHECK (reviewer_actor_kind IN ('system', 'driver', 'panel', 'admin'))
);

CREATE INDEX IF NOT EXISTS medical_reviews_case_reviewed_idx
  ON medical_reviews (case_id, reviewed_at DESC);

CREATE INDEX IF NOT EXISTS medical_reviews_document_idx
  ON medical_reviews (document_id);
