import type { Response } from "express";
import type { PanelRole } from "../lib/panelJwt";
import { isPanelRoleString, panelCan, type PanelPermission } from "../lib/panelPermissions";

/**
 * Nach `assertActivePanelProfile`: 403, wenn die **aktuelle DB-Rolle** die Permission nicht hat.
 * Siehe `docs/access-control.md` und `panelPermissions.ts` (ROLE_MATRIX).
 */
export function denyUnlessPanelPermission(
  res: Response,
  profileRole: string,
  permission: PanelPermission,
): profileRole is PanelRole {
  if (!isPanelRoleString(profileRole)) {
    res.status(403).json({ error: "forbidden" });
    return false;
  }
  if (!panelCan(profileRole, permission)) {
    res.status(403).json({ error: "forbidden", hint: permission });
    return false;
  }
  return true;
}
