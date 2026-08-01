import { NextResponse } from "next/server";
import { createPrivatePresenceSession, createTelegramSubjectHash } from "@/lib/privatePresence";
import { validateTelegramInitData } from "@/lib/telegramAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AuthRequest = {
  initData?: string;
};

function noStore<T>(payload: T, init?: ResponseInit) {
  const response = NextResponse.json(payload, init);
  response.headers.set("Cache-Control", "no-store, private");
  return response;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as AuthRequest;
    const initData = body.initData?.trim() ?? "";
    const devAllowed =
      process.env.NODE_ENV !== "production" &&
      process.env.TELEGRAM_ALLOW_DEV_AUTH === "true";

    let telegramUserId: number;
    if (!initData) {
      if (!devAllowed) {
        return noStore({ ok: false, error: "Откройте приложение внутри Telegram" }, { status: 401 });
      }
      telegramUserId = 1;
    } else {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) {
        return noStore({ ok: false, error: "Вход временно недоступен" }, { status: 503 });
      }
      const maxAgeSeconds = Number(process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS ?? 3600);
      telegramUserId = validateTelegramInitData(initData, botToken, maxAgeSeconds).user.id;
    }

    const sessionSecret = process.env.TELEGRAM_SESSION_SECRET;
    if (!sessionSecret || sessionSecret.length < 32) {
      return noStore({ ok: false, error: "Приватные сессии ещё не настроены" }, { status: 503 });
    }

    const subjectHash = createTelegramSubjectHash(telegramUserId, sessionSecret);
    const session = await createPrivatePresenceSession(subjectHash);
    return noStore({ ok: true, session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/Presence storage/i.test(message)) {
      return noStore({ ok: false, error: "Хранилище присутствия временно недоступно" }, { status: 503 });
    }
    return noStore({ ok: false, error: "Не удалось подтвердить вход через Telegram" }, { status: 401 });
  }
}
