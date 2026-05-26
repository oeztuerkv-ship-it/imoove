-- Verwendungszweck für Partner-Rechnungen (eindeutig, menschenlesbar, ohne company_id im Text).

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_reference TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS invoices_payment_reference_idx
  ON invoices (payment_reference)
  WHERE payment_reference <> '';

-- Bestehende Rechnungen: ONRODA {Firmenname} {YYYY-MM} {Rechnungsnummer}
UPDATE invoices i
SET payment_reference = trim(
  left(
    concat_ws(
      ' ',
      'ONRODA',
      nullif(
        regexp_replace(
          left(coalesce(c.name, 'Mandant'), 48),
          '[^A-Za-z0-9ÄÖÜäöüß .\-]',
          ' ',
          'g'
        ),
        ''
      ),
      to_char(i.billing_period_end::date, 'YYYY-MM'),
      i.invoice_number
    ),
    140
  )
)
FROM admin_companies c
WHERE c.id = i.company_id
  AND (i.payment_reference IS NULL OR trim(i.payment_reference) = '');

UPDATE invoices i
SET payment_reference = trim(
  left(concat_ws(' ', 'ONRODA', 'Mandant', to_char(i.billing_period_end::date, 'YYYY-MM'), i.invoice_number), 140)
)
WHERE (i.payment_reference IS NULL OR trim(i.payment_reference) = '')
  AND i.company_id IS NULL;
