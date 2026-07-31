import { NextResponse } from "next/server";
import { validateTelegramInitData, type TelegramUser } from "@/lib/telegramAuth";

export const runtime = "nodejs";

type AuthRequest = {
  initData?: string;
};

async function upsertTelegramProfile(user: TelegramUser) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return false;

  const response = await fetch(`${supabaseUrl}/rest/v1/telegram_profiles?on_conflict=telegram_id`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify([{
      telegram_id: user.id,
      first_name: user.first_name,
      last_name: user.last_name ?? null,
      username: user.username ?? null,
      language_code: user.language_code ?? null,
      photo_url: user.photo_url ?? null,
      is_premium: user.is_premium ?? false,
      last_seen_at: new Date().toISOString()
    }]),
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase profile sync failed: ${response.status} ${message}`);
  }
  return true;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as AuthRequest;
    const initData = body.initData?.trim() ?? "";

    if (!initData) {
      const devAllowed =
        process.env.NODE_ENV !== "production" &&
        process.env.TELEGRAM_ALLOW_DEV_AUTH === "true";
      if (!devAllowed) {
        return NextResponse.json({ ok: false, error: "Откройте приложение внутри Telegram" }, { status: 401 });
      }

      return NextResponse.json({
        ok: true,
        development: true,
        profileStored: false,
        user: { id: 1, first_name: "Хранитель", username: "local_dev" }
      });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json({ ok: false, error: "TELEGRAM_BOT_TOKEN не настроен" }, { status: 503 });
    }

    const maxAgeSeconds = Number(process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS ?? 86400);
    const session = validateTelegramInitData(initData, botToken, maxAgeSeconds);
    let profileStored = false;
    let profileWarning: string | undefined;
    try {
      profileStored = await upsertTelegramProfile(session.user);
    } catch (error) {
      profileWarning = error instanceof Error ? error.message : "Profile sync failed";
    }

    return NextResponse.json({
      ok: true,
      profileStored,
      profileWarning,
      user: session.user,
      startParam: session.startParam
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось проверить Telegram";
    return NextResponse.json({ ok: false, error: message }, { status: 401 });
  }
}

