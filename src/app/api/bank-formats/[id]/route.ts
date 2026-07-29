import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { updateBankFormatSchema } from "@/lib/validations/bank-format";
import {
  saveUploadedFile,
  deleteUploadedFile,
  MAX_BANK_SAMPLE_SIZE_BYTES,
  ALLOWED_BANK_SAMPLE_MIME_TYPES,
} from "@/lib/documents";

function serialize(format: { columns: string; [key: string]: unknown }) {
  return { ...format, columns: JSON.parse(format.columns) };
}

type Params = { params: Promise<{ id: string }> };

// PUT /api/bank-formats/[id] — admin/hr only
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;

    const existing = await db.bankFormat.findUnique({ where: { id } });
    if (!existing) {
      return apiError("Bank format not found", 404);
    }

    const form = await request.formData();
    const name = form.get("name");
    const columnsRaw = form.get("columns");
    const isDefaultRaw = form.get("isDefault");
    const sampleFile = form.get("sampleFile");

    let parsedColumns: unknown;
    if (typeof columnsRaw === "string" && columnsRaw.length > 0) {
      try {
        parsedColumns = JSON.parse(columnsRaw);
      } catch {
        return apiError("columns must be a valid JSON array.", 400);
      }
    }

    const parsed = updateBankFormatSchema.parse({
      ...(typeof name === "string" && name.length > 0 && { name }),
      ...(isDefaultRaw !== null && { isDefault: isDefaultRaw === "true" }),
      ...(parsedColumns !== undefined && { columns: parsedColumns }),
    });

    if (parsed.name && parsed.name !== existing.name) {
      const nameTaken = await db.bankFormat.findUnique({
        where: { companyId_name: { companyId: existing.companyId, name: parsed.name } },
      });
      if (nameTaken) {
        return apiError("A bank format with this name already exists.", 409);
      }
    }

    let sampleFileName = existing.sampleFileName;
    let sampleFilePath = existing.sampleFilePath;
    let sampleMimeType = existing.sampleMimeType;

    if (sampleFile instanceof File && sampleFile.size > 0) {
      if (sampleFile.size > MAX_BANK_SAMPLE_SIZE_BYTES) {
        return apiError("Sample file exceeds the 10MB upload limit.", 400);
      }
      if (!ALLOWED_BANK_SAMPLE_MIME_TYPES.includes(sampleFile.type)) {
        return apiError(`File type "${sampleFile.type}" is not allowed. Use XLSX, XLS, or CSV.`, 400);
      }
      if (existing.sampleFilePath) {
        await deleteUploadedFile(existing.sampleFilePath);
      }
      const buffer = Buffer.from(await sampleFile.arrayBuffer());
      const { filePath } = await saveUploadedFile(buffer, sampleFile.name);
      sampleFileName = sampleFile.name;
      sampleFilePath = filePath;
      sampleMimeType = sampleFile.type;
    }

    const updated = await db.$transaction(async (tx) => {
      if (parsed.isDefault) {
        await tx.bankFormat.updateMany({
          where: { companyId: existing.companyId, id: { not: id } },
          data: { isDefault: false },
        });
      }
      return tx.bankFormat.update({
        where: { id },
        data: {
          ...(parsed.name !== undefined && { name: parsed.name }),
          ...(parsed.isDefault !== undefined && { isDefault: parsed.isDefault }),
          ...(parsed.columns !== undefined && { columns: JSON.stringify(parsed.columns) }),
          sampleFileName,
          sampleFilePath,
          sampleMimeType,
        },
      });
    });

    await logAudit({ session, action: "update", entity: "BankFormat", entityId: id });

    return NextResponse.json({ data: serialize(updated) });
  } catch (error) {
    return handleApiError(error, "update bank format");
  }
}

// DELETE /api/bank-formats/[id] — admin/hr only
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;

    const existing = await db.bankFormat.findUnique({ where: { id } });
    if (!existing) {
      return apiError("Bank format not found", 404);
    }

    if (existing.sampleFilePath) {
      await deleteUploadedFile(existing.sampleFilePath);
    }
    await db.bankFormat.delete({ where: { id } });

    await logAudit({ session, action: "delete", entity: "BankFormat", entityId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "delete bank format");
  }
}
