import { NextResponse } from "next/server";
import { listSessionChat, postSessionChatMessage } from "@/lib/privatePresence";

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
    const roomId = new URL(request.url).searchParams.get("roomId");
    return noStore({ ok: true, messages: await listSessionChat(token, roomId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = /session/i.test(message) ? 401 : /доступ|комнат/i.test(message) ? 403 : 503;
    const clientMessage = status === 401 ? "Сессия истекла" : status === 503 ? "Чат временно недоступен" : message;
    return noStore({ ok: false, error: clientMessage }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const token = bearerToken(request);
    if (!token) return noStore({ ok: false, error: "Сессия не найдена" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const message = await postSessionChatMessage(token, body.message, body.roomId);
    return noStore({ ok: true, message }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось отправить сообщение";
    const status = /session/i.test(message) ? 401 : /доступ|комнат/i.test(message) ? 403 : /слишком много/i.test(message) ? 429 : /сообщени/i.test(message) ? 400 : 503;
    const clientMessage = status === 401 ? "Сессия истекла" : status === 503 ? "Чат временно недоступен" : message;
    return noStore({ ok: false, error: clientMessage }, { status });
  }
}
