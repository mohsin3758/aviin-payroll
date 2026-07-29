import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { readUploadedFile } from "@/lib/documents";

// GET /api/bank-formats/[id]/sample — streams the uploaded reference file back (download).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(request, ["admin", "hr"]);
    const { id } = await params;
    const format = await db.bankFormat.findUnique({ where: { id } });
    if (!format) {
      return apiError("Bank format not found", 404);
    }
    if (!format.sampleFilePath || !format.sampleFileName || !format.sampleMimeType) {
      return apiError("No sample file was uploaded for this bank format.", 404);
    }

    const buffer = await readUploadedFile(format.sampleFilePath);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": format.sampleMimeType,
        "Content-Disposition": `attachment; filename="${format.sampleFileName}"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "download bank format sample");
  }
}
