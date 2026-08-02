import {
  isPartnerMonthlyReportCronWindow,
  runPartnerMonthlyReport,
} from "../db/partnerMonthlyReportData.js";
import { logger } from "../lib/logger.js";

/**
 * Tick alle ~15 Min aus index.ts.
 * Versand nur im Fenster 1. des Monats, 08:00–08:59 Europe/Berlin (Idempotenz pro Firma+Vormonat).
 */
export async function runPartnerMonthlyReportCronTick(now = new Date()): Promise<void> {
  if (!isPartnerMonthlyReportCronWindow(now)) return;

  logger.info({ at: now.toISOString() }, "[Cron] partnerMonthlyReport window — starting run");
  const out = await runPartnerMonthlyReport({
    dryRun: false,
    force: false,
    actorLabel: "cron:partner_monthly_report",
    now,
  });
  if (!out.ok) {
    logger.error({ error: out.error }, "[Cron] partnerMonthlyReport failed");
    return;
  }
  logger.info(
    {
      periodYm: out.periodYm,
      sentCount: out.sentCount,
      skippedCount: out.skippedCount,
      errorCount: out.errorCount,
    },
    "[Cron] partnerMonthlyReport finished",
  );
}
