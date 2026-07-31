import { notFound, redirect } from "next/navigation";
import { DaoShell } from "@/components/DaoShell";
import { GateRunner } from "@/components/GateRunner";
import { gateById } from "@/content/gates";
import { prisma } from "@/lib/prisma";
import type { GateId } from "@/lib/types";

function isGateId(id: string): id is GateId {
  return id in gateById;
}

export default async function GatePage({
  params
}: {
  params: { sessionId: string; gateId: string };
}) {
  if (!isGateId(params.gateId)) notFound();
  const session = await prisma.candidateSession.findUnique({ where: { id: params.sessionId } });
  if (!session) notFound();
  if (session.status === "completed") redirect(`/session/${session.id}/result`);
  if (session.currentGateId && session.currentGateId !== params.gateId) {
    redirect(`/session/${session.id}/gate/${session.currentGateId}`);
  }

  const gate = gateById[params.gateId];
  return (
    <DaoShell
      eyebrow={`Врата ${gate.order} / 7`}
      title={gate.title}
      subtitle={`${gate.subtitle}. Принцип: ${gate.daoPrinciple}.`}
    >
      <GateRunner sessionId={session.id} gate={gate} seed={session.seed} />
    </DaoShell>
  );
}

