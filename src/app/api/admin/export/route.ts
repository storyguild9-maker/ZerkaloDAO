import { NextRequest, NextResponse } from "next/server";
import { decodeJson } from "@/lib/json";
import { prisma } from "@/lib/prisma";

function maybeJson(value: string | null) {
  return decodeJson<unknown>(value, value);
}

export async function GET(request: NextRequest) {
  const password = request.nextUrl.searchParams.get("password") ?? "";
  const sessionId = request.nextUrl.searchParams.get("session") ?? "";
  const expected = process.env.ADMIN_PASSWORD ?? "change-me";

  if (password !== expected || !sessionId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const session = await prisma.candidateSession.findUnique({
    where: { id: sessionId },
    include: {
      attempts: { orderBy: { startedAt: "asc" } },
      events: { orderBy: { timestamp: "asc" } },
      profile: true,
      notes: { orderBy: { createdAt: "desc" } }
    }
  });

  if (!session) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = {
    ...session,
    profile: session.profile
      ? {
          ...session.profile,
          metrics: maybeJson(session.profile.metrics),
          strengths: maybeJson(session.profile.strengths),
          shadows: maybeJson(session.profile.shadows),
          practices: maybeJson(session.profile.practices),
          riskFlags: maybeJson(session.profile.riskFlags),
          effectiveAccessLevel: session.profile.manualAccessLevel ?? session.profile.accessLevel
        }
      : null,
    attempts: session.attempts.map((attempt) => ({
      ...attempt,
      scoreDelta: maybeJson(attempt.scoreDelta),
      metadata: maybeJson(attempt.metadata)
    })),
    events: session.events.map((event) => ({ ...event, payload: maybeJson(event.payload) }))
  };

  return NextResponse.json(body, {
    headers: {
      "Content-Disposition": `attachment; filename="zerkalo-dao-${session.id}.json"`
    }
  });
}

