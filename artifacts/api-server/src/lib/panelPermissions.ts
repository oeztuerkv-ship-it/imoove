import type { PanelRole } from "./panelJwt";

/**
 * Partner-Panel: Berechtigungsmatrix und Rollen-Hierarchie.
 * Plattform-Admin (`/api/admin/*` + `ADMIN_API_BEARER_TOKEN`) ist davon unabhängig — siehe `docs/access-control.md`.
 */

/** Grobe Rechte — später durch feinere Permissions ersetzbar. */
export type PanelPermission =
  | "rides.read"
  | "rides.create"
  | "users.read"
  | "users.manage"
  | "users.reset_password"
  | "self.change_password"
  | "company.update"
  | "access_codes.read"
  | "access_codes.manage"
  | "fleet.read"
  | "fleet.manage"
  | "support.read"
  | "support.write";

const ROLE_MATRIX: Record<PanelRole, readonly PanelPermission[]> = {
  owner: [
    "rides.read",
    "rides.create",
    "users.read",
    "users.manage",
    "users.reset_password",
    "self.change_password",
    "company.update",
    "access_codes.read",
    "access_codes.manage",
    "fleet.read",
    "fleet.manage",
    "support.read",
    "support.write",
  ],
  manager: [
    "rides.read",
    "rides.create",
    "users.read",
    "users.manage",
    "users.reset_password",
    "self.change_password",
    "company.update",
    "access_codes.read",
    "access_codes.manage",
    "fleet.read",
    "fleet.manage",
    "support.read",
    "support.write",
  ],
  /** Disponent: Fahrten + operative Codes/Flotte; kein Nutzer-Listing, keine Firmen-Stammdaten, kein `company.update`. */
  staff: [
    "rides.read",
    "rides.create",
    "self.change_password",
    "access_codes.read",
    "fleet.read",
    "support.read",
    "support.write",
  ],
  readonly: [
    "rides.read",
    "users.read",
    "self.change_password",
    "access_codes.read",
    "fleet.read",
    "support.read",
    "support.write",
  ],
};

export function isPanelRoleString(v: string): v is PanelRole {
  return v === "owner" || v === "manager" || v === "staff" || v === "readonly";
}

export function panelCan(role: PanelRole, permission: PanelPermission): boolean {
  return (ROLE_MATRIX[role] as readonly PanelPermission[]).includes(permission);
}

export function permissionsForRole(role: PanelRole): PanelPermission[] {
  return [...ROLE_MATRIX[role]];
}

/**
 * Partner-Self-Service (`/panel/v1/users/*`): wer darf welche Zielrolle anlegen oder zuweisen.
 * **Nicht** für Plattform-Admin-API — dort sind alle `PanelRole`-Werte erlaubt.
 */
export function canPartnerAssignPanelRole(actor: PanelRole, target: PanelRole): boolean {
  if (actor === "owner") return true;
  if (actor === "manager") {
    return target === "manager" || target === "staff" || target === "readonly";
  }
  return false;
}
