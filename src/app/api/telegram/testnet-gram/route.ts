import { NextResponse } from "next/server";
import {
  createTestnetGramChallenge,
  getTestnetGramStatus,
  submitTestnetGramClaim
} from "@/lib/testnetGramFaucet";

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

function claimError(error: unknown) {
  const message = error instanceof Error ? error.message : "Выдача test GRAM временно недоступна";
  const status = /session/i.test(message)
    ? 401
    : /уже были выданы|уже получены|already.claimed|duplicate|unique/i.test(message)
      ? 409
      : /кошел|подпис|testnet|сеть|запрос|формат|истёк|поврежд|другой/i.test(message)
        ? 400
        : 503;
  return noStore({
    ok: false,
    error: status === 401
      ? "Сессия истекла"
      : status === 503
        ? "Выдача test GRAM временно недоступна"
        : message
  }, { status });
}

export async function GET(request: Request) {
  try {
    const token = bearerToken(request);
    if (!token) return noStore({ ok: false, error: "Сессия не найдена" }, { status: 401 });
    const url = new URL(request.url);
    const status = await getTestnetGramStatus(token, {
      walletAddress: url.searchParams.get("walletAddress"),
      walletNetwork: url.searchParams.get("walletNetwork")
    });
    return noStore({ ok: true, status });
  } catch (error) {
    return claimError(error);
  }
}

export async function POST(request: Request) {
  try {
    const token = bearerToken(request);
    if (!token) return noStore({ ok: false, error: "Сессия не найдена" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    if (body.action === "challenge") {
      const challenge = await createTestnetGramChallenge(token, body);
      return noStore({ ok: true, challenge }, { status: 201 });
    }
    if (body.action === "claim") {
      const status = await submitTestnetGramClaim(token, body);
      return noStore({ ok: true, status }, { status: 202 });
    }
    return noStore({ ok: false, error: "Неизвестное действие" }, { status: 400 });
  } catch (error) {
    return claimError(error);
  }
}
