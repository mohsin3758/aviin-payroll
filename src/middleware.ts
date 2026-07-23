import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

// Routes reachable without a session: login/logout/session-check itself, and the
// bootstrap seed endpoint (which enforces its own confirm-token + admin/first-run check).
const PUBLIC_API_PREFIXES = ["/api/auth/", "/api/seed"];
// Root health check has no sensitive data.
const PUBLIC_EXACT = ["/api"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Blanket rate limit as defense-in-depth against brute force / accidental hammering,
  // keyed by client IP (falls back to a shared bucket if unavailable behind a proxy without
  // x-forwarded-for, which is an acceptable degradation for a single-instance deployment).
  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
  const rl = checkRateLimit(`api:${ip}`, 300, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests. Slow down." }, { status: 429 });
  }

  if (PUBLIC_EXACT.includes(pathname) || PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized — please log in." }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
