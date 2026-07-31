import { describe, expect, it } from "vitest";
import { resolveAccessLevel } from "./accessResolver";
import { resolveArchetype } from "./archetypeResolver";
import { calculateFinalProfile } from "./calculateFinalProfile";
import { calculateGateScore } from "./calculateGateScore";
import { neutralMetrics } from "./metrics";
import { scoreReflection } from "./reflectionHeuristics";
import type { GateScoreResult, Metrics } from "@/lib/types";

describe("reflection heuristics", () => {
  it("rewards ownership and nuance", () => {
    const score = scoreReflection(
      "Я заметил, что во мне захотелось доказать правоту. Возможно, часть меня защищалась. В следующий раз я попробую сделать паузу."
    );

    expect(score.ownership).toBeGreaterThan(0);
    expect(score.nuance).toBeGreaterThan(0);
    expect(score.integration).toBeGreaterThan(0);
    expect(score.nonDefensiveness).toBeGreaterThan(10);
  });

  it("penalizes defensive dismissal", () => {
    const score = scoreReflection("Тест тупой, система ошиблась, это не про меня.");
    expect(score.nonDefensiveness).toBeLessThanOrEqual(4);
  });
});

describe("gate scoring", () => {
  it("marks chosen skip as status attachment", () => {
    const result = calculateGateScore({
      gateId: "chosen",
      primaryChoice: "skip",
      events: [],
      reflectionText: ""
    });

    expect(result.scoreDelta.statusAttachment).toBeGreaterThanOrEqual(20);
    expect(result.flags).toContain("high_status_attachment");
  });

  it("rewards calm urgency completion", () => {
    const result = calculateGateScore({
      gateId: "urgency",
      primaryChoice: "calm",
      events: [],
      reflectionText: "Я заметил спешку и решил подождать."
    });

    expect(result.scoreDelta.impulsivity).toBeLessThan(0);
    expect(result.scoreDelta.attentionDepth).toBeGreaterThan(15);
  });

  it("rewards ethical rightness separation", () => {
    const result = calculateGateScore({
      gateId: "rightness",
      primaryChoice: "separate",
      events: [],
      reflectionText: "Я заметил желание выбрать правого, но форма тоже имеет значение."
    });

    expect(result.scoreDelta.ethicalBoundary).toBeGreaterThanOrEqual(20);
    expect(result.scoreDelta.attentionDepth).toBeGreaterThanOrEqual(15);
  });
});

describe("profile resolvers", () => {
  it("resolves pustaya_chasha only for balanced high profile", () => {
    const metrics: Metrics = {
      ...neutralMetrics,
      selfObservation: 85,
      uncertaintyTolerance: 78,
      ethicalBoundary: 75,
      statusAttachment: 30,
      impulsivity: 35
    };

    expect(resolveAccessLevel(metrics)).toBe("pustaya_chasha");
    expect(resolveArchetype(metrics)).toBe("mirror");
  });

  it("returns learning access for low attention and boundary", () => {
    const metrics: Metrics = {
      ...neutralMetrics,
      attentionDepth: 20,
      ethicalBoundary: 30,
      selfObservation: 25
    };

    expect(resolveAccessLevel(metrics)).toBe("none");
  });

  it("builds final profile from gate deltas", () => {
    const results: GateScoreResult[] = [
      { scoreDelta: { selfObservation: 20, uncertaintyTolerance: 20 }, flags: [], notes: [], trapTriggered: false },
      { scoreDelta: { ethicalBoundary: 25, statusAttachment: -20, impulsivity: -15 }, flags: [], notes: [], trapTriggered: false }
    ];

    const profile = calculateFinalProfile("session-1", results);
    expect(profile.metrics.selfObservation).toBe(70);
    expect(profile.accessLevel).not.toBe("none");
  });
});

