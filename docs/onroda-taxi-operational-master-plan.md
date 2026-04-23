# Taxi betreibbar machen — Master-Plan (nur Planung)

Dieses Dokument bündelt die **nächsten Bausteine**, damit das Taxi-Partner-Panel **fertig und steuerbar** ist, plus die **Admin-Steuerzentrale** und eine **Mindest-Abrechnungslogik**. **Keine Implementierung** — Verweise auf bestehende Architektur-Doku und konkrete nächste Schritte.

Bestehender Detailplan **Anfragen / Support-Chat:** [`onroda-support-requests-architecture.md`](./onroda-support-requests-architecture.md)

---

## 1. Anfrage-System (Architektur + Flow)

### Ziel

Ein Thread = eine Konversation pro Thema; Nachrichten chronologisch; **vier Status**; Kategorien bei Erstellung; Partner nur eigener Mandant; Admin global.

### Flow (Kurz)

| Schritt | Partner | Admin |
|--------|---------|--------|
| Erstellung | `POST` Thread + erste Nachricht → Status **offen** | — |
| Bearbeitung | — | optional **in Bearbeitung** (`PATCH`) |
| Antwort | liest Polling | `POST` Nachricht → Status **beantwortet** (Regel siehe Support-Doku) |
| Abschluss | — | **geschlossen** (`PATCH`) |
| Nacharbeit | Schreibt bei **beantwortet** → wieder **offen** | — |

### Technische Grundlage

- Tabellen `support_threads` / `support_messages` (siehe Support-Architektur-Doku).
- Panel-Modul z. B. `support`; Routen unter `/api/panel/v1/support/…`.
- Admin unter `/api/admin/support/…` (analog zu bestehenden `adminApi`-Pfaden).

### Integration (Produkt)

- **Stammdaten:** CTA „Änderung anfragen“ → neuer Thread, Kategorie Stammdaten, Text vorbelegt.
- **Dokumente:** bei abgelehntem Nachweis → CTA „Anfrage stellen“.
- Einheitlich für alle Mandanten-Arten (nicht Taxi-spezifische API).

---

## 2. Fahrtenliste im Unternehmer-Panel

### Ziel

Unternehmer sieht **alle Mandantenfahrten** in einer **einfachen Liste** mit Filter **Datum**; Spalten: Datum, Start/Ziel, Preis, Status, Fahrer.

### Ist-Zustand (API)

- **`GET /api/panel/v1/company-rides`** existiert bereits (`panelApi.ts`, Filter `createdFrom` / `createdTo`, Mandant aus JWT).
- Antwort enthält Fahrten inkl. Felder für Route, Status, Preis; **Fahrer** ggf. über Join/Anreicherung prüfen (falls noch nicht in Payload: Planungsschritt „`driver_id` → Anzeigename“ oder Panel-Fleet-Zuordnung).

### UI-Plan (Partner)

| Thema | Vorschlag |
|-------|-----------|
| Ort | Neues Modul in **Taxi-Shell** z. B. „Fahrten“ oder „Alle Fahrten“ (nicht nur Cockpit-KPI). |
| Komponente | `TaxiCompanyRidesPage.jsx` (oder unter `src/pages/taxi/`): Tabelle + Datumsfilter (gleiche Query-Semantik wie CSV: UTC-Tage oder dokumentiert Berlin — mit Export konsistent halten). |
| Modul | `company_rides` ist für Taxi in `panelModules` bereits in der erlaubten Menge enthalten — Sichtbarkeit an **`rides.read`** + Modul koppeln. |
| Umfang | Kein Overkill: Pagination oder „letzte 90 Tage“ wie API-Default; optional „Mehr laden“. |

### Abgrenzung

- **Kein** zweites Rechtesystem: nur `panel_users` + bestehende Permissions (`rides.read`).
- Fahrer-App / Fahrgast bleiben getrennt (Rollenregel Produkt).

---

## 3. Admin-Freigabe-Struktur („Steuerzentrum“)

### Ziel

Eine **mentale Startseite** für Operator: was ist offen, was ist blockiert, wo muss ich klicken.

### Bereits vorhanden (API / Daten, teils UI)

| Funktion | Typischer Ort | Anmerkung |
|----------|----------------|-----------|
| Mandant bearbeiten / sperren | `PATCH /api/admin/companies/:companyId` | Felder wie `is_active`, ggf. Sperr-Flags — mit bestehendem Admin-UI abgleichen |
| Compliance-Dokumente prüfen | `PATCH …/compliance-documents/:kind` | Admin-API existiert |
| Compliance-Status / High-Level | Company-Patch mit `complianceStatus` (wo vorgesehen) | Mit Panel-Darstellung (`compliance_bucket`) nicht vermischen |
| Panel-Nutzer pro Firma | Admin-Routen zu `panel-users` | teils vorhanden |

### Geplant / Lücken

| Baustein | Plan |
|---------|------|
| **Support-Anfragen** | Nach Umsetzung Abschnitt 1: Admin-Inbox + Filter |
| **„Offene Dokumente“** | Admin-View: Mandanten mit `compliance_bucket`-äquivalenter Auswertung oder Query auf `company_compliance_documents` (`review_status = pending`) + Taxi `company_kind` |
| **„Offene Anfragen“** | Aus `support_threads` where `status IN (open, in_progress)` |
| **„Gesperrte / inaktive Firmen“** | Liste aus `admin_companies` (`is_active`, `is_blocked` je nach Schema) |
| **Stammdaten nach Anfrage** | Workflow: Partner-Thread → Admin liest → Admin `PATCH company` oder dedizierter „Übernahme“-Endpunkt — **Policy festlegen** (ein Endpunkt, kein Wildwuchs) |

### UI-Struktur (Admin)

- **Dashboard-Kacheln** oder eine Seite „Freigaben“ mit Untertabs: Unternehmen | Dokumente | Anfragen | Gesperrt.
- Gleiche **Operator-Sprache** wie heute (Admin ≠ Partner-UX, siehe Panel-UX-Regeln).

---

## 4. Abrechnungs-Grundlogik (Minimum)

### Ziel

**Klare Geldlogik:** Umsatz (Brutto), Plattform-Anteil, Rest für Partner — zuerst **sichtbar im Admin**, später Rechnungen/Auszahlung.

### Ist-Zustand (technisch)

- **`ride_financials`** / `financeCalculationService` (Provision `percentage` / `fixed` / …, Defaults) — siehe `init-onroda.sql` / `schema.ts`.
- Partner-Umsatz-KPIs und CSV basieren auf Fahrten-Preisfeldern (nicht automatisch identisch mit `ride_financials` — **Begriff im Produkt trennen**: „Fahrtenumsatz“ vs. „abgerechneter Plattform-Anteil“).

### Plan Minimum (MVP)

| Schicht | Inhalt |
|---------|--------|
| **Definition** | Mandanten- oder globaler Default-Prozentsatz (z. B. 7 %) in Konfiguration/DB (ein Feld, keine UI-Komplexität am Anfang). |
| **Admin** | Eine Seite oder Kachelgruppe: Summe Umsatz (abgeschlossene Fahrten Zeitraum), Summe **Provision**, Summe **Partner-Netto** — Datenquelle primär `ride_financials` wo vorhanden, sonst klar dokumentierter Fallback. |
| **Partner** | Optional später: read-only „Ihre Abrechnungsübersicht“ — nicht Blocker für Taxi-MVP wenn Admin reicht. |

### Später (explizit nicht MVP)

- Rechnungsdokumente, Auszahlungsläufe, Steuerunterlagen, Gutschriften.

---

## 5. Benachrichtigungen (einfach) — Plan

### Ziel

Partner sieht **ohne E-Mail-Pflicht**: neue relevante Ereignisse.

### Umsetzung (MVP)

| Mechanismus | Beschreibung |
|---------------|--------------|
| **Badge** | Zähler offener Threads (`status = open` für `company_id`) + ggf. Compliance **abgelehnt** Flag aus Company-Payload |
| **Cockpit-Hinweis** | Bestehende Alert-Karten erweitern, wenn Support-Modul live |
| **Polling** | Beim Öffnen von „Anfragen“ / Dashboard Refresh — kein WebSocket |

Später: optionale E-Mail an hinterlegte Adresse — nicht Teil des MVP-Plans.

---

## 6. Produktregeln (Bestätigung im Plan)

| Regel | Umsetzung im Plan |
|-------|-------------------|
| Rollen strikt | Unternehmer-Panel ≠ Fahrer ≠ Fahrgast; keine Admin-Shortcuts im Partner-UI-Text |
| Kein zweites Rechtesystem | `panel_users` + `panelPermissions` + `panel_modules` |
| Einfach halten | 4 Support-Status; schlanke Fahrtenliste; Admin-Oberfläche tabellarisch |
| Einheitliches Partner-UI | `partner-workspace.css`, Taxi-Shell als Referenz für spätere Mandanten-Modi |

---

## 7. Reihenfolge (empfohlen)

1. **Support-Threads** (DB + Partner-API + minimale Partner-UI + Admin-Inbox) — entblockiert Stammdaten-/Dokument-CTAs.
2. **Fahrtenliste** im Taxi-Panel (nur UI + Anbindung `company-rides`, Fahrer-Spalte klären).
3. **Admin-Steuerzentrum** (Kacheln/Listen auf bestehende APIs + Lücken schließen).
4. **Abrechnung Admin-Minimum** (Aggregation aus `ride_financials` / klarer Definition).
5. **Badges / Hinweise** (Zähler + Cockpit).

---

## 8. Danach (Hinweis Roadmap)

**Business-Partner-Modus** (Hotel, Agentur, Medical, …): gleiche Shell-/Nav-Disziplin, andere Buchungslogik — siehe bestehende `company_kind`-Whitelists in `panelModules.ts`; kein Mischen von Taxi-Fachlogik in gemeinsame Support-/Fahrten-Endpunkte ohne `company_id`-Filter.

---

*Stand: Planungsdokument. Umsetzung in kleinen PRs je Abschnitt 7.*
