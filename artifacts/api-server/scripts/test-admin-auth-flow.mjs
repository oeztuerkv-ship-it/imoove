const API_BASE = (process.env.ADMIN_AUTH_TEST_API_BASE ?? "http://127.0.0.1:3000/api").replace(/\/+$/, "");
const BOOT_USER = process.env.ADMIN_AUTH_BOOTSTRAP_USERNAME ?? "";
const BOOT_PASS = process.env.ADMIN_AUTH_BOOTSTRAP_PASSWORD ?? "";
const TEST_USER = process.env.ADMIN_AUTH_TEST_USERNAME ?? `admin-e2e-${Date.now()}`;
const TEST_PASS = process.env.ADMIN_AUTH_TEST_PASSWORD ?? "TestAdminPasswort2026!";
const NEXT_PASS = process.env.ADMIN_AUTH_TEST_PASSWORD_NEXT ?? "TestAdminPasswort2026!Neu";

if (!BOOT_USER || !BOOT_PASS) {
  throw new Error("Bitte ADMIN_AUTH_BOOTSTRAP_USERNAME und ADMIN_AUTH_BOOTSTRAP_PASSWORD setzen.");
}

async function post(path, body, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function patch(path, body, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function get(path, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

async function login(username, password) {
  const { res, data } = await post("/admin/auth/login", { username, password });
  assertOk(res.ok && data?.ok && typeof data?.token === "string", `Login fehlgeschlagen für ${username}: ${res.status} ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  // Fall A: Erstlogin/Bootstrap (authSource ist db oder env_bootstrap; beides akzeptiert je nach Vorzustand)
  const bootstrap = await login(BOOT_USER, BOOT_PASS);
  assertOk(bootstrap?.authSource === "db" || bootstrap?.authSource === "env_bootstrap", "authSource fehlt/ungültig");
  const adminToken = bootstrap.token;

  // Fall C: Neuen Admin anlegen + direkter Login
  const create = await post(
    "/admin/auth/users",
    { username: TEST_USER, password: TEST_PASS, role: "admin", isActive: true },
    adminToken,
  );
  assertOk(create.res.status === 201, `Admin-Anlage fehlgeschlagen: ${create.res.status} ${JSON.stringify(create.data)}`);
  const createdId = create.data?.user?.id;
  assertOk(typeof createdId === "string" && createdId.length > 0, "Kein user.id nach Admin-Anlage");

  await login(TEST_USER, TEST_PASS);

  // Fall B: Passwortänderung (altes Passwort danach invalid)
  const changed = await post(
    "/admin/auth/change-password",
    { currentPassword: TEST_PASS, newPassword: NEXT_PASS },
    (await login(TEST_USER, TEST_PASS)).token,
  );
  assertOk(changed.res.ok && changed.data?.ok, `Passwortwechsel fehlgeschlagen: ${changed.res.status} ${JSON.stringify(changed.data)}`);

  const loginOld = await post("/admin/auth/login", { username: TEST_USER, password: TEST_PASS });
  assertOk(loginOld.res.status === 401, "Altes Passwort funktioniert noch (sollte 401 sein)");
  await login(TEST_USER, NEXT_PASS);

  // Fall D: Deaktivierter User darf nicht einloggen
  const deactivate = await patch(`/admin/auth/users/${createdId}`, { isActive: false }, adminToken);
  assertOk(deactivate.res.ok && deactivate.data?.ok, `Deaktivierung fehlgeschlagen: ${deactivate.res.status} ${JSON.stringify(deactivate.data)}`);
  const loginInactive = await post("/admin/auth/login", { username: TEST_USER, password: NEXT_PASS });
  assertOk(loginInactive.res.status === 401, "Deaktivierter User konnte einloggen (sollte 401 sein)");

  // Zusatzcheck: Userliste erreichbar
  const list = await get("/admin/auth/users", adminToken);
  assertOk(list.res.ok && Array.isArray(list.data?.users), "Admin-Userliste nicht lesbar");

  console.log("OK: Admin-Auth-Flows A/B/C/D erfolgreich.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
