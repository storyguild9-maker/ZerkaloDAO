import type { ReflectionScore, ScoreDelta } from "@/lib/types";

const ownershipMarkers = [
  "я заметил",
  "я заметила",
  "во мне",
  "мне захотелось",
  "я почувствовал",
  "я почувствовала",
  "я хотел",
  "я хотела",
  "я защищался",
  "я защищалась",
  "часть меня"
];

const nuanceMarkers = ["возможно", "не знаю", "с одной стороны", "с другой стороны", "часть", "при этом"];
const integrationMarkers = ["теперь", "в следующий раз", "я могу", "я попробую", "практика", "вывод"];
const defensiveMarkers = [
  "тест тупой",
  "система ошиблась",
  "это не про меня",
  "я просто проверял",
  "я всегда осознан",
  "я всегда осознанная",
  "я не ведусь",
  "ничего во мне"
];

function countMarkers(text: string, markers: string[]): number {
  const lower = text.toLowerCase();
  return markers.reduce((count, marker) => count + (lower.includes(marker) ? 1 : 0), 0);
}

export function scoreReflection(text = ""): ReflectionScore {
  const trimmed = text.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  const defensive = countMarkers(trimmed, defensiveMarkers);

  return {
    ownership: Math.min(25, countMarkers(trimmed, ownershipMarkers) * 8),
    specificity: wordCount >= 35 ? 20 : wordCount >= 16 ? 12 : wordCount >= 6 ? 6 : 0,
    nonDefensiveness: Math.max(0, 20 - defensive * 8),
    nuance: Math.min(20, countMarkers(trimmed, nuanceMarkers) * 6),
    integration: Math.min(15, countMarkers(trimmed, integrationMarkers) * 5)
  };
}

export function reflectionToDelta(text = ""): ScoreDelta {
  const score = scoreReflection(text);
  const total = score.ownership + score.specificity + score.nonDefensiveness + score.nuance + score.integration;
  const hostile = score.nonDefensiveness <= 4;

  return {
    selfObservation: total >= 55 ? 15 : total >= 35 ? 8 : total <= 14 ? -10 : 0,
    feedbackTolerance: hostile ? -18 : score.nonDefensiveness >= 16 ? 8 : 0,
    learnability: score.integration >= 10 ? 8 : 0,
    attentionDepth: score.specificity >= 12 && score.nuance >= 6 ? 5 : 0
  };
}

