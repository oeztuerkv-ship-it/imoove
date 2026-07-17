import { Router, type Request, type Response } from "express";
import { insertAdminAuthAuditLog } from "../db/adminAuthData";
import {
  addSecurityBlocklist,
  addSecurityWhitelist,
  getSecurityBanDailyStats,
  insertSecurityBanEvent,
  isIpWhitelisted,
  listSecurityBlocklist,
  listSecurityWhitelist,
  removeSecurityBlocklist,
  removeSecurityWhitelist,
  syncActiveBlocklistToFail2ban,
  syncActiveWhitelistToFail2ban,
} from "../db/securityIpData";
import { isPostgresConfigured } from "../db/client";
import { canAccessAdminSecurityDashboard } from "../lib/adminConsoleRoles";
import {
  applyIgnoreIpAllJails,
  assessPanelLoginProtection,
  banIpInJail,
  banPermanentIp,
  getFail2banJailConfig,
  getFail2banJailStatus,
  getPermanentJailName,
  isFail2banAvailable,
  isValidBanIp,
  isValidJailName,
  listFail2banJails,
  normalizeIpOrCidr,
  removeIgnoreIpAllJails,
  unbanIpInJail,
  unbanPermanentIp,
} from "../lib/fail2banClient";
import { lookupIpGeoBatch } from "../lib/ipGeoLookup";
import { requireAdminApiBearer } from "../middleware/requireAdminApiBearer";

const router = Router();

function adminUsername(req: Request): string {
  return req.adminAuth?.username?.trim() || "admin";
}

function requireSecurityAdmin(req: Request, res: Response): boolean {
  const role = req.adminAuth?.role ?? "admin";
  if (!canAccessAdminSecurityDashboard(role)) {
    res.status(403).json({ error: "forbidden" });
    return false;
  }
  return true;
}

async function auditSecurityAction(req: Request, action: string, meta: Record<string, unknown>): Promise<void> {
  await insertAdminAuthAuditLog({
    username: adminUsername(req),
    action,
    meta,
  });
}

// GET /admin/fail2ban/status — Jails, Geo, Whitelist/Blocklist, Panel-Schutz, Stats-Vorschau
router.get("/admin/fail2ban/status", requireAdminApiBearer, async (req, res, next) => {
  try {
    if (!requireSecurityAdmin(req, res)) return;

    const fail2banAvailable = await isFail2banAvailable();
    const jailNames = fail2banAvailable ? await listFail2banJails() : [];
    const jails = await Promise.all(
      jailNames.map(async (jail) => {
        try {
          return await getFail2banJailStatus(jail);
        } catch {
          return { jail, totalBanned: 0, currentBanned: 0, bannedIps: [] as string[] };
        }
      }),
    );

    const jailConfigs = await Promise.all(
      jailNames.slice(0, 12).map(async (jail) => {
        try {
          return await getFail2banJailConfig(jail);
        } catch {
          return { jail, bantime: null, findtime: null, maxretry: null, bantimeIncrement: null };
        }
      }),
    );

    const allBannedIps = [...new Set(jails.flatMap((j) => j.bannedIps))];
    const geoMap = fail2banAvailable ? await lookupIpGeoBatch(allBannedIps) : new Map();
    const geoByIp = Object.fromEntries(
      [...geoMap.entries()].map(([ip, g]) => [
        ip,
        {
          country: g.country,
          countryCode: g.countryCode,
          hosterLabel: g.hosterLabel,
          isp: g.isp,
          lookupOk: g.lookupOk,
        },
      ]),
    );

    const [whitelist, blocklist, statsDaily, panelLoginProtection] = await Promise.all([
      listSecurityWhitelist(),
      listSecurityBlocklist(),
      getSecurityBanDailyStats(14),
      assessPanelLoginProtection(jailNames),
    ]);

    res.json({
      ok: true,
      fail2banAvailable,
      permanentJail: getPermanentJailName(),
      jails: jails.map((j) => ({
        ...j,
        bannedIps: j.bannedIps.map((ip) => ({
          ip,
          geo: geoByIp[ip] ?? null,
          permanent: blocklist.some((b) => b.ipCidr === ip),
          whitelisted: whitelist.some((w) => w.ipCidr === ip),
        })),
      })),
      jailConfigs,
      whitelist,
      blocklist,
      panelLoginProtection,
      statsDaily,
      dbConfigured: isPostgresConfigured(),
    });
  } catch (e) {
    next(e);
  }
});

// GET /admin/security/stats?days=7|30
router.get("/admin/security/stats", requireAdminApiBearer, async (req, res, next) => {
  try {
    if (!requireSecurityAdmin(req, res)) return;
    const daysRaw = typeof req.query.days === "string" ? Number(req.query.days) : 7;
    const days = Number.isFinite(daysRaw) ? daysRaw : 7;
    const daily = await getSecurityBanDailyStats(days);
    res.json({ ok: true, days, daily });
  } catch (e) {
    next(e);
  }
});

// GET /admin/security/whitelist
router.get("/admin/security/whitelist", requireAdminApiBearer, async (req, res, next) => {
  try {
    if (!requireSecurityAdmin(req, res)) return;
    res.json({ ok: true, items: await listSecurityWhitelist() });
  } catch (e) {
    next(e);
  }
});

// POST /admin/security/whitelist
router.post("/admin/security/whitelist", requireAdminApiBearer, async (req, res, next) => {
  try {
    if (!requireSecurityAdmin(req, res)) return;
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const body = req.body as { ip?: string; label?: string; notes?: string };
    const ip = normalizeIpOrCidr(body.ip ?? "");
    if (!ip) {
      res.status(400).json({ error: "invalid_ip" });
      return;
    }
    const item = await addSecurityWhitelist({
      ipCidr: ip,
      label: body.label,
      notes: body.notes,
      createdBy: adminUsername(req),
    });
    await applyIgnoreIpAllJails(ip);
    await insertSecurityBanEvent({
      ip,
      action: "whitelist_add",
      adminUsername: adminUsername(req),
      meta: { label: item.label },
    });
    await auditSecurityAction(req, "security_whitelist_add", { ip, label: item.label });
    res.json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

// DELETE /admin/security/whitelist/:id
router.delete("/admin/security/whitelist/:id", requireAdminApiBearer, async (req, res, next) => {
  try {
    if (!requireSecurityAdmin(req, res)) return;
    const removed = await removeSecurityWhitelist(req.params.id);
    if (!removed) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await removeIgnoreIpAllJails(removed.ipCidr);
    await insertSecurityBanEvent({
      ip: removed.ipCidr,
      action: "whitelist_remove",
      adminUsername: adminUsername(req),
    });
    await auditSecurityAction(req, "security_whitelist_remove", { ip: removed.ipCidr });
    res.json({ ok: true, ip: removed.ipCidr });
  } catch (e) {
    next(e);
  }
});

// GET /admin/security/blocklist
router.get("/admin/security/blocklist", requireAdminApiBearer, async (req, res, next) => {
  try {
    if (!requireSecurityAdmin(req, res)) return;
    res.json({ ok: true, items: await listSecurityBlocklist() });
  } catch (e) {
    next(e);
  }
});

// POST /admin/security/blocklist
router.post("/admin/security/blocklist", requireAdminApiBearer, async (req, res, next) => {
  try {
    if (!requireSecurityAdmin(req, res)) return;
    if (!isPostgresConfigured()) {
      res.status(503).json({ error: "database_not_configured" });
      return;
    }
    const body = req.body as { ip?: string; label?: string; reason?: string };
    const ip = normalizeIpOrCidr(body.ip ?? "");
    if (!ip) {
      res.status(400).json({ error: "invalid_ip" });
      return;
    }
    if (await isIpWhitelisted(ip)) {
      res.status(409).json({ error: "ip_whitelisted", message: "IP steht auf der Whitelist." });
      return;
    }
    const item = await addSecurityBlocklist({
      ipCidr: ip,
      label: body.label,
      reason: body.reason,
      createdBy: adminUsername(req),
    });
    const banResult = await banPermanentIp(ip);
    await insertSecurityBanEvent({
      ip,
      jail: banResult.jail,
      action: "permanent_ban",
      adminUsername: adminUsername(req),
      meta: { label: item.label, reason: item.reason, fail2banApplied: banResult.applied },
    });
    await auditSecurityAction(req, "security_blocklist_add", { ip, jail: banResult.jail });
    res.json({ ok: true, item, fail2ban: banResult });
  } catch (e) {
    next(e);
  }
});

// DELETE /admin/security/blocklist/:id
router.delete("/admin/security/blocklist/:id", requireAdminApiBearer, async (req, res, next) => {
  try {
    if (!requireSecurityAdmin(req, res)) return;
    const removed = await removeSecurityBlocklist(req.params.id);
    if (!removed) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await unbanPermanentIp(removed.ipCidr);
    await insertSecurityBanEvent({
      ip: removed.ipCidr,
      action: "permanent_unban",
      adminUsername: adminUsername(req),
    });
    await auditSecurityAction(req, "security_blocklist_remove", { ip: removed.ipCidr });
    res.json({ ok: true, ip: removed.ipCidr });
  } catch (e) {
    next(e);
  }
});

// POST /admin/security/sync — Whitelist/Blocklist nach Fail2Ban spiegeln
router.post("/admin/security/sync", requireAdminApiBearer, async (req, res, next) => {
  try {
    if (!requireSecurityAdmin(req, res)) return;
    const wl = await syncActiveWhitelistToFail2ban(async (ip) => {
      await applyIgnoreIpAllJails(ip);
    });
    const bl = await syncActiveBlocklistToFail2ban(async (ip) => {
      await banPermanentIp(ip);
    });
    res.json({ ok: true, whitelist: wl, blocklist: bl });
  } catch (e) {
    next(e);
  }
});

// POST /admin/fail2ban/unban
router.post("/admin/fail2ban/unban", requireAdminApiBearer, async (req, res, next) => {
  try {
    if (!requireSecurityAdmin(req, res)) return;
    const { ip, jail } = req.body as { ip?: string; jail?: string };
    const normalized = normalizeIpOrCidr(ip ?? "");
    const jailName = (jail ?? "").trim();
    if (!normalized || !jailName) {
      res.status(400).json({ error: "ip_and_jail_required" });
      return;
    }
    if (!isValidJailName(jailName)) {
      res.status(400).json({ error: "invalid_jail" });
      return;
    }
    await unbanIpInJail(jailName, normalized);
    await insertSecurityBanEvent({
      ip: normalized,
      jail: jailName,
      action: "unban",
      adminUsername: adminUsername(req),
    });
    await auditSecurityAction(req, "security_unban", { ip: normalized, jail: jailName });
    res.json({ ok: true, message: `${normalized} aus ${jailName} entsperrt` });
  } catch (e) {
    next(e);
  }
});

// POST /admin/fail2ban/ban
router.post("/admin/fail2ban/ban", requireAdminApiBearer, async (req, res, next) => {
  try {
    if (!requireSecurityAdmin(req, res)) return;
    const { ip, jail } = req.body as { ip?: string; jail?: string };
    const normalized = normalizeIpOrCidr(ip ?? "");
    const jailName = (jail ?? "").trim();
    if (!normalized || !jailName) {
      res.status(400).json({ error: "ip_and_jail_required" });
      return;
    }
    if (!isValidBanIp(normalized) || !isValidJailName(jailName)) {
      res.status(400).json({ error: "invalid_ip_or_jail" });
      return;
    }
    if (await isIpWhitelisted(normalized)) {
      res.status(409).json({ error: "ip_whitelisted", message: "IP steht auf der Whitelist — Sperre abgebrochen." });
      return;
    }
    await banIpInJail(jailName, normalized);
    await insertSecurityBanEvent({
      ip: normalized,
      jail: jailName,
      action: "ban",
      adminUsername: adminUsername(req),
    });
    await auditSecurityAction(req, "security_ban", { ip: normalized, jail: jailName });
    res.json({ ok: true, message: `${normalized} in ${jailName} gesperrt` });
  } catch (e) {
    next(e);
  }
});

// POST /admin/security/bulk
router.post("/admin/security/bulk", requireAdminApiBearer, async (req, res, next) => {
  try {
    if (!requireSecurityAdmin(req, res)) return;
    const body = req.body as {
      action?: "ban" | "unban";
      jail?: string;
      items?: Array<{ ip?: string; jail?: string }>;
    };
    const action = body.action;
    const defaultJail = (body.jail ?? "").trim();
    const items = Array.isArray(body.items) ? body.items : [];
    if (!action || !items.length) {
      res.status(400).json({ error: "action_and_items_required" });
      return;
    }
    if (action === "ban" && defaultJail && !isValidJailName(defaultJail)) {
      res.status(400).json({ error: "invalid_jail" });
      return;
    }

    const results: Array<{ ip: string; jail: string; ok: boolean; error?: string }> = [];
    for (const item of items.slice(0, 100)) {
      const ip = normalizeIpOrCidr(item.ip ?? "");
      const jailName = (item.jail ?? defaultJail).trim();
      if (!ip || !jailName || !isValidJailName(jailName)) {
        results.push({ ip: item.ip ?? "", jail: jailName, ok: false, error: "invalid_ip_or_jail" });
        continue;
      }
      if (action === "ban" && (await isIpWhitelisted(ip))) {
        results.push({ ip, jail: jailName, ok: false, error: "ip_whitelisted" });
        continue;
      }
      try {
        if (action === "ban") {
          await banIpInJail(jailName, ip);
        } else {
          await unbanIpInJail(jailName, ip);
        }
        results.push({ ip, jail: jailName, ok: true });
      } catch {
        results.push({ ip, jail: jailName, ok: false, error: "fail2ban_failed" });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    await insertSecurityBanEvent({
      ip: results.map((r) => r.ip).join(","),
      jail: defaultJail || null,
      action: action === "ban" ? "bulk_ban" : "bulk_unban",
      adminUsername: adminUsername(req),
      meta: { count: results.length, okCount, results },
    });
    await auditSecurityAction(req, action === "ban" ? "security_bulk_ban" : "security_bulk_unban", {
      count: results.length,
      okCount,
    });
    res.json({ ok: true, results, okCount });
  } catch (e) {
    next(e);
  }
});

export default router;
