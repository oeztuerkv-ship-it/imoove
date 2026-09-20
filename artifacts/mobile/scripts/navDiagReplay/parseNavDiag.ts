/**
 * NavDiag-Parser (Diagnose-Werkzeug, NICHT Teil des App-Bundles).
 *
 * Eingabe: Transcript aus dem In-App-Overlay (`getNavDiagTranscript`) oder Zeilen aus Metro/logcat:
 *   HH:MM:SS.mmm kind {json}            (Overlay/Ring-Buffer, UTC-Uhrzeit)
 *   (prev) HH:MM:SS.mmm kind {json}     (Zeile aus vorheriger App-Session)
 *   ... [NavDiag] kind {json}           (Zeitstempel muss davor in der Zeile stehen)
 *   [NavDiag] transcript platform=ios lines=N at=ISO   (Kopfzeile)
 *
 * Zeitachse: Uhrzeit → ms, Tageswechsel (Rücksprung > 12 h) wird aufgelöst. Ohne Zeitstempel → Zeile übersprungen.
 * Keine Node-APIs — reine Funktion, deterministisch.
 */

export type NavDiagEvent = {
  /** Laufende Nummer der akzeptierten Events (0-basiert). */
  idx: number;
  /** Zeilennummer in der Eingabe (1-basiert). */
  line: number;
  /** Zeit in ms auf einer durchgehenden Achse (Tageswechsel aufgelöst). */
  tMs: number;
  /** Uhrzeit-Text der Zeile (HH:MM:SS.mmm). */
  clock: string;
  kind: string;
  data: Record<string, unknown>;
  /** Zeile stammt aus der vorherigen App-Session (`(prev)`). */
  prevSession: boolean;
};

export type NavDiagSkipped = { line: number; reason: string; text: string };

export type NavDiagParseResult = {
  events: NavDiagEvent[];
  header: { platform: string | null; at: string | null; lines: number | null } | null;
  skipped: NavDiagSkipped[];
  totalLines: number;
};

const DAY_MS = 86_400_000;
const CLOCK_RE = /(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/;

function clockToMs(m: RegExpExecArray): number {
  const ms = m[4] ? Number((m[4] + "00").slice(0, 3)) : 0;
  return ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + ms;
}

export function parseNavDiagLog(text: string): NavDiagParseResult {
  const rawLines = text.split(/\r?\n/);
  const events: NavDiagEvent[] = [];
  const skipped: NavDiagSkipped[] = [];
  let header: NavDiagParseResult["header"] = null;

  let dayOffset = 0;
  let lastT: number | null = null;
  let lastWasPrev: boolean | null = null;

  for (let i = 0; i < rawLines.length; i++) {
    const lineNo = i + 1;
    const line = rawLines[i]!.trim();
    if (!line) continue;

    const hdr = /\[NavDiag\]\s+transcript\b(.*)$/.exec(line);
    if (hdr) {
      const rest = hdr[1] ?? "";
      header = {
        platform: /platform=(\S+)/.exec(rest)?.[1] ?? null,
        at: /\bat=(\S+)/.exec(rest)?.[1] ?? null,
        lines: /lines=(\d+)/.exec(rest) ? Number(/lines=(\d+)/.exec(rest)![1]) : null,
      };
      continue;
    }

    const prevSession = /^\(prev\)\s+/.test(line);
    const body = prevSession ? line.replace(/^\(prev\)\s+/, "") : line;
    const brace = body.indexOf("{");
    if (brace < 0) {
      skipped.push({ line: lineNo, reason: "no_json", text: line.slice(0, 120) });
      continue;
    }
    const prefix = body.slice(0, brace);
    const clockM = CLOCK_RE.exec(prefix);
    if (!clockM) {
      skipped.push({ line: lineNo, reason: "no_timestamp", text: line.slice(0, 120) });
      continue;
    }
    const kindM = /([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(prefix.trimEnd());
    if (!kindM) {
      skipped.push({ line: lineNo, reason: "no_kind", text: line.slice(0, 120) });
      continue;
    }
    let data: unknown;
    try {
      data = JSON.parse(body.slice(brace));
    } catch {
      skipped.push({ line: lineNo, reason: "bad_json", text: line.slice(0, 120) });
      continue;
    }
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      skipped.push({ line: lineNo, reason: "json_not_object", text: line.slice(0, 120) });
      continue;
    }

    const tod = clockToMs(clockM);
    // Wechsel zwischen (prev)-Block und aktueller Session: eigene Zeitachse, kein Tageswechsel-Raten.
    if (lastWasPrev !== null && lastWasPrev !== prevSession) {
      dayOffset = 0;
      lastT = null;
    }
    let tMs = dayOffset + tod;
    if (lastT !== null && tMs < lastT - DAY_MS / 2) {
      dayOffset += DAY_MS;
      tMs = dayOffset + tod;
    }
    lastT = tMs;
    lastWasPrev = prevSession;

    events.push({
      idx: events.length,
      line: lineNo,
      tMs,
      clock: clockM[0],
      kind: kindM[1]!,
      data: data as Record<string, unknown>,
      prevSession,
    });
  }

  return { events, header, skipped, totalLines: rawLines.filter((l) => l.trim()).length };
}
