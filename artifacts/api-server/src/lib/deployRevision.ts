import { execSync } from "node:child_process";
import { DEPLOY_BUILT_AT, DEPLOY_GIT_SHA } from "../generated/deployRevision.generated";

export type HealthCheckPayload = {
  status: "ok";
  gitSha?: string;
  gitShaShort?: string;
  builtAt?: string;
};

function resolveGitFromRepo(): string | null {
  try {
    const sha = execSync("git rev-parse HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return sha || null;
  } catch {
    return null;
  }
}

/** Laufzeit-Override (Deploy) > eingebetteter Build-Stand > git im Arbeitsbaum. */
export function resolveDeployGitSha(): string | null {
  const fromEnv = process.env.ONRODA_GIT_SHA?.trim();
  if (fromEnv) return fromEnv;
  const embedded = DEPLOY_GIT_SHA.trim();
  if (embedded) return embedded;
  return resolveGitFromRepo();
}

export function buildHealthCheckPayload(): HealthCheckPayload {
  const gitSha = resolveDeployGitSha();
  const builtAt = DEPLOY_BUILT_AT.trim() || undefined;
  if (!gitSha) {
    return { status: "ok", ...(builtAt ? { builtAt } : {}) };
  }
  return {
    status: "ok",
    gitSha,
    gitShaShort: gitSha.slice(0, 8),
    ...(builtAt ? { builtAt } : {}),
  };
}
