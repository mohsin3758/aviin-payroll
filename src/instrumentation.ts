// Starts the Contractor Workforce worker: one in-process timer that runs a pass of the automation
// (reminders, escalation, day closing, client digests) every minute. It lives in the web server
// process so no extra container or queue is needed. With every workforce feature flag off, a
// pass is a single cheap query and does nothing.
//
// Set WORKFORCE_WORKER=off to disable it (e.g. for a second instance — only ONE process should run it).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.WORKFORCE_WORKER === "off") return;

  const g = globalThis as { __workforceTimer?: ReturnType<typeof setInterval> };
  if (g.__workforceTimer) return; // dev hot-reload must not stack timers

  const { runTick } = await import("@/lib/workforce/tick");
  let running = false;
  g.__workforceTimer = setInterval(async () => {
    if (running) return; // a slow pass must never overlap the next one
    running = true;
    try {
      await runTick();
    } catch (error) {
      console.error("[workforce] tick failed:", error);
    } finally {
      running = false;
    }
  }, 60_000);
  g.__workforceTimer.unref?.();
  console.log("[workforce] worker started (60s tick)");
}
