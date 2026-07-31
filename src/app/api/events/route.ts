import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { encodeJson } from "@/lib/json";
import { prisma } from "@/lib/prisma";

const eventSchema = z.object({
  sessionId: z.string().min(1),
  gateId: z.string().optional(),
  eventType: z.enum([
    "gate_started",
    "button_clicked",
    "choice_selected",
    "wait_threshold_reached",
    "text_started",
    "text_submitted",
    "back_navigation",
    "hint_requested",
    "gate_completed",
    "result_viewed"
  ]),
  elapsedMs: z.number().int().nonnegative().optional(),
  payload: z.record(z.unknown()).optional()
});

export async function POST(request: NextRequest) {
  const parsed = eventSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_event" }, { status: 400 });
  }

  await prisma.sessionEvent.create({
    data: {
      ...parsed.data,
      payload: parsed.data.payload ? encodeJson(parsed.data.payload) : undefined
    }
  });
  return NextResponse.json({ ok: true });
}

