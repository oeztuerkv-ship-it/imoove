import type { Response } from "express";
import { isPostgresConfigured } from "../db/client";
import { findActivePanelUserProfileById, type PanelUserProfileRow } from "../db/panelAuthData";
import { resolveEffectivePanelModules, type PanelModuleId } from "../domain/panelModules";
import { isPanelRoleString } from "../lib/panelPermissions";
import type { PanelAuthRequest } from "../middleware/requirePanelAuth";

export function enabledPanelModules(profile: PanelUserProfileRow): PanelModuleId[] {
  return resolveEffectivePanelModules(profile.panelModules, profile.companyKind);
}

export function denyUnlessPanelModule(
  res: Response,
  profile: PanelUserProfileRow,
  mod: PanelModuleId,
): boolean {
  if (!enabledPanelModules(profile).includes(mod)) {
    res.status(403).json({ error: "module_disabled", hint: mod });
    return false;
  }
  return true;
}

export async function assertActivePanelProfile(
  req: PanelAuthRequest,
  res: Response,
  opts?: { allowPasswordChangeRequired?: boolean },
): Promise<{ claims: NonNullable<PanelAuthRequest["panelAuth"]>; profile: PanelUserProfileRow } | null> {
  if (!isPostgresConfigured()) {
    res.status(503).json({ error: "database_not_configured" });
    return null;
  }
  const claims = req.panelAuth;
  if (!claims) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }
  const profile = await findActivePanelUserProfileById(claims.panelUserId);
  if (!profile || !isPanelRoleString(profile.role)) {
    res.status(401).json({ error: "user_inactive_or_missing" });
    return null;
  }
  if (profile.companyId !== claims.companyId || profile.username !== claims.username) {
    res.status(401).json({ error: "token_out_of_sync" });
    return null;
  }
  if (profile.mustChangePassword && !opts?.allowPasswordChangeRequired) {
    res.status(403).json({ error: "password_change_required" });
    return null;
  }
  return { claims, profile };
}
