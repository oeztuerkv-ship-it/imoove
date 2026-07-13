# Partner-Panel: UI-Referenz (Unternehmens-Arbeitsplatz)

**Persona:** nur **eigenes Unternehmen**, Sprache **Ihr / Mein** — nicht die Operator-Konsole. Visuell: warme Flächen, Teal-Akzente (`panel-app--workspace`). Trennung zu Admin: `imoove-panel-ux-separation.mdc`.

**Gemeinsame Struktur-Muster (Chat, Modals, KV, Aufklappbar):** `.cursor/rules/imoove-modern-ui-design-agreement.mdc`

## Referenz-Dateien

| Bereich | Beispiel |
|---------|----------|
| Aufklappbare Sektionen | `src/components/PartnerCollapsibleSection.jsx` + `partner-workspace.css` (`.partner-collapsible`) |
| Meine Fahrten (Karten, Segmente) | `src/pages/PartnerRidesListPage.jsx`, `src/components/PartnerRideCard.jsx` |
| Fahrt-Chat (Modal + Bubbles) | `src/components/PartnerRideChatModal.jsx`, `panel-ui.css` (`.partner-ride-chat-*`) |
| Dialog-Standard | `panel-ui.css` — `.panel-dialog`, `.panel-dialog__footer` |
| Schlüssel–Wert | `panel-ui.css` — `.panel-detail-kv` |
| Stammdaten / Einstellungen | `src/pages/SettingsPage.jsx`, `panel-card` |

## Seitenoberfläche

| Ebene | Klasse | Verhalten |
|-------|--------|-----------|
| App-Chrome | `panel-app--workspace` | Teal-Arbeitsplatz, nicht Admin-Cyan |
| Seite | `panel-page` | Titel `panel-page__title`, Lead `panel-page__lead` |
| Statische Karte | `panel-card` / `panel-card--wide` | Weiße Karte auf hellem Grund |
| Aufklappbar | `PartnerCollapsibleSection` | Wie Admin, Partner-Chevron/Styling |
| Fahrt-Karte (Liste) | `partner-ride-card--modern` | Kopfzeile kompakt, Body aufklappbar |

## Buttons

| Rolle | Klasse |
|-------|--------|
| Primär | `panel-btn-primary` |
| Sekundär | `panel-btn-secondary` |

Keine Admin-Klassen (`admin-*`) im Partner-Panel importieren oder spiegeln.

## Chat (Fahrt)

- Thread-Hintergrund: `#eceff1` (wie Mobile `RIDE_CHAT_THEME.threadBg`)
- Eigene Nachricht: grün (`partner-ride-chat-bubble--out`)
- Fahrer/Kunde: blau (`--in-peer`)
- **Text und Uhrzeit in einer Zeile** (`partner-ride-chat-bubble__body-row`)
- Modal: `panel-dialog` — Header mit Eyebrow, Footer mit Abbrechen + Senden

## IDs

- Monospace für REQ-IDs
- Copy-Icon-Button: `partner-ride-card__id-copy` (Muster für weitere Copy-Aktionen)

## Neue Features

1. Zuerst prüfen, ob `PartnerCollapsibleSection` oder `panel-card` reicht.
2. Modal → `panel-dialog`-Gerüst, nicht neues Overlay-CSS.
3. Keine `0.72rem`-Mini-Flächen für Hauptinhalt; Mind. ~0.88–0.92rem Fließtext in Karten.
