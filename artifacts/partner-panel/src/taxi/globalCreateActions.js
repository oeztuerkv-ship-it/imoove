import { hasPanelModule } from "../lib/panelNavigation.js";

function hasPerm(user, key) {
  return Array.isArray(user?.permissions) && user.permissions.includes(key);
}

/** Gleiche Einträge wie im Plus-Menü — eine Quelle für Labels und IDs. */
export function getGlobalCreateMenuItems(user) {
  /** @type {{ id: string; label: string }[]} */
  const out = [];
  const taxiFleet = hasPanelModule(user?.panelModules, "taxi_fleet");
  const ridesCreateMod = hasPanelModule(user?.panelModules, "rides_create");
  const codesMod = hasPanelModule(user?.panelModules, "access_codes");
  const teamMod = hasPanelModule(user?.panelModules, "team");

  if (taxiFleet && hasPerm(user, "fleet.manage")) {
    out.push({ id: "add_driver", label: "Fahrer hinzufügen" });
    out.push({ id: "add_vehicle", label: "Fahrzeug hinzufügen" });
  }
  if (ridesCreateMod && hasPerm(user, "rides.create")) {
    out.push({ id: "create_ride", label: "Auftrag erstellen" });
    out.push({ id: "create_medical_round", label: "Krankenfahrt erstellen" });
  }
  if (codesMod && hasPerm(user, "access_codes.manage")) {
    out.push({ id: "create_voucher_code", label: "Gutscheincode erstellen" });
  }
  if (teamMod && hasPerm(user, "users.read")) {
    out.push({ id: "add_staff", label: "Mitarbeiter hinzufügen" });
  }
  return out;
}

/** Nur die fünf Fleet-Dashboard-Schnellaktionen (Subset). */
export function getDashboardFleetQuickActionIds() {
  return ["create_ride", "add_driver", "add_vehicle", "create_medical_round", "create_voucher_code"];
}
