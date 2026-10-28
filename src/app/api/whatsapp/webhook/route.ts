import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyMetaSignature } from "@/lib/workforce/tokens";
import { applyStatus, handleInbound, type InboundMessage, type StatusUpdate } from "@/lib/workforce/inbound";
import { checkRateLimit } from "@/lib/rate-limit";

// Meta's WhatsApp webhook. PUBLIC (no session): every request authenticates itself.
//  GET  — one-time setup handshake, answered only with the configured verify token.
//  POST — events. The raw body must carry a valid X-Hub-Signature-256 made with the app secret;
//         unsigned or wrongly-signed requests are rejected and never processed.

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const company = await db.company.findFirst({ select: { whatsappVerifyToken: true } });
  const expected = company?.whatsappVerifyToken;
  if (expected && sp.get("hub.mode") === "subscribe" && sp.get("hub.verify_token") === expected) {
    return new NextResponse(sp.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  if (!checkRateLimit(`wa-webhook:${ip}`, 600, 60_000).allowed) return new NextResponse("Too many requests", { status: 429 });

  const raw = await request.text();
  const company = await db.company.findFirst({ select: { whatsappAppSecret: true } });
  if (!company?.whatsappAppSecret) return new NextResponse("Webhook not configured", { status: 503 });
  if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), company.whatsappAppSecret)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let body: unknown;
  try { body = JSON.parse(raw); } catch { return new NextResponse("Bad request", { status: 400 }); }

  const messages: InboundMessage[] = [];
  const statuses: StatusUpdate[] = [];
  const entries = (body as { entry?: { changes?: { value?: Record<string, unknown> }[] }[] })?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const m of (value.messages as Record<string, unknown>[] | undefined) ?? []) {
        const id = String(m.id ?? "");
        const from = String(m.from ?? "");
        if (!id || !from) continue;
        const type = String(m.type ?? "");
        if (type === "button") {
          messages.push({ id, from, kind: "button", payload: String((m.button as { payload?: string })?.payload ?? "") });
        } else if (type === "interactive") {
          const reply = (m.interactive as { button_reply?: { id?: string } })?.button_reply;
          messages.push({ id, from, kind: "button", payload: String(reply?.id ?? "") });
        } else if (type === "text") {
          messages.push({ id, from, kind: "text", text: String((m.text as { body?: string })?.body ?? "") });
        } else messages.push({ id, from, kind: "other" });
      }
      for (const s of (value.statuses as Record<string, unknown>[] | undefined) ?? []) {
        const errors = s.errors as { title?: string; message?: string }[] | undefined;
        statuses.push({ id: String(s.id ?? ""), status: String(s.status ?? ""), error: errors?.[0]?.title ?? errors?.[0]?.message });
      }
    }
  }

  // Always answer 200 once the signature is good: a processing error on one message must not make
  // Meta retry the whole batch. Each failure is logged and the rest still run.
  for (const s of statuses) {
    try { if (s.id) await applyStatus(s); } catch (e) { console.error("[workforce] status update failed:", e); }
  }
  for (const m of messages) {
    try { await handleInbound(m); } catch (e) { console.error("[workforce] inbound failed:", e); }
  }
  return NextResponse.json({ ok: true });
}
