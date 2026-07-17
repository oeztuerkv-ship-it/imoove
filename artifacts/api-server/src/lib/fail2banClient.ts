import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isIPv4, isIPv6 } from "node:net";

const execFileAsync = promisify(execFile);

const JAIL_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const PERMANENT_JAIL = (process.env.FAIL2BAN_PERMANENT_JAIL ?? "onroda-permanent").trim() || "onroda-permanent";
const PANEL_AUTH_JAIL = (process.env.FAIL2BAN_PANEL_AUTH_JAIL ?? "nginx-http-auth").trim() || "nginx-http-auth";

export type Fail2banJailStatus = {
  jail: string;
  totalBanned: number;
  currentBanned: number;
  bannedIps: string[];
};

export type Fail2banJailConfig = {
  jail: string;
  bantime: string | null;
  findtime: string | null;
  maxretry: string | null;
  bantimeIncrement: string | null;
  bantimeFactor: string | null;
  bantimeFormula: string | null;
  bantimeMultiplier: string | null;
  bantimeOverreach: string | null;
  bantimeRndtime: string | null;
};

export function isValidJailName(jail: string): boolean {
  return JAIL_NAME_RE.test(jail.trim());
}

export function normalizeIpOrCidr(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.includes("/")) {
    const [addr, prefix] = s.split("/", 2);
    const p = Number(prefix);
    if (!Number.isInteger(p) || p < 0) return null;
    if (isIPv4(addr) && p <= 32) return `${addr}/${p}`;
    if (isIPv6(addr) && p <= 128) return `${addr}/${p}`;
    return null;
  }
  if (isIPv4(s) || isIPv6(s)) return s;
  return null;
}

export function isValidBanIp(raw: string): boolean {
  return normalizeIpOrCidr(raw) !== null;
}

async function runFail2ban(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("fail2ban-client", args, {
    timeout: 12_000,
    maxBuffer: 512 * 1024,
  });
  return stdout;
}

export async function isFail2banAvailable(): Promise<boolean> {
  try {
    await runFail2ban(["ping"]);
    return true;
  } catch {
    return false;
  }
}

export async function listFail2banJails(): Promise<string[]> {
  try {
    const stdout = await runFail2ban(["status"]);
    const match = stdout.match(/Jail list:\s*(.+)/);
    if (!match) return [];
    return match[1]
      .split(",")
      .map((j) => j.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function getFail2banJailStatus(jail: string): Promise<Fail2banJailStatus> {
  if (!isValidJailName(jail)) {
    throw new Error("invalid_jail");
  }
  const stdout = await runFail2ban(["status", jail]);
  const bannedMatch = stdout.match(/Banned IP list:\s*(.*)/);
  const totalMatch = stdout.match(/Total banned:\s*(\d+)/);
  const currentMatch = stdout.match(/Currently banned:\s*(\d+)/);
  const bannedIps = bannedMatch?.[1]?.trim() ? bannedMatch[1].trim().split(/\s+/).filter(Boolean) : [];
  return {
    jail,
    totalBanned: parseInt(totalMatch?.[1] ?? "0", 10),
    currentBanned: parseInt(currentMatch?.[1] ?? "0", 10),
    bannedIps,
  };
}

async function getJailSetting(jail: string, key: string): Promise<string | null> {
  if (!isValidJailName(jail)) return null;
  try {
    const stdout = await runFail2ban(["get", jail, key]);
    const line = stdout
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean);
    return line ?? null;
  } catch {
    return null;
  }
}

export async function getFail2banJailConfig(jail: string): Promise<Fail2banJailConfig> {
  const keys = [
    "bantime",
    "findtime",
    "maxretry",
    "bantime.increment",
    "bantime.factor",
    "bantime.formula",
    "bantime.multiplier",
    "bantime.overreach",
    "bantime.rndtime",
  ] as const;
  const values = await Promise.all(keys.map((k) => getJailSetting(jail, k)));
  return {
    jail,
    bantime: values[0],
    findtime: values[1],
    maxretry: values[2],
    bantimeIncrement: values[3],
    bantimeFactor: values[4],
    bantimeFormula: values[5],
    bantimeMultiplier: values[6],
    bantimeOverreach: values[7],
    bantimeRndtime: values[8],
  };
}

export async function banIpInJail(jail: string, ip: string): Promise<void> {
  const normalized = normalizeIpOrCidr(ip);
  if (!normalized || !isValidJailName(jail)) throw new Error("invalid_ip_or_jail");
  await runFail2ban(["set", jail, "banip", normalized]);
}

export async function unbanIpInJail(jail: string, ip: string): Promise<void> {
  const normalized = normalizeIpOrCidr(ip);
  if (!normalized || !isValidJailName(jail)) throw new Error("invalid_ip_or_jail");
  await runFail2ban(["set", jail, "unbanip", normalized]);
}

export async function addIgnoreIp(jail: string, ip: string): Promise<void> {
  const normalized = normalizeIpOrCidr(ip);
  if (!normalized || !isValidJailName(jail)) throw new Error("invalid_ip_or_jail");
  await runFail2ban(["set", jail, "addignoreip", normalized]);
}

export async function removeIgnoreIp(jail: string, ip: string): Promise<void> {
  const normalized = normalizeIpOrCidr(ip);
  if (!normalized || !isValidJailName(jail)) throw new Error("invalid_ip_or_jail");
  await runFail2ban(["set", jail, "delignoreip", normalized]);
}

export async function applyIgnoreIpAllJails(ip: string, jails?: string[]): Promise<string[]> {
  const list = jails?.length ? jails : await listFail2banJails();
  const applied: string[] = [];
  for (const jail of list) {
    try {
      await addIgnoreIp(jail, ip);
      applied.push(jail);
    } catch {
      /* jail may not support ignoreip */
    }
  }
  return applied;
}

export async function removeIgnoreIpAllJails(ip: string, jails?: string[]): Promise<void> {
  const list = jails?.length ? jails : await listFail2banJails();
  for (const jail of list) {
    try {
      await removeIgnoreIp(jail, ip);
    } catch {
      /* ignore */
    }
  }
}

export async function banPermanentIp(ip: string): Promise<{ jail: string; applied: boolean }> {
  const jails = await listFail2banJails();
  const jail = jails.includes(PERMANENT_JAIL) ? PERMANENT_JAIL : jails[0] ?? PERMANENT_JAIL;
  if (!jails.length) {
    return { jail, applied: false };
  }
  await banIpInJail(jail, ip);
  return { jail, applied: true };
}

export async function unbanPermanentIp(ip: string): Promise<void> {
  const jails = await listFail2banJails();
  const targets = jails.includes(PERMANENT_JAIL) ? [PERMANENT_JAIL] : jails;
  for (const jail of targets) {
    try {
      await unbanIpInJail(jail, ip);
    } catch {
      /* may not be banned in this jail */
    }
  }
}

export function getPermanentJailName(): string {
  return PERMANENT_JAIL;
}

export function getPanelAuthJailName(): string {
  return PANEL_AUTH_JAIL;
}

export async function assessPanelLoginProtection(jails: string[]): Promise<{
  jail: string;
  jailExists: boolean;
  totalBanned: number;
  currentBanned: number;
  status: "ok" | "warn" | "missing";
  hint: string;
}> {
  const jail = PANEL_AUTH_JAIL;
  const jailExists = jails.includes(jail);
  if (!jailExists) {
    return {
      jail,
      jailExists: false,
      totalBanned: 0,
      currentBanned: 0,
      status: "missing",
      hint:
        "Kein Fail2Ban-Jail für Admin-Panel-Login gefunden. Beispiel-Konfiguration: artifacts/deploy/fail2ban/jail.d/nginx-http-auth.local.example",
    };
  }
  try {
    const st = await getFail2banJailStatus(jail);
    const status = st.totalBanned === 0 && st.currentBanned === 0 ? "warn" : "ok";
    return {
      jail,
      jailExists: true,
      totalBanned: st.totalBanned,
      currentBanned: st.currentBanned,
      status,
      hint:
        st.totalBanned === 0
          ? "Jail aktiv, aber noch keine Sperren — prüfen ob Nginx auth_request/auth_basic Fail2Ban-Filter erreicht."
          : "Panel-Login-Jail meldet Sperren.",
    };
  } catch {
    return {
      jail,
      jailExists: true,
      totalBanned: 0,
      currentBanned: 0,
      status: "warn",
      hint: "Jail vorhanden, Status konnte nicht gelesen werden.",
    };
  }
}
