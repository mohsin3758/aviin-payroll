// Bounds the size of a multi-month report range — protects query cost and CSV/xlsx size.
export const MAX_RANGE_MONTHS = 24;

export class InvalidRangeError extends Error {}

/** Enumerates every (month, year) pair from `from` to `to`, inclusive, in chronological order.
 * Throws InvalidRangeError if `to` is before `from` or the span exceeds MAX_RANGE_MONTHS. */
export function enumerateMonthRange(
  fromMonth: number,
  fromYear: number,
  toMonth: number,
  toYear: number
): { month: number; year: number }[] {
  const fromIndex = fromYear * 12 + (fromMonth - 1);
  const toIndex = toYear * 12 + (toMonth - 1);

  if (toIndex < fromIndex) {
    throw new InvalidRangeError("toMonth/toYear must not be before fromMonth/fromYear.");
  }
  if (toIndex - fromIndex + 1 > MAX_RANGE_MONTHS) {
    throw new InvalidRangeError(`Range cannot exceed ${MAX_RANGE_MONTHS} months.`);
  }

  const pairs: { month: number; year: number }[] = [];
  for (let i = fromIndex; i <= toIndex; i++) {
    pairs.push({ month: (i % 12) + 1, year: Math.floor(i / 12) });
  }
  return pairs;
}
