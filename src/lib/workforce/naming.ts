/**
 * Lower-cases a client name and strips punctuation and common company suffixes so that
 * "ABC Technologies Pvt. Ltd." and "abc technologies private limited" collide. Used for duplicate
 * detection (Client.normalizedName) and for suggesting matches in the legacy-client mapping —
 * never to merge anything automatically.
 */
const SUFFIX_WORDS = new Set([
  "pvt", "private", "ltd", "limited", "llp", "llc", "inc", "incorporated", "corp", "corporation", "co", "company",
]);

export function normalizeClientName(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  // Drop suffix words, but only if something meaningful remains (a client literally named "Co" stays).
  const kept = words.filter((w) => !SUFFIX_WORDS.has(w));
  return (kept.length > 0 ? kept : words).join(" ");
}

/** Next sequential client code ("CL-001", "CL-002", ...) given the codes already in use. */
export function nextClientCode(existingCodes: string[]): string {
  let max = 0;
  for (const code of existingCodes) {
    const match = /^CL-(\d+)$/.exec(code);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return `CL-${String(max + 1).padStart(3, "0")}`;
}
