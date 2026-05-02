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

  if (taxiFleet && hasPerm(user, "fleet.manage")) {
    out.push({ id: "add_driver", label: "Fahrer hinzufügen" });
    out.push({ id: "add_vehicle", label: "Fahrzeug hinzufügen" });
  }
  if (ridesCreateMod && hasPerm(user, "rides.create")) {
    out.push({ id: "create_ride", label: "Fahrt erstellen" });
    out.push({ id: "create_medical_round", label: "Krankenfahrt erstellen" });
  }
  return out;
}

/** Dashboard-Schnellaktionen — gleiches Subset wie Plus-Menü. */
export function getDashboardFleetQuickActionIds() {
  return ["create_ride", "add_driver", "add_vehicle", "create_medical_round"];
}
