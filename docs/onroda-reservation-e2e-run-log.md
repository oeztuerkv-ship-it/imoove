# Reservierungs-E2E: Laufprotokoll (Agent / CI-nahe Checks)

**Datum:** 2026-05-10  
**Commit-Ziel:** `fix(reservations): harden reservation lifecycle and activation flow`  
**Hinweis:** Geräte-, Push-, Cron- und Server-Smokes sind **manuell** auf Staging/Produktion auszuführen; unten ist getrennt dokumentiert, was **in dieser Umgebung** automatisch geprüft wurde.

---

## Automatisch geprüft (grün)

| Check | Ergebnis |
|--------|----------|
| `pnpm --filter @workspace/api-server run build` | OK |
| `pnpm --filter @workspace/mobile run typecheck` | OK |
| Keine Rest-Auto-Promotion im API-Source (`promoteDueReservations` / `isReservationActivatable`) | Keine Treffer unter `artifacts/api-server/src` |
| Storno-Grenze (Modell wie `isReservationCustomerDriverStornoLocked`: Sperre bei `msUntilPickup <= 60min`) | 61 min → offen; 60 min → zu; 59 min → zu |
| Aktivieren-Fenster (Modell wie Fahrer-`canActivate`: `0 <= round(minutesUntil) <= 45`) | 46 min vorher → nein; 45 → ja; 44 → ja |

---

## Manuell / auf Server (Checkliste, noch auszufüllen)

| # | Szenario | Erwartung | Status |
|---|----------|-----------|--------|
| 1 | `scheduled` ohne Annahme bis kurz vor Abholung; Cron | ≤10 min vor Abholung → `cancelled_by_system`, Push Kunde | ☐ |
| 2 | `scheduled_assigned` ohne Aktivierung | Status bleibt bis Tap; kein Live-Standort Kunde | ☐ |
| 3 | Aktivieren 44 / 45 / 46 min | 46 Button aus; 44/45 wie UX-Spez | ☐ |
| 4 | `ready_for_dispatch` | **Nur** nach Fahrer-Button, nicht durch List-GET | ☐ |
| 5 | GPS / WS | Erst nach 4, Join mit JWT, Standort fließt | ☐ |
| 6 | Storno 61 / 60 / 59 min | API `reservation_storno_locked` bei ≤60 min | ☐ |
| 7 | Verpasste Aktivierung | Sperre 24h, Fahrt wieder `scheduled`, kein Market für gesperrten Fahrer | ☐ |
| 8 | Pushes | Bestätigt, Reminder ~45 min, Sperr-Hinweis, kein Push durch Auto-Promotion | ☐ |
| 9 | App-Neustart Kunde/Fahrer | Konsistenter Status nach Refetch | ☐ |
| 10 | Keine Ghost-Fahrt / kein falsches „Fahrer unterwegs“ | Nur `scheduled` nie Live-Leiste | ☐ |

---

## Deploy-Hinweis

- Migration **064** (und ggf. **063** falls noch nicht auf der DB): über `./scripts/deploy-onroda-production.sh` bzw. nur Migrationen-Modus.  
- Nach Deploy: `GET /api/healthz` + kurzer Reservierungs-Smoke (Buchung → Zuweisung → Aktivieren → WS).

---

## Referenz

Ausführliche Matrix und Architektur: `docs/onroda-reservation-flow-e2e-test-matrix.md`.
