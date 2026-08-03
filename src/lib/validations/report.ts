import { z } from "zod";

// Backward-compatible superset of the original 6 statutory/compliance types.
export const REPORT_TYPES = ["pf", "esi", "tds", "pt", "lwf", "summary", "headcount", "attrition", "attendance", "leave-balance"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_FORMATS = ["json", "csv", "xlsx", "pdf"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

// Base query-param shape. Per-type required-field checks (month/year OR a from/to range for
// the 6 statutory types; month/year for attendance; fromDate/toDate for attrition; an optional
// year for leave-balance; nothing for headcount) are applied in the route handler after this
// parse, same as the original ad hoc checks — this just formalizes the growing param surface
// into one place instead of scattered parseInt/range checks.
export const reportQuerySchema = z
  .object({
    type: z.enum(REPORT_TYPES).default("summary"),
    format: z.enum(REPORT_FORMATS).default("json"),
    month: z.coerce.number().int().min(1).max(12).optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    fromMonth: z.coerce.number().int().min(1).max(12).optional(),
    fromYear: z.coerce.number().int().min(2000).max(2100).optional(),
    toMonth: z.coerce.number().int().min(1).max(12).optional(),
    toYear: z.coerce.number().int().min(2000).max(2100).optional(),
    fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fromDate must be YYYY-MM-DD").optional(),
    toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "toDate must be YYYY-MM-DD").optional(),
  })
  .refine(
    (v) => {
      const rangeFields = [v.fromMonth, v.fromYear, v.toMonth, v.toYear];
      const providedCount = rangeFields.filter((f) => f !== undefined).length;
      return providedCount === 0 || providedCount === 4;
    },
    { message: "fromMonth/fromYear/toMonth/toYear must all be provided together for a ranged report." }
  );
