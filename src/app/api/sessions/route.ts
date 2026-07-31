import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gates } from "@/content/gates";

export async function POST(request: NextRequest) {
  const session = await prisma.candidateSession.create({
    data: {
      status: "in_progress",
      currentGateId: gates[0].id,
      userAgent: request.headers.get("user-agent") ?? undefined,
      locale: "ru",
      consentAccepted: true,
      seed: crypto.randomUUID()
    }
  });

  await prisma.sessionEvent.create({
    data: {
      sessionId: session.id,
      eventType: "gate_started",
      gateId: gates[0].id,
      payload: JSON.stringify({ source: "consent" })
    }
  });

  return NextResponse.redirect(new URL(`/session/${session.id}/gate/${gates[0].id}`, request.url), 303);
}

