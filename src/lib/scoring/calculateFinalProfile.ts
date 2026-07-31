import type { GateScoreResult, Metrics, RiskFlag, ScoreProfile } from "@/lib/types";
import { applyDelta, neutralMetrics } from "./metrics";
import { resolveAccessLevel } from "./accessResolver";
import { resolveArchetype } from "./archetypeResolver";

const archetypeCopy = {
  winner: {
    summary: "Сильная ориентация на результат. Важно отличать движение к истине от движения к победе.",
    strengths: ["решительность", "логика", "энергия"],
    shadows: ["нетерпение", "давление", "зависимость от победы"],
    practices: ["Перед важным действием делать паузу: я сейчас иду к истине или к победе?"]
  },
  strategist: {
    summary: "Ты видишь систему и последствия, но важно не превращать людей в фигуры.",
    strengths: ["дальновидность", "анализ", "хладнокровие"],
    shadows: ["скрытый контроль", "манипулятивность", "недостаток сердца"],
    practices: ["Перед решением спрашивать: останется ли другой человек субъектом?"]
  },
  seeker: {
    summary: "Глубина и честность заметны, но путь требует малых завершённых действий.",
    strengths: ["интуиция", "философичность", "внутренняя честность"],
    shadows: ["сомнения", "медлительность", "уход от действия"],
    practices: ["Завершать размышление маленьким действием."]
  },
  savior: {
    summary: "Сердце включено, но помощь требует границ, иначе чаша разбивается.",
    strengths: ["забота", "преданность", "поддержка"],
    shadows: ["самопожертвование", "скрытая обида", "потеря границ"],
    practices: ["Перед помощью спрашивать: я помогаю идти или несу вместо человека?"]
  },
  mirror: {
    summary: "Ты способен видеть импульс, признавать ошибку и действовать без лишнего насилия.",
    strengths: ["самонаблюдение", "ясность", "мягкость без слабости"],
    shadows: ["затянутое наблюдение", "недооценка собственной силы"],
    practices: ["Не только видеть путь, но и входить в него."]
  }
} as const;

export function calculateFinalProfile(sessionId: string, gateResults: GateScoreResult[]): ScoreProfile {
  const metrics: Metrics = gateResults.reduce(
    (current, result) => applyDelta(current, result.scoreDelta),
    neutralMetrics
  );
  const archetype = resolveArchetype(metrics);
  const accessLevel = resolveAccessLevel(metrics);
  const riskFlags = Array.from(new Set(gateResults.flatMap((result) => result.flags))) as RiskFlag[];
  const copy = archetypeCopy[archetype];

  return {
    sessionId,
    metrics,
    archetype,
    accessLevel,
    summary: copy.summary,
    strengths: [...copy.strengths],
    shadows: [...copy.shadows],
    practices: [...copy.practices],
    riskFlags
  };
}

