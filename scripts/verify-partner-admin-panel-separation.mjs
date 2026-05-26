#!/usr/bin/env node
/**
 * Regression: Partner-Panel darf nicht mit Admin-/partners-Pfad verwechselt werden.
 */
import {
  isAdminOperatorHost,
  isAdminSpaPath,
  isWrongPortalLocation,
} from "../artifacts/partner-panel/src/lib/panelHistoryGuard.js";

let failed = 0;
function ok(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed += 1;
  }
}

ok(isAdminOperatorHost("admin.onroda.de"), "admin host");
ok(!isAdminOperatorHost("panel.onroda.de"), "panel host");
ok(isAdminSpaPath("/partners/"), "partners path");
ok(isAdminSpaPath("/partners/login"), "partners subpath");
ok(!isAdminSpaPath("/"), "panel root");

const mockLoc = (hostname, pathname) => ({ hostname, pathname });
ok(isWrongPortalLocation(mockLoc("admin.onroda.de", "/partners/")), "admin+partners wrong");
ok(!isWrongPortalLocation(mockLoc("panel.onroda.de", "/")), "panel root ok");
ok(!isWrongPortalLocation(mockLoc("panel.onroda.de", "/partners/")), "panel host /partners (Nginx → /, kein Admin)");

if (failed > 0) {
  console.error(`verify-partner-admin-panel-separation: ${failed} Fehler`);
  process.exit(1);
}
console.log("verify-partner-admin-panel-separation: OK");
