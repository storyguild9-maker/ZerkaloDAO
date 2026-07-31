import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { gateById, getNextGateId } from "@/content/gates";
import { decodeJson, encodeJson } from "@/lib/json";
import { prisma } from "@/lib/prisma";
import { calculateGateScore } from "@/lib/scoring/calculateGateScore";
import { calculateFinalProfile } from "@/lib/scoring/calculateFinalProfile";
import type { GateId, GateScoreResult } from "@/lib/types";

const submitSchema = z.object({
  sessionId: z.string().min(1),
  gateId: z.string().min(1),
  primaryChoice: z.string().optional(),
  reflectionText: z.string().optional(),
  elapsedMs: z.number().int().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
  events: z
    .array(
      z.object({
        eventType: z.string(),
        elapsedMs: z.number().int().nonnegative().optional(),
        payload: z.record(z.unknown()).optional()
      })
    )
    .default([])
});

function isGateId(id: string): id is GateId {
  return id in gateById;
}

export async function POST(request: NextRequest) {
  const parsed = submitSchema.safeParse(await request.json());
  if (!parsed.success || !isGateId(parsed.data.gateId)) {
    return NextResponse.json({ error: "invalid_submission" }, { status: 400 });
  }

  const input = parsed.data;
  const gateId = input.gateId as GateId;
  const session = await prisma.candidateSession.findUnique({ where: { id: input.sessionId } });
  if (!session || session.currentGateId !== input.gateId) {
    return NextResponse.json({ error: "invalid_session_or_gate" }, { status: 409 });
  }

  const eventsForScore = input.events.map((event) => ({
    gateId,
    eventType: event.eventType as never,
    elapsedMs: event.elapsedMs,
    payload: event.payload
  }));

  const gateScore = calculateGateScore({
    gateId,
    events: eventsForScore,
    primaryChoice: input.primaryChoice,
    reflectionText: input.reflectionText,
    metadata: input.metadata
  });

  await prisma.$transaction(async (tx) => {
    for (const event of input.events) {
      await tx.sessionEvent.create({
        data: {
          sessionId: input.sessionId,
          gateId: input.gateId,
          eventType: event.eventType as never,
          elapsedMs: event.elapsedMs,
          payload: event.payload ? encodeJson(event.payload) : undefined
        }
      });
    }

    await tx.gateAttempt.create({
      data: {
        sessionId: input.sessionId,
        gateId: input.gateId,
        status: "completed",
        completedAt: new Date(),
        primaryChoice: input.primaryChoice,
        reflectionText: input.reflectionText,
        trapTriggered: gateScore.trapTriggered,
        scoreDelta: encodeJson(gateScore.scoreDelta),
        metadata: encodeJson({ ...input.metadata, flags: gateScore.flags, notes: gateScore.notes })
      }
    });

    await tx.sessionEvent.create({
      data: {
        sessionId: input.sessionId,
        gateId: input.gateId,
        eventType: "gate_completed",
        elapsedMs: input.elapsedMs,
        payload: encodeJson({ primaryChoice: input.primaryChoice })
      }
    });
  });

  const nextGateId = getNextGateId(gateId);
  if (nextGateId) {
    await prisma.candidateSession.update({
      where: { id: input.sessionId },
      data: { currentGateId: nextGateId }
    });
    await prisma.sessionEvent.create({
      data: { sessionId: input.sessionId, gateId: nextGateId, eventType: "gate_started" }
    });
    return NextResponse.json({ nextUrl: `/session/${input.sessionId}/gate/${nextGateId}` });
  }

  const attempts = await prisma.gateAttempt.findMany({
    where: { sessionId: input.sessionId, status: "completed" },
    orderBy: { startedAt: "asc" }
  });
  const results: GateScoreResult[] = attempts.map((attempt) => ({
    scoreDelta: decodeJson<Record<string, number>>(attempt.scoreDelta, {}),
    flags: (decodeJson<{ flags?: string[] }>(attempt.metadata, {}).flags ?? []) as never,
    notes: decodeJson<{ notes?: string[] }>(attempt.metadata, {}).notes ?? [],
    trapTriggered: attempt.trapTriggered
  }));
  const profile = calculateFinalProfile(input.sessionId, results);

  await prisma.$transaction([
    prisma.scoreProfile.upsert({
      where: { sessionId: input.sessionId },
      create: {
        sessionId: input.sessionId,
        metrics: encodeJson(profile.metrics),
        archetype: profile.archetype,
        accessLevel: profile.accessLevel,
        summary: profile.summary,
        strengths: encodeJson(profile.strengths),
        shadows: encodeJson(profile.shadows),
        practices: encodeJson(profile.practices),
        riskFlags: encodeJson(profile.riskFlags)
      },
      update: {
        metrics: encodeJson(profile.metrics),
        archetype: profile.archetype,
        accessLevel: profile.accessLevel,
        summary: profile.summary,
        strengths: encodeJson(profile.strengths),
        shadows: encodeJson(profile.shadows),
        practices: encodeJson(profile.practices),
        riskFlags: encodeJson(profile.riskFlags)
      }
    }),
    prisma.candidateSession.update({
      where: { id: input.sessionId },
      data: { status: "completed", completedAt: new Date(), currentGateId: null }
    })
  ]);

  return NextResponse.json({ nextUrl: `/session/${input.sessionId}/result` });
}

