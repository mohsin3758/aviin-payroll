/**
 * Live Board column for one assignment-day (docs/CONTRACTOR_MONITORING_SPEC.md §11). Pure, so the
 * precedence (what the coordinator should look at first) is tested rather than implied by a UI.
 */
export type BoardColumn =
  | "Exception" | "Leave" | "Unavailable" | "Checked Out" | "Missing Update" | "Late" | "Checked In" | "Not Started" | "Off";

export interface BoardFacts {
  state: string; // DailyStatus.state, or "pending" when no row exists yet
  hasCheckIn: boolean;
  hasCheckOut: boolean;
  eodDone: boolean;
  closed: boolean;
  openExceptions: number;
  /** True once the local time is past shift end. */
  shiftOver: boolean;
}

export function boardColumn(f: BoardFacts): BoardColumn {
  if (f.state === "holiday" || f.state === "weekly_off") return f.hasCheckIn ? "Checked In" : "Off";
  if (f.openExceptions > 0) return "Exception";
  if (f.state === "leave") return "Leave";
  if (f.state === "absent" && f.closed) return "Unavailable";
  if (f.hasCheckOut) return "Checked Out";
  if (f.hasCheckIn && f.shiftOver && !f.eodDone) return "Missing Update";
  if (f.state === "late") return "Late";
  if (f.hasCheckIn) return "Checked In";
  return "Not Started";
}
