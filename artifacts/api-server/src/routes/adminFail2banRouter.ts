import { Router } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import { requireAdminApiBearer } from "../lib/adminAuth";

const execAsync = promisify(exec);
const router = Router();

async function getFail2banJails(): Promise<string[]> {
  const { stdout } = await execAsync("fail2ban-client status 2>/dev/null");
  const match = stdout.match(/Jail list:\s*(.+)/);
  if (!match) return [];
  return match[1].split(",").map((j) => j.trim()).filter(Boolean);
}

// GET /admin/fail2ban/status — alle Jails + gesperrte IPs
router.get("/admin/fail2ban/status", requireAdminApiBearer, async (_req, res, next) => {
  try {
    const jails = await getFail2banJails();
    const result = await Promise.all(
      jails.map(async (jail) => {
        try {
          const { stdout } = await execAsync(`fail2ban-client status ${jail} 2>/dev/null`);
          const bannedMatch = stdout.match(/Banned IP list:\s*(.*)/);
          const totalMatch = stdout.match(/Total banned:\s*(\d+)/);
          const currentMatch = stdout.match(/Currently banned:\s*(\d+)/);
          const bannedIps = bannedMatch?.[1]?.trim()
            ? bannedMatch[1].trim().split(/\s+/)
            : [];
          return {
            jail,
            totalBanned: parseInt(totalMatch?.[1] ?? "0"),
            currentBanned: parseInt(currentMatch?.[1] ?? "0"),
            bannedIps,
          };
        } catch {
          return { jail, totalBanned: 0, currentBanned: 0, bannedIps: [] };
        }
      })
    );
    res.json({ ok: true, jails: result });
  } catch (e) {
    next(e);
  }
});

// POST /admin/fail2ban/unban — IP entsperren
router.post("/admin/fail2ban/unban", requireAdminApiBearer, async (req, res, next) => {
  try {
    const { ip, jail } = req.body as { ip?: string; jail?: string };
    if (!ip || !jail) {
      res.status(400).json({ error: "ip_and_jail_required" });
      return;
    }
    // Validierung: nur gültige IP-Adressen
    if (!/^[\d.a-f:]+$/i.test(ip)) {
      res.status(400).json({ error: "invalid_ip" });
      return;
    }
    await execAsync(`fail2ban-client set ${jail} unbanip ${ip} 2>/dev/null`);
    res.json({ ok: true, message: `${ip} aus ${jail} entsperrt` });
  } catch (e) {
    next(e);
  }
});

// POST /admin/fail2ban/ban — IP manuell sperren
router.post("/admin/fail2ban/ban", requireAdminApiBearer, async (req, res, next) => {
  try {
    const { ip, jail } = req.body as { ip?: string; jail?: string };
    if (!ip || !jail) {
      res.status(400).json({ error: "ip_and_jail_required" });
      return;
    }
    if (!/^[\d.a-f:]+$/i.test(ip)) {
      res.status(400).json({ error: "invalid_ip" });
      return;
    }
    await execAsync(`fail2ban-client set ${jail} banip ${ip} 2>/dev/null`);
    res.json({ ok: true, message: `${ip} in ${jail} gesperrt` });
  } catch (e) {
    next(e);
  }
});

export default router;
