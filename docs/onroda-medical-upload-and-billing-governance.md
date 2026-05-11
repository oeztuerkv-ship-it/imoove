# Onroda — Medical-Uploads & Panel-Abrechnung (Governance)

Kurzüberblick für Betrieb und Entwicklung: **kein** öffentlicher Zugriff auf medizinische Nachweise, **Persistenz** der Dateien, **`invoice_immutable_context`** bei Partner-Rechnung.

## Speicherort (Dateisystem)

| Inhalt | Umgebungsvariable / Default | Hinweis |
|--------|------------------------------|--------|
| Panel-Rechnungs-PDFs (Medical) | `PANEL_INVOICE_UPLOAD_DIR`, sonst `{cwd}/artifacts/api-server/uploads/panel-invoices` | Pro Unternehmen Unterordner `…/invoices/<Rechnungsnr>.pdf`. |
| Transportschein / Signatur-Dateien (Medical) | `MEDICAL_RIDE_UPLOAD_DIR`, sonst `{cwd}/artifacts/api-server/uploads/medical-ride` | Siehe `artifacts/api-server/src/routes/rides.ts`; `transport_document_file_key` / Signatur-Keys in `partner_booking_meta`. |

**Wichtig für Produktion:** Deploys und PM2-Restarts **ersetzen** keine bind-mounts. Ohne **persistentes Volume** (oder rsync/Backup auf Block-Storage) gehen Uploads bei Neu-Deployment auf leerem Platten-Image verloren. Container: dasselbe Prinzip — **kein** reines Container-`tmp` ohne Volume.

## Zugriff und Sichtbarkeit

- Medical-Metadaten liegen in **`rides.partner_booking_meta`** (JSONB). Abrechnungskontext nach Rechnung zusätzlich unter **`invoice_immutable_context`** (Reduktion ohne Diagnose).
- Download/Anzeige erfolgt **nur über authentisierte API-Routen** (Kunde, berechtigtes Panel, ggf. Admin) — **keine** Welt-lesbaren statischen URLs für Transportschein/Signatur.
- QR-/Signatur-Flows aktualisieren nur Meta und Events; Dateizugriff bleibt gebunden an Session/JWT der jeweiligen Rolle.

## Retention & Löschen

- Aktuell keine automatische Löschroutine im Repo: **Retention** und Löschkonzept (z. B. gesetzliche Fristen vs. Testdaten) sind **betrieblich** zu definieren.
- **Partner-`create-invoice`:** PDF wird überschrieben, wenn derselbe Rechnungskreis je erneut lief — bei idempotentem Retry nach erfolgreicher Erzeugung gibt es **keinen** zweiten PDF-Schreibweg (Ride-Zeile bleibt „bereits invoiced“).

## Financial Integrity (`create-invoice`)

- Mit PostgreSQL läuft die Erzeugung in einer **Transaktion** mit **`SELECT … FOR UPDATE`** auf `rides`: parallele Doppel-Anfragen führen zu **hochstens einem** erfolgreichen Create; weiterer Retry liefert **200** mit `idempotent: true` und bestehender Rechnungsnummer.
- Nach erfolgreicher Buchung (oder bei bestehendem Invoice): **`ride_financials`** wird gesperrt (`lockRideFinancialSnapshot`) und **`billing_status: invoiced`** gesetzt sofern ein Snapshot existiert oder per `upsertRideFinancialSnapshot` angelegt wurde.
- **Financial-Audit:** `financial_audit_log` mit `entity_type = 'ride'`, Action `panel_medical_invoice_created` (bzw. idempotente Panel-Audit-Zeile `billing.invoice_create_idempotent`).

## OCR-Vorbereitung (Schema)

- Tabelle **`medical_document_extractions`** (Migration **060**): strukturierte Vorschläge (`extraction_json` / `confidence_json`), `review_status` ohne automatische finale Freigabe. **Keine** Speicherpflicht für Diagnosen — nur abrechnungs-/fahrtrelevante Felder nach späterer Produktpolicy.
