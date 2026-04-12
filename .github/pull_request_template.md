## Kurzbeschreibung

<!-- Was ändert dieser PR? Warum? -->

## Rollen-Trennung

<!-- Bei Änderungen an API, Auth, Middleware, DB-Zugriffen, Admin-Panel, Partner-Panel oder Mobile (Kunde/Fahrer) ausfüllen. Sonst eine Zeile: „Nicht betroffen.“ -->

| Prüfpunkt | Antwort |
|-----------|---------|
| **Für welche Rolle(n) ist das Feature gedacht?** | Admin / Partner / Kunde / Fahrer — |
| **Route(n) / API-Prefix** | z. B. `/api/admin/…`, `/api/panel/v1/…`, öffentlich, Mobile-… |
| **Auth / Middleware** | z. B. Admin-Bearer, `requirePanelAuth`, öffentlich, … |
| **DB-Filter** | z. B. keine Mandantenfilter (Admin-global), `WHERE company_id = …`, nur eigene `passenger_id` / `driver_id`, … |
| **Global oder `company_id`-gebunden?** | |
| **Vermischung vermieden?** | Kurz: ja — oder Nein + was angepasst wurde |

### Checkliste (abhacken)

- [ ] Rolle(n), Routen und Schutzmechanismus sind konsistent zueinander.
- [ ] Partner-Pfade sind nicht global; Admin-Pfade erzwingen Admin-Auth.
- [ ] Kunden- und Fahrer-Daten sind nicht über Partner- oder Admin-Endpunkte „nebenbei“ sichtbar.

## Panel-UX (nur bei Admin- oder Partner-UI/Copy)

<!-- Sonst: „Nicht betroffen.“ -->

- [ ] **Admin** bleibt **Plattform-/Operator-Konsole** (Sprache, `admin-app--control`, keine Partner-Optik).
- [ ] **Partner** bleibt **Unternehmens-Arbeitsplatz** (Ihr/Mein, `panel-app--workspace`, keine Admin-Optik).
- [ ] Keine geteilten React-Komponenten zwischen `artifacts/admin-panel` und `artifacts/partner-panel` eingeführt.

## Tests / Verifikation

<!-- Wie wurde geprüft? (manuell, Build, …) -->
