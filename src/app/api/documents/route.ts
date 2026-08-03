import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { saveDocumentForEmployee, DocumentUploadError, ALLOWED_DOC_TYPES } from "@/lib/documents";
import { logAudit } from "@/lib/audit";

// GET /api/documents?employeeId=xxx&verifiedStatus=pending — list an employee's documents.
// An employee-role session can only ever list their own; admin/hr/manager can list anyone's.
// Omitting employeeId is a company-wide listing (e.g. the verification queue) — admin/hr only.
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const { searchParams } = request.nextUrl;
    let employeeId = searchParams.get("employeeId");
    const verifiedStatus = searchParams.get("verifiedStatus");

    if (session.role === "employee") {
      if (!session.employeeId) {
        return apiError("Your login isn't linked to an employee record.", 403);
      }
      employeeId = session.employeeId;
    } else if (!employeeId && session.role !== "admin" && session.role !== "hr") {
      return apiError("employeeId is required", 400);
    }

    const where: Record<string, unknown> = {};
    if (employeeId) where.employeeId = employeeId;
    if (verifiedStatus) where.verifiedStatus = verifiedStatus;

    const documents = await db.employeeDocument.findMany({
      where,
      include: employeeId ? undefined : { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ data: documents });
  } catch (error) {
    return handleApiError(error, "fetch documents");
  }
}

// POST /api/documents — multipart upload (fields: file, docType, employeeId).
// Employees can only upload against their own employeeId; admin/hr can upload for anyone
// (including generated letters, which get saved through this same endpoint server-side).
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const formData = await request.formData();
    const file = formData.get("file");
    const docType = formData.get("docType");
    let employeeId = formData.get("employeeId");

    if (!(file instanceof File)) {
      return apiError("file is required", 400);
    }
    if (typeof docType !== "string") {
      return apiError(`docType must be one of: ${ALLOWED_DOC_TYPES.join(", ")}`, 400);
    }

    if (session.role === "employee") {
      if (!session.employeeId) {
        return apiError("Your login isn't linked to an employee record.", 403);
      }
      employeeId = session.employeeId;
    } else if (typeof employeeId !== "string" || !employeeId) {
      return apiError("employeeId is required", 400);
    }

    const doc = await saveDocumentForEmployee({
      employeeId: employeeId as string,
      file,
      docType,
      uploadedBy: session.userId,
      allowedDocTypes: ALLOWED_DOC_TYPES,
    });

    await logAudit({ session, action: "create", entity: "EmployeeDocument", entityId: doc.id, details: { docType } });

    return NextResponse.json({ data: doc }, { status: 201 });
  } catch (error) {
    if (error instanceof DocumentUploadError) {
      return apiError(error.message, error.status);
    }
    return handleApiError(error, "upload document");
  }
}
