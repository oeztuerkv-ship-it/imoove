import { getApiBaseUrl } from "@/utils/apiBase";
import { resolveCustomerBearerToken } from "@/utils/customerSessionToken";

export async function deleteCustomerAccount(
  authToken?: string | null,
): Promise<
  | { ok: true; alreadyDeleted?: boolean; message?: string }
  | { ok: false; error: string; message?: string }
> {
  const token = (await resolveCustomerBearerToken(authToken)) ?? "";
  const apiBase = getApiBaseUrl()?.trim().replace(/\/+$/, "");
  if (!token || !apiBase) {
    return { ok: false, error: "api_not_configured" };
  }
  const res = await fetch(`${apiBase}/customer/v1/account`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    data = {};
  }
  if (!res.ok || data.ok === false) {
    return {
      ok: false,
      error: typeof data.error === "string" ? data.error : "delete_failed",
      message: typeof data.message === "string" ? data.message : undefined,
    };
  }
  return {
    ok: true,
    alreadyDeleted: data.alreadyDeleted === true,
    message: typeof data.message === "string" ? data.message : undefined,
  };
}
