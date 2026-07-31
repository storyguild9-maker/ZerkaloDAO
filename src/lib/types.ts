export type GateId =
  | "chosen"
  | "urgency"
  | "garden"
  | "rightness"
  | "savior"
  | "uncertainty"
  | "access";

export type EgoTrapType =
  | "status_attachment"
  | "impulsivity"
  | "control_need"
  | "rightness_attachment"
  | "savior_pattern"
  | "uncertainty_tolerance"
  | "access_attachment";

export type EventType =
  | "gate_started"
  | "button_clicked"
  | "choice_selected"
  | "wait_threshold_reached"
  | "text_started"
  | "text_submitted"
  | "back_navigation"
  | "hint_requested"
  | "gate_completed"
  | "result_viewed";

export type Metrics = {
  statusAttachment: number;
  impulsivity: number;
  controlNeed: number;
  rightnessAttachment: number;
  saviorPattern: number;
  uncertaintyTolerance: number;
  feedbackTolerance: number;
  selfObservation: number;
  ethicalBoundary: number;
  learnability: number;
  attentionDepth: number;
};

export type ScoreDelta = Partial<Metrics>;

export type Archetype = "winner" | "strategist" | "seeker" | "savior" | "mirror";
export type AccessLevel = "none" | "iskatel" | "slyshashchiy" | "pustaya_chasha";

export type RiskFlag =
  | "high_status_attachment"
  | "high_impulsivity"
  | "low_self_observation"
  | "hostile_feedback_response"
  | "over_savior_pattern"
  | "low_uncertainty_tolerance";

export type GateOption = {
  id: string;
  label: string;
  description?: string;
};

export type GateStep = {
  id: string;
  kind: "choice" | "timer" | "garden" | "allocation" | "reflection";
  prompt: string;
  options?: GateOption[];
};

export type Gate = {
  id: GateId;
  order: number;
  title: string;
  subtitle: string;
  daoPrinciple: string;
  visibleTask: string;
  hiddenTrap: EgoTrapType;
  steps: GateStep[];
  reflectionPrompt: string;
  teachingText: string;
};

export type SessionEventInput = {
  gateId?: GateId;
  eventType: EventType;
  elapsedMs?: number;
  payload?: Record<string, unknown>;
};

export type GateScoreInput = {
  gateId: GateId;
  events: SessionEventInput[];
  primaryChoice?: string;
  reflectionText?: string;
  metadata?: Record<string, unknown>;
};

export type GateScoreResult = {
  scoreDelta: ScoreDelta;
  flags: RiskFlag[];
  notes: string[];
  trapTriggered: boolean;
};

export type ReflectionScore = {
  ownership: number;
  specificity: number;
  nonDefensiveness: number;
  nuance: number;
  integration: number;
};

export type ScoreProfile = {
  sessionId: string;
  metrics: Metrics;
  archetype: Archetype;
  accessLevel: AccessLevel;
  summary: string;
  strengths: string[];
  shadows: string[];
  practices: string[];
  riskFlags: RiskFlag[];
};

