import { writeFile, mkdir, unlink, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join, extname } from "path";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";

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
  "investment_proof",
  "other",
  // Self-onboarding uploads (see ONBOARDING_DOC_TYPES below) — kept in this same list so
  // GET /api/documents and every other consumer of ALLOWED_DOC_TYPES already recognizes them.
  "photo",
  "bank_proof",
  "education_certificate",
  // Deliberately distinct from "relieving_letter" above, which means "letter this company
  // generated for someone exiting" — reusing it here for a new joiner's letter from their
  // *previous* employer would make those two very different documents indistinguishable.
  "previous_relieving_letter",
  "resume",
] as const;
export type DocType = (typeof ALLOWED_DOC_TYPES)[number];

// The subset a self-onboarding candidate (no session, token-authenticated) may upload — a
// candidate should never be able to self-upload a docType like "offer_letter" that the
// generated-letters feature otherwise treats as HR-authored.
export const ONBOARDING_DOC_TYPES = [
  "photo",
  "pan",
  "aadhaar",
  "bank_proof",
  "education_certificate",
  "previous_relieving_letter",
  "resume",
] as const;
export type OnboardingDocType = (typeof ONBOARDING_DOC_TYPES)[number];

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

export class DocumentUploadError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Shared validation + save + EmployeeDocument creation, used by both the session-authenticated
 * POST /api/documents route and the token-authenticated onboarding-invite upload route — keeping
 * this in one place means the two paths can never drift on size/MIME/docType rules. */
export async function saveDocumentForEmployee(params: {
  employeeId: string;
  file: File;
  docType: string;
  uploadedBy: string | null;
  allowedDocTypes: readonly string[];
}): Promise<{ id: string; docType: string; fileName: string; filePath: string; mimeType: string }> {
  const { employeeId, file, docType, uploadedBy, allowedDocTypes } = params;

  if (!allowedDocTypes.includes(docType)) {
    throw new DocumentUploadError(`docType must be one of: ${allowedDocTypes.join(", ")}`, 400);
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new DocumentUploadError("File exceeds the 10MB upload limit.", 400);
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new DocumentUploadError(`File type "${file.type}" is not allowed. Use JPEG, PNG, or PDF.`, 400);
  }

  const employee = await db.employee.findUnique({ where: { id: employeeId } });
  if (!employee) {
    throw new DocumentUploadError("Employee not found", 404);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { filePath } = await saveUploadedFile(buffer, file.name);

  return db.employeeDocument.create({
    data: {
      employeeId,
      docType,
      fileName: file.name,
      filePath,
      mimeType: file.type,
      uploadedBy,
    },
  });
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
