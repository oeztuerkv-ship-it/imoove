-- Mid-Trip-Abbruch: Zeitpunkt des Kunden-Abbruchs nach Fahrtstart (Audit / Admin-Filter).
-- Status customer_abort_pending_fare → cancelled_by_customer mit Taxameter-Endpreis.

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS customer_mid_trip_abort_at timestamp with time zone;

COMMENT ON COLUMN rides.customer_mid_trip_abort_at IS
  'Kunden-Abbruch während in_progress; gesetzt bei Übergang zu customer_abort_pending_fare, bleibt nach Finalisierung.';
