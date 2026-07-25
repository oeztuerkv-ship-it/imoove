import { randomUUID } from "node:crypto";
import { findCompanyById, insertAdminCompany, updateAdminCompany } from "../db/adminData";
import { setDriverVehicleAssignment } from "../db/fleetAssignmentsData";
import {
  findFleetDriverInCompany,
  fleetDriverEmailConflictBody,
  insertFleetDriver,
  isFleetDriverEmailConflictError,
} from "../db/fleetDriversData";
import {
  adminPatchFleetVehicleFields,
  findFleetVehicleInCompany,
  insertFleetVehicle,
} from "../db/fleetVehiclesData";
import { insertPanelAuditLog } from "../db/panelAuditData";
import {
  findPanelUserInCompany,
  insertPanelUser,
  panelUsernameTaken,
} from "../db/panelUsersData";
import { isPanelRoleString } from "./panelPermissions";
import type { PanelRole } from "./panelJwt";
import { hashPassword } from "./password";
import { sendFleetDriverWelcomeEmail } from "./fleetDriverWelcomeMail";
import { sendPanelUserWelcomeEmail } from "./panelUserWelcomeMail";
import { generateTemporaryPassword } from "./tempPassword";
import { logger } from "./logger";

function clip(s: string, max: number): string {
  return s.trim().slice(0, max);
}

function splitPersonName(raw: string): { firstName: string; lastName: string } {
  const t = raw.trim().replace(/\s+/g, " ");
  if (!t) return { firstName: "", lastName: "" };
  const i = t.indexOf(" ");
  if (i < 0) return { firstName: t, lastName: "-" };
  return { firstName: t.slice(0, i), lastName: t.slice(i + 1).trim() || "-" };
}

async function allocateUniquePanelUsername(preferred: string): Promise<string> {
  const base = preferred
    .trim()
    .toLowerCase()
    .replace(/@.*$/, "")
    .replace(/[^a-z0-9._-]+/g, "")
    .slice(0, 40);
  const root = base || `user${Date.now().toString(36)}`;
  let candidate = root;
  for (let n = 0; n < 40; n++) {
    if (!(await panelUsernameTaken(candidate))) return candidate;
    candidate = `${root}${n + 2}`.slice(0, 48);
  }
  return `${root}${randomUUID().slice(0, 8)}`;
}

export type FleetProvisionVehicleInput = {
  mode: "existing" | "create";
  vehicleId?: string;
  licensePlate?: string;
  insuranceNumber?: string;
  nextInspectionDate?: string | null;
  konzessionNumber?: string;
};

export type FleetProvisionDriverInput = {
  mode: "existing" | "create";
  driverId?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  pScheinNumber?: string;
  email?: string;
  phone?: string;
  password?: string;
  /** Default true when creating. */
  sendWelcomeEmail?: boolean;
};

export type FleetProvisionRowInput = {
  vehicle?: FleetProvisionVehicleInput | null;
  driver?: FleetProvisionDriverInput | null;
};

export type FleetProvisionBody = {
  company: {
    mode: "existing" | "create";
    companyId?: string;
    name?: string;
    concessionNumber?: string;
    phone?: string;
    contactName?: string;
  };
  notes?: string;
  /** Nur anlegen, wenn username und/oder email explizit gesetzt. */
  portalAccess?: {
    username?: string;
    email?: string;
    password?: string;
    role?: string;
    sendWelcomeEmail?: boolean;
  } | null;
  owner?: {
    mode: "existing" | "create_name" | "create_user" | "none";
    panelUserId?: string;
    ownerName?: string;
    username?: string;
    email?: string;
    password?: string;
    sendWelcomeEmail?: boolean;
  } | null;
  rows?: FleetProvisionRowInput[];
};

export type FleetProvisionRowResult = {
  index: number;
  ok: boolean;
  error?: string;
  errorMeta?: Record<string, unknown>;
  vehicleId?: string;
  vehicleCreated?: boolean;
  driverId?: string;
  driverCreated?: boolean;
  assigned?: boolean;
  driverWelcomeEmail?: { sent: boolean; reason?: string };
  initialPassword?: string;
};

export type FleetProvisionPortalUserResult = {
  id: string;
  username: string;
  email: string;
  role: string;
  initialPassword?: string;
  welcomeEmail?: { sent: boolean; reason?: string };
};

export type FleetProvisionResult =
  | {
      ok: true;
      companyId: string;
      companyCreated: boolean;
      portalUser?: FleetProvisionPortalUserResult;
      owner?: { panelUserId?: string; ownerName?: string };
      rows: FleetProvisionRowResult[];
    }
  | { ok: false; error: string; hint?: string; status: number };

function portalAccessRequested(p: FleetProvisionBody["portalAccess"]): boolean {
  if (!p || typeof p !== "object") return false;
  const u = typeof p.username === "string" ? p.username.trim() : "";
  const e = typeof p.email === "string" ? p.email.trim() : "";
  return Boolean(u || e);
}

function ownerRequested(o: FleetProvisionBody["owner"]): boolean {
  if (!o || typeof o !== "object") return false;
  const mode = o.mode ?? "none";
  if (mode === "none") return false;
  if (mode === "existing") return Boolean(String(o.panelUserId ?? "").trim());
  if (mode === "create_name") return Boolean(String(o.ownerName ?? "").trim());
  if (mode === "create_user") {
    return Boolean(String(o.email ?? "").trim() || String(o.username ?? "").trim());
  }
  return false;
}

async function createPanelAccess(opts: {
  companyId: string;
  companyName: string;
  usernameHint: string;
  email: string;
  password?: string;
  role: PanelRole;
  sendWelcomeEmail: boolean;
  auditSource: string;
}): Promise<
  | {
      ok: true;
      id: string;
      username: string;
      email: string;
      role: string;
      initialPassword?: string;
      welcomeEmail?: { sent: boolean; reason?: string };
    }
  | { ok: false; error: string; status: number }
> {
  let username = clip(opts.usernameHint, 64);
  const email = clip(opts.email, 254);
  if (!email || !email.includes("@")) {
    return { ok: false, error: "portal_email_invalid", status: 400 };
  }
  if (!username) {
    username = await allocateUniquePanelUsername(email);
  } else if (await panelUsernameTaken(username.toLowerCase())) {
    return { ok: false, error: "username_taken", status: 409 };
  }
  const generated = opts.password?.trim() ? "" : generateTemporaryPassword();
  const password = opts.password?.trim() || generated;
  if (!password || password.length < 10) {
    return { ok: false, error: "password_invalid", status: 400 };
  }
  const hash = await hashPassword(password);
  const created = await insertPanelUser({
    companyId: opts.companyId,
    username,
    email,
    role: opts.role,
    passwordHash: hash,
    mustChangePassword: true,
  });
  if (!created) {
    return { ok: false, error: "username_taken", status: 409 };
  }
  let welcomeEmail: { sent: boolean; reason?: string } | undefined;
  if (opts.sendWelcomeEmail) {
    const mail = await sendPanelUserWelcomeEmail({
      to: email,
      companyName: opts.companyName,
      username,
      initialPassword: password,
    });
    welcomeEmail = mail.ok ? { sent: true } : { sent: false, reason: mail.reason };
  }
  await insertPanelAuditLog({
    id: randomUUID(),
    companyId: opts.companyId,
    actorPanelUserId: null,
    action: "admin.panel_user.created",
    subjectType: "panel_user",
    subjectId: created.id,
    meta: { username, role: opts.role, source: opts.auditSource, welcomeEmail },
  });
  return {
    ok: true,
    id: created.id,
    username,
    email,
    role: opts.role,
    ...(generated ? { initialPassword: generated } : {}),
    ...(welcomeEmail ? { welcomeEmail } : {}),
  };
}

/**
 * Admin-Massen-/Nachzug-Erfassung: Unternehmen (± Portal/Owner) + Zeilen Fahrzeug und/oder Fahrer.
 * Zeilen werden sequentiell verarbeitet (Partial Success). Portal nur bei expliziten Feldern.
 */
export async function runAdminFleetProvision(body: FleetProvisionBody): Promise<FleetProvisionResult> {
  const companyIn = body.company;
  if (!companyIn || (companyIn.mode !== "existing" && companyIn.mode !== "create")) {
    return { ok: false, error: "company_required", status: 400 };
  }

  let companyId = "";
  let companyCreated = false;
  let companyName = "";
  let companyConcession = "";

  if (companyIn.mode === "existing") {
    companyId = String(companyIn.companyId ?? "").trim();
    if (!companyId) return { ok: false, error: "company_id_required", status: 400 };
    const co = await findCompanyById(companyId);
    if (!co) return { ok: false, error: "company_not_found", status: 404 };
    if (co.company_kind !== "taxi") return { ok: false, error: "not_taxi_company", status: 400 };
    if (!co.is_active) return { ok: false, error: "company_inactive", status: 400 };
    companyName = co.name ?? companyId;
    companyConcession = (co.concession_number ?? "").trim();
  } else {
    const name = clip(String(companyIn.name ?? ""), 200);
    if (!name) return { ok: false, error: "company_name_required", status: 400 };
    const created = await insertAdminCompany({
      name,
      company_kind: "taxi",
      phone: clip(String(companyIn.phone ?? ""), 64),
      contact_name: clip(String(companyIn.contactName ?? ""), 120),
      concession_number: clip(String(companyIn.concessionNumber ?? ""), 64),
      owner_name: clip(String(companyIn.contactName ?? ""), 120),
      panel_access_enabled: true,
      contract_status: "active",
    });
    if ("error" in created) {
      return {
        ok: false,
        error: created.error,
        hint: "hint" in created ? created.hint : undefined,
        status: created.error.startsWith("db_") ? 503 : 400,
      };
    }
    companyId = created.id;
    companyCreated = true;
    companyName = created.name;
    companyConcession = (created.concession_number ?? "").trim();
  }

  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (notes) {
    await updateAdminCompany(companyId, { business_notes: notes.slice(0, 4000) });
  }

  let portalUser: FleetProvisionPortalUserResult | undefined;
  if (portalAccessRequested(body.portalAccess)) {
    const p = body.portalAccess!;
    const roleRaw = typeof p.role === "string" && p.role.trim() ? p.role.trim() : "owner";
    if (!isPanelRoleString(roleRaw)) {
      return { ok: false, error: "invalid_role", status: 400, hint: `companyId=${companyId}` };
    }
    const created = await createPanelAccess({
      companyId,
      companyName,
      usernameHint: String(p.username ?? ""),
      email: String(p.email ?? ""),
      password: typeof p.password === "string" ? p.password : undefined,
      role: roleRaw as PanelRole,
      sendWelcomeEmail: p.sendWelcomeEmail === true,
      auditSource: "admin_fleet_provision_portal",
    });
    if (!created.ok) {
      return { ok: false, error: created.error, status: created.status, hint: `companyId=${companyId}` };
    }
    portalUser = {
      id: created.id,
      username: created.username,
      email: created.email,
      role: created.role,
      ...(created.initialPassword ? { initialPassword: created.initialPassword } : {}),
      ...(created.welcomeEmail ? { welcomeEmail: created.welcomeEmail } : {}),
    };
  }

  let ownerOut: { panelUserId?: string; ownerName?: string } | undefined;
  if (ownerRequested(body.owner)) {
    const o = body.owner!;
    const mode = o.mode;
    if (mode === "existing") {
      const pid = String(o.panelUserId ?? "").trim();
      const pu = await findPanelUserInCompany(pid, companyId);
      if (!pu) return { ok: false, error: "owner_panel_user_not_found", status: 404, hint: `companyId=${companyId}` };
      ownerOut = { panelUserId: pu.id };
      if (!String((await findCompanyById(companyId))?.owner_name ?? "").trim()) {
        await updateAdminCompany(companyId, { owner_name: pu.username });
        ownerOut.ownerName = pu.username;
      }
    } else if (mode === "create_name") {
      const ownerName = clip(String(o.ownerName ?? ""), 120);
      await updateAdminCompany(companyId, { owner_name: ownerName });
      ownerOut = { ownerName };
    } else if (mode === "create_user") {
      const created = await createPanelAccess({
        companyId,
        companyName,
        usernameHint: String(o.username ?? ""),
        email: String(o.email ?? ""),
        password: typeof o.password === "string" ? o.password : undefined,
        role: "owner",
        sendWelcomeEmail: o.sendWelcomeEmail === true,
        auditSource: "admin_fleet_provision_owner",
      });
      if (!created.ok) {
        return { ok: false, error: created.error, status: created.status, hint: `companyId=${companyId}` };
      }
      const ownerName = clip(String(o.ownerName ?? created.username), 120);
      await updateAdminCompany(companyId, { owner_name: ownerName });
      ownerOut = { panelUserId: created.id, ownerName };
      if (!portalUser) {
        portalUser = {
          id: created.id,
          username: created.username,
          email: created.email,
          role: created.role,
          ...(created.initialPassword ? { initialPassword: created.initialPassword } : {}),
          ...(created.welcomeEmail ? { welcomeEmail: created.welcomeEmail } : {}),
        };
      }
    }
  }

  const rowsIn = Array.isArray(body.rows) ? body.rows : [];
  const rowResults: FleetProvisionRowResult[] = [];

  for (let index = 0; index < rowsIn.length; index++) {
    const row = rowsIn[index] ?? {};
    const result: FleetProvisionRowResult = { index, ok: true };
    try {
      const hasVehicle = row.vehicle && row.vehicle.mode;
      const hasDriver = row.driver && row.driver.mode;
      if (!hasVehicle && !hasDriver) {
        result.ok = false;
        result.error = "row_empty";
        rowResults.push(result);
        continue;
      }

      let vehicleId = "";
      let vehicleCreated = false;
      if (hasVehicle && row.vehicle) {
        const v = row.vehicle;
        if (v.mode === "existing") {
          vehicleId = String(v.vehicleId ?? "").trim();
          const found = await findFleetVehicleInCompany(vehicleId, companyId);
          if (!found) {
            result.ok = false;
            result.error = "vehicle_not_found";
            rowResults.push(result);
            continue;
          }
        } else {
          const plate = clip(String(v.licensePlate ?? ""), 32);
          if (!plate) {
            result.ok = false;
            result.error = "license_plate_required";
            rowResults.push(result);
            continue;
          }
          const kz =
            clip(String(v.konzessionNumber ?? ""), 64) ||
            companyConcession ||
            plate;
          const ins = await insertFleetVehicle({
            companyId,
            licensePlate: plate,
            konzessionNumber: kz,
            vehicleType: "sedan",
            vehicleLegalType: "taxi",
            vehicleClass: "standard",
            nextInspectionDate:
              v.nextInspectionDate === null
                ? null
                : typeof v.nextInspectionDate === "string"
                  ? v.nextInspectionDate
                  : null,
            approvalStatus: "approved",
          });
          if (!ins.ok) {
            result.ok = false;
            result.error = ins.error;
            rowResults.push(result);
            continue;
          }
          vehicleId = ins.id;
          vehicleCreated = true;
          const insurance = clip(String(v.insuranceNumber ?? ""), 120);
          if (insurance) {
            await adminPatchFleetVehicleFields(companyId, vehicleId, {
              adminInternalNote: `Versicherung: ${insurance}`,
            });
          }
          await insertPanelAuditLog({
            id: randomUUID(),
            companyId,
            actorPanelUserId: null,
            action: "admin.fleet_vehicle.created",
            subjectType: "fleet_vehicle",
            subjectId: vehicleId,
            meta: { licensePlate: plate, source: "admin_fleet_provision" },
          });
        }
        result.vehicleId = vehicleId;
        result.vehicleCreated = vehicleCreated;
      }

      let driverId = "";
      let driverCreated = false;
      if (hasDriver && row.driver) {
        const d = row.driver;
        if (d.mode === "existing") {
          driverId = String(d.driverId ?? "").trim();
          const found = await findFleetDriverInCompany(driverId, companyId);
          if (!found) {
            result.ok = false;
            result.error = "driver_not_found";
            rowResults.push(result);
            continue;
          }
        } else {
          const email = clip(String(d.email ?? ""), 254);
          if (!email || !email.includes("@")) {
            result.ok = false;
            result.error = "driver_email_required";
            rowResults.push(result);
            continue;
          }
          let firstName = clip(String(d.firstName ?? ""), 80);
          let lastName = clip(String(d.lastName ?? ""), 80);
          if (!firstName && !lastName && d.name) {
            const sp = splitPersonName(String(d.name));
            firstName = sp.firstName;
            lastName = sp.lastName;
          }
          if (!firstName) firstName = "Fahrer";
          if (!lastName) lastName = "-";
          const phone = clip(String(d.phone ?? ""), 40) || "-";
          const generated = d.password?.trim() ? "" : generateTemporaryPassword();
          const initialPassword = d.password?.trim() || generated;
          if (!initialPassword || initialPassword.length < 10) {
            result.ok = false;
            result.error = "driver_password_invalid";
            rowResults.push(result);
            continue;
          }
          const hash = await hashPassword(initialPassword);
          const ins = await insertFleetDriver({
            companyId,
            email,
            firstName,
            lastName,
            phone,
            passwordHash: hash,
            mustChangePassword: true,
            pScheinNumber: clip(String(d.pScheinNumber ?? ""), 64) || undefined,
            approvalStatus: "approved",
            vehicleLegalType: "taxi",
            vehicleClass: "standard",
          });
          if (!ins.ok) {
            result.ok = false;
            result.error = ins.error;
            if (isFleetDriverEmailConflictError(ins.error)) {
              result.errorMeta = fleetDriverEmailConflictBody(ins.error, {
                existingCompanyId: ins.existingCompanyId,
                existingCompanyName: ins.existingCompanyName,
                existingDriverId: ins.existingDriverId,
              });
            }
            rowResults.push(result);
            continue;
          }
          driverId = ins.id;
          driverCreated = true;
          if (generated) result.initialPassword = generated;
          await insertPanelAuditLog({
            id: randomUUID(),
            companyId,
            actorPanelUserId: null,
            action: "admin.fleet_driver.created",
            subjectType: "fleet_driver",
            subjectId: driverId,
            meta: { email: email.toLowerCase(), source: "admin_fleet_provision" },
          });
          const sendMail = d.sendWelcomeEmail !== false;
          if (sendMail) {
            const mail = await sendFleetDriverWelcomeEmail({
              to: email,
              companyName,
              driverDisplayName: `${firstName} ${lastName}`.trim(),
              emailLogin: email,
              initialPassword,
            });
            result.driverWelcomeEmail = mail.ok
              ? { sent: true }
              : { sent: false, reason: mail.reason };
          } else {
            result.driverWelcomeEmail = { sent: false, reason: "not_requested" };
          }
        }
        result.driverId = driverId;
        result.driverCreated = driverCreated;
      }

      if (vehicleId && driverId) {
        const asg = await setDriverVehicleAssignment({ companyId, driverId, vehicleId });
        if (!asg.ok) {
          result.ok = false;
          result.error = asg.error;
          result.assigned = false;
        } else {
          result.assigned = true;
          await insertPanelAuditLog({
            id: randomUUID(),
            companyId,
            actorPanelUserId: null,
            action: "admin.fleet_assignment.set",
            subjectType: "fleet_assignment",
            subjectId: `${driverId}:${vehicleId}`,
            meta: { driverId, vehicleId, source: "admin_fleet_provision" },
          });
        }
      }

      rowResults.push(result);
    } catch (err) {
      logger.warn({ err, index, companyId }, "admin fleet provision row failed");
      result.ok = false;
      result.error = "row_failed";
      rowResults.push(result);
    }
  }

  await insertPanelAuditLog({
    id: randomUUID(),
    companyId,
    actorPanelUserId: null,
    action: "admin.fleet_provision.completed",
    subjectType: "company",
    subjectId: companyId,
    meta: {
      companyCreated,
      rowCount: rowResults.length,
      rowOk: rowResults.filter((r) => r.ok).length,
      portalCreated: Boolean(portalUser),
    },
  });

  return {
    ok: true,
    companyId,
    companyCreated,
    ...(portalUser ? { portalUser } : {}),
    ...(ownerOut ? { owner: ownerOut } : {}),
    rows: rowResults,
  };
}
