import { getApiBaseUrl } from "@/utils/apiBase";

const API_BASE = getApiBaseUrl();

export type CustomerRidePinResponse = {
  ok: true;
  pin: string;
  autoAssigned: boolean;
  setAt: string;
};

async function authHeaders(sessionToken: string): Promise<Record<string, string>> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${sessionToken.trim()}`,
  };
}

export async function fetchCustomerRidePin(sessionToken: string): Promise<CustomerRidePinResponse> {
  const res = await fetch(`${API_BASE}/customer/v1/profile/ride-pin`, {
    method: "GET",
    headers: await authHeaders(sessionToken),
  });
  const body = (await res.json().catch(() => null)) as
    | CustomerRidePinResponse
    | { ok?: false; error?: string; message?: string }
    | null;
  if (!res.ok || !body || body.ok !== true || typeof (body as CustomerRidePinResponse).pin !== "string") {
    const msg =
      body && "message" in body && typeof body.message === "string"
        ? body.message
        : body && "error" in body && typeof body.error === "string"
          ? body.error
          : "ride_pin_load_failed";
    throw new Error(msg);
  }
  return body as CustomerRidePinResponse;
}

export async function updateCustomerRidePin(
  sessionToken: string,
  pin: string,
): Promise<{ ok: true; pin: string; setAt: string }> {
  const res = await fetch(`${API_BASE}/customer/v1/profile/ride-pin`, {
    method: "PATCH",
    headers: await authHeaders(sessionToken),
    body: JSON.stringify({ pin }),
  });
  const body = (await res.json().catch(() => null)) as
    | { ok?: true; pin?: string; setAt?: string; error?: string; message?: string }
    | null;
  if (!res.ok || !body?.ok || typeof body.pin !== "string") {
    throw new Error(
      typeof body?.message === "string"
        ? body.message
        : typeof body?.error === "string"
          ? body.error
          : "ride_pin_update_failed",
    );
  }
  return { ok: true, pin: body.pin, setAt: typeof body.setAt === "string" ? body.setAt : "" };
}
