// The single definition of "active employee" shared by Dashboard, Payroll processing, and
// Reports' headcount type — extracted so these can never silently drift apart. Excludes both
// exited employees (dateOfExit) and anyone still mid-self-onboarding (onboardingStatus).
export const ACTIVE_EMPLOYEE_WHERE = { dateOfExit: null, onboardingStatus: "active" } as const;
