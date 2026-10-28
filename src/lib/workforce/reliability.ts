/**
 * Contractor reliability score (docs/CONTRACTOR_MONITORING_SPEC.md §14). Transparent by design:
 * every component shows its value and the reason, and a component with no data is EXCLUDED and the
 * remaining weights are rescaled, so a missing signal never silently counts as zero (or as full
 * marks). It informs people; it never triggers a deduction, warning or termination by itself.
 */
export const WEIGHTS = {
  attendance: 25,
  timesheet: 15, // end-of-day / hours reporting compliance
  delivery: 25, // client's weekly "on track?" answers
  clientFeedback: 20, // client's 1-5 rating
  response: 10, // answered "still online" checks
  availability: 5, // working days not lost to unplanned absence
} as const;

export type ComponentKey = keyof typeof WEIGHTS;
export type Band = "green" | "yellow" | "orange" | "red";

/** Each value is 0..1, or null when there is no data for it. */
export type ReliabilityInput = Record<ComponentKey, number | null> & { workingDays: number };

export interface ComponentResult {
  key: ComponentKey;
  weight: number;
  value: number | null; // 0..1
  points: number | null; // contribution to the final 0..100 (after rescaling)
  reason: string;
}

export interface ReliabilityResult {
  score: number | null; // null when there is no data at all
  band: Band | null;
  components: ComponentResult[];
  note: string | null;
}

export function bandFor(score: number): Band {
  if (score >= 90) return "green";
  if (score >= 75) return "yellow";
  if (score >= 60) return "orange";
  return "red";
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const LABEL: Record<ComponentKey, (v: number) => string> = {
  attendance: (v) => `${pct(v)} of working days attended`,
  timesheet: (v) => `${pct(v)} of worked days had an end-of-day update`,
  delivery: (v) => `Client said "on track" ${pct(v)} of the time`,
  clientFeedback: (v) => `Average client rating ${(1 + v * 4).toFixed(1)} of 5`,
  response: (v) => `${pct(v)} of "still online" checks answered`,
  availability: (v) => `${pct(v)} of working days without unplanned absence`,
};

export function computeReliability(input: ReliabilityInput): ReliabilityResult {
  const keys = Object.keys(WEIGHTS) as ComponentKey[];
  if (input.workingDays <= 0) {
    return {
      score: null, band: null, note: "No working days in this period yet.",
      components: keys.map((key) => ({ key, weight: WEIGHTS[key], value: null, points: null, reason: "No data yet." })),
    };
  }
  const present = keys.filter((k) => input[k] != null);
  const totalWeight = present.reduce((s, k) => s + WEIGHTS[k], 0);
  if (totalWeight === 0) {
    return { score: null, band: null, note: "Not enough data to score.", components: keys.map((key) => ({ key, weight: WEIGHTS[key], value: null, points: null, reason: "No data yet." })) };
  }
  // The score is summed from UNROUNDED contributions; the per-component points are rounded only
  // for display, so rounding can never push the total past 100.
  let raw = 0;
  const components: ComponentResult[] = keys.map((key) => {
    const v = input[key];
    if (v == null) return { key, weight: WEIGHTS[key], value: null, points: null, reason: "No data yet: left out and the other parts are scaled up." };
    const clamped = Math.max(0, Math.min(1, v));
    const exact = ((WEIGHTS[key] * clamped) / totalWeight) * 100;
    raw += exact;
    return { key, weight: WEIGHTS[key], value: clamped, points: Math.round(exact * 10) / 10, reason: LABEL[key](clamped) };
  });
  const score = Math.round(raw * 10) / 10;
  const missing = keys.length - present.length;
  return { score, band: bandFor(score), components, note: missing > 0 ? `${missing} component(s) have no data yet and were excluded.` : null };
}
