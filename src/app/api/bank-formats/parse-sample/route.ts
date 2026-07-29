import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { MAX_BANK_SAMPLE_SIZE_BYTES, isAllowedBankSampleFile } from "@/lib/documents";

const PREVIEW_ROW_LIMIT = 40;
const PREVIEW_COL_LIMIT = 20;

// POST /api/bank-formats/parse-sample — admin/hr only. Reads back the raw first ~40 rows of
// an uploaded sample file so the admin can see it and pick which row is the real header row.
// Returns exact cell text only — no field-mapping or "this is the header" decision is made
// here; that stays client-side (findLikelyHeaderRowIndex/guessFieldForHeader) so the admin can
// override it before anything is saved. This endpoint never writes the file to disk.
export async function POST(request: NextRequest) {
  try {
    await requireRole(request, ["admin", "hr"]);
    const form = await request.formData();
    const file = form.get("sampleFile");

    if (!(file instanceof File) || file.size === 0) {
      return apiError("No sample file was provided.", 400);
    }
    if (file.size > MAX_BANK_SAMPLE_SIZE_BYTES) {
      return apiError("Sample file exceeds the 10MB upload limit.", 400);
    }
    if (!isAllowedBankSampleFile(file)) {
      return apiError(`File type "${file.type}" is not allowed. Use XLSX, XLSM, XLS, or CSV.`, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type.includes("csv");

    let rows: string[][] = [];

    if (isCsv) {
      const parsed = Papa.parse<string[]>(buffer.toString("utf-8"), { skipEmptyLines: false });
      rows = (parsed.data as string[][]).slice(0, PREVIEW_ROW_LIMIT).map((r) => r.slice(0, PREVIEW_COL_LIMIT));
    } else {
      const workbook = new ExcelJS.Workbook();
      // exceljs's bundled types predate @types/node 26's generic Buffer<TArrayBuffer> change,
      // so the two Buffer types don't structurally match at compile time even though this is
      // a real, correctly-shaped Node Buffer at runtime — a type-only mismatch, not a bug.
      await workbook.xlsx.load(buffer as any);
      const sheet = workbook.worksheets[0];
      if (!sheet) {
        return apiError("Couldn't find any sheet in that file.", 400);
      }
      const rowCount = Math.min(sheet.rowCount, PREVIEW_ROW_LIMIT);
      for (let r = 1; r <= rowCount; r++) {
        const values = sheet.getRow(r).values as (string | number | null | undefined)[];
        // ExcelJS's row.values is 1-indexed with index 0 unused, and is a SPARSE array — an
        // unset cell (e.g. leading blank columns before a header that starts at column C, as
        // real bank templates often do) is an actual array hole, not `undefined`. Array.prototype
        // .slice().map() skips holes entirely (never invokes the callback for them), so a naive
        // null/undefined check here silently leaves holes in place; JSON.stringify then turns
        // those into literal `null` in the response, which crashed the client's preview render.
        // Array.from's iterator visits every index (holes included, as undefined), so this
        // actually densifies the array instead of leaving holes for JSON.stringify to corrupt.
        const sliced = values.slice(1, PREVIEW_COL_LIMIT + 1);
        const cells = Array.from(sliced, (v) => (v === null || v === undefined ? "" : String(v)));
        rows.push(cells);
      }
    }

    return NextResponse.json({ data: { rows } });
  } catch (error) {
    return handleApiError(error, "parse bank sample file");
  }
}
