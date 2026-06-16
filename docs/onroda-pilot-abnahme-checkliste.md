# Pilot-Abnahme: 30-Minuten-Checkliste (Kunde → Fahrer → Zahlung)

**Zweck:** Einmal durchspielen vor dem kontrollierten Pilot (1 Mandant, wenige Fahrer).  
**Dauer:** ca. 30 Minuten mit 2 Geräten (Kunde + Fahrer).  
**Voraussetzung:** Server-Deploy aktuell (`./scripts/deploy-onroda-production.sh`), Mobile-Build mit aktuellem `main`, Testfahrer **ONLINE**.

---

## Vorbereitung (5 Min.)

| # | Schritt | Erwartung |
|---|---------|-----------|
| 0.1 | API: `curl -s https://api.onroda.de/api/healthz` | `ok` / HTTP 200 |
| 0.2 | Kunde: App öffnen, **Profil → Weiter mit Google** | Login ohne „JSON parse“ / HTML-Fehler |
| 0.3 | Fahrer: einloggen, Schalter **ONLINE**, Standort erlaubt | Dashboard bereit, Markt sichtbar |
| 0.4 | Optional Karte: Testkarte hinterlegen (Stripe) | Zahlungsmethode in Buchung wählbar |

---

## A — Sofortfahrt Bar (10 Min.)

| # | Rolle | Aktion | Erwartung |
|---|-------|--------|-----------|
| A1 | **Kunde** | Ziel setzen → Standard-Taxi → **Bar** → buchen | Preis zeigt **Taxameter** (kein €-Schätzpreis) |
| A2 | **Kunde** | Fahrt bestätigen | Kein Fehler, Weiterleitung zu Status / Suche |
| A3 | **Fahrer** | Auftrag im Markt → **Annehmen** | Kunde sieht Fahrer zugewiesen |
| A4 | **Kunde** | Status-Screen | Karte, Fahrername, **Taxameter** (ggf. + Aufschlag bei XL/Rollstuhl) |
| A5 | **Fahrer** | Anfahrt → Angekommen → Fahrt beginnen → **Endpreis** eintragen → abschließen | Status `completed` |
| A6 | **Kunde** | Quittung / Meine Fahrten | **Endpreis** vom Fahrer sichtbar, kein Schätzpreis |

**Abbruch testen (optional):** Kunde storniert vor Annahme → Auftrag verschwindet beim Fahrer.

---

## B — Sofortfahrt Karte (10 Min.)

| # | Rolle | Aktion | Erwartung |
|---|-------|--------|-----------|
| B1 | **Kunde** | Neue Fahrt, Zahlung **Karte / Apple Pay** | Beim Buchen: **SetupIntent** (0 €), kein 1-€-Hold |
| B2 | **Kunde** | Buchung abschließen | Status: Taxameter, Hinweis Abbuchung nach Fahrtende |
| B3 | **Fahrer** | Annehmen → Fahrt durchspielen → Endpreis z. B. 12,50 € | Capture serverseitig |
| B4 | **Kunde** | Nach Fahrtende | Quittung mit Endpreis; Karte belastet (Stripe Dashboard prüfen) |
| B5 | **Admin** (optional) | Tagesabrechnung / Fahrtliste | Fahrt mit Endpreis, Provision plausibel |

---

## C — XL oder Rollstuhl (5 Min., wenn im Pilot)

| # | Rolle | Aktion | Erwartung |
|---|-------|--------|-----------|
| C1 | **Kunde** | Fahrzeug **XL** oder **Rollstuhl** wählen | **Taxameter** + Zeile **+ Aufschlag** (ohne Euro-Betrag) |
| C2 | **Fahrer** | Passendes Fahrzeug / Klasse | Annahme nur wenn Fahrzeug passt (Policy) |

---

## Schnell-Check „Go / No-Go“

| Kriterium | Go |
|-----------|-----|
| Google-Login | Ja, Session aktiv (Profil zeigt Name/E-Mail) |
| Buchung → Annahme | Ja, ohne Ghost-Order |
| Live-Status Kunde | Ja, Fahrer auf Karte / ETA |
| Endpreis + Quittung | Ja, nur Taxameter-Endpreis |
| Kartenzahlung | Ja, Capture **nach** Fahrt, nicht bei Buchung |
| Deploy-Stand | Server + App-Build vom gleichen `main`-Stand |

**No-Go**, wenn: Google-Login scheitert, Fahrer sieht Auftrag nicht, Karte wird sofort belastet, oder API-500 nach Deploy (Migrationen prüfen).

---

## Nach dem Test

- [ ] Auffälligkeiten in GitHub-Issue / Team-Chat notieren  
- [ ] Stripe Live-Events + PM2-Logs kurz prüfen  
- [ ] Bei Erfolg: Pilot-Kundenkreis freigeben  

**Referenz:** ausführliche Matrix Reservierungen → `docs/onroda-reservation-flow-e2e-test-matrix.md`
