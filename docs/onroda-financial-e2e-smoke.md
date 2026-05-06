# ONRODA — Financial E2E Smoke (manuell)

Kurzcheckliste für Betrieb/QA nach Deploy. **Bearer:** Admin `Authorization: Bearer …` wie für alle JSON-Routen unter **`/api/admin/…`** (siehe `requireAdminApiBearer`). **DB:** Migration **061** eingespielt.

## 1–3 Fahrtlebenszyklus

1. **Fahrt erstellen** — z. B. Kunden-/Panel-Flow; `ride_financials`-Zeile kann bei Erstellung angelegt werden (`ride_created`).
2. **Annehmen / zu Endstatus führen** — je nach Szenario Fleet-Accept bzw. Statuswechsel.
3. **Abschließen** — `PATCH /rides/:id/status` mit `completed` → `upsertRideFinancialSnapshot` (`ride_completed_status_transition`); Provision/VAT wird in `calculation_metadata_json.finance_pricing_snapshot` eingefroren und nicht mehr durch spätere Operational-Commission überschrieben.

## 4–6 Rechnung (Medical Panel)

4. **`POST /panel/v1/rides/:id/create-invoice`** (Medical, `billing_ready`) — erste Antwort mit PDF-Metadaten.
5. **Rechnung erneut erstellen** — gleicher Aufruf muss **`200`** mit **`idempotent: true`** liefern, **keine** zweite erfolgreiche Buchung.
6. **Storno** — z. B. `PATCH … status: cancelled_by_customer` mit gültiger `cancelReason` wo nötig → **ein** Finanz-Upsert pro erstem erfolgreichen Storno (`ride_status_*`); wiederholtes PATCH auf **gleichem** Terminalstatus wird **vor** Mutation abgebrochen (kein zweites Upsert).

## 7–8 Settlement (Admin)

7. **`POST /api/admin/finance/settlements/create`** mit JSON `{ "companyId", "periodStart", "periodEnd", "rideIds": ["…"], "idempotencyKey": "batch-XYZ" }` — erzeugt Settlement + **`settlement_ride_allocations`**, aktualisiert Summenfelder auf `settlements`, setzt **`ride_financials.settlement_status`** auf `calculated`.
8. **Gleicher Request erneut** (identische `idempotencyKey`, gleiche Ride-Liste) — **`409`** wenn Ride-Liste abweicht, sonst **`idempotent: true`** und gleiche `settlementId`.

## 9–10 Provision & Audit

9. **`GET /api/admin/json/finance/ride-financials/:rideId`** — `commission_*`-Felder entsprechen dem **`finance_pricing_snapshot`** nach erstem Persist; keine stille Änderung bei Config-Änderung ohne Korrektur (`correctRideFinancialSnapshot`).
10. **`GET /api/admin/json/finance/audit`** — Einträge zu `snapshot_created`, `snapshot_updated`, `settlement_created_with_allocations`, `settlement_payment_*`, `snapshot_locked`.

## Auszahlung (optional)

11. **`POST /api/admin/finance/settlements/:settlementId/record-payment`** mit `{ "amount", "reference" }` — zweiter Aufruf mit offenem ersten `pending`/`booked` → **`idempotent: true`**; DB-Partial-Unique `payments_settlement_single_open` bremst Rennen zusätzlich.

## Bekannte Lücken / Risiken

- **„Operator“-Rechnungen** (`invoices` / `invoice_items`) außerhalb Medical-Panel weiterhin eigene Produktpfade absichern; Medical nutzt oft nur `partner_booking_meta`/PDF + `invoice_item_assigned`-Lock wenn invoice_items verküpft.
- **`rejected` / `expired`** lösen noch keinen dedizierten Finanz-Upsert aus (wie zuvor); nur **`cancelled*`**/`completed`/Terminal-Replay-Schutz angepasst.
- **Smoke** ist keine automatisierte Suite — bei Bedarf `curl`-Skripte mit echten Tokens ergänzen.
