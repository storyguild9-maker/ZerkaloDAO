import type { Archetype, Metrics } from "@/lib/types";

export function resolveArchetype(metrics: Metrics): Archetype {
  if (
    metrics.selfObservation >= 72 &&
    metrics.uncertaintyTolerance >= 62 &&
    metrics.statusAttachment <= 45 &&
    metrics.impulsivity <= 45
  ) {
    return "mirror";
  }

  if (metrics.saviorPattern >= 70 && metrics.ethicalBoundary <= 55) {
    return "savior";
  }

  if (metrics.controlNeed >= 68 && metrics.attentionDepth >= 58) {
    return "strategist";
  }

  if (metrics.impulsivity <= 42 && metrics.uncertaintyTolerance >= 58) {
    return "seeker";
  }

  return "winner";
}

