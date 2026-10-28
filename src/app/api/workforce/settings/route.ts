import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { DEFAULT_SETTINGS, parseStoredLayer, settingsLayerSchema } from "@/lib/workforce/settings";
import { loadSettingsFor } from "@/lib/workforce/daily";
import { workforceError } from "@/lib/workforce/route-helpers";

const scopeSchema = z.object({ scope: z.enum(["company", "client", "project", "assignment"]), scopeId: z.string().min(1).optional() })
  .refine((v) => v.scope === "company" || !!v.scopeId, { message: "scopeId is required", path: ["scopeId"] });

function scopeKey(scope: string, id?: string) { return scope === "company" ? "company" : `${scope}:${id}`; }

async function targetExists(scope: string, id?: string): Promise<boolean> {
  if (scope === "company") return true;
  if (scope === "client") return !!(await db.client.findUnique({ where: { id: id! }, select: { id: true } }));
  if (scope === "project") return !!(await db.project.findUnique({ where: { id: id! }, select: { id: true } }));
  return !!(await db.assignment.findUnique({ where: { id: id! }, select: { id: true } }));
}

// GET /api/workforce/settings?scope=&scopeId=  -> the overrides stored at that level, plus the
//     built-in defaults.
// GET /api/workforce/settings?assignmentId=    -> the EFFECTIVE settings for an assignment and where
//     each value comes from (assignment / project / client / company / default).
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["admin", "hr"]);
    const sp = request.nextUrl.searchParams;
    const assignmentId = sp.get("assignmentId");
    if (assignmentId) {
      const a = await db.assignment.findUnique({ where: { id: assignmentId }, include: { project: true } });
      if (!a) return apiError("Assignment not found", 404);
      return NextResponse.json({ data: await loadSettingsFor(a.id, a.projectId, a.project.clientId) });
    }
    const q = scopeSchema.parse({ scope: sp.get("scope") ?? "company", scopeId: sp.get("scopeId") ?? undefined });
    const row = await db.settingsPolicy.findUnique({ where: { scopeKey: scopeKey(q.scope, q.scopeId) } });
    return NextResponse.json({ data: { values: parseStoredLayer(row?.values), defaults: DEFAULT_SETTINGS } });
  } catch (error) {
    return workforceError(error, "fetch workforce settings");
  }
}

// PUT /api/workforce/settings — { scope, scopeId?, values } REPLACES the overrides at that level
// (send only the keys you want to override; omitted keys inherit). Strictly validated: an unknown
// key or an out-of-range value is rejected, not stored.
export async function PUT(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const body = await request.json();
    const target = scopeSchema.parse({ scope: body.scope, scopeId: body.scopeId });
    const values = settingsLayerSchema.parse(body.values ?? {});
    if (!(await targetExists(target.scope, target.scopeId))) return apiError("That client/project/assignment does not exist.", 404);

    const key = scopeKey(target.scope, target.scopeId);
    const before = await db.settingsPolicy.findUnique({ where: { scopeKey: key } });
    const row = await db.settingsPolicy.upsert({
      where: { scopeKey: key },
      create: { scopeKey: key, values: JSON.stringify(values), updatedBy: session.userId },
      update: { values: JSON.stringify(values), updatedBy: session.userId },
    });
    await logAudit({ session, action: "update_workforce_settings", entity: "SettingsPolicy", entityId: row.id, details: { scopeKey: key, before: before ? JSON.parse(before.values) : {}, after: values } });
    return NextResponse.json({ data: { values } });
  } catch (error) {
    return workforceError(error, "update workforce settings");
  }
}
