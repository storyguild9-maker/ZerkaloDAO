import type { Metrics, ScoreDelta } from "@/lib/types";

export const metricKeys: (keyof Metrics)[] = [
  "statusAttachment",
  "impulsivity",
  "controlNeed",
  "rightnessAttachment",
  "saviorPattern",
  "uncertaintyTolerance",
  "feedbackTolerance",
  "selfObservation",
  "ethicalBoundary",
  "learnability",
  "attentionDepth"
];

export const neutralMetrics: Metrics = {
  statusAttachment: 50,
  impulsivity: 50,
  controlNeed: 50,
  rightnessAttachment: 50,
  saviorPattern: 50,
  uncertaintyTolerance: 50,
  feedbackTolerance: 50,
  selfObservation: 50,
  ethicalBoundary: 50,
  learnability: 50,
  attentionDepth: 50
};

export function clampMetric(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function applyDelta(metrics: Metrics, delta: ScoreDelta): Metrics {
  const next = { ...metrics };
  for (const key of metricKeys) {
    if (typeof delta[key] === "number") {
      next[key] = clampMetric(next[key] + delta[key]!);
    }
  }
  return next;
}

export function mergeDeltas(...deltas: ScoreDelta[]): ScoreDelta {
  const merged: ScoreDelta = {};
  for (const delta of deltas) {
    for (const key of metricKeys) {
      if (typeof delta[key] === "number") {
        merged[key] = (merged[key] ?? 0) + delta[key]!;
      }
    }
  }
  return merged;
}

