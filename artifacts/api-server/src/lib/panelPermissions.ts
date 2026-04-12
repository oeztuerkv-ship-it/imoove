import type { PanelRole } from "./panelJwt";

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
  | "access_codes.manage";

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
  ],
  staff: ["rides.read", "rides.create", "users.read", "self.change_password", "access_codes.read"],
  readonly: ["rides.read", "users.read", "self.change_password", "access_codes.read"],
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
