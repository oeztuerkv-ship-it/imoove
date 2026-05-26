-- Verwendungszweck kürzen: identisch mit global eindeutiger Rechnungsnummer (Bank/SEPA).

UPDATE invoices
SET payment_reference = invoice_number
WHERE trim(coalesce(payment_reference, '')) <> trim(invoice_number)
   OR payment_reference IS NULL;
