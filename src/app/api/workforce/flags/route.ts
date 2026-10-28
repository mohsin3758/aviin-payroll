import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { setFlagSchema } from "@/lib/validations/workforce";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { WORKFORCE_FLAG_KEYS, clientScopeKey, companyScopeKey, projectScopeKey, setWorkforceFlag } from "@/lib/workforce/flags";

// GET /api/workforce/flags — admin/hr: every flag row plus the full list of known keys.
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["admin", "hr"]);
    const rows = await db.featureFlag.findMany({ orderBy: [{ key: "asc" }, { scopeKey: "asc" }] });
    return NextResponse.json({ data: { keys: WORKFORCE_FLAG_KEYS, flags: rows } });
  } catch (error) {
    return handleApiError(error, "fetch workforce flags");
  }
}

// PUT /api/workforce/flags — ADMIN only (turning the module on is a deliberate go-live decision).
// Body: { key, scope: "company"|"client"|"project", scopeId?, enabled }
export async function PUT(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin"]);
    const parsed = setFlagSchema.parse(await request.json());

    let scopeKey = companyScopeKey();
    if (parsed.scope === "client") {
      const client = await db.client.findUnique({ where: { id: parsed.scopeId! } });
      if (!client) return apiError("Client not found", 404);
      scopeKey = clientScopeKey(client.id);
    } else if (parsed.scope === "project") {
      const project = await db.project.findUnique({ where: { id: parsed.scopeId! } });
      if (!project) return apiError("Project not found", 404);
      scopeKey = projectScopeKey(project.id);
    }

    const flag = await setWorkforceFlag({ key: parsed.key, scopeKey, enabled: parsed.enabled, updatedBy: session.userId });
    await logAudit({ session, action: "set_flag", entity: "FeatureFlag", entityId: flag.id, details: { key: parsed.key, scopeKey, enabled: parsed.enabled } });
    return NextResponse.json({ data: flag });
  } catch (error) {
    return handleApiError(error, "set workforce flag");
  }
}
