"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AccessGate,
  ChosenGate,
  GardenGate,
  RightnessGate,
  SaviorGate,
  UncertaintyGate,
  UrgencyGate,
  type GardenState,
  type SaviorState
} from "@/components/gates/GateStages";
import { DaoKicker, DaoPanel, DaoProgress, DaoStat } from "@/components/DaoDesign";
import type { Gate, GateOption, SessionEventInput } from "@/lib/types";

type Props = {
  sessionId: string;
  gate: Gate;
  seed: string;
};

const defaultGarden: GardenState = {
  water: 50,
  light: 50,
  temperature: 50,
  wind: 50,
  soil: 50
};

const defaultSavior: SaviorState = {
  acute: 30,
  chronic: 10,
  seed: 25,
  self: 35
};

function hashValue(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededOptions(options: GateOption[] | undefined, seed: string, gateId: string) {
  return [...(options ?? [])].sort((left, right) => hashValue(`${seed}:${gateId}:${left.id}`) - hashValue(`${seed}:${gateId}:${right.id}`));
}

export function GateRunner({ sessionId, gate, seed }: Props) {
  const router = useRouter();
  const startedAt = useRef(Date.now());
  const eventsRef = useRef<SessionEventInput[]>([]);
  const submittingRef = useRef(false);
  const textStartedAt = useRef<number | null>(null);
  const textEditCount = useRef(0);
  const [choice, setChoice] = useState<string>("");
  const [reflectionText, setReflectionText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [timerDone, setTimerDone] = useState(false);
  const [garden, setGarden] = useState<GardenState>(defaultGarden);
  const [gardenInterventions, setGardenInterventions] = useState(0);
  const [savior, setSavior] = useState<SaviorState>(defaultSavior);

  const step = gate.steps[0];
  const orderedOptions = useMemo(() => seededOptions(step.options, seed, gate.id), [gate.id, seed, step.options]);
  const elapsedMs = () => Date.now() - startedAt.current;
  const progress = Math.round((gate.order / 7) * 100);

  const totalEnergy = savior.acute + savior.chronic + savior.seed + savior.self;
  const gardenHealth = useMemo(() => {
    const values = Object.values(garden);
    const balance = values.reduce((sum, value) => sum + Math.abs(value - 52), 0);
    const interventionPenalty = Math.max(0, gardenInterventions - 2) * 5;
    return Math.max(0, Math.min(100, Math.round(100 - balance * 0.55 - interventionPenalty)));
  }, [garden, gardenInterventions]);

  function record(event: SessionEventInput) {
    const nextEvent = { ...event, gateId: gate.id, elapsedMs: event.elapsedMs ?? elapsedMs() };
    const nextEvents = [...eventsRef.current, nextEvent];
    eventsRef.current = nextEvents;
    return nextEvents;
  }

  function persistImmediate(event: SessionEventInput) {
    const body = JSON.stringify({ ...event, sessionId, gateId: gate.id, elapsedMs: event.elapsedMs ?? elapsedMs() });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true
    });
  }

  useEffect(() => {
    if (gate.id !== "urgency") return;
    const timeout = window.setTimeout(() => {
      setTimerDone(true);
      record({ eventType: "wait_threshold_reached", payload: { thresholdMs: 30000 } });
    }, 30000);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate.id]);

  useEffect(() => {
    function trackExit() {
      if (submittingRef.current) return;
      persistImmediate({ eventType: "back_navigation", payload: { reason: "page_exit" } });
    }

    window.addEventListener("pagehide", trackExit);
    window.addEventListener("popstate", trackExit);
    return () => {
      window.removeEventListener("pagehide", trackExit);
      window.removeEventListener("popstate", trackExit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate.id, sessionId]);

  function choose(id: string) {
    setChoice(id);
    record({ eventType: "button_clicked", payload: { control: "choice", value: id } });
    if (id === "hint") {
      record({ eventType: "hint_requested", payload: { choice: id } });
    }
    record({ eventType: "choice_selected", payload: { choice: id } });
  }

  function updateGarden(key: keyof GardenState, value: number) {
    setGarden((current) => ({ ...current, [key]: value }));
    setGardenInterventions((count) => count + 1);
    record({ eventType: "button_clicked", payload: { control: key, value } });
  }

  function updateSavior(key: keyof SaviorState, value: number) {
    setSavior((current) => ({ ...current, [key]: value }));
    record({ eventType: "button_clicked", payload: { allocation: key, value } });
  }

  function startText() {
    if (textStartedAt.current !== null) return;
    textStartedAt.current = elapsedMs();
    record({ eventType: "text_started", elapsedMs: textStartedAt.current });
  }

  function renderGateStage() {
    const choiceProps = { options: orderedOptions, choice, onChoose: choose };
    switch (gate.id) {
      case "chosen":
        return <ChosenGate {...choiceProps} />;
      case "urgency":
        return <UrgencyGate {...choiceProps} prompt={step.prompt} timerDone={timerDone} />;
      case "garden":
        return <GardenGate garden={garden} gardenHealth={gardenHealth} onChange={updateGarden} />;
      case "rightness":
        return <RightnessGate {...choiceProps} />;
      case "savior":
        return <SaviorGate savior={savior} totalEnergy={totalEnergy} onChange={updateSavior} />;
      case "uncertainty":
        return <UncertaintyGate {...choiceProps} />;
      case "access":
        return <AccessGate {...choiceProps} />;
    }
  }

  async function submit() {
    if (submitting) return;
    submittingRef.current = true;
    setSubmitting(true);
    const now = elapsedMs();
    const firstInputElapsedMs = textStartedAt.current;
    const choiceChangeCount = Math.max(0, eventsRef.current.filter((event) => event.eventType === "choice_selected").length - 1);
    const finalEvents = record({
      eventType: "text_submitted",
      payload: {
        length: reflectionText.trim().length,
        firstInputElapsedMs,
        writingElapsedMs: firstInputElapsedMs === null ? null : Math.max(0, now - firstInputElapsedMs),
        editCount: textEditCount.current,
        choiceChangeCount,
        changedStrategy: choiceChangeCount > 0
      }
    });

    const metadata =
      gate.id === "garden"
        ? { ...garden, health: gardenHealth, interventionCount: gardenInterventions }
        : gate.id === "savior"
          ? savior
          : {};

    const response = await fetch("/api/gates/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        gateId: gate.id,
        primaryChoice: choice || (gate.id === "urgency" && timerDone ? "calm" : undefined),
        reflectionText,
        elapsedMs: now,
        metadata,
        events: finalEvents
      })
    });

    if (!response.ok) {
      submittingRef.current = false;
      setSubmitting(false);
      return;
    }

    const data = (await response.json()) as { nextUrl: string };
    router.push(data.nextUrl);
  }

  const canSubmit =
    gate.id === "garden" ||
    (gate.id === "savior" && totalEnergy === 100) ||
    Boolean(choice) ||
    (gate.id === "urgency" && timerDone);

  return (
    <div className="grid gap-8 lg:grid-cols-[1.08fr_0.92fr]">
      <section className="space-y-6">
        <DaoPanel className="relative min-h-56">
          <div className="grid gap-5 md:grid-cols-[1fr_13rem] md:items-start">
            <div>
              <DaoKicker>Видимая задача</DaoKicker>
              <p className="mt-4 text-xl leading-9 text-white">{gate.visibleTask}</p>
            </div>
            <div className="grid gap-3">
              <DaoStat label="Врата" value={`${gate.order} / 7`} />
              <DaoStat label="Принцип" value={gate.daoPrinciple} />
            </div>
          </div>
          <div className="mt-6">
            <DaoProgress value={progress} label="Траектория" />
          </div>
        </DaoPanel>
        {renderGateStage()}
      </section>

      <aside className="space-y-5">
        <DaoPanel>
          <DaoKicker>Даосский слой</DaoKicker>
          <p className="mt-4 leading-8 text-mist/85">{gate.teachingText}</p>
        </DaoPanel>
        <label className="dao-panel block">
          <DaoKicker>Рефлексия</DaoKicker>
          <span className="mt-3 block leading-7 text-mist/70">{gate.reflectionPrompt}</span>
          <textarea
            value={reflectionText}
            onFocus={startText}
            onChange={(event) => {
              textEditCount.current += 1;
              setReflectionText(event.target.value);
            }}
            className="dao-input mt-4 min-h-40 w-full p-4"
            placeholder="Напиши честно, без попытки угадать правильную формулу."
          />
        </label>
        <button disabled={!canSubmit || submitting} onClick={submit} className="dao-action w-full px-6 py-3 font-medium disabled:cursor-not-allowed disabled:opacity-40">
          {submitting ? "Сохраняю..." : "Завершить врата"}
        </button>
      </aside>
    </div>
  );
}
