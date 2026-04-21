import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import CompanyWorkspaceForm from "../components/CompanyWorkspaceForm.jsx";
import { PanelModuleIcon } from "../components/PanelModuleIcons.jsx";
import { API_BASE } from "../lib/apiBase.js";
import { adminApiHeaders } from "../lib/adminApiHeaders.js";

const COMPANIES_URL = `${API_BASE}/admin/companies`;
const REG_REQUESTS_URL = `${API_BASE}/admin/company-registration-requests`;
const AZ_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const REG_STATUS_TABS = [
  { value: "pending_queue", label: "Zu erledigen" },
  { value: "all", label: "Alle" },
  { value: "open", label: "Offen" },
  { value: "in_review", label: "In Bearbeitung" },
  { value: "documents_required", label: "Warten auf Unterlagen" },
  { value: "approved", label: "Freigegeben" },
  { value: "rejected", label: "Abgelehnt" },
  { value: "blocked", label: "Gesperrt" },
];

function firstLetterKey(name) {
  const s = (name ?? "").trim();
  if (!s) return "#";
  const c = s.charAt(0);
  if (/[a-zA-ZäöüÄÖÜ]/.test(c)) return c.toLocaleUpperCase("de-DE");
  return "#";
}
const ITEMS_PER_PAGE = 10;
const COMPANY_DASHBOARD_URL = "https://panel.onroda.de/";

function emptyCompanyForm() {
  return {
    company_type: "service_provider",
    company_kind: "general",
    tax_id: "",
    concession_number: "",
    customer_category: "hotel",
    patient_data_required: false,
    name: "",
    legal_form: "",
    owner_name: "",
    contact_name: "",
    email: "",
    phone: "",
    address_line1: "",
    address_line2: "",
    postal_code: "",
    city: "",
    country: "",
    vat_id: "",
    billing_name: "",
    billing_address_line1: "",
    billing_address_line2: "",
    billing_postal_code: "",
    billing_city: "",
    billing_country: "",
    bank_iban: "",
    bank_bic: "",
    business_notes: "",
    is_active: true,
    is_priority_company: false,
    priority_for_live_rides: false,
    priority_for_reservations: false,
    priority_price_threshold: "25",
    priority_timeout_seconds: "90",
    release_radius_km: "10",
  };
}

const COMPANY_KIND_EDIT = new Set([
  "taxi",
  "general",
  "voucher_client",
  "insurer",
  "hotel",
  "corporate",
  "medical",
]);

function formFromItem(item) {
  const ck = item.company_kind && COMPANY_KIND_EDIT.has(item.company_kind) ? item.company_kind : "general";
  return {
    company_type: "service_provider",
    company_kind: ck,
    tax_id: item.tax_id ?? "",
    concession_number: item.concession_number ?? "",
    customer_category: "hotel",
    patient_data_required: false,
    name: item.name ?? "",
    legal_form: item.legal_form ?? "",
    owner_name: item.owner_name ?? "",
    contact_name: item.contact_name ?? "",
    email: item.email ?? "",
    phone: item.phone ?? "",
    address_line1: item.address_line1 ?? "",
    address_line2: item.address_line2 ?? "",
    postal_code: item.postal_code ?? "",
    city: item.city ?? "",
    country: item.country ?? "",
    vat_id: item.vat_id ?? "",
    billing_name: item.billing_name ?? "",
    billing_address_line1: item.billing_address_line1 ?? "",
    billing_address_line2: item.billing_address_line2 ?? "",
    billing_postal_code: item.billing_postal_code ?? "",
    billing_city: item.billing_city ?? "",
    billing_country: item.billing_country ?? "",
    bank_iban: item.bank_iban ?? "",
    bank_bic: item.bank_bic ?? "",
    business_notes: item.business_notes ?? "",
    is_active: !!item.is_active,
    is_priority_company: !!item.is_priority_company,
    priority_for_live_rides: !!item.priority_for_live_rides,
    priority_for_reservations: !!item.priority_for_reservations,
    priority_price_threshold: String(item.priority_price_threshold ?? 25),
    priority_timeout_seconds: String(item.priority_timeout_seconds ?? 90),
    release_radius_km: String(item.release_radius_km ?? 10),
  };
}

export default function CompaniesPage({ initialOpenCompanyId, onInitialOpenCompanyConsumed }) {
  const companyIntentHandled = useRef(null);
  const [mainTab, setMainTab] = useState("companies");
  const [items, setItems] = useState([]);
  const [moduleCatalog, setModuleCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [savingModulesId, setSavingModulesId] = useState(null);
  const [editingModulesFor, setEditingModulesFor] = useState(null);
  const [moduleDraft, setModuleDraft] = useState([]);
  const [error, setError] = useState("");
  const [kpisByCompany, setKpisByCompany] = useState({});
  const [loadingKpis, setLoadingKpis] = useState({});

  const [search, setSearch] = useState("");
  const [listFilter, setListFilter] = useState("all");
  const [letterFilter, setLetterFilter] = useState(null);
  const [page, setPage] = useState(1);
  const [expandedCompanyId, setExpandedCompanyId] = useState(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState(null);
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);
  const [formModalSaving, setFormModalSaving] = useState(false);
  const [formModalError, setFormModalError] = useState("");
  const [workspaceModuleDraft, setWorkspaceModuleDraft] = useState([]);
  const [panelUsersList, setPanelUsersList] = useState([]);
  const [panelUsersLoading, setPanelUsersLoading] = useState(false);
  const [selectedPanelUserId, setSelectedPanelUserId] = useState("");
  const [passwordNew, setPasswordNew] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [regStatusFilter, setRegStatusFilter] = useState("pending_queue");
  const [registrationRequests, setRegistrationRequests] = useState([]);
  const [registrationLoading, setRegistrationLoading] = useState(false);
  const [registrationError, setRegistrationError] = useState("");
  const [registrationDetail, setRegistrationDetail] = useState(null);
  const [registrationDetailLoading, setRegistrationDetailLoading] = useState(false);
  const [registrationActionBusy, setRegistrationActionBusy] = useState(false);
  const [ownerOnboardingResult, setOwnerOnboardingResult] = useState(null);

  useEffect(() => {
    loadCompanies();
  }, []);

  useEffect(() => {
    if (!showCreateModal && !showEditModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showCreateModal, showEditModal]);

  useEffect(() => {
    if (!showEditModal || !editingCompanyId) {
      setPanelUsersList([]);
      return;
    }
    setPanelUsersList([]);
    setSelectedPanelUserId("");
    let cancelled = false;
    setPanelUsersLoading(true);
    void (async () => {
      try {
        const res = await fetch(`${COMPANIES_URL}/${encodeURIComponent(editingCompanyId)}/panel-users`, {
          headers: adminApiHeaders(),
        });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && data?.ok && Array.isArray(data.users)) {
          setPanelUsersList(data.users);
          const firstActive = data.users.find((u) => u.isActive);
          setSelectedPanelUserId(firstActive?.id ?? "");
        } else {
          setPanelUsersList([]);
        }
      } catch {
        if (!cancelled) setPanelUsersList([]);
      } finally {
        if (!cancelled) setPanelUsersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showEditModal, editingCompanyId]);

  useEffect(() => {
    if (!showCreateModal) return;
    if (moduleCatalog.length === 0) return;
    setWorkspaceModuleDraft((prev) => (prev.length > 0 ? prev : moduleCatalog.map((m) => m.id)));
  }, [showCreateModal, moduleCatalog]);

  useEffect(() => {
    if (mainTab !== "requests") return;
    void loadRegistrationRequests(regStatusFilter);
  }, [mainTab, regStatusFilter]);

  useEffect(() => {
    if (!initialOpenCompanyId) {
      companyIntentHandled.current = null;
      return;
    }
    if (loading) return;
    if (companyIntentHandled.current === initialOpenCompanyId) return;
    const item = items.find((i) => i.id === initialOpenCompanyId);
    if (!item) {
      onInitialOpenCompanyConsumed?.();
      return;
    }
    companyIntentHandled.current = initialOpenCompanyId;
    openEditCompany(item);
    onInitialOpenCompanyConsumed?.();
  }, [initialOpenCompanyId, loading, items]);

  async function loadCompanies() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(COMPANIES_URL, { headers: adminApiHeaders() });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      if (!data?.ok || !Array.isArray(data.items)) {
        throw new Error("Ungültige Antwort");
      }

      setItems(data.items);
      if (Array.isArray(data.panelModuleCatalog)) {
        setModuleCatalog(data.panelModuleCatalog);
      }
    } catch {
      setError("Unternehmen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  async function loadRegistrationRequests(status = "all") {
    setRegistrationLoading(true);
    setRegistrationError("");
    try {
      const qs =
        status === "pending_queue"
          ? "?pending=1"
          : status && status !== "all"
            ? `?status=${encodeURIComponent(status)}`
            : "";
      const res = await fetch(`${REG_REQUESTS_URL}${qs}`, { headers: adminApiHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => null);
      if (!data?.ok || !Array.isArray(data.items)) throw new Error("Ungültige Antwort");
      setRegistrationRequests(data.items);
    } catch {
      setRegistrationError("Unternehmensanfragen konnten nicht geladen werden.");
    } finally {
      setRegistrationLoading(false);
    }
  }

  async function patchRegistrationRequest(id, patch) {
    const reloadDetailAfter =
      registrationDetail && (registrationDetail.request?.id === id || registrationDetail.id === id);
    setRegistrationActionBusy(true);
    setRegistrationError("");
    try {
      const res = await fetch(`${REG_REQUESTS_URL}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setRegistrationError(data?.hint || data?.error || `HTTP ${res.status}`);
        return null;
      }
      if (!data.item) {
        setRegistrationError(data?.hint || data?.error || "Ungültige Antwort");
        return null;
      }
      setRegistrationRequests((prev) => prev.map((r) => (r.id === id ? data.item : r)));
      if (reloadDetailAfter) {
        await loadRegistrationDetail(id);
      } else {
        setRegistrationDetail((prev) => {
          if (!prev) return prev;
          const prevId = prev.request?.id ?? prev.id;
          if (prevId !== id) return prev;
          if (prev.request && typeof prev.request === "object") {
            return { ...prev, request: { ...prev.request, ...data.item } };
          }
          return { request: data.item, documents: [], timeline: [] };
        });
      }
      return data.item;
    } catch (e) {
      console.error(e);
      setRegistrationError("Anfrage konnte nicht aktualisiert werden.");
      return null;
    } finally {
      setRegistrationActionBusy(false);
    }
  }

  async function approveRegistrationRequest(id) {
    setRegistrationActionBusy(true);
    setRegistrationError("");
    try {
      const res = await fetch(`${REG_REQUESTS_URL}/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ createOwnerUser: true }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        const msg = data?.hint || data?.error || `HTTP ${res.status}`;
        setRegistrationError(msg);
        if (typeof window !== "undefined") window.alert(msg);
        return;
      }
      if (data.request) {
        setRegistrationRequests((prev) => prev.map((r) => (r.id === id ? data.request : r)));
        const hadDetailOpen =
          registrationDetail &&
          (registrationDetail.request?.id === id || registrationDetail.id === id);
        if (hadDetailOpen) {
          await loadRegistrationDetail(id);
        }
      }
      if (data.company) {
        setItems((prev) => [data.company, ...prev]);
      }
      if (data.ownerOnboarding?.initialPassword) {
        setOwnerOnboardingResult({
          ...data.ownerOnboarding,
          companyId: data.company?.id ?? "",
          requestId: id,
        });
      } else if (data.ownerProvisioningWarning) {
        window.alert(data.ownerProvisioningWarning);
      }
    } catch (e) {
      console.error(e);
      setRegistrationError("Freigabe fehlgeschlagen.");
    } finally {
      setRegistrationActionBusy(false);
    }
  }

  async function rejectRegistrationRequest(id) {
    if (typeof window === "undefined") return;
    const note = window.prompt(
      "Ablehnen: optionaler interner Vermerk (wird an der Anfrage gespeichert). „Abbrechen“ = keine Änderung.",
    );
    if (note === null) return;
    await patchRegistrationRequest(id, {
      status: "rejected",
      ...(note.trim() ? { adminNote: note.trim() } : {}),
    });
  }

  async function requestFollowUpOnRegistration(id) {
    if (typeof window === "undefined") return;
    const note = window.prompt(
      "Rückfrage: Welche Unterlagen oder Angaben fehlen? (Kurz beschreiben; „Abbrechen“ = keine Änderung.)",
    );
    if (note === null) return;
    const trimmed = note.trim();
    if (!trimmed) {
      window.alert("Bitte einen kurzen Text eingeben oder Abbrechen wählen.");
      return;
    }
    await patchRegistrationRequest(id, {
      status: "documents_required",
      complianceStatus: "missing_documents",
      missingDocumentsNote: trimmed,
    });
  }

  async function loadRegistrationDetail(id) {
    setRegistrationDetailLoading(true);
    setRegistrationError("");
    try {
      const res = await fetch(`${REG_REQUESTS_URL}/${encodeURIComponent(id)}`, {
        headers: adminApiHeaders(),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data.request) throw new Error(data?.error || `HTTP ${res.status}`);
      setRegistrationDetail(data);
    } catch (e) {
      console.error(e);
      setRegistrationError("Anfragedetail konnte nicht geladen werden.");
    } finally {
      setRegistrationDetailLoading(false);
    }
  }

  async function sendAdminMessageToRequest(id, message) {
    setRegistrationActionBusy(true);
    setRegistrationError("");
    try {
      const res = await fetch(`${REG_REQUESTS_URL}/${encodeURIComponent(id)}/messages`, {
        method: "POST",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ message }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await loadRegistrationDetail(id);
      return true;
    } catch (e) {
      console.error(e);
      setRegistrationError("Admin-Nachricht konnte nicht gesendet werden.");
      return false;
    } finally {
      setRegistrationActionBusy(false);
    }
  }

  function openCreateCompany() {
    setCompanyForm(emptyCompanyForm());
    setFormModalError("");
    setWorkspaceModuleDraft(moduleCatalog.map((m) => m.id));
    setShowCreateModal(true);
  }

  function openEditCompany(item) {
    setEditingCompanyId(item.id);
    setCompanyForm(formFromItem(item));
    setFormModalError("");
    setWorkspaceModuleDraft(
      item.panel_modules == null ? moduleCatalog.map((c) => c.id) : [...item.panel_modules],
    );
    setPasswordNew("");
    setPasswordConfirm("");
    setPasswordMessage("");
    setShowEditModal(true);
  }

  function closeCompanyModals() {
    setShowCreateModal(false);
    setShowEditModal(false);
    setEditingCompanyId(null);
    setFormModalError("");
    setWorkspaceModuleDraft([]);
    setPanelUsersList([]);
    setPanelUsersLoading(false);
    setSelectedPanelUserId("");
    setPasswordNew("");
    setPasswordConfirm("");
    setPasswordMessage("");
  }

  function toggleWorkspaceModule(modId, checked) {
    setWorkspaceModuleDraft((prev) => {
      const set = new Set(prev);
      if (checked) set.add(modId);
      else set.delete(modId);
      return [...set];
    });
  }

  async function submitPanelPassword() {
    if (!editingCompanyId || !selectedPanelUserId) {
      setPasswordMessage("Bitte einen Panel-Benutzer wählen.");
      return;
    }
    if (passwordNew.length < 10) {
      setPasswordMessage("Neues Passwort: mindestens 10 Zeichen.");
      return;
    }
    if (passwordNew !== passwordConfirm) {
      setPasswordMessage("Passwörter stimmen nicht überein.");
      return;
    }
    setPasswordBusy(true);
    setPasswordMessage("");
    try {
      const res = await fetch(
        `${COMPANIES_URL}/${encodeURIComponent(editingCompanyId)}/panel-users/${encodeURIComponent(selectedPanelUserId)}/reset-password`,
        {
          method: "POST",
          headers: adminApiHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ newPassword: passwordNew }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || data?.hint || `HTTP ${res.status}`);
      }
      setPasswordMessage("Passwort wurde gesetzt.");
      setPasswordNew("");
      setPasswordConfirm("");
    } catch (e) {
      setPasswordMessage(e?.message || "Passwort konnte nicht gesetzt werden.");
    } finally {
      setPasswordBusy(false);
    }
  }

  function buildCompanyPayload() {
    const pt = Number(companyForm.priority_price_threshold);
    const ts = Number(companyForm.priority_timeout_seconds);
    const rk = Number(companyForm.release_radius_km);
    const ck =
      companyForm.company_kind && COMPANY_KIND_EDIT.has(companyForm.company_kind)
        ? companyForm.company_kind
        : "general";
    return {
      name: companyForm.name.trim(),
      legal_form: companyForm.legal_form.trim(),
      owner_name: companyForm.owner_name.trim(),
      contact_name: companyForm.contact_name.trim(),
      email: companyForm.email.trim(),
      phone: companyForm.phone.trim(),
      address_line1: companyForm.address_line1.trim(),
      address_line2: companyForm.address_line2.trim(),
      postal_code: companyForm.postal_code.trim(),
      city: companyForm.city.trim(),
      country: companyForm.country.trim(),
      vat_id: companyForm.vat_id.trim(),
      company_kind: ck,
      tax_id: companyForm.tax_id.trim(),
      concession_number: companyForm.concession_number.trim(),
      billing_name: companyForm.billing_name.trim(),
      billing_address_line1: companyForm.billing_address_line1.trim(),
      billing_address_line2: companyForm.billing_address_line2.trim(),
      billing_postal_code: companyForm.billing_postal_code.trim(),
      billing_city: companyForm.billing_city.trim(),
      billing_country: companyForm.billing_country.trim(),
      bank_iban: companyForm.bank_iban.trim(),
      bank_bic: companyForm.bank_bic.trim(),
      business_notes: companyForm.business_notes.trim(),
      is_active: companyForm.is_active,
      is_priority_company: companyForm.is_priority_company,
      priority_for_live_rides: companyForm.priority_for_live_rides,
      priority_for_reservations: companyForm.priority_for_reservations,
      priority_price_threshold: Number.isFinite(pt) ? pt : 0,
      priority_timeout_seconds: Number.isFinite(ts) ? Math.floor(ts) : 90,
      release_radius_km: Number.isFinite(rk) ? rk : 10,
    };
  }

  async function saveCreateCompany(e) {
    e.preventDefault();
    if (!companyForm.name.trim()) {
      setFormModalError("Name ist Pflicht.");
      return;
    }
    setFormModalSaving(true);
    setFormModalError("");
    try {
      const res = await fetch(COMPANIES_URL, {
        method: "POST",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(buildCompanyPayload()),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data.item) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const created = data.item;
      const moduleSet = new Set(moduleCatalog.map((m) => m.id));
      const allIds = moduleCatalog.map((c) => c.id);
      let finalRow = created;
      if (workspaceModuleDraft.length > 0 && allIds.length > 0) {
        const normalized = [...new Set(workspaceModuleDraft.filter((id) => moduleSet.has(id)))];
        if (normalized.length > 0) {
          const body =
            normalized.length >= allIds.length ? { panel_modules: null } : { panel_modules: normalized };
          const modRes = await fetch(`${COMPANIES_URL}/${encodeURIComponent(created.id)}/panel-modules`, {
            method: "PATCH",
            headers: adminApiHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(body),
          }).catch(() => null);
          const modData = await modRes?.json().catch(() => null);
          if (modRes?.ok && modData?.ok && modData.item) {
            finalRow = modData.item;
          }
        }
      }
      setItems((prev) => [finalRow, ...prev]);
      closeCompanyModals();
    } catch (err) {
      console.error(err);
      setFormModalError(err.message || "Anlegen fehlgeschlagen.");
    } finally {
      setFormModalSaving(false);
    }
  }

  async function saveEditCompany(e) {
    e.preventDefault();
    if (!editingCompanyId) return;
    if (!companyForm.name.trim()) {
      setFormModalError("Name ist Pflicht.");
      return;
    }
    setFormModalSaving(true);
    setFormModalError("");
    try {
      const res = await fetch(`${COMPANIES_URL}/${encodeURIComponent(editingCompanyId)}`, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(buildCompanyPayload()),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data.item) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      let merged = data.item;
      const allIds = moduleCatalog.map((c) => c.id);
      if (allIds.length > 0) {
        if (workspaceModuleDraft.length === 0) {
          throw new Error("Mindestens ein Panel-Modul muss aktiv bleiben.");
        }
        const modBody =
          workspaceModuleDraft.length >= allIds.length ? { panel_modules: null } : { panel_modules: workspaceModuleDraft };
        const modRes = await fetch(`${COMPANIES_URL}/${encodeURIComponent(editingCompanyId)}/panel-modules`, {
          method: "PATCH",
          headers: adminApiHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(modBody),
        });
        const modData = await modRes.json().catch(() => null);
        if (!modRes.ok || !modData?.ok || !modData.item) {
          throw new Error(modData?.error || `Module: HTTP ${modRes.status}`);
        }
        merged = modData.item;
      }
      setItems((prev) => prev.map((row) => (row.id === editingCompanyId ? merged : row)));
      closeCompanyModals();
    } catch (err) {
      console.error(err);
      setFormModalError(err.message || "Speichern fehlgeschlagen.");
    } finally {
      setFormModalSaving(false);
    }
  }

  async function toggleCompanyActive(item) {
    if (item.is_active) {
      const ok = window.confirm(
        "Unternehmen deaktivieren? Aktive Panel-Logins für diese Firma werden beim nächsten /me-Check abgewiesen.",
      );
      if (!ok) return;
    }
    setSavingId(item.id);
    setError("");
    try {
      const res = await fetch(`${COMPANIES_URL}/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ is_active: !item.is_active }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data.item) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setItems((prev) => prev.map((row) => (row.id === item.id ? data.item : row)));
    } catch (err) {
      console.error(err);
      setError("Status konnte nicht geändert werden.");
    } finally {
      setSavingId(null);
    }
  }

  function startEditModules(item) {
    setEditingModulesFor(item.id);
    setModuleDraft(
      item.panel_modules == null
        ? moduleCatalog.map((c) => c.id)
        : [...item.panel_modules],
    );
  }

  function toggleModuleDraft(modId, checked) {
    setModuleDraft((prev) => {
      const set = new Set(prev);
      if (checked) set.add(modId);
      else set.delete(modId);
      return [...set];
    });
  }

  async function saveCompanyModules(companyId) {
    const allIds = moduleCatalog.map((c) => c.id);
    if (moduleDraft.length === 0) {
      setError("Mindestens ein Panel-Modul muss aktiv bleiben (oder „Alle“ über Standard).");
      return;
    }
    setSavingModulesId(companyId);
    setError("");
    const body =
      moduleDraft.length >= allIds.length ? { panel_modules: null } : { panel_modules: moduleDraft };
    try {
      const res = await fetch(`${COMPANIES_URL}/${companyId}/panel-modules`, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data?.item) {
        throw new Error(`HTTP ${res.status}`);
      }
      setItems((prev) => prev.map((row) => (row.id === companyId ? data.item : row)));
      setEditingModulesFor(null);
    } catch (err) {
      console.error("panel-modules update:", err);
      setError("Panel-Module konnten nicht gespeichert werden.");
    } finally {
      setSavingModulesId(null);
    }
  }

  async function updateCompanyPriority(companyId, patch) {
    setSavingId(companyId);
    setError("");

    try {
      const res = await fetch(`${COMPANIES_URL}/${companyId}/priority`, {
        method: "PATCH",
        headers: adminApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      if (!data?.ok || !data?.item) {
        throw new Error("Ungültige Antwort");
      }

      setItems((prev) =>
        prev.map((item) => (item.id === companyId ? data.item : item))
      );
    } catch {
      setError("Die Prioritätseinstellungen konnten nicht gespeichert werden.");
    } finally {
      setSavingId(null);
    }
  }

  function formatMoneyEUR(n) {
    const value = Number(n ?? 0);
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
      Number.isFinite(value) ? value : 0,
    );
  }

  function voucherLimitLabel(v) {
    if (v == null) return "—";
    if (!Number.isFinite(v)) return "—";
    return v === 0 ? "0" : String(v);
  }

  function openCompanyDashboard(item) {
    const target = `${COMPANY_DASHBOARD_URL}?company=${encodeURIComponent(item.id)}`;
    window.open(target, "_blank", "noopener,noreferrer");
  }

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();

    return items.filter((item) => {
      let matchesList = true;
      if (listFilter === "active") matchesList = !!item.is_active;
      else if (listFilter === "inactive") matchesList = !item.is_active;
      else if (listFilter === "priority") matchesList = !!item.is_priority_company;

      if (letterFilter != null) {
        if (firstLetterKey(item.name) !== letterFilter) return false;
      }

      const haystack = [
        item.id,
        item.name,
        item.contact_name,
        item.email,
        item.phone,
        item.city,
        item.postal_code,
        item.country,
        item.priority_price_threshold,
        item.priority_timeout_seconds,
        item.release_radius_km,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = q ? haystack.includes(q) : true;

      return matchesList && matchesSearch;
    });
  }, [items, search, listFilter, letterFilter]);

  const sortedFilteredItems = useMemo(
    () =>
      [...filteredItems].sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", "de", { sensitivity: "base" }),
      ),
    [filteredItems],
  );

  const totalPages = Math.max(1, Math.ceil(sortedFilteredItems.length / ITEMS_PER_PAGE));

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return sortedFilteredItems.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedFilteredItems, page]);

  useEffect(() => {
    setPage(1);
  }, [search, listFilter, letterFilter]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (paginatedItems.length === 0) return;
    const ids = paginatedItems.map((x) => x.id).filter((id) => !kpisByCompany[id] && !loadingKpis[id]);
    if (ids.length === 0) return;
    ids.forEach((id) => {
      setLoadingKpis((prev) => ({ ...prev, [id]: true }));
      void (async () => {
        try {
          const res = await fetch(`${COMPANIES_URL}/${encodeURIComponent(id)}/kpis`, { headers: adminApiHeaders() });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data?.ok && data?.kpis) {
            setKpisByCompany((prev) => ({ ...prev, [id]: data.kpis }));
          }
        } finally {
          setLoadingKpis((prev) => ({ ...prev, [id]: false }));
        }
      })();
    });
  }, [paginatedItems, kpisByCompany, loadingKpis]);

  const stats = useMemo(() => {
    return {
      total: items.length,
      active: items.filter((i) => i.is_active).length,
      inactive: items.filter((i) => !i.is_active).length,
      priority: items.filter((i) => i.is_priority_company).length,
    };
  }, [items]);

  const companyListFilterOptions = useMemo(() => {
    const rest = [
      { value: "active", label: "Nur aktive" },
      { value: "inactive", label: "Nur deaktivierte" },
      { value: "priority", label: "Hohe Priorität" },
    ].sort((a, b) => a.label.localeCompare(b.label, "de", { sensitivity: "base" }));
    return [{ value: "all", label: "Alle Unternehmen" }, ...rest];
  }, []);

  const moduleCatalogAz = useMemo(
    () =>
      [...moduleCatalog].sort((a, b) =>
        (a.label || "").localeCompare(b.label || "", "de", { sensitivity: "base" }),
      ),
    [moduleCatalog],
  );

  function renderPagination() {
    const buttons = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);

    if (page > 1) {
      buttons.push(
        <button
          key="prev"
          type="button"
          className="admin-page-btn"
          onClick={() => setPage(page - 1)}
        >
          Zurück
        </button>
      );
    }

    if (start > 1) {
      buttons.push(
        <button key={1} type="button" className="admin-page-btn" onClick={() => setPage(1)}>
          1
        </button>
      );
      if (start > 2) {
        buttons.push(
          <span key="startDots" className="admin-page-dots">
            ...
          </span>
        );
      }
    }

    for (let i = start; i <= end; i += 1) {
      buttons.push(
        <button
          key={i}
          type="button"
          className={
            i === page ? "admin-page-btn admin-page-btn--active" : "admin-page-btn"
          }
          onClick={() => setPage(i)}
        >
          {i}
        </button>
      );
    }

    if (end < totalPages) {
      if (end < totalPages - 1) {
        buttons.push(
          <span key="endDots" className="admin-page-dots">
            ...
          </span>
        );
      }
      buttons.push(
        <button
          key={totalPages}
          type="button"
          className="admin-page-btn"
          onClick={() => setPage(totalPages)}
        >
          {totalPages}
        </button>
      );
    }

    if (page < totalPages) {
      buttons.push(
        <button
          key="next"
          type="button"
          className="admin-page-btn"
          onClick={() => setPage(page + 1)}
        >
          Weiter
        </button>
      );
    }

    return buttons;
  }

  if (loading) {
    return <div className="admin-info-banner">Unternehmen werden geladen …</div>;
  }

  return (
    <div className="admin-page">
      <div className="admin-toolbar-row">
        <button
          type="button"
          className={`admin-page-btn ${mainTab === "companies" ? "admin-page-btn--active" : ""}`}
          onClick={() => setMainTab("companies")}
        >
          Unternehmen
        </button>
        <button
          type="button"
          className={`admin-page-btn ${mainTab === "requests" ? "admin-page-btn--active" : ""}`}
          onClick={() => setMainTab("requests")}
        >
          Unternehmensanfragen
        </button>
      </div>

      {mainTab === "companies" ? (
        <>
      <div className="admin-stat-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-label">Gesamt</div>
          <div className="admin-stat-value admin-crisp-numeric">{stats.total}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Aktiv</div>
          <div className="admin-stat-value admin-crisp-numeric">{stats.active}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Inaktiv</div>
          <div className="admin-stat-value admin-crisp-numeric">{stats.inactive}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Mit Priorität</div>
          <div className="admin-stat-value admin-crisp-numeric">{stats.priority}</div>
        </div>
      </div>

      <div className="admin-companies-sticky-head">
        <div className="admin-filter-card admin-filter-card--flush">
          <div className="admin-filter-grid admin-filter-grid--companies">
            <div className="admin-filter-item">
              <label className="admin-field-label">Suche</label>
              <input
                type="search"
                className="admin-input"
                placeholder="Firmenname, Kennung, E-Mail …"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="admin-filter-item">
              <label className="admin-field-label">Ansicht</label>
              <select
                className="admin-select"
                value={listFilter}
                onChange={(e) => setListFilter(e.target.value)}
              >
                {companyListFilterOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-filter-item">
              <label className="admin-field-label">&nbsp;</label>
              <div className="admin-filter-actions">
                <button type="button" className="admin-btn-refresh" onClick={openCreateCompany}>
                  + Neues Unternehmen
                </button>
                <button type="button" className="admin-page-btn" onClick={loadCompanies}>
                  Neu laden
                </button>
              </div>
            </div>
          </div>
          <div className="admin-az-bar" role="toolbar" aria-label="Schnellwahl A–Z">
            <button
              type="button"
              className={`admin-az-btn${letterFilter === null ? " admin-az-btn--active" : ""}`}
              onClick={() => setLetterFilter(null)}
            >
              Alle
            </button>
            {AZ_LETTERS.map((L) => (
              <button
                key={L}
                type="button"
                className={`admin-az-btn${letterFilter === L ? " admin-az-btn--active" : ""}`}
                onClick={() => setLetterFilter((prev) => (prev === L ? null : L))}
              >
                {L}
              </button>
            ))}
            <button
              type="button"
              className={`admin-az-btn${letterFilter === "#" ? " admin-az-btn--active" : ""}`}
              onClick={() => setLetterFilter((prev) => (prev === "#" ? null : "#"))}
              title="Sonstige Anfangsbuchstaben"
            >
              #
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="admin-error-banner">{error}</div> : null}

      <div className="admin-table-toolbar">
        <div className="admin-table-toolbar__info">
          Zeige {(page - 1) * ITEMS_PER_PAGE + 1}
          {" - "}
          {Math.min(page * ITEMS_PER_PAGE, sortedFilteredItems.length)}
          {" von "}
          {sortedFilteredItems.length}
        </div>

        <div className="admin-pagination">{renderPagination()}</div>
      </div>

      <div className="admin-companies-table-wrap">
        {paginatedItems.length === 0 ? (
          <div className="admin-info-banner">Keine Unternehmen gefunden.</div>
        ) : (
          <table className="admin-companies-table">
            <caption className="admin-companies-table__caption">
              Mandanten — tabellarische Übersicht; Details für Priorität und Partner-Module ausklappbar.
            </caption>
            <thead>
              <tr>
                <th scope="col">Unternehmen</th>
                <th scope="col">Status</th>
                <th scope="col" className="admin-companies-table__num">
                  Monat €
                </th>
                <th scope="col" className="admin-companies-table__num">
                  Offen
                </th>
                <th scope="col" className="admin-companies-table__num">
                  Limit
                </th>
                <th scope="col">Portal</th>
                <th scope="col" className="admin-companies-table__actions">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => {
                const isSaving = savingId === item.id;
                const open = expandedCompanyId === item.id;
                const portalLabel =
                  item.panel_modules == null
                    ? "Alle"
                    : `${item.panel_modules.length}/${moduleCatalog.length}`;

                return (
                  <Fragment key={item.id}>
                    <tr className={open ? "admin-companies-table__row admin-companies-table__row--open" : "admin-companies-table__row"}>
                      <td>
                        <div className="admin-companies-table__name">{item.name}</div>
                        <div className="admin-companies-table__id" title={item.id}>
                          {item.id}
                        </div>
                        <div className="admin-companies-table__sub">
                          {[item.contact_name, item.email, item.phone].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </td>
                      <td>
                        <div className="admin-companies-table__pills">
                          <span className={`admin-pill${item.is_active ? " admin-pill--success" : " admin-pill--muted"}`}>
                            {item.is_active ? "Aktiv" : "Inaktiv"}
                          </span>
                          <span
                            className={`admin-pill${item.is_priority_company ? " admin-pill--warn" : " admin-pill--muted"}`}
                          >
                            {item.is_priority_company ? "Prio" : "Std"}
                          </span>
                        </div>
                        <div className="admin-companies-table__prio-mini admin-table-sub">
                          Prio {item.is_priority_company ? "ja" : "nein"} · SF {item.priority_for_live_rides ? "ja" : "nein"} · Res{" "}
                          {item.priority_for_reservations ? "ja" : "nein"}
                        </div>
                      </td>
                      <td className="admin-companies-table__num">
                        <span className="admin-crisp-numeric">
                          {loadingKpis[item.id] ? "…" : formatMoneyEUR(kpisByCompany[item.id]?.monthlyRevenue ?? 0)}
                        </span>
                      </td>
                      <td className="admin-companies-table__num">
                        <span className="admin-crisp-numeric">
                          {loadingKpis[item.id] ? "…" : Number(kpisByCompany[item.id]?.openRides ?? 0)}
                        </span>
                      </td>
                      <td className="admin-companies-table__num">
                        <span className="admin-crisp-numeric">
                          {loadingKpis[item.id] ? "…" : voucherLimitLabel(kpisByCompany[item.id]?.voucherLimitAvailable)}
                        </span>
                      </td>
                      <td>
                        <span className="admin-companies-table__portal-label">{portalLabel}</span>
                        <div className="admin-table-sub">Module</div>
                      </td>
                      <td className="admin-companies-table__actions">
                        <div className="admin-companies-table__action-btns">
                          <button
                            type="button"
                            className="admin-btn-outline admin-btn-outline--compact"
                            onClick={() => openCompanyDashboard(item)}
                          >
                            Panel
                          </button>
                          <button type="button" className="admin-btn-outline admin-btn-outline--compact" onClick={() => openEditCompany(item)}>
                            Stammdaten
                          </button>
                          <button
                            type="button"
                            className="admin-btn-outline admin-btn-outline--compact"
                            onClick={() => openCompanyReceiptPdf(item)}
                          >
                            PDF / Quittung
                          </button>
                          <button
                            type="button"
                            className="admin-btn-outline admin-btn-outline--compact"
                            disabled={isSaving}
                            onClick={() => void toggleCompanyActive(item)}
                          >
                            {item.is_active ? "Aus" : "An"}
                          </button>
                          <button
                            type="button"
                            className={
                              "admin-page-btn admin-page-btn--compact" +
                              (open ? " admin-page-btn--active" : "")
                            }
                            onClick={() => {
                              setExpandedCompanyId((prev) => {
                                if (prev === item.id) {
                                  setEditingModulesFor(null);
                                  return null;
                                }
                                setEditingModulesFor(null);
                                return item.id;
                              });
                            }}
                            aria-expanded={open}
                          >
                            {open ? "Zu" : "Details"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {open ? (
                      <tr className="admin-companies-table__detail">
                        <td colSpan={7}>
                          <div className="admin-companies-expand">
                            <div className="admin-company-prio-toggles admin-company-prio-toggles--table">
                              <div className="admin-company-prio-toggle">
                                <div>
                                  <div className="admin-switch-row__label">Priorität aktiv</div>
                                  <div className="admin-company-toggle-hint">Matching bevorzugt dieses Unternehmen.</div>
                                </div>
                                <label className="admin-switch">
                                  <input
                                    type="checkbox"
                                    checked={!!item.is_priority_company}
                                    disabled={isSaving}
                                    onChange={(e) =>
                                      updateCompanyPriority(item.id, {
                                        is_priority_company: e.target.checked,
                                      })
                                    }
                                  />
                                  <span className="admin-switch__slider" aria-hidden />
                                </label>
                              </div>
                              <div className="admin-company-prio-toggle">
                                <div>
                                  <div className="admin-switch-row__label">Sofortfahrten priorisieren</div>
                                  <div className="admin-company-toggle-hint">Sofortfahrten bevorzugt vermitteln.</div>
                                </div>
                                <label className="admin-switch">
                                  <input
                                    type="checkbox"
                                    checked={!!item.priority_for_live_rides}
                                    disabled={isSaving}
                                    onChange={(e) =>
                                      updateCompanyPriority(item.id, {
                                        priority_for_live_rides: e.target.checked,
                                      })
                                    }
                                  />
                                  <span className="admin-switch__slider" aria-hidden />
                                </label>
                              </div>
                              <div className="admin-company-prio-toggle">
                                <div>
                                  <div className="admin-switch-row__label">Reservierungen priorisieren</div>
                                  <div className="admin-company-toggle-hint">Terminfahrten in der Vorplanung bevorzugen.</div>
                                </div>
                                <label className="admin-switch">
                                  <input
                                    type="checkbox"
                                    checked={!!item.priority_for_reservations}
                                    disabled={isSaving}
                                    onChange={(e) =>
                                      updateCompanyPriority(item.id, {
                                        priority_for_reservations: e.target.checked,
                                      })
                                    }
                                  />
                                  <span className="admin-switch__slider" aria-hidden />
                                </label>
                              </div>
                            </div>

                            <div className="admin-companies-expand__meta">
                              <span>
                                Ab Preis <strong className="admin-crisp-numeric">{item.priority_price_threshold} €</strong>
                              </span>
                              <span>
                                Timeout <strong className="admin-crisp-numeric">{item.priority_timeout_seconds}s</strong>
                              </span>
                              <span>
                                Radius <strong className="admin-crisp-numeric">{item.release_radius_km} km</strong>
                              </span>
                            </div>

                            <p className="admin-cws-inline-info" style={{ marginTop: 10 }}>
                              Stammdaten, Abrechnung und Portal-Module bearbeiten Sie über{" "}
                              <strong>Stammdaten</strong> im Modal — zentral editierbar.
                            </p>

                            {isSaving ? <div className="admin-saving-hint">Speichert …</div> : null}

                            {moduleCatalog.length > 0 ? (
                              <div className="admin-company-portal admin-company-portal--table">
                                <div className="admin-company-portal__title">Partner-Portal (panel.onroda.de)</div>
                                <p className="admin-entity-card__meta admin-company-portal__meta">
                                  Ohne Auswahl sind alle Bereiche aktiv. Änderungen gelten für diesen Mandanten.
                                </p>
                                {editingModulesFor === item.id ? (
                                  <>
                                    <div className="admin-module-grid admin-module-grid--dense">
                                      {moduleCatalogAz.map((mod) => {
                                        const on = moduleDraft.includes(mod.id);
                                        return (
                                          <button
                                            key={mod.id}
                                            type="button"
                                            className={`admin-module-tile${on ? " admin-module-tile--on" : ""}`}
                                            title={mod.description}
                                            disabled={savingModulesId === item.id}
                                            onClick={() => toggleModuleDraft(mod.id, !on)}
                                          >
                                            <span className="admin-module-tile__icon" aria-hidden>
                                              <PanelModuleIcon moduleId={mod.id} />
                                            </span>
                                            <span className="admin-module-tile__text">
                                              <span className="admin-module-tile__label">{mod.label}</span>
                                              <span className="admin-module-tile__desc">{on ? "An" : "Aus"}</span>
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                    <div className="admin-company-module-actions">
                                      <button
                                        type="button"
                                        className="admin-btn-refresh admin-btn-refresh--compact"
                                        disabled={savingModulesId === item.id}
                                        onClick={() => void saveCompanyModules(item.id)}
                                      >
                                        {savingModulesId === item.id ? "Speichert …" : "Module speichern"}
                                      </button>
                                      <button
                                        type="button"
                                        className="admin-page-btn admin-page-btn--compact"
                                        disabled={savingModulesId === item.id}
                                        onClick={() => setEditingModulesFor(null)}
                                      >
                                        Abbrechen
                                      </button>
                                    </div>
                                  </>
                                ) : (
                                  <div>
                                    <div className="admin-module-grid admin-module-grid--readonly admin-module-grid--dense">
                                      {(item.panel_modules == null
                                        ? moduleCatalogAz
                                        : moduleCatalogAz.filter((m) => item.panel_modules.includes(m.id))
                                      ).map((m) => (
                                        <div
                                          key={m.id}
                                          className="admin-module-tile admin-module-tile--on admin-module-tile--static"
                                          title={m.description}
                                        >
                                          <span className="admin-module-tile__icon" aria-hidden>
                                            <PanelModuleIcon moduleId={m.id} />
                                          </span>
                                          <span className="admin-module-tile__text">
                                            <span className="admin-module-tile__label">{m.label}</span>
                                            <span className="admin-module-tile__desc">An</span>
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                    <button
                                      type="button"
                                      className="admin-btn-refresh admin-btn-refresh--compact"
                                      onClick={() => startEditModules(item)}
                                    >
                                      Module bearbeiten
                                    </button>
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="admin-table-toolbar">
        <div className="admin-table-toolbar__info">
          Seite {page} von {totalPages}
        </div>

        <div className="admin-pagination">{renderPagination()}</div>
      </div>
        </>
      ) : (
        <RegistrationRequestsSection
          items={registrationRequests}
          loading={registrationLoading}
          error={registrationError}
          statusFilter={regStatusFilter}
          onStatusFilterChange={setRegStatusFilter}
          detail={registrationDetail}
          detailLoading={registrationDetailLoading}
          onOpenDetail={(r) => {
            setRegistrationDetail({ request: r, documents: [], timeline: [] });
            void loadRegistrationDetail(r.id);
          }}
          onCloseDetail={() => setRegistrationDetail(null)}
          actionBusy={registrationActionBusy}
          onReload={() => loadRegistrationRequests(regStatusFilter)}
          onPatchRequest={patchRegistrationRequest}
          onSetStatus={(id, status) => patchRegistrationRequest(id, { status })}
          onRequestFollowUp={requestFollowUpOnRegistration}
          onApprove={approveRegistrationRequest}
          onReject={rejectRegistrationRequest}
          onInReview={(id) => patchRegistrationRequest(id, { status: "in_review" })}
          onSendAdminMessage={sendAdminMessageToRequest}
        />
      )}

      {showCreateModal ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={closeCompanyModals}>
          <div
            className="admin-modal admin-modal--company-workspace"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-company-create-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal__header">
              <div className="admin-modal__title-wrap">
                <h2 id="admin-company-create-title" className="admin-modal__title">
                  Neues Unternehmen
                </h2>
                <p className="admin-modal__title-meta">Mandant anlegen · Stammdaten, Abrechnung und Portal-Module</p>
              </div>
              <button type="button" className="admin-modal__close" onClick={closeCompanyModals} aria-label="Schließen">
                ×
              </button>
            </div>
            <form onSubmit={saveCreateCompany}>
              <div className="admin-modal__body">
                {formModalError ? <div className="admin-error-banner">{formModalError}</div> : null}
                <CompanyWorkspaceForm
                  form={companyForm}
                  setForm={setCompanyForm}
                  moduleCatalogAz={moduleCatalogAz}
                  moduleCatalog={moduleCatalog}
                  moduleDraft={workspaceModuleDraft}
                  onToggleModule={toggleWorkspaceModule}
                  showPasswordCard={false}
                  panelUsers={[]}
                  panelUsersLoading={false}
                  selectedPanelUserId=""
                  setSelectedPanelUserId={() => {}}
                  passwordNew=""
                  setPasswordNew={() => {}}
                  passwordConfirm=""
                  setPasswordConfirm={() => {}}
                  passwordBusy={false}
                  passwordMessage=""
                  onSubmitPanelPassword={() => {}}
                />
              </div>
              <div className="admin-modal__footer-actions">
                <button type="button" className="admin-page-btn" onClick={closeCompanyModals} disabled={formModalSaving}>
                  Abbrechen
                </button>
                <button type="submit" className="admin-btn-refresh" disabled={formModalSaving}>
                  {formModalSaving ? "Speichert …" : "Anlegen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showEditModal ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={closeCompanyModals}>
          <div
            className="admin-modal admin-modal--company-workspace"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-company-edit-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal__header">
              <div className="admin-modal__title-wrap">
                <h2 id="admin-company-edit-title" className="admin-modal__title">
                  Unternehmensprofil bearbeiten
                </h2>
                <p className="admin-modal__title-meta">{editingCompanyId}</p>
              </div>
              <div className="admin-modal__header-actions">
                <span
                  className={`admin-pill${companyForm.is_active ? " admin-pill--success" : " admin-pill--muted"}`}
                  title="Wird mit „Speichern“ übernommen"
                >
                  {companyForm.is_active ? "Aktiv" : "Inaktiv"}
                </span>
                <button
                  type="button"
                  className="admin-page-btn admin-page-btn--compact"
                  onClick={() => setCompanyForm((f) => ({ ...f, is_active: !f.is_active }))}
                >
                  {companyForm.is_active ? "Deaktivieren" : "Aktivieren"}
                </button>
                <button type="button" className="admin-modal__close" onClick={closeCompanyModals} aria-label="Schließen">
                  ×
                </button>
              </div>
            </div>
            <form onSubmit={saveEditCompany}>
              <div className="admin-modal__body">
                {formModalError ? <div className="admin-error-banner">{formModalError}</div> : null}
                <CompanyWorkspaceForm
                  form={companyForm}
                  setForm={setCompanyForm}
                  moduleCatalogAz={moduleCatalogAz}
                  moduleCatalog={moduleCatalog}
                  moduleDraft={workspaceModuleDraft}
                  onToggleModule={toggleWorkspaceModule}
                  showPasswordCard
                  panelUsers={panelUsersList}
                  panelUsersLoading={panelUsersLoading}
                  selectedPanelUserId={selectedPanelUserId}
                  setSelectedPanelUserId={setSelectedPanelUserId}
                  passwordNew={passwordNew}
                  setPasswordNew={setPasswordNew}
                  passwordConfirm={passwordConfirm}
                  setPasswordConfirm={setPasswordConfirm}
                  passwordBusy={passwordBusy}
                  passwordMessage={passwordMessage}
                  onSubmitPanelPassword={submitPanelPassword}
                />
              </div>
              <div className="admin-modal__footer-actions">
                <button type="button" className="admin-page-btn" onClick={closeCompanyModals} disabled={formModalSaving}>
                  Abbrechen
                </button>
                <button type="submit" className="admin-btn-refresh" disabled={formModalSaving}>
                  {formModalSaving ? "Speichert …" : "Speichern"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {ownerOnboardingResult ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={() => setOwnerOnboardingResult(null)}>
          <div
            className="admin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-owner-onboarding-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal__header">
              <h2 id="admin-owner-onboarding-title" className="admin-modal__title">
                Partner-Portal: Erstzugang (Owner)
              </h2>
              <button
                type="button"
                className="admin-modal__close"
                onClick={() => setOwnerOnboardingResult(null)}
                aria-label="Schließen"
              >
                ×
              </button>
            </div>
            <div className="admin-modal__body">
              <p className="admin-table-sub">
                Einmalpasswort sicher übermitteln (z. B. getrennt vom Benutzernamen). Nach erstem Login muss das Passwort
                geändert werden.
              </p>
              <dl className="admin-detail-grid">
                <div>
                  <dt>Unternehmen</dt>
                  <dd>
                    <code>{ownerOnboardingResult.companyId}</code>
                  </dd>
                </div>
                <div>
                  <dt>Benutzername</dt>
                  <dd>
                    <code>{ownerOnboardingResult.username}</code>
                  </dd>
                </div>
                <div>
                  <dt>E-Mail (Login)</dt>
                  <dd>{ownerOnboardingResult.email}</dd>
                </div>
                <div>
                  <dt>Einmalpasswort</dt>
                  <dd>
                    <code style={{ wordBreak: "break-all" }}>{ownerOnboardingResult.initialPassword}</code>
                  </dd>
                </div>
              </dl>
            </div>
            <div className="admin-modal__footer-actions">
              <button
                type="button"
                className="admin-page-btn"
                onClick={() => {
                  const blob = [
                    `Unternehmen (Mandant): ${ownerOnboardingResult.companyId}`,
                    `Panel: ${COMPANY_DASHBOARD_URL}`,
                    `Benutzername: ${ownerOnboardingResult.username}`,
                    `E-Mail: ${ownerOnboardingResult.email}`,
                    `Einmalpasswort: ${ownerOnboardingResult.initialPassword}`,
                  ].join("\n");
                  void navigator.clipboard?.writeText(blob).catch(() => {});
                }}
              >
                Alles kopieren
              </button>
              <button type="button" className="admin-btn-refresh" onClick={() => setOwnerOnboardingResult(null)}>
                Schließen
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function openCompanyReceiptPdf(item) {
  if (typeof window === "undefined") return;
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) return;
  const rawBase = import.meta.env.BASE_URL || "/";
  const base = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;
  const onrodaLogo = `${base}favicon.svg`;
  const today = new Date();
  const dateLabel = today.toLocaleDateString("de-DE");
  const address = [item.address_line1, item.address_line2].filter(Boolean).join(", ");
  const address2 = [item.postal_code, item.city, item.country].filter(Boolean).join(" ");
  const billingAddress = [item.billing_address_line1, item.billing_address_line2].filter(Boolean).join(", ");
  const billingAddress2 = [item.billing_postal_code, item.billing_city, item.billing_country].filter(Boolean).join(" ");

  const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Stammdaten ${item.name || ""}</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color: #111827; }
    .hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .hdr-left { max-width: 70%; }
    .hdr-title { font-size: 20px; font-weight: 700; margin: 0 0 4px; }
    .hdr-sub { font-size: 12px; color: #6b7280; margin: 0; }
    .hdr-logo { display: flex; align-items: center; gap: 8px; }
    .hdr-logo-onroda { font-weight: 700; letter-spacing: 0.08em; font-size: 14px; }
    .section-title { font-size: 14px; font-weight: 600; margin-top: 20px; margin-bottom: 6px; }
    .table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .table th, .table td { text-align: left; padding: 4px 6px; vertical-align: top; }
    .table th { width: 28%; color: #6b7280; font-weight: 500; }
    .muted { color: #6b7280; font-size: 11px; }
    .small { font-size: 11px; margin-top: 16px; color: #6b7280; }
    @media print {
      body { margin: 12mm; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="hdr">
    <div class="hdr-left">
      <h1 class="hdr-title">Unternehmens-Stammdaten / Quittung</h1>
      <p class="hdr-sub">Mandant im Onroda-System · Stand: ${dateLabel}</p>
    </div>
    <div class="hdr-logo">
      <img src="${onrodaLogo}" alt="Onroda" width="32" height="30" />
      <div>
        <div class="hdr-logo-onroda">ONRODA</div>
        <div class="muted">Plattform</div>
      </div>
    </div>
  </div>

  <h2 class="section-title">Stammdaten</h2>
  <table class="table">
    <tr><th>Firma</th><td>${item.name || "—"}</td></tr>
    <tr><th>Rechtsform</th><td>${item.legal_form || "—"}</td></tr>
    <tr><th>Inhaber</th><td>${item.owner_name || "—"}</td></tr>
    <tr><th>Offizielle Anschrift</th><td>${address || "—"}<br /><span class="muted">${address2}</span></td></tr>
    <tr><th>Kontakt</th><td>${[item.email, item.phone].filter(Boolean).join(" · ") || "—"}</td></tr>
    <tr><th>Steuer-ID</th><td>${item.tax_id || "—"}</td></tr>
    <tr><th>USt-IdNr.</th><td>${item.vat_id || "—"}</td></tr>
    <tr><th>Konzession / Genehmigung</th><td>${item.concession_number || "—"}</td></tr>
  </table>

  <h2 class="section-title">Rechnung &amp; Bank</h2>
  <table class="table">
    <tr><th>Rechnungsempfänger</th><td>${item.billing_name || "—"}</td></tr>
    <tr><th>Rechnungsadresse</th><td>${billingAddress || "—"}<br /><span class="muted">${billingAddress2}</span></td></tr>
    <tr><th>Bankverbindung</th><td>IBAN ${item.bank_iban || "—"}<br /><span class="muted">BIC ${item.bank_bic || "—"}</span></td></tr>
  </table>

  <p class="small">
    Hinweis: Diese Übersicht dient als Nachweis der im Onroda-System hinterlegten Stammdaten für dieses Unternehmen.
    Änderungen erfolgen ausschließlich über die Plattform-Administration.
  </p>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
  try {
    win.focus();
    win.print();
  } catch {
    // ignore
  }
}

function regStatusLabel(s) {
  switch (s) {
    case "open":
      return "Offen";
    case "in_review":
      return "In Bearbeitung";
    case "documents_required":
      return "Unterlagen fehlen";
    case "approved":
      return "Freigegeben";
    case "rejected":
      return "Abgelehnt";
    case "blocked":
      return "Gesperrt";
    default:
      return s ?? "—";
  }
}

const REG_PARTNER_TYPES = [
  ["taxi", "Taxi"],
  ["hotel", "Hotel"],
  ["insurance", "Krankenkasse / Versicherer"],
  ["medical", "Medical / Krankenfahrt"],
  ["care", "Pflege & Leistungspartner"],
  ["business", "Unternehmen"],
  ["voucher_partner", "Gutscheinpartner"],
  ["other", "Sonstiges"],
];

function partnerTypeSelectLabel(value) {
  const row = REG_PARTNER_TYPES.find((x) => x[0] === value);
  return row ? row[1] : value ?? "—";
}

function companyKindAtApproveHint(partnerType) {
  switch (partnerType) {
    case "taxi":
      return "Nach Freigabe: Mandanten-Typ Taxi / Flotte — Taximeter- und Konzessionslogik wie klassische Betriebe.";
    case "hotel":
      return "Nach Freigabe: Mandanten-Typ Hotel — Hotel-/Zimmerbuchungskontext im Partner-Panel.";
    case "insurance":
      return "Nach Freigabe: Mandanten-Typ Krankenkasse / Versicherer (insurer) — getrennt von Medical.";
    case "medical":
    case "care":
      return "Nach Freigabe: Mandanten-Typ Medical (medical) — Krankenfahrt / Leistungspartner, nicht Krankenkasse.";
    case "business":
      return "Nach Freigabe: Mandanten-Typ Firmenkunde (corporate).";
    case "voucher_partner":
      return "Nach Freigabe: Mandanten-Typ Gutscheinkunde (voucher_client).";
    default:
      return "Nach Freigabe: Mandanten-Typ allgemein (general), sofern nicht manuell im Unternehmensprofil geändert.";
  }
}

function PartnerTypeBadge({ partnerType }) {
  const key = partnerType && String(partnerType).trim() ? String(partnerType).trim() : "other";
  return (
    <span className={`admin-reg-type-badge admin-reg-type-badge--${key}`} title={key}>
      {partnerTypeSelectLabel(key)}
    </span>
  );
}

function registrationDraftFromRequest(request) {
  if (!request) return null;
  let usageText = "{}";
  try {
    usageText = JSON.stringify(request.requestedUsage ?? {}, null, 2);
  } catch {
    usageText = "{}";
  }
  return {
    partnerType: request.partnerType ?? "other",
    companyName: request.companyName ?? "",
    legalForm: request.legalForm ?? "",
    usesVouchers: !!request.usesVouchers,
    contactFirstName: request.contactFirstName ?? "",
    contactLastName: request.contactLastName ?? "",
    email: request.email ?? "",
    phone: request.phone ?? "",
    addressLine1: request.addressLine1 ?? "",
    addressLine2: request.addressLine2 ?? "",
    ownerName: request.ownerName ?? "",
    dispoPhone: request.dispoPhone ?? "",
    postalCode: request.postalCode ?? "",
    city: request.city ?? "",
    country: request.country ?? "",
    taxId: request.taxId ?? "",
    vatId: request.vatId ?? "",
    concessionNumber: request.concessionNumber ?? "",
    desiredRegion: request.desiredRegion ?? "",
    notes: request.notes ?? "",
    requestedUsageText: usageText,
  };
}

function RegistrationRequestsSection({
  items,
  loading,
  error,
  statusFilter,
  onStatusFilterChange,
  detail,
  detailLoading,
  onOpenDetail,
  onCloseDetail,
  actionBusy,
  onReload,
  onPatchRequest,
  onSetStatus,
  onRequestFollowUp,
  onApprove,
  onReject,
  onInReview,
  onSendAdminMessage,
}) {
  const [adminMessage, setAdminMessage] = useState("");
  const [adminUploadFile, setAdminUploadFile] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const request = detail?.request ?? detail ?? null;
  const docs = Array.isArray(detail?.documents) ? detail.documents : [];
  const timeline = Array.isArray(detail?.timeline) ? detail.timeline : [];
  const masterLocked = Boolean(request?.linkedCompanyId);
  const wasDetailLoading = useRef(false);
  const lastHydratedRequestId = useRef("");

  useEffect(() => {
    if (!request) {
      setEditDraft(null);
      wasDetailLoading.current = detailLoading;
      lastHydratedRequestId.current = "";
      return;
    }
    const finishedDetailFetch = wasDetailLoading.current && !detailLoading;
    wasDetailLoading.current = detailLoading;
    if (detailLoading) return;
    const switchedRequest = lastHydratedRequestId.current !== request.id;
    if (finishedDetailFetch || switchedRequest || !editDraft) {
      setEditDraft(registrationDraftFromRequest(request));
      lastHydratedRequestId.current = request.id;
    }
  }, [request, detailLoading, editDraft]);

  async function saveRegistrationMaster() {
    if (!request || !editDraft || masterLocked) return;
    let requestedUsage = {};
    try {
      requestedUsage = editDraft.requestedUsageText.trim()
        ? JSON.parse(editDraft.requestedUsageText)
        : {};
      if (typeof requestedUsage !== "object" || requestedUsage === null || Array.isArray(requestedUsage)) {
        window.alert("„Nutzung / Kontext“ muss ein JSON-Objekt sein.");
        return;
      }
    } catch {
      window.alert("„Nutzung / Kontext“: ungültiges JSON.");
      return;
    }
    const payload = {
      partnerType: editDraft.partnerType,
      companyName: editDraft.companyName.trim(),
      legalForm: editDraft.legalForm.trim(),
      usesVouchers: editDraft.usesVouchers,
      contactFirstName: editDraft.contactFirstName.trim(),
      contactLastName: editDraft.contactLastName.trim(),
      email: editDraft.email.trim().toLowerCase(),
      phone: editDraft.phone.trim(),
      addressLine1: editDraft.addressLine1.trim(),
      addressLine2: editDraft.addressLine2.trim(),
      ownerName: editDraft.ownerName.trim(),
      dispoPhone: editDraft.dispoPhone.trim(),
      postalCode: editDraft.postalCode.trim(),
      city: editDraft.city.trim(),
      country: editDraft.country.trim(),
      taxId: editDraft.taxId.trim(),
      vatId: editDraft.vatId.trim(),
      concessionNumber: editDraft.concessionNumber.trim(),
      desiredRegion: editDraft.desiredRegion.trim(),
      notes: editDraft.notes.trim(),
      requestedUsage,
    };
    if (!payload.companyName) {
      window.alert("Firmenname ist Pflicht.");
      return;
    }
    if (!payload.email) {
      window.alert("E-Mail ist Pflicht.");
      return;
    }
    if (editDraft.partnerType === "taxi") {
      if (!payload.concessionNumber) {
        window.alert("Taxi: Konzessionsnummer ist Pflicht.");
        return;
      }
      if (!payload.taxId.trim() || !payload.vatId.trim()) {
        window.alert("Taxi: Steuernummer und USt-IdNr. sind Pflicht.");
        return;
      }
      if (!payload.ownerName) {
        window.alert("Taxi: Inhaber ist Pflicht.");
        return;
      }
    }
    await onPatchRequest(request.id, payload);
  }

  return (
    <>
      <div className="admin-filter-card">
        <div className="admin-toolbar-row">
          {REG_STATUS_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              className={`admin-page-btn ${statusFilter === t.value ? "admin-page-btn--active" : ""}`}
              onClick={() => onStatusFilterChange(t.value)}
            >
              {t.label}
            </button>
          ))}
          <button type="button" className="admin-btn-refresh" onClick={onReload}>
            Neu laden
          </button>
        </div>
      </div>

      {error ? <div className="admin-error-banner">{error}</div> : null}

      {loading ? (
        <div className="admin-info-banner">Unternehmensanfragen werden geladen …</div>
      ) : items.length === 0 ? (
        <div className="admin-info-banner">
          {statusFilter === "pending_queue"
            ? "Keine Anfragen in der Warteschlange (offen, in Bearbeitung oder Rückfrage)."
            : "Keine Anfragen in diesem Status."}
        </div>
      ) : (
        <div className="admin-companies-table-wrap">
          <table className="admin-companies-table">
            <thead>
              <tr>
                <th>Unternehmen</th>
                <th>Typ</th>
                <th>Status</th>
                <th>Kontakt</th>
                <th>Region</th>
                <th>Eingang</th>
                <th className="admin-companies-table__actions">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="admin-companies-table__row">
                  <td>
                    <div className="admin-companies-table__name">{r.companyName}</div>
                    <div className="admin-companies-table__id">{r.id}</div>
                  </td>
                  <td>
                    <PartnerTypeBadge partnerType={r.partnerType} />
                  </td>
                  <td>
                    <span className="admin-status-pill admin-status-pill--active">{regStatusLabel(r.registrationStatus)}</span>
                  </td>
                  <td>
                    {[`${r.contactFirstName ?? ""} ${r.contactLastName ?? ""}`.trim(), r.email, r.phone]
                      .filter(Boolean)
                      .join(" · ")}
                  </td>
                  <td>{r.desiredRegion || "—"}</td>
                  <td>{new Date(r.createdAt).toLocaleString("de-DE")}</td>
                  <td className="admin-companies-table__actions">
                    <div className="admin-companies-table__action-btns">
                      <button type="button" className="admin-btn-outline admin-btn-outline--compact" onClick={() => onOpenDetail(r)}>
                        Details
                      </button>
                      <button
                        type="button"
                        className="admin-btn-outline admin-btn-outline--compact"
                        disabled={actionBusy}
                        onClick={() => onInReview(r.id)}
                      >
                        In Bearbeitung
                      </button>
                      <button
                        type="button"
                        className="admin-btn-outline admin-btn-outline--compact"
                        disabled={actionBusy}
                        onClick={() => onRequestFollowUp(r.id)}
                      >
                        Rückfrage / Unterlagen
                      </button>
                      <button
                        type="button"
                        className="admin-btn-refresh admin-btn-refresh--compact"
                        disabled={actionBusy || r.registrationStatus === "approved"}
                        onClick={() => onApprove(r.id)}
                      >
                        Freigeben
                      </button>
                      <button
                        type="button"
                        className="admin-btn-danger"
                        disabled={actionBusy}
                        onClick={() => onReject(r.id)}
                      >
                        Ablehnen
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {request ? (
        <div className="admin-modal-backdrop" role="presentation" onClick={onCloseDetail}>
          <div className="admin-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal__header">
              <h2 className="admin-modal__title">Anfrage: {request.companyName}</h2>
              <button type="button" className="admin-modal__close" onClick={onCloseDetail} aria-label="Schließen">
                ×
              </button>
            </div>
            <div className="admin-modal__body">
              {detailLoading ? <div className="admin-info-banner">Lade Details …</div> : null}
              <div className="admin-reg-detail-head">
                <div className="admin-reg-detail-badges">
                  <PartnerTypeBadge partnerType={request.partnerType} />
                  <span className="admin-status-pill admin-status-pill--active">
                    {regStatusLabel(request.registrationStatus)}
                  </span>
                  {masterLocked ? (
                    <span className="admin-pill admin-pill--warn" title="Stammdaten nur noch im Mandantenprofil">
                      Mit Mandant verknüpft
                    </span>
                  ) : null}
                </div>
                <p className="admin-table-sub admin-reg-detail-hint">
                  {companyKindAtApproveHint(editDraft?.partnerType ?? request.partnerType)}
                </p>
              </div>

              <h3 className="admin-reg-subtitle">Stammdaten prüfen und korrigieren</h3>
              {(editDraft?.partnerType === "taxi" || request.partnerType === "taxi") ? (
                <div className="admin-info-banner" role="status">
                  <strong>Taxi-Unternehmen</strong> — vor der Freigabe müssen Konzession, Steuernummer, USt-IdNr. und
                  Inhaber vollständig sein (Freigabe wird sonst abgelehnt). Gutschein-Nutzung steuert die
                  Mandanten-Voreinstellung bei der Anlage.
                </div>
              ) : null}
              {masterLocked ? (
                <p className="admin-table-sub">
                  Diese Anfrage ist freigegeben und mit <code>{request.linkedCompanyId}</code> verknüpft. Änderungen am
                  Anfrage-Typ und zu den übernommenen Stammdaten erfolgen im Unternehmensprofil (Tab „Unternehmen“).
                </p>
              ) : null}

              {editDraft ? (
                <div className={`admin-reg-form${masterLocked ? " admin-reg-form--locked" : ""}`}>
                  <div className="admin-reg-form-row">
                    <label className="admin-field-label">Anfrage-Art / Typ</label>
                    <select
                      className="admin-select"
                      disabled={masterLocked || actionBusy}
                      value={editDraft.partnerType}
                      onChange={(e) => setEditDraft((d) => ({ ...d, partnerType: e.target.value }))}
                    >
                      {REG_PARTNER_TYPES.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="admin-reg-form-row admin-reg-form-row--2col">
                    <div>
                      <label className="admin-field-label">Firmenname</label>
                      <input
                        className="admin-input"
                        disabled={masterLocked || actionBusy}
                        value={editDraft.companyName}
                        onChange={(e) => setEditDraft((d) => ({ ...d, companyName: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="admin-field-label">Rechtsform</label>
                      <input
                        className="admin-input"
                        disabled={masterLocked || actionBusy}
                        value={editDraft.legalForm}
                        onChange={(e) => setEditDraft((d) => ({ ...d, legalForm: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="admin-reg-form-row">
                    <label className="admin-field-label">
                      <input
                        type="checkbox"
                        disabled={masterLocked || actionBusy}
                        checked={editDraft.usesVouchers}
                        onChange={(e) => setEditDraft((d) => ({ ...d, usesVouchers: e.target.checked }))}
                      />{" "}
                      Nutzt Gutscheine / Budget-Codes
                    </label>
                  </div>
                  <div className="admin-reg-form-row admin-reg-form-row--2col">
                    <div>
                      <label className="admin-field-label">Vorname Ansprechpartner</label>
                      <input
                        className="admin-input"
                        disabled={masterLocked || actionBusy}
                        value={editDraft.contactFirstName}
                        onChange={(e) => setEditDraft((d) => ({ ...d, contactFirstName: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="admin-field-label">Nachname</label>
                      <input
                        className="admin-input"
                        disabled={masterLocked || actionBusy}
                        value={editDraft.contactLastName}
                        onChange={(e) => setEditDraft((d) => ({ ...d, contactLastName: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="admin-reg-form-row admin-reg-form-row--2col">
                    <div>
                      <label className="admin-field-label">E-Mail</label>
                      <input
                        className="admin-input"
                        type="email"
                        autoComplete="off"
                        disabled={masterLocked || actionBusy}
                        value={editDraft.email}
                        onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="admin-field-label">Telefon</label>
                      <input
                        className="admin-input"
                        disabled={masterLocked || actionBusy}
                        value={editDraft.phone}
                        onChange={(e) => setEditDraft((d) => ({ ...d, phone: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="admin-reg-form-row">
                    <label className="admin-field-label">Adresse (Zeile 1)</label>
                    <input
                      className="admin-input"
                      disabled={masterLocked || actionBusy}
                      value={editDraft.addressLine1}
                      onChange={(e) => setEditDraft((d) => ({ ...d, addressLine1: e.target.value }))}
                    />
                  </div>
                  <div className="admin-reg-form-row">
                    <label className="admin-field-label">Adresse (Zeile 2, optional)</label>
                    <input
                      className="admin-input"
                      disabled={masterLocked || actionBusy}
                      value={editDraft.addressLine2}
                      onChange={(e) => setEditDraft((d) => ({ ...d, addressLine2: e.target.value }))}
                    />
                  </div>
                  <div className="admin-reg-form-row admin-reg-form-row--2col">
                    <div>
                      <label className="admin-field-label">Inhaber / inhabende Person</label>
                      <input
                        className="admin-input"
                        disabled={masterLocked || actionBusy}
                        value={editDraft.ownerName}
                        onChange={(e) => setEditDraft((d) => ({ ...d, ownerName: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="admin-field-label">Dispo-Telefon (optional)</label>
                      <input
                        className="admin-input"
                        disabled={masterLocked || actionBusy}
                        value={editDraft.dispoPhone}
                        onChange={(e) => setEditDraft((d) => ({ ...d, dispoPhone: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="admin-reg-form-row admin-reg-form-row--3col">
                    <div>
                      <label className="admin-field-label">PLZ</label>
                      <input
                        className="admin-input"
                        disabled={masterLocked || actionBusy}
                        value={editDraft.postalCode}
                        onChange={(e) => setEditDraft((d) => ({ ...d, postalCode: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="admin-field-label">Ort</label>
                      <input
                        className="admin-input"
                        disabled={masterLocked || actionBusy}
                        value={editDraft.city}
                        onChange={(e) => setEditDraft((d) => ({ ...d, city: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="admin-field-label">Land</label>
                      <input
                        className="admin-input"
                        disabled={masterLocked || actionBusy}
                        value={editDraft.country}
                        onChange={(e) => setEditDraft((d) => ({ ...d, country: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="admin-reg-form-row admin-reg-form-row--2col">
                    <div>
                      <label className="admin-field-label">Steuer-ID</label>
                      <input
                        className="admin-input"
                        disabled={masterLocked || actionBusy}
                        value={editDraft.taxId}
                        onChange={(e) => setEditDraft((d) => ({ ...d, taxId: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="admin-field-label">USt-IdNr.</label>
                      <input
                        className="admin-input"
                        disabled={masterLocked || actionBusy}
                        value={editDraft.vatId}
                        onChange={(e) => setEditDraft((d) => ({ ...d, vatId: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="admin-reg-form-row admin-reg-form-row--2col">
                    <div>
                      <label className="admin-field-label">Konzession / Genehmigung</label>
                      <input
                        className="admin-input"
                        disabled={masterLocked || actionBusy}
                        value={editDraft.concessionNumber}
                        onChange={(e) => setEditDraft((d) => ({ ...d, concessionNumber: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="admin-field-label">Gewünschte Region</label>
                      <input
                        className="admin-input"
                        disabled={masterLocked || actionBusy}
                        value={editDraft.desiredRegion}
                        onChange={(e) => setEditDraft((d) => ({ ...d, desiredRegion: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="admin-reg-form-row">
                    <label className="admin-field-label">Hinweise / Bemerkung (Antrag)</label>
                    <textarea
                      className="admin-input admin-textarea"
                      rows={3}
                      disabled={masterLocked || actionBusy}
                      value={editDraft.notes}
                      onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))}
                    />
                  </div>
                  <div className="admin-reg-form-row">
                    <label className="admin-field-label">Nutzung / Kontext (JSON)</label>
                    <textarea
                      className="admin-input admin-textarea admin-reg-json"
                      rows={5}
                      disabled={masterLocked || actionBusy}
                      value={editDraft.requestedUsageText}
                      onChange={(e) => setEditDraft((d) => ({ ...d, requestedUsageText: e.target.value }))}
                    />
                  </div>
                  <div className="admin-toolbar-row">
                    <button
                      type="button"
                      className="admin-btn-refresh"
                      disabled={masterLocked || actionBusy || detailLoading}
                      onClick={() => void saveRegistrationMaster()}
                    >
                      Stammdaten &amp; Typ speichern
                    </button>
                    <button
                      type="button"
                      className="admin-page-btn"
                      disabled={masterLocked || actionBusy || detailLoading}
                      onClick={() => setEditDraft(registrationDraftFromRequest(request))}
                    >
                      Zurücksetzen
                    </button>
                  </div>
                </div>
              ) : null}

              <h3 className="admin-reg-subtitle">Prüfstatus</h3>
              <dl className="admin-detail-grid">
                <div>
                  <dt>Verifizierung</dt>
                  <dd>{request.verificationStatus}</dd>
                </div>
                <div>
                  <dt>Compliance</dt>
                  <dd>{request.complianceStatus}</dd>
                </div>
                <div>
                  <dt>Vertrag</dt>
                  <dd>{request.contractStatus}</dd>
                </div>
                <div>
                  <dt>Mandanten-ID (nach Freigabe)</dt>
                  <dd>{request.linkedCompanyId || "—"}</dd>
                </div>
              </dl>
              <h3 style={{ marginTop: 16 }}>Dokumente</h3>
              {docs.length === 0 ? (
                <p className="admin-table-sub">Noch keine Dokumente.</p>
              ) : (
                <ul className="admin-placeholder-list">
                  {docs.map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        className="admin-btn-outline admin-btn-outline--compact"
                        onClick={async () => {
                          const res = await fetch(
                            `${REG_REQUESTS_URL}/${encodeURIComponent(request.id)}/documents/${encodeURIComponent(d.id)}/download`,
                            { headers: adminApiHeaders() },
                          );
                          if (!res.ok) return;
                          const blob = await res.blob();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = d.originalFileName || "document.bin";
                          document.body.appendChild(a);
                          a.click();
                          a.remove();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        {d.originalFileName}
                      </button>{" "}
                      ({d.category}, {Math.round((d.fileSizeBytes ?? 0) / 1024)} KB)
                    </li>
                  ))}
                </ul>
              )}
              <h3 style={{ marginTop: 16 }}>Timeline / Kommunikation</h3>
              {timeline.length === 0 ? (
                <p className="admin-table-sub">Noch keine Timeline-Einträge.</p>
              ) : (
                <ul className="admin-placeholder-list">
                  {timeline.slice(0, 20).map((t) => (
                    <li key={t.id}>
                      <strong>{new Date(t.createdAt).toLocaleString("de-DE")}</strong> · {t.actorType} ·{" "}
                      {t.eventType} · {t.message}
                    </li>
                  ))}
                </ul>
              )}
              <div className="admin-toolbar-row" style={{ marginTop: 12 }}>
                <input
                  className="admin-input"
                  placeholder="Rückfrage/Nachricht an Partner"
                  value={adminMessage}
                  onChange={(e) => setAdminMessage(e.target.value)}
                />
                <button
                  type="button"
                  className="admin-btn-outline"
                  disabled={actionBusy || !adminMessage.trim()}
                  onClick={async () => {
                    const ok = await onSendAdminMessage(request.id, adminMessage.trim());
                    if (ok) setAdminMessage("");
                  }}
                >
                  Nachricht senden
                </button>
              </div>
              <div className="admin-toolbar-row" style={{ marginTop: 10 }}>
                <input
                  className="admin-input"
                  type="file"
                  onChange={(e) => setAdminUploadFile(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  className="admin-btn-outline"
                  disabled={actionBusy || !adminUploadFile}
                  onClick={async () => {
                    if (!adminUploadFile) return;
                    const toBase64 = (file) =>
                      new Promise((resolve, reject) => {
                        const r = new FileReader();
                        r.onload = () => resolve(String(r.result ?? ""));
                        r.onerror = () => reject(new Error("file_read_failed"));
                        r.readAsDataURL(file);
                      });
                    try {
                      const contentBase64 = await toBase64(adminUploadFile);
                      const res = await fetch(
                        `${REG_REQUESTS_URL}/${encodeURIComponent(request.id)}/documents`,
                        {
                          method: "POST",
                          headers: adminApiHeaders({ "Content-Type": "application/json" }),
                          body: JSON.stringify({
                            fileName: adminUploadFile.name,
                            mimeType: adminUploadFile.type || "application/octet-stream",
                            category: "admin_note",
                            contentBase64,
                          }),
                        },
                      );
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok || !data?.ok) return;
                      setAdminUploadFile(null);
                      await onSendAdminMessage(request.id, `Dokument hinzugefügt: ${adminUploadFile.name}`);
                    } catch {
                      // ignore, user can retry
                    }
                  }}
                >
                  Admin-Dokument hochladen
                </button>
              </div>
              <p className="admin-table-sub" style={{ marginTop: 14 }}>
                Hinweis: Öffentliche Anfrage-Stammdaten werden bei Freigabe in den Mandanten übernommen; Panel-Login gibt
                es erst nach Freigabe.
              </p>
              <div className="admin-toolbar-row" style={{ marginTop: 14 }}>
                <button type="button" className="admin-btn-outline" disabled={actionBusy} onClick={() => onSetStatus(request.id, "open")}>
                  Offen
                </button>
                <button type="button" className="admin-btn-outline" disabled={actionBusy} onClick={() => onInReview(request.id)}>
                  In Bearbeitung
                </button>
                <button type="button" className="admin-btn-outline" disabled={actionBusy} onClick={() => onRequestFollowUp(request.id)}>
                  Rückfrage / Unterlagen nachfordern
                </button>
                <button type="button" className="admin-btn-refresh" disabled={actionBusy} onClick={() => onApprove(request.id)}>
                  Freigeben & Unternehmen anlegen
                </button>
                <button type="button" className="admin-btn-danger" disabled={actionBusy} onClick={() => onReject(request.id)}>
                  Ablehnen
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
