import type { GateId, GateScoreInput, GateScoreResult, RiskFlag, ScoreDelta } from "@/lib/types";
import { mergeDeltas } from "./metrics";
import { reflectionToDelta, scoreReflection } from "./reflectionHeuristics";

function choiceDelta(gateId: GateId, choice?: string, metadata?: Record<string, unknown>): ScoreDelta {
  switch (gateId) {
    case "chosen":
      if (choice === "skip") return { statusAttachment: 25, impulsivity: 10, attentionDepth: -10 };
      if (choice === "why") return { statusAttachment: -8, attentionDepth: 12, uncertaintyTolerance: 5 };
      return { statusAttachment: -5, attentionDepth: 6 };
    case "urgency":
      if (choice === "calm") return { impulsivity: -10, attentionDepth: 20, uncertaintyTolerance: 10 };
      if (choice === "hint") return { impulsivity: 25, attentionDepth: -10 };
      return { impulsivity: 20, attentionDepth: -10 };
    case "garden": {
      const interventionCount = Number(metadata?.interventionCount ?? 0);
      const health = Number(metadata?.health ?? 50);
      if (interventionCount > 6) return { controlNeed: 25, impulsivity: 10, attentionDepth: -8 };
      if (interventionCount >= 1 && interventionCount <= 3 && health >= 60) {
        return { attentionDepth: 20, controlNeed: -10, learnability: 10 };
      }
      return { attentionDepth: -5 };
    }
    case "rightness":
      if (choice === "support-a") return { rightnessAttachment: 25, ethicalBoundary: -10 };
      if (choice === "support-b") return { rightnessAttachment: -5, attentionDepth: -10 };
      if (choice === "separate") return { ethicalBoundary: 20, selfObservation: 10, attentionDepth: 15 };
      return { ethicalBoundary: -5 };
    case "savior": {
      const self = Number(metadata?.self ?? 0);
      const chronic = Number(metadata?.chronic ?? 0);
      if (self === 0) return { saviorPattern: 40, ethicalBoundary: -15 };
      if (self < 15) return { saviorPattern: 30, ethicalBoundary: -10 };
      if (self > 85) return { ethicalBoundary: -20, selfObservation: -10 };
      if (self >= 25 && self <= 45 && chronic <= 20) return { ethicalBoundary: 25, selfObservation: 10 };
      return { ethicalBoundary: 5 };
    }
    case "uncertainty":
      if (choice === "admit-unknown") return { uncertaintyTolerance: 25, selfObservation: 10 };
      if (choice === "ask-data") return { uncertaintyTolerance: 15, attentionDepth: 15 };
      if (choice === "follow-majority") return { uncertaintyTolerance: -10, attentionDepth: -5 };
      return { uncertaintyTolerance: -20, rightnessAttachment: 10 };
    case "access":
      if (choice === "already-worthy") {
        return { statusAttachment: -20, selfObservation: 20, ethicalBoundary: 10 };
      }
      return { statusAttachment: 15, selfObservation: -8 };
  }
}

function riskFlags(delta: ScoreDelta, reflectionText = ""): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const reflection = scoreReflection(reflectionText);
  if ((delta.statusAttachment ?? 0) >= 20) flags.push("high_status_attachment");
  if ((delta.impulsivity ?? 0) >= 20) flags.push("high_impulsivity");
  if ((delta.saviorPattern ?? 0) >= 30) flags.push("over_savior_pattern");
  if ((delta.uncertaintyTolerance ?? 0) <= -15) flags.push("low_uncertainty_tolerance");
  if ((delta.selfObservation ?? 0) <= -8) flags.push("low_self_observation");
  if (reflection.nonDefensiveness <= 4 && reflectionText.trim()) flags.push("hostile_feedback_response");
  return flags;
}

export function calculateGateScore(input: GateScoreInput): GateScoreResult {
  const baseDelta = choiceDelta(input.gateId, input.primaryChoice, input.metadata);
  const reflectionDelta = reflectionToDelta(input.reflectionText);
  const scoreDelta = mergeDeltas(baseDelta, reflectionDelta);
  const flags = riskFlags(scoreDelta, input.reflectionText);

  return {
    scoreDelta,
    flags,
    notes: flags.length ? ["Врата проявили выраженный паттерн. Нужен человеческий просмотр."] : [],
    trapTriggered: flags.length > 0
  };
}

