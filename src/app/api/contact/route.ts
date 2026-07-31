import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { encodeJson } from "@/lib/json";
import { prisma } from "@/lib/prisma";

const contactSchema = z.object({
  sessionId: z.string().min(1),
  contact: z.string().trim().min(2).max(160)
});

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const parsed = contactSchema.safeParse({
    sessionId: String(form.get("sessionId") ?? ""),
    contact: String(form.get("contact") ?? "")
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_contact" }, { status: 400 });
  }

  const { sessionId, contact } = parsed.data;

  await prisma.$transaction([
    prisma.candidateSession.update({
      where: { id: sessionId },
      data: { optionalEmail: contact }
    }),
    prisma.sessionEvent.create({
      data: {
        sessionId,
        eventType: "button_clicked",
        payload: encodeJson({ action: "contact_saved" })
      }
    })
  ]);

  const referer = request.headers.get("referer");
  return NextResponse.redirect(referer ?? new URL("/session/" + sessionId + "/result", request.url), 303);
}

