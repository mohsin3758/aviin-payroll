import { db } from "@/lib/db";

/**
 * Feature flags for the Contractor Workforce module (docs/CONTRACTOR_MONITORING_SPEC.md §5).
 * Every flag defaults OFF, so with nothing configured the existing payroll/attendance behavior
 * is exactly what it was before this module existed.
 */
import { WORKFORCE_FLAG_KEYS, type WorkforceFlagKey } from "@/lib/workforce/flag-keys";
export { WORKFORCE_FLAG_KEYS };
export type { WorkforceFlagKey };

const MASTER_FLAG: WorkforceFlagKey = "contractor_workforce_enabled";

export interface FlagRow {
  key: string;
  scopeKey: string;
  enabled: boolean;
}

export interface FlagContext {
  clientId?: string | null;
  projectId?: string | null;
}

export function isWorkforceFlagKey(value: string): value is WorkforceFlagKey {
  return (WORKFORCE_FLAG_KEYS as readonly string[]).includes(value);
}

export function companyScopeKey(): string {
  return "company";
}
export function clientScopeKey(clientId: string): string {
  return `client:${clientId}`;
}
export function projectScopeKey(projectId: string): string {
  return `project:${projectId}`;
}

/** Scope keys that can apply for a context, most specific first. */
export function scopeKeysFor(ctx: FlagContext): string[] {
  const keys: string[] = [];
  if (ctx.projectId) keys.push(projectScopeKey(ctx.projectId));
  if (ctx.clientId) keys.push(clientScopeKey(ctx.clientId));
  keys.push(companyScopeKey());
  return keys;
}

function resolveSingle(rows: FlagRow[], key: string, ctx: FlagContext): boolean {
  for (const scopeKey of scopeKeysFor(ctx)) {
    const row = rows.find((r) => r.key === key && r.scopeKey === scopeKey);
    if (row) return row.enabled; // most specific explicit row wins, on or off
  }
  return false; // no row anywhere = off
}

/**
 * Pure resolution (unit-tested). The most specific explicit setting wins (project, then client,
 * then company); no setting means off. Any flag other than the master switch also requires the
 * master switch to resolve on for the same context, so turning the master off disables the whole
 * module without having to touch every other flag.
 */
export function resolveFlag(rows: FlagRow[], key: WorkforceFlagKey, ctx: FlagContext = {}): boolean {
  if (!resolveSingle(rows, MASTER_FLAG, ctx)) return false;
  if (key === MASTER_FLAG) return true;
  return resolveSingle(rows, key, ctx);
}

export async function isWorkforceFlagEnabled(key: WorkforceFlagKey, ctx: FlagContext = {}): Promise<boolean> {
  const rows = await db.featureFlag.findMany({
    where: { key: { in: key === MASTER_FLAG ? [key] : [key, MASTER_FLAG] }, scopeKey: { in: scopeKeysFor(ctx) } },
    select: { key: true, scopeKey: true, enabled: true },
  });
  return resolveFlag(rows, key, ctx);
}

export async function setWorkforceFlag(params: {
  key: WorkforceFlagKey;
  scopeKey: string;
  enabled: boolean;
  updatedBy: string;
}) {
  return db.featureFlag.upsert({
    where: { key_scopeKey: { key: params.key, scopeKey: params.scopeKey } },
    create: { key: params.key, scopeKey: params.scopeKey, enabled: params.enabled, updatedBy: params.updatedBy },
    update: { enabled: params.enabled, updatedBy: params.updatedBy },
  });
}
