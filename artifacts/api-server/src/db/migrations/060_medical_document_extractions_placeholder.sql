-- OCR / Krankenkassen-Vorbereitung: strukturierte Extraktionen (ohne Diagnose); keine automatische Freigabe.
-- API liest/schreibt diese Tabelle vorerst nicht — nur Schema für spätere Pipelines.
CREATE TABLE IF NOT EXISTS medical_document_extractions (
  id TEXT PRIMARY KEY,
  ride_id TEXT NOT NULL REFERENCES rides (id) ON DELETE CASCADE,
  company_id TEXT REFERENCES admin_companies (id) ON DELETE SET NULL,
  document_kind TEXT NOT NULL DEFAULT 'transport_sheet',
  source TEXT NOT NULL DEFAULT 'ocr_placeholder',
  review_status TEXT NOT NULL DEFAULT 'draft',
  extraction_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by_actor_kind TEXT,
  reviewed_by_actor_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT medical_document_extractions_review_chk
    CHECK (
      review_status IN ('draft', 'proposed', 'confirmed', 'rejected')
    ),
  CONSTRAINT medical_document_extractions_document_kind_chk
    CHECK (document_kind IN ('transport_sheet', 'signature_image', 'other'))
);

CREATE INDEX IF NOT EXISTS medical_document_extractions_ride_idx
  ON medical_document_extractions (ride_id, created_at DESC);
CREATE INDEX IF NOT EXISTS medical_document_extractions_company_idx
  ON medical_document_extractions (company_id, created_at DESC);
