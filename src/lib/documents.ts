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
