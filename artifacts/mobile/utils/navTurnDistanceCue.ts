/**
 * Navi-Kopf: Distanz-Wortlaut zur nächsten Abzweigung (ohne Google Navigation SDK).
 */

/**
 * Anzeige-Meter: immer auf 10 m aufrunden (1/2/4 m → 10 m), unter 1 km.
 * Rohwert für Schwellen („Jetzt“) separat behalten.
 */
export function roundNavDisplayMeters(distanceM: number): number {
  const m = Math.max(0, Number.isFinite(distanceM) ? distanceM : 0);
  if (m <= 0) return 0;
  if (m < 1000) return Math.max(10, Math.ceil(m / 10) * 10);
  return Math.round(m);
}

/** „In 200 m“ / „In 1.2 km“ / „Jetzt“ (< 25 m). Meter unter 1 km in 10-m-Schritten. */
export function formatNavTurnDistanceLabel(distanceM: number): string {
  const m = Math.max(0, Number.isFinite(distanceM) ? distanceM : 0);
  if (m < 25) return "Jetzt";
  if (m < 1000) return `In ${roundNavDisplayMeters(m)} m`;
  return `In ${(m / 1000).toFixed(1)} km`;
}

/** Instruction für Satzanschluss: „Rechts abbiegen…“ → „rechts abbiegen…“. */
export function lowerCaseGermanInstruction(instruction: string): string {
  const t = instruction.trim();
  if (!t) return "";
  return t.charAt(0).toLowerCase() + t.slice(1);
}

/**
 * Gesprochener / kombinierter Hinweis: „In 200 m rechts abbiegen auf Hauptstraße“.
 * Bei < 25 m: „Jetzt rechts abbiegen …“.
 */
export function formatNavTurnCue(distanceM: number, instruction: string): string {
  const instr = instruction.trim();
  const distLabel = formatNavTurnDistanceLabel(distanceM);
  if (!instr) return distLabel;
  const body = lowerCaseGermanInstruction(instr);
  if (distLabel === "Jetzt") return `Jetzt ${body}`;
  return `${distLabel} ${body}`;
}

/**
 * Manöver vs. Straße aus Step (Server-Felder oder Fallback aus Instruction).
 */
export function splitNavStepParts(step: {
  instruction?: string | null;
  maneuver?: string | null;
  roadName?: string | null;
}): { maneuver: string; roadName: string | null } {
  const instruction = (step.instruction ?? "").trim();
  const maneuverRaw = typeof step.maneuver === "string" ? step.maneuver.trim() : "";
  const roadRaw =
    typeof step.roadName === "string" && step.roadName.trim() ? step.roadName.trim() : null;
  if (maneuverRaw) {
    return { maneuver: maneuverRaw, roadName: roadRaw };
  }
  const auf = instruction.match(/^(.*?)\s+auf\s+(.+)$/i);
  if (auf) {
    return { maneuver: auf[1]!.trim() || instruction, roadName: auf[2]!.trim() || null };
  }
  return { maneuver: instruction || "Weiterfahren", roadName: roadRaw };
}
