import { NextResponse } from "next/server";
import {
  createPrivateChatRoom,
  joinPrivateChatRoom,
  listJoinedChatRooms
} from "@/lib/privatePresence";

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

function roomError(error: unknown) {
  const message = error instanceof Error ? error.message : "Не удалось открыть комнату";
  const status = /session/i.test(message)
    ? 401
    : /неверный/i.test(message)
      ? 403
      : /лимит/i.test(message)
        ? 409
        : /назван|парол|код|комнат/i.test(message)
          ? 400
          : 503;
  const clientMessage = status === 401
    ? "Сессия истекла"
    : status === 503
      ? "Закрытые комнаты временно недоступны"
      : message;
  return noStore({ ok: false, error: clientMessage }, { status });
}

export async function GET(request: Request) {
  try {
    const token = bearerToken(request);
    if (!token) return noStore({ ok: false, error: "Сессия не найдена" }, { status: 401 });
    return noStore({ ok: true, rooms: await listJoinedChatRooms(token) });
  } catch (error) {
    return roomError(error);
  }
}

export async function POST(request: Request) {
  try {
    const token = bearerToken(request);
    if (!token) return noStore({ ok: false, error: "Сессия не найдена" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const room = body.action === "create"
      ? await createPrivateChatRoom(token, body.name, body.password)
      : body.action === "join"
        ? await joinPrivateChatRoom(token, body.code, body.password)
        : null;
    if (!room) return noStore({ ok: false, error: "Неизвестное действие" }, { status: 400 });
    return noStore({ ok: true, room }, { status: body.action === "create" ? 201 : 200 });
  } catch (error) {
    return roomError(error);
  }
}
