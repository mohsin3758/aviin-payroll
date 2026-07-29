import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, getDefaultCompanyId, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { createBankFormatSchema } from "@/lib/validations/bank-format";
import {
  saveUploadedFile,
  MAX_BANK_SAMPLE_SIZE_BYTES,
  ALLOWED_BANK_SAMPLE_MIME_TYPES,
} from "@/lib/documents";

function serialize(format: { columns: string; [key: string]: unknown }) {
  return { ...format, columns: JSON.parse(format.columns) };
}

// GET /api/bank-formats — admin/hr only
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["admin", "hr"]);
    const companyId = await getDefaultCompanyId();
    const formats = await db.bankFormat.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ data: formats.map(serialize) });
  } catch (error) {
    return handleApiError(error, "fetch bank formats");
  }
}

// POST /api/bank-formats — admin/hr only. Multipart: name, columns (JSON string), isDefault,
// optional sampleFile (kept purely as a visual reference — never parsed/auto-mapped).
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const companyId = await getDefaultCompanyId();
    const form = await request.formData();

    const name = form.get("name");
    const columnsRaw = form.get("columns");
    const isDefaultRaw = form.get("isDefault");
    const sampleFile = form.get("sampleFile");

    let parsedColumns: unknown;
    try {
      parsedColumns = JSON.parse(typeof columnsRaw === "string" ? columnsRaw : "");
    } catch {
      return apiError("columns must be a valid JSON array.", 400);
    }

    const parsed = createBankFormatSchema.parse({
      name,
      isDefault: isDefaultRaw === "true",
      columns: parsedColumns,
    });

    const existing = await db.bankFormat.findUnique({
      where: { companyId_name: { companyId, name: parsed.name } },
    });
    if (existing) {
      return apiError("A bank format with this name already exists.", 409);
    }

    let sampleFileName: string | null = null;
    let sampleFilePath: string | null = null;
    let sampleMimeType: string | null = null;

    if (sampleFile instanceof File && sampleFile.size > 0) {
      if (sampleFile.size > MAX_BANK_SAMPLE_SIZE_BYTES) {
        return apiError("Sample file exceeds the 10MB upload limit.", 400);
      }
      if (!ALLOWED_BANK_SAMPLE_MIME_TYPES.includes(sampleFile.type)) {
        return apiError(`File type "${sampleFile.type}" is not allowed. Use XLSX, XLS, or CSV.`, 400);
      }
      const buffer = Buffer.from(await sampleFile.arrayBuffer());
      const { filePath } = await saveUploadedFile(buffer, sampleFile.name);
      sampleFileName = sampleFile.name;
      sampleFilePath = filePath;
      sampleMimeType = sampleFile.type;
    }

    const created = await db.$transaction(async (tx) => {
      if (parsed.isDefault) {
        await tx.bankFormat.updateMany({ where: { companyId }, data: { isDefault: false } });
      }
      return tx.bankFormat.create({
        data: {
          companyId,
          name: parsed.name,
          isDefault: parsed.isDefault,
          columns: JSON.stringify(parsed.columns),
          sampleFileName,
          sampleFilePath,
          sampleMimeType,
        },
      });
    });

    await logAudit({ session, action: "create", entity: "BankFormat", entityId: created.id });

    return NextResponse.json({ data: serialize(created) }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create bank format");
  }
}
