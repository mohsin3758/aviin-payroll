import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { AuthError } from "@/lib/auth";

export function apiError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

/** Normalizes a date-only string ("2026-01-15") or full ISO datetime into a Date. */
export function toDate(value: unknown): Date | null | undefined {
  if (value === null) return null;
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") return undefined;
  const iso = value.length === 10 ? `${value}T00:00:00.000Z` : value;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return undefined;
  return d;
}

/** Single-tenant app: resolve the one Company row server-side rather than trusting client input. */
export async function getDefaultCompanyId(): Promise<string> {
  const company = await db.company.findFirst({ orderBy: { createdAt: "asc" } });
  if (!company) {
    throw new Error("No company configured. Seed or create company settings first.");
  }
  return company.id;
}

export function handleApiError(error: unknown, context: string) {
  if (error instanceof AuthError) {
    return apiError(error.message, error.status);
  }
  if (error instanceof ZodError) {
    return apiError(
      `Validation failed: ${error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      400
    );
  }
  console.error(`${context}:`, error);
  const message = error instanceof Error ? error.message : "Unexpected error";
  return apiError(message.startsWith("No company configured") ? message : `Failed: ${context}`, 500);
}
