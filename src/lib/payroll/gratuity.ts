export const GRATUITY_DAYS_PER_YEAR = 15;
export const GRATUITY_WORKING_DAYS_PER_MONTH = 26;
export const GRATUITY_MIN_YEARS_OF_SERVICE = 5;
// Statutory ceiling under the Payment of Gratuity Act, 1972 (as amended). Employers may pay
// more voluntarily, but the Act itself only mandates up to this cap.
export const GRATUITY_STATUTORY_CAP = 2000000;

export interface GratuityResult {
  eligibleForGratuity: boolean;
  completedYears: number;
  rawAmount: number;
  cappedAmount: number;
}

/**
 * Payment of Gratuity Act, 1972: (15 x last-drawn Basic+DA x completed years of service) / 26.
 * A final partial year rounds up to a full year if it exceeds 6 months, down otherwise.
 * Only payable after 5 years of continuous service — death/disablement exceptions (which waive
 * the 5-year requirement) are not modeled here.
 */
export function calculateGratuity(
  lastDrawnBasicDA: number,
  dateOfJoining: Date,
  dateOfExit: Date
): GratuityResult {
  const msPerDay = 1000 * 60 * 60 * 24;
  const totalDays = Math.floor((dateOfExit.getTime() - dateOfJoining.getTime()) / msPerDay);
  const totalYearsExact = totalDays / 365.25;
  const wholeYears = Math.floor(totalYearsExact);
  const remainderMonths = (totalYearsExact - wholeYears) * 12;
  const completedYears = remainderMonths > 6 ? wholeYears + 1 : wholeYears;

  const eligibleForGratuity = completedYears >= GRATUITY_MIN_YEARS_OF_SERVICE;
  if (!eligibleForGratuity) {
    return { eligibleForGratuity: false, completedYears, rawAmount: 0, cappedAmount: 0 };
  }

  const rawAmount = Math.round(
    (GRATUITY_DAYS_PER_YEAR * lastDrawnBasicDA * completedYears) / GRATUITY_WORKING_DAYS_PER_MONTH
  );
  const cappedAmount = Math.min(rawAmount, GRATUITY_STATUTORY_CAP);

  return { eligibleForGratuity, completedYears, rawAmount, cappedAmount };
}
