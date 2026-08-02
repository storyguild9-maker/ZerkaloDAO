import { NextResponse } from "next/server";
import { listActivePresence, updateOwnPresence } from "@/lib/privatePresence";

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

export async function GET(request: Request) {
  try {
    const token = bearerToken(request);
    if (!token) return noStore({ ok: false, error: "Сессия не найдена" }, { status: 401 });
    return noStore({ ok: true, participants: await listActivePresence(token) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = /session/i.test(message) ? 401 : 503;
    return noStore({ ok: false, error: status === 401 ? "Сессия истекла" : "Присутствие временно недоступно" }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const token = bearerToken(request);
    if (!token) return noStore({ ok: false, error: "Сессия не найдена" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const presence = await updateOwnPresence(token, body);
    return noStore({ ok: true, presence });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось обновить присутствие";
    const status = /session/i.test(message) ? 401 : /ник|символ|облик|пол/i.test(message) ? 400 : 503;
    const clientMessage = status === 401 ? "Сессия истекла" : status === 400 ? message : "Не удалось обновить присутствие";
    return noStore({ ok: false, error: clientMessage }, { status });
  }
}
