import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, getDefaultCompanyId } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { nextClientCode, normalizeClientName } from "@/lib/workforce/naming";
import { workforceError } from "@/lib/workforce/route-helpers";

// Maps the old free-text Employee.client / Candidate.client strings to real Client records. Nothing
// is guessed or merged automatically, and the historical employee/candidate rows are never altered:
// this only records which Client each distinct string refers to, with an audit trail.

// GET — admin/hr. Scans the legacy strings, registers any new ones, and reports each with a
// suggested match (same normalized name), plus groups of strings that look like duplicates.
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["admin", "hr"]);
    const [emps, cands] = await Promise.all([
      db.employee.groupBy({ by: ["client"], where: { client: { not: null } }, _count: true }),
      db.candidate.groupBy({ by: ["client"], where: { client: { not: null } }, _count: true }),
    ]);
    const counts = new Map<string, number>();
    for (const g of [...emps, ...cands]) {
      const raw = g.client?.trim();
      if (raw) counts.set(raw, (counts.get(raw) ?? 0) + g._count);
    }
    for (const [rawName, sourceCount] of counts) {
      await db.legacyClientMap.upsert({ where: { rawName }, create: { rawName, sourceCount }, update: { sourceCount } });
    }
    const [rows, clients] = await Promise.all([db.legacyClientMap.findMany({ orderBy: { rawName: "asc" } }), db.client.findMany({ select: { id: true, code: true, name: true, normalizedName: true } })]);
    const byNorm = new Map(clients.map((c) => [c.normalizedName, c]));
    const groups = new Map<string, string[]>();
    for (const r of rows) {
      const n = normalizeClientName(r.rawName);
      groups.set(n, [...(groups.get(n) ?? []), r.rawName]);
    }
    const data = rows.map((r) => {
      const n = normalizeClientName(r.rawName);
      const match = byNorm.get(n);
      return {
        ...r, suggestedClient: match ? { id: match.id, code: match.code, name: match.name } : null,
        possibleDuplicates: (groups.get(n) ?? []).filter((x) => x !== r.rawName),
      };
    });
    return NextResponse.json({ data, unresolved: data.filter((d) => d.status === "unmapped").length });
  } catch (error) {
    return workforceError(error, "scan legacy clients");
  }
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("map"), rawName: z.string().min(1), clientId: z.string().min(1) }),
  z.object({ action: z.literal("create"), rawName: z.string().min(1) }),
  z.object({ action: z.literal("ignore"), rawName: z.string().min(1) }),
]);

// PUT — admin/hr. map: point a legacy string at an existing Client. create: make a Client from the
// string and map it. ignore: mark it as not a client (e.g. "N/A").
export async function PUT(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const body = schema.parse(await request.json());
    const row = await db.legacyClientMap.findUnique({ where: { rawName: body.rawName } });
    if (!row) return apiError("Unknown legacy client name. Reload the list first.", 404);

    let clientId: string | null = null;
    let status = "ignored";
    if (body.action === "map") {
      const c = await db.client.findUnique({ where: { id: body.clientId } });
      if (!c) return apiError("Client not found", 404);
      clientId = c.id; status = "mapped";
    } else if (body.action === "create") {
      const companyId = await getDefaultCompanyId();
      const normalizedName = normalizeClientName(body.rawName);
      const dup = await db.client.findUnique({ where: { companyId_normalizedName: { companyId, normalizedName } } });
      if (dup) return apiError(`A matching client already exists: "${dup.name}" (${dup.code}). Map to it instead.`, 409);
      const codes = (await db.client.findMany({ select: { code: true } })).map((c) => c.code);
      const created = await db.client.create({ data: { code: nextClientCode(codes), companyId, name: body.rawName.trim(), normalizedName } });
      clientId = created.id; status = "mapped";
    }
    const updated = await db.legacyClientMap.update({ where: { id: row.id }, data: { clientId, status, mappedBy: session.userId, mappedAt: new Date() } });
    await logAudit({ session, action: `legacy_client_${body.action}`, entity: "LegacyClientMap", entityId: row.id, details: { rawName: body.rawName, clientId } });
    return NextResponse.json({ data: updated });
  } catch (error) {
    return workforceError(error, "map legacy client");
  }
}
