import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { readUploadedFile, deleteUploadedFile } from "@/lib/documents";
import { logAudit } from "@/lib/audit";

// GET /api/documents/[id] — streams the actual file back (download).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(request);
    const { id } = await params;
    const doc = await db.employeeDocument.findUnique({ where: { id } });
    if (!doc) {
      return apiError("Document not found", 404);
    }
    if (session.role === "employee" && session.employeeId !== doc.employeeId) {
      return apiError("You can only access your own documents.", 403);
    }

    const buffer = await readUploadedFile(doc.filePath);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `attachment; filename="${doc.fileName}"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "download document");
  }
}

// DELETE /api/documents/[id] — admin/hr only.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;
    const doc = await db.employeeDocument.findUnique({ where: { id } });
    if (!doc) {
      return apiError("Document not found", 404);
    }

    await deleteUploadedFile(doc.filePath);
    await db.employeeDocument.delete({ where: { id } });

    await logAudit({ session, action: "delete", entity: "EmployeeDocument", entityId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "delete document");
  }
}
