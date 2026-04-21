import { PanelModuleIcon } from "./PanelModuleIcons.jsx";

function Field({ label, children, hint }) {
  return (
    <div className="admin-cws-field">
      <label className="admin-field-label">{label}</label>
      {children}
      {hint ? <p className="admin-cws-hint">{hint}</p> : null}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="admin-cws-section">
      <h3 className="admin-cws-section-title">{title}</h3>
      <div className="admin-cws-section-body">{children}</div>
    </div>
  );
}

function Card({ title, subtitle, children }) {
  return (
    <section className="admin-cws-card">
      <header className="admin-cws-card__head">
        <h2 className="admin-cws-card__title">{title}</h2>
        {subtitle ? <p className="admin-cws-card__sub">{subtitle}</p> : null}
      </header>
      <div className="admin-cws-card__body">{children}</div>
    </section>
  );
}

export default function CompanyWorkspaceForm({
  form,
  setForm,
  moduleCatalogAz,
  moduleCatalog,
  moduleDraft,
  onToggleModule,
  showPasswordCard,
  panelUsers,
  panelUsersLoading,
  selectedPanelUserId,
  setSelectedPanelUserId,
  passwordNew,
  setPasswordNew,
  passwordConfirm,
  setPasswordConfirm,
  passwordBusy,
  passwordMessage,
  onSubmitPanelPassword,
}) {
  const ch = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }));
  const chk = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.checked }));
  const isClient = form.company_type === "client";
  const isService = form.company_type === "service_provider";
  const supportsHotelModule = moduleCatalog.some((m) => m.id === "hotel_mode");
  const allModuleIds = moduleCatalog.map((c) => c.id);
  const allModulesOn = moduleDraft.length >= allModuleIds.length;

  function onTypeChange(nextType) {
    setForm((p) => ({
      ...p,
      company_type: nextType,
      ...(nextType === "client"
        ? { is_priority_company: false, priority_for_live_rides: false, priority_for_reservations: false }
        : {}),
    }));
  }

  return (
    <div className="admin-company-workspace">
      <div className="admin-company-workspace__col admin-company-workspace__col--main">
        <Card
          title="Unternehmensprofil bearbeiten"
          subtitle="Stammdaten, Abrechnung und taxi-relevante Angaben — zentral für Mandant und Buchhaltung."
        >
          <Section title="Basisdaten">
            <div className="admin-cws-field-grid">
              <Field label="Firmenname *">
                <input className="admin-input" value={form.name} onChange={ch("name")} required autoComplete="organization" />
              </Field>
              <Field label="Rechtsform">
                <input className="admin-input" value={form.legal_form} onChange={ch("legal_form")} placeholder="z. B. GmbH, UG, Einzelunternehmen" />
              </Field>
              <Field label="Inhaber / Geschäftsführung">
                <input className="admin-input" value={form.owner_name} onChange={ch("owner_name")} />
              </Field>
              <Field label="Ansprechpartner">
                <input className="admin-input" value={form.contact_name} onChange={ch("contact_name")} autoComplete="name" />
              </Field>
            </div>
          </Section>

          <Section title="Kontakt">
            <div className="admin-cws-field-grid">
              <Field label="E-Mail">
                <input className="admin-input" type="email" value={form.email} onChange={ch("email")} autoComplete="email" />
              </Field>
              <Field label="Telefon">
                <input className="admin-input" type="tel" value={form.phone} onChange={ch("phone")} autoComplete="tel" />
              </Field>
            </div>
          </Section>

          <Section title="Adresse (Betrieb)">
            <div className="admin-cws-field-grid">
              <Field label="Straße + Hausnummer">
                <input className="admin-input" value={form.address_line1} onChange={ch("address_line1")} autoComplete="street-address" />
              </Field>
              <Field label="Adresszusatz (optional)">
                <input className="admin-input" value={form.address_line2} onChange={ch("address_line2")} />
              </Field>
              <Field label="PLZ">
                <input className="admin-input" value={form.postal_code} onChange={ch("postal_code")} autoComplete="postal-code" />
              </Field>
              <Field label="Stadt">
                <input className="admin-input" value={form.city} onChange={ch("city")} autoComplete="address-level2" />
              </Field>
              <Field label="Land">
                <input className="admin-input" value={form.country} onChange={ch("country")} autoComplete="country-name" />
              </Field>
            </div>
          </Section>

          <Section title="Abrechnung">
            <div className="admin-cws-field-grid">
              <Field label="Rechnungsname / Rechnungsempfänger" hint="Juristischer oder handelsüblicher Empfänger auf der Rechnung.">
                <input className="admin-input" value={form.billing_name} onChange={ch("billing_name")} />
              </Field>
              <Field label="Rechnung: Straße + Hausnummer">
                <input className="admin-input" value={form.billing_address_line1} onChange={ch("billing_address_line1")} />
              </Field>
              <Field label="Rechnung: Adresszusatz (optional)">
                <input className="admin-input" value={form.billing_address_line2} onChange={ch("billing_address_line2")} />
              </Field>
              <Field label="Rechnung: PLZ">
                <input className="admin-input" value={form.billing_postal_code} onChange={ch("billing_postal_code")} />
              </Field>
              <Field label="Rechnung: Ort">
                <input className="admin-input" value={form.billing_city} onChange={ch("billing_city")} />
              </Field>
              <Field label="Rechnung: Land">
                <input className="admin-input" value={form.billing_country} onChange={ch("billing_country")} />
              </Field>
            </div>
          </Section>

          <Section title="Bankverbindung">
            <div className="admin-cws-field-grid">
              <Field label="IBAN">
                <input className="admin-input" value={form.bank_iban} onChange={ch("bank_iban")} autoComplete="off" spellCheck={false} />
              </Field>
              <Field label="BIC">
                <input className="admin-input" value={form.bank_bic} onChange={ch("bank_bic")} autoComplete="off" spellCheck={false} />
              </Field>
            </div>
          </Section>

          <Section title="Steuer">
            <div className="admin-cws-field-grid">
              <Field label="Steuer-ID">
                <input className="admin-input" value={form.tax_id} onChange={ch("tax_id")} />
              </Field>
              <Field label="USt-IdNr.">
                <input className="admin-input" value={form.vat_id} onChange={ch("vat_id")} />
              </Field>
            </div>
          </Section>

          <Section title="Taxi & Genehmigung">
            <div className="admin-cws-field-grid">
              <Field label="Unternehmensart (Plattform)">
                <select className="admin-select" value={form.company_kind} onChange={ch("company_kind")}>
                  <option value="general">Allgemein</option>
                  <option value="taxi">Taxi / Flotte</option>
                  <option value="voucher_client">Gutscheinkunde</option>
                  <option value="insurer">Krankenkasse / Versicherer</option>
                  <option value="medical">Medical / Krankenfahrt (ohne Krankenkasse)</option>
                  <option value="hotel">Hotel</option>
                  <option value="corporate">Firmenkunde / Corporate</option>
                </select>
              </Field>
              <Field label="Konzessionsnummer">
                <input className="admin-input" value={form.concession_number} onChange={ch("concession_number")} />
              </Field>
              <Field label="Genehmigung / Lizenz (Vermerk)" hint="Freitext zu Erlaubnis, P-Schein-Pflicht, Auflagen — intern im Mandantenprofil.">
                <textarea className="admin-input admin-textarea" rows={3} value={form.business_notes} onChange={ch("business_notes")} />
              </Field>
            </div>
          </Section>
        </Card>
      </div>

      <div className="admin-company-workspace__col admin-company-workspace__col--side">
        <Card title="Mandant &amp; Logik" subtitle="Typ, Priorität und technische Schwellen — nur Service-Erbringer mit Dispatch-Feldern.">
          <Section title="Unternehmenstyp">
            <div className="admin-cws-radio-row">
              <label className="admin-cws-radio">
                <input
                  type="radio"
                  name="companyTypeWs"
                  checked={form.company_type === "service_provider"}
                  onChange={() => onTypeChange("service_provider")}
                />
                <span>Service-Erbringer (Taxi / Flotte)</span>
              </label>
              <label className="admin-cws-radio">
                <input type="radio" name="companyTypeWs" checked={form.company_type === "client"} onChange={() => onTypeChange("client")} />
                <span>Auftraggeber (B2B / Gutschein)</span>
              </label>
            </div>
          </Section>

          {isClient ? (
            <Section title="Auftraggeber">
              <div className="admin-cws-field-grid">
                <Field label="Kunden-Kategorie">
                  <select className="admin-select" value={form.customer_category} onChange={ch("customer_category")}>
                    <option value="hotel">Hotel</option>
                    <option value="insurance">Krankenkasse</option>
                    <option value="company">Firma</option>
                  </select>
                </Field>
              </div>
              {form.customer_category === "hotel" ? (
                <p className="admin-cws-inline-info">
                  Hotel: Modul „Hotelmodus“ wird nach dem Anlegen bei aktivem Katalog automatisch vorgeschlagen.
                  {!supportsHotelModule ? " (Modul-Katalog derzeit ohne hotel_mode.)" : ""}
                </p>
              ) : null}
              {form.customer_category === "insurance" ? (
                <label className="admin-cws-check-line">
                  <input type="checkbox" checked={!!form.patient_data_required} onChange={chk("patient_data_required")} />
                  <span>Patientendaten-Vorgaben aktivieren</span>
                </label>
              ) : null}
            </Section>
          ) : null}

          {isService ? (
            <Section title="Matching &amp; Dispatch">
              <div className="admin-cws-toggle-list">
                <label className="admin-cws-toggle">
                  <div>
                    <div className="admin-cws-toggle__label">Priorität aktiv</div>
                    <div className="admin-cws-toggle__hint">Matching bevorzugt dieses Unternehmen.</div>
                  </div>
                  <input type="checkbox" checked={!!form.is_priority_company} onChange={chk("is_priority_company")} />
                </label>
                <label className="admin-cws-toggle">
                  <div>
                    <div className="admin-cws-toggle__label">Sofortfahrten priorisieren</div>
                    <div className="admin-cws-toggle__hint">Live-Fahrten zuerst an diesen Mandanten.</div>
                  </div>
                  <input type="checkbox" checked={!!form.priority_for_live_rides} onChange={chk("priority_for_live_rides")} />
                </label>
                <label className="admin-cws-toggle">
                  <div>
                    <div className="admin-cws-toggle__label">Reservierungen priorisieren</div>
                    <div className="admin-cws-toggle__hint">Geplante Fahrten höher gewichten.</div>
                  </div>
                  <input type="checkbox" checked={!!form.priority_for_reservations} onChange={chk("priority_for_reservations")} />
                </label>
              </div>
            </Section>
          ) : null}

          {isService ? (
            <Section title="Parameter">
              <div className="admin-cws-field-grid">
                <Field label="Mindestpreis Priorität (€)">
                  <input className="admin-input" inputMode="decimal" value={form.priority_price_threshold} onChange={ch("priority_price_threshold")} />
                </Field>
                <Field label="Radius (km)">
                  <input className="admin-input" inputMode="decimal" value={form.release_radius_km} onChange={ch("release_radius_km")} />
                </Field>
                <Field label="Timeout (Sekunden)">
                  <input className="admin-input" inputMode="numeric" value={form.priority_timeout_seconds} onChange={ch("priority_timeout_seconds")} />
                </Field>
              </div>
            </Section>
          ) : null}

          <Section title="Status">
            <label className="admin-cws-toggle">
              <div>
                <div className="admin-cws-toggle__label">Unternehmen aktiv</div>
                <div className="admin-cws-toggle__hint">Panel-Login nur bei aktivem Mandanten möglich.</div>
              </div>
              <input type="checkbox" checked={!!form.is_active} onChange={chk("is_active")} />
            </label>
          </Section>
        </Card>

        {moduleCatalog.length > 0 ? (
          <Card title="Partner-Portal-Module" subtitle={allModulesOn ? "Alle Module freigeschaltet (Default)." : `${moduleDraft.length} von ${allModuleIds.length} aktiv.`}>
            <Section title="Bereiche (an/aus)">
              <div className="admin-cws-module-chips">
                {moduleCatalogAz.map((mod) => {
                  const on = moduleDraft.includes(mod.id);
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      className={`admin-cws-module-chip${on ? " admin-cws-module-chip--on" : ""}`}
                      title={mod.description}
                      onClick={() => onToggleModule(mod.id, !on)}
                    >
                      <span className="admin-cws-module-chip__icon" aria-hidden>
                        <PanelModuleIcon moduleId={mod.id} />
                      </span>
                      <span className="admin-cws-module-chip__text">{mod.label}</span>
                      <span className="admin-cws-module-chip__state">{on ? "An" : "Aus"}</span>
                    </button>
                  );
                })}
              </div>
              <p className="admin-cws-hint">Mindestens ein Modul muss aktiv bleiben.</p>
            </Section>
          </Card>
        ) : null}

        {showPasswordCard ? (
          <Card
            title="Panel-Passwort"
            subtitle="Setzt für den gewählten Panel-Zugang ein neues Passwort (Operator-Aktion, kein altes Passwort nötig)."
          >
            <Section title="Zugang wählen">
              {panelUsersLoading ? <p className="admin-cws-hint">Zugänge werden geladen …</p> : null}
              {!panelUsersLoading && panelUsers.length === 0 ? (
                <p className="admin-cws-hint">Keine Panel-Benutzer für dieses Unternehmen.</p>
              ) : null}
              {panelUsers.length > 0 ? (
                <div className="admin-cws-field">
                  <label className="admin-field-label">Panel-Benutzer</label>
                  <select
                    className="admin-select"
                    value={selectedPanelUserId}
                    onChange={(e) => setSelectedPanelUserId(e.target.value)}
                  >
                    <option value="">— Bitte wählen —</option>
                    {panelUsers.map((u) => (
                      <option key={u.id} value={u.id} disabled={!u.isActive}>
                        {u.username} ({u.role}){u.isActive ? "" : " · inaktiv"}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </Section>
            <Section title="Neues Passwort setzen">
              <div className="admin-cws-field-grid">
                <Field label="Neues Passwort (min. 10 Zeichen)">
                  <input
                    className="admin-input"
                    type="password"
                    autoComplete="new-password"
                    value={passwordNew}
                    onChange={(e) => setPasswordNew(e.target.value)}
                  />
                </Field>
                <Field label="Passwort bestätigen">
                  <input
                    className="admin-input"
                    type="password"
                    autoComplete="new-password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                  />
                </Field>
              </div>
              {passwordMessage ? <p className="admin-cws-banner">{passwordMessage}</p> : null}
              <div className="admin-cws-actions-inline">
                <button type="button" className="admin-btn-outline" disabled={passwordBusy || !selectedPanelUserId} onClick={() => void onSubmitPanelPassword()}>
                  {passwordBusy ? "Speichert …" : "Passwort setzen"}
                </button>
              </div>
            </Section>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
