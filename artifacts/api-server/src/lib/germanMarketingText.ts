/**
 * Normalisiert häufige ae-Schreibweisen in deutschsprachigen Marketing-/CMS-Texten.
 * Keine URLs/Links anwenden — nur Fließtext-Felder.
 */
const RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/Für Fahrgaeste/gi, "Für Fahrgäste"],
  [/\bFahrgaeste\b/gi, "Fahrgäste"],
  [/\bFahrgaste\b/gi, "Fahrgäste"],
  [/\bfuer\b/gi, "für"],
  [/\bGaeste\b/gi, "Gäste"],
];

export function normalizeGermanMarketingText(value: string): string {
  if (!value) return value;
  let s = value;
  for (const [re, repl] of RULES) {
    s = s.replace(re, repl);
  }
  return s;
}

/** JSONB/Text-Reparatur (Migration): gleiche Ersetzungen auf serialisiertem JSON. */
export function normalizeGermanMarketingJsonText(serialized: string): string {
  if (!serialized) return serialized;
  let s = serialized;
  for (const [re, repl] of RULES) {
    s = s.replace(re, repl);
  }
  return s;
}
