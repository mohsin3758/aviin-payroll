import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import {
  saveUploadedFile,
  ALLOWED_DOC_TYPES,
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  type DocType,
} from "@/lib/documents";
import { logAudit } from "@/lib/audit";

// GET /api/documents?employeeId=xxx — list an employee's documents.
// An employee-role session can only ever list their own; admin/hr/manager can list anyone's.
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const { searchParams } = request.nextUrl;
    let employeeId = searchParams.get("employeeId");

    if (session.role === "employee") {
      if (!session.employeeId) {
        return apiError("Your login isn't linked to an employee record.", 403);
      }
      employeeId = session.employeeId;
    }
    if (!employeeId) {
      return apiError("employeeId is required", 400);
    }

    const documents = await db.employeeDocument.findMany({
      where: { employeeId },
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
    if (typeof docType !== "string" || !ALLOWED_DOC_TYPES.includes(docType as DocType)) {
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

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      return apiError("File exceeds the 10MB upload limit.", 400);
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return apiError(`File type "${file.type}" is not allowed. Use JPEG, PNG, or PDF.`, 400);
    }

    const employee = await db.employee.findUnique({ where: { id: employeeId as string } });
    if (!employee) {
      return apiError("Employee not found", 404);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { filePath } = await saveUploadedFile(buffer, file.name);

    const doc = await db.employeeDocument.create({
      data: {
        employeeId: employeeId as string,
        docType,
        fileName: file.name,
        filePath,
        mimeType: file.type,
        uploadedBy: session.userId,
      },
    });

    await logAudit({ session, action: "create", entity: "EmployeeDocument", entityId: doc.id, details: { docType } });

    return NextResponse.json({ data: doc }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "upload document");
  }
}
