import { writeFile, mkdir, unlink, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join, extname } from "path";
import { randomUUID } from "crypto";

// Local-disk storage under a Docker-volume-backed directory (mirrors how the SQLite file
// itself is persisted). No S3/blob storage — appropriate for this single-VPS deployment.
const UPLOAD_ROOT = process.env.UPLOADS_DIR || join(process.cwd(), "uploads");

export const ALLOWED_DOC_TYPES = [
  "pan",
  "aadhaar",
  "passport",
  "offer_letter",
  "appointment_letter",
  "experience_letter",
  "relieving_letter",
  "other",
] as const;
export type DocType = (typeof ALLOWED_DOC_TYPES)[number];

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "application/pdf"];

// A BankFormat's sample reference file is a spreadsheet, not an identity document — kept as
// its own constant pair rather than widening ALLOWED_MIME_TYPES above, which would loosen
// what the Documents feature accepts too.
export const MAX_BANK_SAMPLE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const ALLOWED_BANK_SAMPLE_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
  "application/vnd.ms-excel.sheet.macroEnabled.12", // .xlsm
  "text/csv",
  "application/csv",
];
const ALLOWED_BANK_SAMPLE_EXTENSIONS = [".xlsx", ".xls", ".xlsm", ".csv"];

// Browsers report macro-enabled/legacy Excel MIME types inconsistently (some send
// "application/octet-stream" for .xlsm) — fall back to the file extension rather than
// rejecting a real bank template outright.
export function isAllowedBankSampleFile(file: { name: string; type: string }): boolean {
  if (ALLOWED_BANK_SAMPLE_MIME_TYPES.includes(file.type)) return true;
  const ext = extname(file.name).toLowerCase();
  return ALLOWED_BANK_SAMPLE_EXTENSIONS.includes(ext);
}

export async function saveUploadedFile(
  buffer: Buffer,
  originalFileName: string
): Promise<{ filePath: string }> {
  if (!existsSync(UPLOAD_ROOT)) {
    await mkdir(UPLOAD_ROOT, { recursive: true });
  }
  const ext = extname(originalFileName) || "";
  const fileName = `${randomUUID()}${ext}`;
  await writeFile(join(UPLOAD_ROOT, fileName), buffer);
  return { filePath: fileName };
}

export async function readUploadedFile(filePath: string): Promise<Buffer> {
  return readFile(join(UPLOAD_ROOT, filePath));
}

export async function deleteUploadedFile(filePath: string): Promise<void> {
  const absolutePath = join(UPLOAD_ROOT, filePath);
  if (existsSync(absolutePath)) {
    await unlink(absolutePath);
  }
}
