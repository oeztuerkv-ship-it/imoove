import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBaseUrl } from "@/utils/apiBase";

const DRIVER_SESSION_KEY = "@Onroda_driver_session";
const API_BASE = getApiBaseUrl();

export type FleetPrivateReminder = {
  id: string;
  companyId: string;
  createdByPanelUserId: string | null;
  fleetDriverId: string | null;
  scheduledAt: string;
  fromFull: string;
  toFull: string;
  note: string;
  /** null/fehlend = offen. */
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function isPrivateReminderOpen(r: FleetPrivateReminder): boolean {
  return !r.completedAt;
}

function normalizeReminder(raw: FleetPrivateReminder): FleetPrivateReminder {
  return {
    ...raw,
    completedAt: typeof raw.completedAt === "string" && raw.completedAt.trim() ? raw.completedAt : null,
  };
}

async function fleetAuthHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const raw = await AsyncStorage.getItem(DRIVER_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { authToken?: string };
      const tok = typeof parsed.authToken === "string" ? parsed.authToken.trim() : "";
      if (tok) h.Authorization = `Bearer ${tok}`;
    }
  } catch {
    /* ignore */
  }
  return h;
}

export async function listFleetPrivateReminders(): Promise<
  { ok: true; reminders: FleetPrivateReminder[] } | { ok: false; error: string }
> {
  try {
    const res = await fetch(`${API_BASE}/fleet-driver/v1/private-reminders`, {
      headers: await fleetAuthHeaders(),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      reminders?: FleetPrivateReminder[];
    };
    if (!res.ok || !data?.ok) {
      return { ok: false, error: typeof data?.error === "string" ? data.error : "load_failed" };
    }
    const reminders = Array.isArray(data.reminders) ? data.reminders.map(normalizeReminder) : [];
    return { ok: true, reminders };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export async function createFleetPrivateReminder(input: {
  scheduledAt: string;
  fromFull: string;
  toFull: string;
  note: string;
}): Promise<{ ok: true; reminder: FleetPrivateReminder } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_BASE}/fleet-driver/v1/private-reminders`, {
      method: "POST",
      headers: await fleetAuthHeaders(),
      body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      reminder?: FleetPrivateReminder;
    };
    if (!res.ok || !data?.ok || !data.reminder) {
      return { ok: false, error: typeof data?.error === "string" ? data.error : "create_failed" };
    }
    return { ok: true, reminder: normalizeReminder(data.reminder) };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export async function updateFleetPrivateReminder(
  id: string,
  input: {
    scheduledAt?: string;
    fromFull?: string;
    toFull?: string;
    note?: string;
    /** true = erledigt; false = wieder öffnen; fehlend = unverändert. */
    completed?: boolean;
  },
): Promise<{ ok: true; reminder: FleetPrivateReminder } | { ok: false; error: string }> {
  try {
    const body: Record<string, unknown> = {};
    if (typeof input.scheduledAt === "string") body.scheduledAt = input.scheduledAt;
    if (typeof input.fromFull === "string") body.fromFull = input.fromFull;
    if (typeof input.toFull === "string") body.toFull = input.toFull;
    if (typeof input.note === "string") body.note = input.note;
    if (input.completed === true) body.completed = true;
    else if (input.completed === false) body.completed = false;

    const res = await fetch(
      `${API_BASE}/fleet-driver/v1/private-reminders/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: await fleetAuthHeaders(),
        body: JSON.stringify(body),
      },
    );
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      reminder?: FleetPrivateReminder;
    };
    if (!res.ok || !data?.ok || !data.reminder) {
      return { ok: false, error: typeof data?.error === "string" ? data.error : "update_failed" };
    }
    return { ok: true, reminder: normalizeReminder(data.reminder) };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export async function deleteFleetPrivateReminder(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(
      `${API_BASE}/fleet-driver/v1/private-reminders/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: await fleetAuthHeaders(),
      },
    );
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data?.ok) {
      return { ok: false, error: typeof data?.error === "string" ? data.error : "delete_failed" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "network_error" };
  }
}
