/** Client-safe list of workforce feature flags (no database import), shared by the UI and the server. */
export const WORKFORCE_FLAG_KEYS = [
  "contractor_workforce_enabled", // master switch: every other flag is inert while this is off
  "whatsapp_enabled",
  "client_digest_enabled",
  "client_confirmation_enabled",
  "exception_engine_enabled",
  "payroll_prefill_enabled",
  "reliability_score_enabled",
  "sms_fallback_enabled",
  "voice_automation_enabled",
] as const;

export type WorkforceFlagKey = (typeof WORKFORCE_FLAG_KEYS)[number];
