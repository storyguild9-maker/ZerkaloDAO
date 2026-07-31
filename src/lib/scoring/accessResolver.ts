import type { AccessLevel, Metrics } from "@/lib/types";

export function resolveAccessLevel(metrics: Metrics): AccessLevel {
  if (
    metrics.selfObservation >= 80 &&
    metrics.uncertaintyTolerance >= 70 &&
    metrics.ethicalBoundary >= 70 &&
    metrics.statusAttachment <= 35 &&
    metrics.impulsivity <= 40
  ) {
    return "pustaya_chasha";
  }

  if (
    metrics.selfObservation >= 65 &&
    metrics.uncertaintyTolerance >= 55 &&
    metrics.ethicalBoundary >= 55 &&
    metrics.statusAttachment <= 60
  ) {
    return "slyshashchiy";
  }

  if (metrics.attentionDepth >= 45 && metrics.ethicalBoundary >= 40) {
    return "iskatel";
  }

  return "none";
}

