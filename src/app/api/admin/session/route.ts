import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { encodeJson } from "@/lib/json";
import { prisma } from "@/lib/prisma";
import type { AccessLevel } from "@/lib/types";

const accessLevels: AccessLevel[] = ["none", "iskatel", "slyshashchiy", "pustaya_chasha"];

const reviewSchema = z.object({
  password: z.string().min(1),
  sessionId: z.string().min(1),
  accessLevel: z.enum(["none", "iskatel", "slyshashchiy", "pustaya_chasha"]).optional(),
  confirmAccess: z.boolean().default(false),
  isProspect: z.boolean().default(false),
  note: z.string().trim().max(2000).optional(),
  reviewer: z.string().trim().max(120).optional()
});

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const parsed = reviewSchema.safeParse({
    password: String(form.get("password") ?? ""),
    sessionId: String(form.get("sessionId") ?? ""),
    accessLevel: accessLevels.includes(String(form.get("accessLevel")) as AccessLevel)
      ? String(form.get("accessLevel"))
      : undefined,
    confirmAccess: form.get("confirmAccess") === "on",
    isProspect: form.get("isProspect") === "on",
    note: String(form.get("note") ?? ""),
    reviewer: String(form.get("reviewer") ?? "")
  });

  const expected = process.env.ADMIN_PASSWORD ?? "change-me";
  if (!parsed.success || parsed.data.password !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { sessionId, accessLevel, confirmAccess, isProspect, note, reviewer } = parsed.data;
  const profile = await prisma.scoreProfile.findUnique({ where: { sessionId } });
  const updates: Prisma.PrismaPromise<unknown>[] = [];

  updates.push(
    prisma.candidateSession.update({
      where: { id: sessionId },
      data: { status: "reviewed", isProspect }
    })
  );

  if (profile && accessLevel) {
    updates.push(
      prisma.scoreProfile.update({
        where: { sessionId },
        data: { manualAccessLevel: accessLevel, accessConfirmed: confirmAccess }
      })
    );
  }

  if (note?.trim()) {
    updates.push(
      prisma.adminNote.create({
        data: { sessionId, note: note.trim(), reviewer: reviewer?.trim() || undefined }
      })
    );
  }

  updates.push(
    prisma.sessionEvent.create({
      data: {
        sessionId,
        eventType: "button_clicked",
        payload: encodeJson({ action: "admin_review_updated", accessLevel, confirmAccess, isProspect })
      }
    })
  );

  await prisma.$transaction(updates);

  return NextResponse.redirect(new URL(`/admin?password=${encodeURIComponent(expected)}&session=${sessionId}`, request.url), 303);
}

