import { NextResponse } from "next/server";
import { authorizeRealtimeParticipant } from "@/lib/privatePresence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

function noStore<T>(payload: T, init?: ResponseInit) {
  const response = NextResponse.json(payload, init);
  response.headers.set("Cache-Control", "no-store, private");
  return response;
}

export async function POST(request: Request) {
  try {
    const token = bearerToken(request);
    if (!token) return noStore({ ok: false, error: "Сессия не найдена" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const accessToken = typeof body.supabaseAccessToken === "string" ? body.supabaseAccessToken : "";
    if (!accessToken) return noStore({ ok: false, error: "Realtime-сессия не найдена" }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error("Realtime is not configured");
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${accessToken}` },
      cache: "no-store"
    });
    if (!userResponse.ok) return noStore({ ok: false, error: "Realtime-сессия истекла" }, { status: 401 });
    const user = await userResponse.json() as { id?: unknown };
    if (typeof user.id !== "string") return noStore({ ok: false, error: "Realtime-сессия недействительна" }, { status: 401 });

    await authorizeRealtimeParticipant(token, user.id);
    return noStore({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = /session|identity/i.test(message) ? 401 : 503;
    return noStore({ ok: false, error: status === 401 ? "Сессия истекла" : "Realtime временно недоступен" }, { status });
  }
}