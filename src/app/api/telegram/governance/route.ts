import { NextResponse } from "next/server";
import {
  castGovernanceVote,
  closeGovernanceProposal,
  createGovernanceProposal,
  createGovernanceVoteChallenge,
  listGovernanceProposals
} from "@/lib/governance";

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

function governanceError(error: unknown) {
  const message = error instanceof Error ? error.message : "Голосование временно недоступно";
  const status = /session/i.test(message)
    ? 401
    : /прав/i.test(message)
      ? 403
      : /уже подтвержд|duplicate|unique/i.test(message)
        ? 409
        : /не найден|закрыт|истёк|вариант|адрес|сеть|срок|кворум|описан|назван|подпис|кошел/i.test(message)
          ? 400
          : 503;
  return noStore({
    ok: false,
    error: status === 401 ? "Сессия истекла" : status === 503 ? "Голосование временно недоступно" : message
  }, { status });
}

export async function GET(request: Request) {
  try {
    const token = bearerToken(request);
    if (!token) return noStore({ ok: false, error: "Сессия не найдена" }, { status: 401 });
    return noStore({ ok: true, ...(await listGovernanceProposals(token)) });
  } catch (error) {
    return governanceError(error);
  }
}

export async function POST(request: Request) {
  try {
    const token = bearerToken(request);
    if (!token) return noStore({ ok: false, error: "Сессия не найдена" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    if (body.action === "create") {
      return noStore({ ok: true, proposal: await createGovernanceProposal(token, body) }, { status: 201 });
    }
    if (body.action === "close") {
      return noStore({ ok: true, proposal: await closeGovernanceProposal(token, body.proposalId) });
    }
    if (body.action === "challenge") {
      return noStore({ ok: true, challenge: await createGovernanceVoteChallenge(token, body) }, { status: 201 });
    }
    if (body.action === "vote") {
      return noStore({ ok: true, vote: await castGovernanceVote(token, body) }, { status: 201 });
    }
    return noStore({ ok: false, error: "Неизвестное действие" }, { status: 400 });
  } catch (error) {
    return governanceError(error);
  }
}
