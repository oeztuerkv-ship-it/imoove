/** Heading-Qualitätswechsel (nicht jeden Frame). Keine RN-Deps — selftests dürfen importieren. */
let lastKey: string | null = null;

export function navDiagHeadingTransition(args: {
  rawHeading: number | null;
  resolvedHeading: number | null;
  headingState: string;
  headingAccuracy?: number | null;
  speedMps?: number | null;
  reason?: string;
}): void {
  const key = `${args.headingState}|${args.reason ?? ""}`;
  if (lastKey === key) return;
  lastKey = key;
  try {
    console.log("[navDiagHeadingTransition]", {
      rawHeading: args.rawHeading,
      resolvedHeading: args.resolvedHeading,
      headingState: args.headingState,
      headingAccuracy: args.headingAccuracy ?? null,
      speed: args.speedMps ?? null,
      reason: args.reason ?? args.headingState,
    });
  } catch {
    /* ignore */
  }
}
