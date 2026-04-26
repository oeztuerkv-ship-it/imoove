# Admin-Panel: UI-Referenz (Operator-Konsole)

**Verbindliche Referenz** ab Stand Mandantenzentrale (`CompanyMandateDetailPage`) und zugehörigem Styling in `src/admin-ui.css` (Kapitel ab „Mandantenzentrale-Header + Form“).

Ziel: **keine** neuen Fremd- oder Einzellayouts, **keine** isolierten Sonderdesigns — neue und erweiterte Seiten sollen **dieselbe** visuelle und strukturelle Sprache nutzen.

## ONRODA Admin-Standard (Leitbild)

1. **Einheitliches helles Layout** — `admin-shell` / helle Inhaltsflächen, keine dunklen Vollbild-„Cockpits“ als neues Standard-Layout; Kontrast über Karten, nicht über Sonderhintergründe pro Seite.
2. **Karten statt Fremd-Design** — inhaltlich relevante Blöcke als `admin-m-card` (mit `admin-m-card--unified` wo vorgesehen), nicht als freistehendes Layout-Raster in Inline-Farben oder fremden CSS-Gittern.
3. **Mandantenzentrale als Hauptansicht** — Blick auf einen Mandanten folgt dem Muster `CompanyMandateDetailPage`: nummerierte Sektionen (Stammdaten, Status, Abrechnung, ggf. typbezogen), Hero mit Rück-Navigation.
4. **„Bearbeiten“ direkt in der Zentrale** — derselbe Ablauf wie in der Referenz: umschaltbares Formular in der Karte (Button `admin-m-btn-bearb`), kein zwingend separater Vollbild-Editor-Modus, wo die Zentrale dasselbe leistet.
5. **Typ-spezifische Zusatzfelder getrennt** — gemeinsame Stammdaten/Status/Abrechnung zuerst; Sektion **4** (Taxi, Hotel, Krankenkasse, sonst) nur Zusätze, keine doppelte Logik und keine Vermischung mit globalen Blöcken.
6. **TaxiMaster Schwarz/Gelb ist kein Admin-Standard** — die alte `TaxiMasterPanel`-Optik (dunkle Sidebar, Gelb) ist **kein** Vorbild für neuen oder refaktorierten Admin-UI-Code. Wo die Komponente vorerst noch technisch nötig ist, bleibt sie hinter klarer „Werkstatt“-Einordnung; **neu** baut der Admin nur noch auf hellem Karten-Layout.
7. **Gleiche Tragfähigkeit aller Unternehmensarten** — **Taxi, Hotel, Krankenkasse, Sonstige** nutzen **dieselbe** Seiten- und Sektionslogik; Unterschiede nur in den sichtbaren/aktiven Feldern der Sektion 4 und den Daten (`company_kind` / PATCH-Body), nicht in einem eigenen Layout-„Skin“ pro Branche.

## Referenz-Dateien (Source of Truth)

| Bereich        | Beispiel / Definition |
|----------------|------------------------|
| Detailseite mit Sektionen, Formular, Lesemodus | `src/pages/CompanyMandateDetailPage.jsx` |
| Tabellen, Suche, Filter (Badges) | `src/pages/CompaniesPage.jsx` |
| Globale Klassen | `src/admin-ui.css` (u. a. `admin-m-*`, `admin-c-*`) |
| App-Shell, Content-Raster | `src/admin-shell.css` |

## Cards (Karten)

- Inhalt in **`admin-panel-card` + `admin-m-card`**, für einheitliche Flächen: **`admin-m-card--unified`**, nicht pro Fachfarbe eigene Silo-Rahmen.
- Karten-Header: **`admin-m-card__h`**; Titel z. B. `admin-panel-card__title` wie in der Referenz.
- KPI-/Zahlenblöcke: **`admin-m-card--kpi`**, Raster **`admin-mandate-kpi`** (oder vergleichbare, bereits vorhandene KPI-Klassen aus derselben Datei).
- **Kein** Wiedereinführen veralteter „Silo“-Karten pro Typ (`admin-m-silo--*`) in neuen Features — Klasse ggf. nur in Legacy, nicht kopieren.

## Buttons

| Rolle        | Klassen (Wiederverwendung) |
|--------------|----------------------------|
| Primär / „Bearbeiten“ (prominent) | `admin-m-btn-bearb` |
| Primär, kompakt (dunkel)   | `admin-m-btn-pri` |
| Sekundär   | `admin-c-btn-sec` |
| Icon/Refresh   | `admin-m-btn-gh` |
| Text-Link/Back  | `admin-m-back` |

Keine ad-hoc `style={{ background: '#f1c40f' }}` oder fremde Farb-„Themes“ in neuen Seiten (z. B. kein Taxi-Schwarz/Gelb-Block).

## Abstände

- Seiten-Container: **`admin-m-page`**, **`admin-page`**, wie in der Mandantenzentrale.
- Vertikal zwischen Sektionen: typisch **12–16px** `margin-bottom` pro Card-Section (siehe Referenzseite).
- Form: **`admin-m-form`**; Sektionstitel im Formular: **`admin-m-sec`**; Fließtext: **`admin-m-sec__hint`**.

## Status-Badges

- Plattform-neutral: **`admin-c-badge`** + Modifikatoren **`admin-c-badge--neutral` | `--info` | `--ok` | `--warn` | `--err`**, wie in `CompaniesPage` (Mandantenliste) bzw. Hero der Mandantenzentrale.
- Nicht: eigene, inkompatible Farb-Stacks pro Screen ohne Abgleich mit dieser Tabelle.

## Formularzeilen, Read-Only-Notizen

- Felder: **`admin-m-lbl`**, **`admin-m-inp`**, **`admin-m-ta`**, **`admin-m-lbl--check`**.
- Sektionsfuß: **`admin-m-form__foot`**.
- Hervorgehobene reine Lese-Notiz: **`admin-m-ro-note`**.

## Struktur-Muster (Detailseiten)

- Optional **Hero** oben: **`admin-m-hero`**, **`admin-m-hero__bar`**, Titel, Badges, Aktionen rechts in **`admin-m-hero__actions`**.

## Tabellen & Listen (wenn nicht Mandantenliste)

- Wenn passend: Muster **CompaniesPage** (Suchzeile, Chips, Tabelle) — Klassen **`admin-c-*`** (`admin-c-table`, `admin-c-th`, `admin-c-tr`, …) aus derselben `admin-ui.css`, keine parallele Mini-Tabelle in Inline-Styles.

## Was nicht tun

- Keine **neuen** vollseitigen Layout-Experimente neben dem Shell- und Card-Muster, wenn dieselbe Information auch in Karten+Form darstellbar wäre.
- Keine **duplizierten** Design-Systeme im Ordner (kein zweites **TaxiMaster**-Theme als Admin-Referenz; siehe ONRODA Admin-Standard oben).
- Keine harten **Einzelfarben** für Sektionen, die im Rest des Admin-Panels nicht vorkommen — bei Bedarf zuerst `onroda-brand.css` / Variablen prüfen, dann ggf. **eine** Erweiterung in `admin-ui.css` committen, die für alle wiederverwendet werden kann.

## Änderungsprozess

Wer eine **wirklich** neue, mehrfach nutzbare Komponente braucht: in **`admin-ui.css`** (oder bei wirklichem Muster-Export konsistent mit dem Team) hinterlegen und **diese** Referenzdoku um eine Zeile ergänzen.
