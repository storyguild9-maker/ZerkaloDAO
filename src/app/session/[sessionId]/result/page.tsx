import { notFound } from "next/navigation";
import { DaoCard, DaoKicker, DaoPanel } from "@/components/DaoDesign";
import { DaoShell } from "@/components/DaoShell";
import { ResultActions } from "@/components/ResultActions";
import { accessLabels, archetypeLabels } from "@/lib/labels";
import { decodeJson } from "@/lib/json";
import { prisma } from "@/lib/prisma";
import type { AccessLevel, Archetype } from "@/lib/types";

export default async function ResultPage({ params }: { params: { sessionId: string } }) {
  const session = await prisma.candidateSession.findUnique({
    where: { id: params.sessionId },
    include: { profile: true }
  });
  if (!session || !session.profile) notFound();

  await prisma.sessionEvent.create({
    data: { sessionId: session.id, eventType: "result_viewed" }
  });

  const effectiveAccess = (session.profile.manualAccessLevel ?? session.profile.accessLevel) as AccessLevel;
  const archetypeLabel = archetypeLabels[session.profile.archetype as Archetype];
  const accessLabel = accessLabels[effectiveAccess];
  const strengths = decodeJson<string[]>(session.profile.strengths, []);
  const shadows = decodeJson<string[]>(session.profile.shadows, []);
  const practices = decodeJson<string[]>(session.profile.practices, []);
  const copyText = [
    "Зеркало Дао",
    `Архетип: ${archetypeLabel}`,
    `Уровень доступа: ${accessLabel}`,
    `Расшифровка: ${session.profile.summary}`,
    `Сильные стороны: ${strengths.join(", ")}`,
    `Тени: ${shadows.join(", ")}`,
    `Практика на 24 часа: ${practices.join("; ")}`
  ].join("\n");

  return (
    <DaoShell eyebrow="Результат" title={archetypeLabel} subtitle={session.profile.summary} seal="bowl">
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="space-y-5">
          <DaoPanel className="relative min-h-56">
            <DaoKicker>Уровень доступа</DaoKicker>
            <p className="mt-3 text-3xl font-semibold text-white">{accessLabel}</p>
            <p className="mt-4 max-w-xl leading-7 text-mist/75">Ты не провалился. Ты увидел часть механизма. Это уже начало пути.</p>
            {effectiveAccess === "none" ? (
              <p className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4 leading-7 text-mist/75">
                Сейчас система рекомендует пройти обучающий цикл и вернуться позже. Это не отказ, а приглашение укрепить внимание.
              </p>
            ) : null}
          </DaoPanel>

          <ResultList title="Сильные стороны" items={strengths} />
          <ResultList title="Главные ловушки" items={shadows} />
          <ResultList title="Практика на 24 часа" items={practices} />
        </section>

        <DaoPanel className="space-y-6">
          <div>
            <DaoKicker>Даосская расшифровка</DaoKicker>
            <p className="mt-4 leading-8 text-mist/80">
              Результат показывает не ярлык личности, а то, какой импульс сильнее проявился в прохождении. Точная формула скоринга скрыта: важен не счёт, а способность увидеть движение внутри себя.
            </p>
          </div>

          <ResultActions copyText={copyText} downloadHref={`/api/results/${session.id}`} />

          <form action="/api/contact" method="post" className="grid gap-3">
            <input type="hidden" name="sessionId" value={session.id} />
            <label className="dao-kicker">Контакт для доступа</label>
            <input name="contact" defaultValue={session.optionalEmail ?? ""} className="dao-input p-3" placeholder="email или Telegram" required />
            <button className="dao-action px-5 py-3">{session.optionalEmail ? "Обновить контакт" : "Сохранить контакт"}</button>
            {session.optionalEmail ? <p className="text-sm text-mist/60">Контакт сохранен в сессии.</p> : null}
          </form>
        </DaoPanel>
      </div>
    </DaoShell>
  );
}

function ResultList({ title, items }: { title: string; items: string[] }) {
  return (
    <DaoCard>
      <DaoKicker>{title}</DaoKicker>
      <ul className="mt-4 space-y-2 text-mist/80">
        {items.map((item) => (
          <li key={item} className="leading-7">
            {item}
          </li>
        ))}
      </ul>
    </DaoCard>
  );
}
