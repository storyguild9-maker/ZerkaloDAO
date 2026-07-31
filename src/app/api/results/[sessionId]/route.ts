import { NextResponse } from "next/server";
import { accessLabels, archetypeLabels } from "@/lib/labels";
import { decodeJson } from "@/lib/json";
import { prisma } from "@/lib/prisma";
import type { AccessLevel, Archetype } from "@/lib/types";

export async function GET(_request: Request, { params }: { params: { sessionId: string } }) {
  const session = await prisma.candidateSession.findUnique({
    where: { id: params.sessionId },
    include: { profile: true }
  });

  if (!session?.profile) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const accessLevel = (session.profile.manualAccessLevel ?? session.profile.accessLevel) as AccessLevel;
  const body = {
    sessionId: session.id,
    archetype: session.profile.archetype,
    archetypeLabel: archetypeLabels[session.profile.archetype as Archetype],
    accessLevel,
    accessLabel: accessLabels[accessLevel],
    summary: session.profile.summary,
    strengths: decodeJson<string[]>(session.profile.strengths, []),
    shadows: decodeJson<string[]>(session.profile.shadows, []),
    practices: decodeJson<string[]>(session.profile.practices, [])
  };

  return NextResponse.json(body, {
    headers: {
      "Content-Disposition": `attachment; filename="zerkalo-dao-result-${session.id}.json"`
    }
  });
}

