import { firstAllowedAdminPage, isAdminPageAllowed } from "../config/adminNavConfig.js";

/**
 * Admin-SPA: Hash-Routing für Browser Zurück/Vorwärts (kein React Router).
 * Beispiele: #/rides, #/companies/mandate/co-demo-1, #/ride-detail/abc
 */

function encodeSeg(id) {
  return encodeURIComponent(String(id ?? "").trim());
}

function decodeSeg(seg) {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

/** @param {string} page */
function normalizePage(page, role) {
  const key = String(page || "").trim() || "dashboard";
  if (isAdminPageAllowed(key, role)) return key;
  return firstAllowedAdminPage(role) || "dashboard";
}

/**
 * @param {{
 *   active: string;
 *   rideRecordId?: string | null;
 *   mandateDetailCompanyId?: string | null;
 *   companiesListTab?: string;
 *   panelUsersSeedCompanyId?: string | null;
 *   taxiFleetSeedCompanyId?: string | null;
 *   companiesExpandWorkspaceCompanyId?: string | null;
 * }} state
 */
export function buildAdminAppHash(state) {
  const active = state.active || "dashboard";

  if (active === "ride-detail" && state.rideRecordId) {
    return `#/ride-detail/${encodeSeg(state.rideRecordId)}`;
  }

  if (active === "companies") {
    if (state.mandateDetailCompanyId) {
      return `#/companies/mandate/${encodeSeg(state.mandateDetailCompanyId)}`;
    }
    const q = new URLSearchParams();
    const tab = state.companiesListTab;
    if (tab && tab !== "all") q.set("tab", tab);
    if (state.companiesExpandWorkspaceCompanyId) {
      q.set("expand", state.companiesExpandWorkspaceCompanyId);
    }
    const qs = q.toString();
    return qs ? `#/companies?${qs}` : "#/companies";
  }

  if (active === "users-panel" && state.panelUsersSeedCompanyId) {
    return `#/users-panel?company=${encodeSeg(state.panelUsersSeedCompanyId)}`;
  }

  if (
    (active === "taxi-fleet-drivers" || active === "taxi-fleet-vehicles") &&
    state.taxiFleetSeedCompanyId
  ) {
    return `#/${active}?company=${encodeSeg(state.taxiFleetSeedCompanyId)}`;
  }

  return `#/${active}`;
}

/**
 * @param {string} hash
 * @param {string} role
 */
export function parseAdminAppHash(hash, role) {
  const raw = String(hash || "")
    .replace(/^#/, "")
    .replace(/^\//, "")
    .trim();
  if (!raw) {
    return { page: normalizePage("dashboard", role) };
  }

  const qIdx = raw.indexOf("?");
  const pathPart = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
  const query = qIdx >= 0 ? new URLSearchParams(raw.slice(qIdx + 1)) : new URLSearchParams();
  const segments = pathPart.split("/").filter(Boolean);
  const head = segments[0] || "dashboard";

  if (head === "ride-detail") {
    const rideId = segments[1] ? decodeSeg(segments[1]) : null;
    return {
      page: rideId && isAdminPageAllowed("ride-detail", role) ? "ride-detail" : normalizePage("rides", role),
      rideId,
    };
  }

  if (head === "companies") {
    const out = {
      page: "companies",
      companiesTab: query.get("tab") || "all",
      expandWorkspaceId: query.get("expand") || null,
    };
    if (segments[1] === "mandate" && segments[2]) {
      out.mandateId = decodeSeg(segments[2]);
    }
    return out;
  }

  if (head === "users-panel") {
    return {
      page: "users-panel",
      panelCompanyId: query.get("company") || null,
    };
  }

  if (head === "taxi-fleet-drivers" || head === "taxi-fleet-vehicles") {
    return {
      page: head,
      taxiFleetCompanyId: query.get("company") || null,
    };
  }

  return { page: normalizePage(head, role) };
}

/**
 * Wendet geparste Route auf App-State an (Setter aus App.jsx).
 * @param {ReturnType<typeof parseAdminAppHash>} route
 * @param {object} setters
 */
export function applyAdminAppRoute(route, setters) {
  const page = route.page || "dashboard";

  if (page === "ride-detail") {
    setters.setRideRecordId(route.rideId || null);
    setters.setActive(route.rideId ? "ride-detail" : "rides");
    setters.setMandateDetailCompanyId(null);
    setters.setCompaniesExpandWorkspaceCompanyId(null);
    setters.setPanelUsersSeedCompanyId(null);
    setters.setTaxiFleetSeedCompanyId(null);
    return;
  }

  setters.setRideRecordId(null);
  setters.setActive(page);

  if (page === "companies") {
    setters.setMandateDetailCompanyId(route.mandateId || null);
    setters.setCompaniesListTab(route.companiesTab != null && route.companiesTab !== "" ? route.companiesTab : "all");
    setters.setCompaniesExpandWorkspaceCompanyId(route.expandWorkspaceId || null);
    setters.setCompaniesInitialOpenId(null);
  } else {
    setters.setMandateDetailCompanyId(null);
    setters.setCompaniesExpandWorkspaceCompanyId(null);
  }

  if (page === "users-panel") {
    setters.setPanelUsersSeedCompanyId(route.panelCompanyId || null);
  } else if (page !== "companies") {
    setters.setPanelUsersSeedCompanyId(null);
  }

  if (page === "taxi-fleet-drivers" || page === "taxi-fleet-vehicles") {
    setters.setTaxiFleetSeedCompanyId(route.taxiFleetCompanyId || null);
  } else {
    setters.setTaxiFleetSeedCompanyId(null);
  }
}

export function adminAppHistoryHref(hash) {
  if (typeof window === "undefined") return hash || "#/dashboard";
  return `${window.location.pathname}${window.location.search}${hash}`;
}

/** Deep-Link (Mandantenzentrale, Fahrtakte, …) — Login direkt anzeigen, nicht weiße Leerseite. */
export function isAdminDeepLinkHash(hash) {
  const route = parseAdminAppHash(hash, "admin");
  if (route.mandateId) return true;
  if (route.page === "ride-detail" && route.rideId) return true;
  if (route.page === "users-panel" && route.panelCompanyId) return true;
  if (route.taxiFleetCompanyId) return true;
  return false;
}
