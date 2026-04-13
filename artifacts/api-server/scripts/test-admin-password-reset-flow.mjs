const API_BASE = (process.env.ADMIN_AUTH_TEST_API_BASE ?? "http://127.0.0.1:3000/api").replace(/\/+$/, "");
const USERNAME = process.env.ADMIN_AUTH_RESET_TEST_USERNAME ?? "Kardelen2026";
const OLD_PASSWORD = process.env.ADMIN_AUTH_RESET_TEST_OLD_PASSWORD ?? "";
const NEW_PASSWORD = process.env.ADMIN_AUTH_RESET_TEST_NEW_PASSWORD ?? "Kardelen2026-Reset-Test-1905!";
const UNKNOWN_IDENTITY = process.env.ADMIN_AUTH_RESET_TEST_UNKNOWN_IDENTITY ?? `unknown-${Date.now()}@example.com`;

if (!OLD_PASSWORD) {
  throw new Error("ADMIN_AUTH_RESET_TEST_OLD_PASSWORD ist erforderlich.");
}

async function request(path, { method = "GET", body, token } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function login(password) {
  return request("/admin/auth/login", {
    method: "POST",
    body: { username: USERNAME, password },
  });
}

async function main() {
  const steps = [];

  const seedLogin = await login(OLD_PASSWORD);
  steps.push({ case: "seed", label: "ensure bootstrap user exists in DB", ...seedLogin });
  assert(seedLogin.status === 200, "Seed login failed");

  const adminToken = seedLogin.data?.token;
  assert(typeof adminToken === "string", "Seed login missing token");

  const case1 = await request("/admin/auth/password-reset/request", {
    method: "POST",
    body: { identity: USERNAME },
  });
  steps.push({ case: 1, label: "request existing", ...case1 });
  assert(case1.status === 200 && case1.data?.ok, "Case 1 failed");

  const case2 = await request("/admin/auth/password-reset/request", {
    method: "POST",
    body: { identity: UNKNOWN_IDENTITY },
  });
  steps.push({ case: 2, label: "request unknown", ...case2 });
  assert(case2.status === 200 && case2.data?.ok, "Case 2 failed");
  assert(case1.data?.message === case2.data?.message, "Case 2 failed: response message differs (enumeration risk)");
  const keys1 = Object.keys(case1.data ?? {}).sort().join(",");
  const keys2 = Object.keys(case2.data ?? {}).sort().join(",");
  assert(keys1 === keys2, `Case 2 failed: response JSON keys differ (enumeration risk): ${keys1} vs ${keys2}`);
  if (process.env.NODE_ENV === "production") {
    assert(
      case1.data?.debugResetToken === undefined && case2.data?.debugResetToken === undefined,
      "Production must not expose debugResetToken on password-reset/request",
    );
    assert(
      case1.data?.debugResetExpiresAt === undefined && case2.data?.debugResetExpiresAt === undefined,
      "Production must not expose debugResetExpiresAt on password-reset/request",
    );
  }

  const issueValid = await request("/admin/auth/password-reset/issue-link", {
    method: "POST",
    body: { identity: USERNAME },
    token: adminToken,
  });
  const token = issueValid.data?.resetToken;
  assert(issueValid.status === 200 && typeof token === "string" && token.length > 20, "Case 3 setup failed: issue-link failed");

  const case3 = await request("/admin/auth/password-reset/confirm", {
    method: "POST",
    body: { token, newPassword: NEW_PASSWORD },
  });
  steps.push({ case: 3, label: "confirm valid token", ...case3 });
  assert(case3.status === 200 && case3.data?.ok, "Case 3 failed");

  const case4 = await login(NEW_PASSWORD);
  steps.push({ case: 4, label: "login new password", ...case4 });
  assert(case4.status === 200, "Case 4 failed");

  const case5 = await login(OLD_PASSWORD);
  steps.push({ case: 5, label: "login old password should fail", ...case5 });
  assert(case5.status === 401, "Case 5 failed");

  const case6 = await request("/admin/auth/password-reset/confirm", {
    method: "POST",
    body: { token, newPassword: `${NEW_PASSWORD}-twice` },
  });
  steps.push({ case: 6, label: "reuse token should fail", ...case6 });
  assert(case6.status === 400, "Case 6 failed");

  const expReq = await request("/admin/auth/password-reset/issue-link", {
    method: "POST",
    body: { identity: USERNAME, expiresInSeconds: 1 },
    token: adminToken,
  });
  const expToken = expReq.data?.resetToken;
  assert(expReq.status === 200 && typeof expToken === "string", "Case 7 setup failed");
  await new Promise((r) => setTimeout(r, 1200));
  const case7 = await request("/admin/auth/password-reset/confirm", {
    method: "POST",
    body: { token: expToken, newPassword: `${NEW_PASSWORD}-expired` },
  });
  steps.push({ case: 7, label: "expired token should fail", ...case7 });
  assert(case7.status === 400, "Case 7 failed");

  const case8 = await request("/admin/auth/password-reset/confirm", {
    method: "POST",
    body: { token: "bad-token", newPassword: "short" },
  });
  steps.push({ case: 8, label: "invalid payload/misuse", ...case8 });
  assert(case8.status === 400, "Case 8 failed");

  const restoreReq = await request("/admin/auth/password-reset/issue-link", {
    method: "POST",
    body: { identity: USERNAME },
    token: adminToken,
  });
  const restoreToken = restoreReq.data?.resetToken;
  if (typeof restoreToken === "string" && restoreToken.length > 20) {
    await request("/admin/auth/password-reset/confirm", {
      method: "POST",
      body: { token: restoreToken, newPassword: OLD_PASSWORD },
    });
  }

  console.log(JSON.stringify({ ok: true, steps }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error) }, null, 2));
  process.exit(1);
});
