"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { assetUrl } from "@/lib/assetUrl";
import { createCelestialSpheres } from "@/lib/celestialSpheres";
import { getTelegramAvatarId, getTelegramAvatarMotion, isTelegramSceneAsset } from "@/lib/telegramScene";
import { CouncilHologramPanel } from "@/components/CouncilHologramPanel";

const TELEGRAM_POSE_SAMPLE_MS = 50;

type MeshyAsset = {
  slug: string;
  sourceImage?: string;
  localModel?: string;
  status?: string;
};

type MeshyManifest = {
  assets?: MeshyAsset[];
};

type InitiateMotionTask = {
  id?: string;
  label?: string;
  localModel?: string;
  clipName?: string;
  status?: string;
  actionId?: number;
  actionName?: string;
};

type InitiateAvatar = {
  id: string;
  title?: string;
  gender?: string;
  localModel?: string;
  riggedModel?: string;
  basicAnimations?: Record<string, string>;
  motions?: InitiateMotionTask[];
  animationTasks?: Record<string, InitiateMotionTask>;
};

type InitiateManifest = {
  avatars?: InitiateAvatar[];
};

export type TelegramPresenceParticipant = {
  participantId: string;
  nickname: string;
  avatarId: string;
  position: [number, number, number];
  rotationY: number;
  animation: string;
  lastSeenAt: string;
};

export type TelegramAvatarPose = Pick<TelegramPresenceParticipant, "position" | "rotationY" | "animation">;

type CouncilHologramWorldRuntime = {
  group: THREE.Group;
  anchor: THREE.Object3D;
  pedestal: THREE.Group;
  crystalHitTarget: THREE.Mesh;
  rings: THREE.Mesh[];
  light: THREE.PointLight;
  tabletopY: number | null;
  viewportWidth: number;
};

const createCouncilHologramWorldRuntime = (): CouncilHologramWorldRuntime => {
  const group = new THREE.Group();
  group.name = "council-hologram-world-projector";
  group.visible = false;

  const pedestal = new THREE.Group();
  pedestal.name = "council-hologram-pedestal";
  group.add(pedestal);

  const crystalHitTarget = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 16, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  crystalHitTarget.name = "council-hologram-crystal-toggle";
  crystalHitTarget.position.y = 0.34;
  crystalHitTarget.userData.councilProjectorToggle = true;
  pedestal.add(crystalHitTarget);

  const panelFrame = new THREE.Group();
  panelFrame.name = "council-hologram-world-panel";
  panelFrame.position.set(0, 1.62, 0);
  panelFrame.rotation.x = -0.08;
  group.add(panelFrame);

  const anchor = new THREE.Object3D();
  anchor.name = "council-hologram-dom-anchor";
  panelFrame.add(anchor);

  const light = new THREE.PointLight(0xb57bf0, 4.2, 4.8, 1.7);
  light.position.set(0, 0.42, 0.18);
  group.add(light);

  return {
    group,
    anchor,
    pedestal,
    crystalHitTarget,
    rings: [],
    light,
    tabletopY: null,
    viewportWidth: 0,
  };
};

type MeshySceneConstructorProps = {
  plain?: boolean;
  telegram?: boolean;
  telegramAvatarId?: string;
  telegramParticipantId?: string;
  telegramParticipantNickname?: string;
  telegramParticipants?: TelegramPresenceParticipant[];
  onTelegramPose?: (pose: TelegramAvatarPose) => void;
};

type AvatarSeatingRuntime = {
  startPosition: THREE.Vector3;
  targetPosition: THREE.Vector3;
  approachPosition: THREE.Vector3;
  sitStartPosition: THREE.Vector3;
  settleStartYaw: number;
  targetYaw: number;
  path: THREE.Vector3[];
  pathLength: number;
  elapsed: number;
  duration: number;
  walkDuration: number;
  sitDuration: number;
  phase: "approach" | "settle";
  started: boolean;
};

type ControlledAvatarRuntime = {
  root: THREE.Group;
  model: THREE.Object3D;
  idleModel: THREE.Object3D | null;
  seatedModel: THREE.Object3D | null;
  mixer: THREE.AnimationMixer | null;
  action: THREE.AnimationAction | null;
  motionClips?: Map<string, THREE.AnimationClip>;
  activeMotion?: string;
  seatedMixer: THREE.AnimationMixer | null;
  seatedAction: THREE.AnimationAction | null;
  baseModelPosition: THREE.Vector3;
  baseIdleModelPosition: THREE.Vector3 | null;
  baseSeatedModelPosition: THREE.Vector3 | null;
  yaw: number;
  wasMoving: boolean;
  isSeated: boolean;
  seating: AvatarSeatingRuntime | null;
};

type RemoteAvatarRuntime = {
  participantId: string;
  avatarId: string;
  motionId: string;
  looping: boolean;
  root: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  action: THREE.AnimationAction | null;
  targetPosition: THREE.Vector3;
  targetYaw: number;
  animation: string;
  wasMoving: boolean;
};

type DlanisPoseRuntime = {
  mixer: THREE.AnimationMixer;
  action: THREE.AnimationAction;
  replayIn: number;
  playing: boolean;
};

type Vec3 = [number, number, number];
type DlanisWeaponId = "Weapon_Spear" | "Weapon_Axe_Back";
type DlanisTransformTarget = "avatar" | "breathing-guard" | DlanisWeaponId;
type DlanisPlacement = {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
};
type DlanisWeaponAdjustment = {
  position: Vec3;
  rotation: Vec3;
  scale: number;
};
type DlanisWeaponAdjustments = Record<DlanisWeaponId, DlanisWeaponAdjustment>;
type SurfaceId = "floor" | "back-wall" | "front-wall" | "left-wall" | "right-wall" | "ceiling";

type SurfaceDefinition = {
  id: SurfaceId;
  label: string;
  hint: string;
  dimensions: readonly [number, number];
  position: Vec3;
  rotation: Vec3;
  defaultRotation: Vec3;
  fixedAxis: 0 | 1 | 2;
  fixedValue: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const ROOM_SCALE = 3;
const ROOM_WIDTH = 70;
const ROOM_DEPTH = 70;
const ROOM_HEIGHT = 15;
const SURFACE_OFFSET = 0.18;
const DEFAULT_CONTROLLED_AVATAR_ID = "east-seer-dawn-neutral-v2-cyber";
const DLANIS_AVATAR_ID = "azure-aegis-armed-v3";
const BREATHING_GUARD_AVATAR_ID = "long-breath-watch-guardian-v1";
const BREATHING_GUARD_MOTION_ID = "long-breathe-look-around";
const DLANIS_SELECTABLE_MOTION_IDS = new Set(["axe-stance"]);
const DLANIS_SHOWCASE_MOTION_IDS = new Set(["axe-stance"]);
const DLANIS_WEAPON_BY_MOTION: Record<string, string> = {
  "axe-stance": "Weapon_Spear",
};
const DLANIS_WEAPON_STORAGE_KEY = "zerkalo-dao-dlanis-weapons-v1";
const DLANIS_PLACEMENT_STORAGE_KEY = "zerkalo-dao-dlanis-placement-v1";
const BREATHING_GUARD_PLACEMENT_STORAGE_KEY = "zerkalo-dao-breathing-guard-placement-v1";
const PERMANENT_GUARD_MOTION_BY_ID: Record<string, string> = {
  [DLANIS_AVATAR_ID]: "axe-stance",
  [BREATHING_GUARD_AVATAR_ID]: BREATHING_GUARD_MOTION_ID,
};
const NON_CONTROLLABLE_AVATAR_IDS = new Set([BREATHING_GUARD_AVATAR_ID]);
const PERMANENT_GUARD_PLACEMENT_BY_ID: Record<string, { position: Vec3; yaw: number }> = {
  [BREATHING_GUARD_AVATAR_ID]: { position: [-12, 0, 27], yaw: Math.PI },
};
const DEFAULT_DLANIS_WEAPON_ADJUSTMENTS: DlanisWeaponAdjustments = {
  Weapon_Spear: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
  Weapon_Axe_Back: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
};
const ACTIVE_AVATAR_ID_LIST = [
  "east-seer-dawn-neutral-v2-cyber",
  "female-initiate-neutral-v2-cyber",
  "void-archon-v3-cyber",
  "gold-crown-sentinel-v3-cyber",
  "crimson-elder-v3-cyber",
  "lunar-adept-v3-cyber",
  "azure-aegis-armed-v3",
  "long-breath-watch-guardian-v1"
] as const;
const ACTIVE_AVATAR_IDS = new Set<string>(ACTIVE_AVATAR_ID_LIST);
const DEFAULT_AVATAR_SEATS = Object.fromEntries(ACTIVE_AVATAR_ID_LIST.map((id, index) => [id, index])) as Record<string, number>;
const AVATAR_SEATED_MOTION_BY_ID: Record<string, string> = {
  "east-seer-dawn-neutral-v2-cyber": "sit-transition",
  "female-initiate-neutral-v2-cyber": "chair-sitting-idle",
  "void-archon-v3-cyber": "sit-cross-legged",
  "gold-crown-sentinel-v3-cyber": "male-sit-transition",
  "crimson-elder-v3-cyber": "chair-sitting-idle",
  "lunar-adept-v3-cyber": "sit-cross-legged",
  "azure-aegis-armed-v3": "sit-cross-legged",
};
const AVATAR_SEATED_MOTION_IDS = new Set(["sit-at-table", "walk-to-seat", "chair-sitting-idle", "male-sit-transition", "sit-transition", "sit-cross-legged"]);
const AVATAR_LOCOMOTION_MOTION_IDS = new Set([
  "basic-walking",
  "daily-walk-loop",
  "fast-walk-loop",
  "slow-walk-loop",
  "elegant-walk-loop",
  "walk-loop",
  "walk-turn-left",
  "walk-turn-right",
  "walk-backward",
  "female-walk-loop",
]);
const getAvatarSeatedMotionId = (avatar: InitiateAvatar) => AVATAR_SEATED_MOTION_BY_ID[avatar.id] ?? "sit-at-table";
const AVATAR_SEAT_STORAGE_KEY = "zerkalo-dao-avatar-seats-v1";
const AVATAR_SEAT_TUNING_STORAGE_KEY = "zerkalo-dao-avatar-seat-tuning-v1";
const AVATAR_SEAT_COUNT = ACTIVE_AVATAR_ID_LIST.length - NON_CONTROLLABLE_AVATAR_IDS.size;
const AVATAR_ASSET_VERSION = "breathing-guardian-20260716-0700";
const AVATAR_MODEL_FORWARD_OFFSET = Math.PI;
const AVATAR_TARGET_HEIGHT = 6.3;
const AVATAR_SEAT_RADIUS = 18.4;
const AVATAR_TABLE_CENTER = new THREE.Vector3(0.3, 0, -0.12);
const AVATAR_CHAIR_SIT_FORWARD_OFFSET = -0.55;
const AVATAR_TABLE_AVOID_RADIUS = 10.8;
const AVATAR_TABLE_INTERACTION_RADIUS = 18.5;
const AVATAR_CHAIR_INTERACTION_RADIUS = 6.8;
type AvatarSeatTuning = {
  animated: boolean;
  chairDepth: number;
  approachSide: number;
  approachBack: number;
  walkSpeed: number;
  sitDuration: number;
};
const DEFAULT_AVATAR_SEAT_TUNING: AvatarSeatTuning = {
  animated: true,
  chairDepth: 0.78,
  approachSide: 2.85,
  approachBack: 0.35,
  walkSpeed: 4.2,
  sitDuration: 0.86,
};

type AvatarSeatAdjustment = {
  yawOffsetDeg: number;
  depthOffset: number;
  sideOffset: number;
  heightOffset: number;
};
const DEFAULT_AVATAR_SEAT_ADJUSTMENT: AvatarSeatAdjustment = {
  yawOffsetDeg: 0,
  depthOffset: 0,
  sideOffset: 0,
  heightOffset: 0,
};
const DEFAULT_AVATAR_SEAT_ADJUSTMENTS = Object.fromEntries(ACTIVE_AVATAR_ID_LIST.map((id) => [id, { ...DEFAULT_AVATAR_SEAT_ADJUSTMENT }])) as Record<string, AvatarSeatAdjustment>;
const AVATAR_SEAT_ADJUSTMENTS_STORAGE_KEY = "zerkalo-dao-avatar-seat-adjustments-v1";
const readFiniteNumber = (value: unknown, fallback: number) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};
const normalizeDlanisWeaponAdjustments = (value: unknown): DlanisWeaponAdjustments => {
  const raw = value && typeof value === "object" ? value as Partial<Record<DlanisWeaponId, Partial<DlanisWeaponAdjustment>>> : {};
  const normalize = (id: DlanisWeaponId): DlanisWeaponAdjustment => {
    const fallback = DEFAULT_DLANIS_WEAPON_ADJUSTMENTS[id];
    const current = raw[id] ?? {};
    const position = Array.isArray(current.position) ? current.position : fallback.position;
    const rotation = Array.isArray(current.rotation) ? current.rotation : fallback.rotation;
    return {
      position: [
        clamp(readFiniteNumber(position[0], fallback.position[0]), -2.5, 2.5),
        clamp(readFiniteNumber(position[1], fallback.position[1]), -2.5, 2.5),
        clamp(readFiniteNumber(position[2], fallback.position[2]), -2.5, 2.5),
      ],
      rotation: [
        clamp(readFiniteNumber(rotation[0], fallback.rotation[0]), -180, 180),
        clamp(readFiniteNumber(rotation[1], fallback.rotation[1]), -180, 180),
        clamp(readFiniteNumber(rotation[2], fallback.rotation[2]), -180, 180),
      ],
      scale: clamp(readFiniteNumber(current.scale, fallback.scale), 0.2, 2.5),
    };
  };
  return { Weapon_Spear: normalize("Weapon_Spear"), Weapon_Axe_Back: normalize("Weapon_Axe_Back") };
};
const normalizeDlanisPlacement = (value: unknown): DlanisPlacement | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<DlanisPlacement>;
  if (!Array.isArray(raw.position) || !Array.isArray(raw.rotation) || !Array.isArray(raw.scale)) return null;
  return {
    position: [
      clamp(readFiniteNumber(raw.position[0], 0), -ROOM_WIDTH / 2, ROOM_WIDTH / 2),
      clamp(readFiniteNumber(raw.position[1], 0), 0, ROOM_HEIGHT),
      clamp(readFiniteNumber(raw.position[2], 0), -ROOM_DEPTH / 2, ROOM_DEPTH / 2),
    ],
    rotation: [
      clamp(readFiniteNumber(raw.rotation[0], 0), -180, 180),
      clamp(readFiniteNumber(raw.rotation[1], 0), -180, 180),
      clamp(readFiniteNumber(raw.rotation[2], 0), -180, 180),
    ],
    scale: [
      clamp(readFiniteNumber(raw.scale[0], 1), 0.2, 3),
      clamp(readFiniteNumber(raw.scale[1], 1), 0.2, 3),
      clamp(readFiniteNumber(raw.scale[2], 1), 0.2, 3),
    ],
  };
};

const normalizeAvatarSeatMapPayload = (value: unknown) => {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(ACTIVE_AVATAR_ID_LIST.map((id, index) => {
    const fallback = DEFAULT_AVATAR_SEATS[id] ?? index;
    return [id, clamp(Math.trunc(readFiniteNumber(raw[id], fallback)), 0, AVATAR_SEAT_COUNT - 1)];
  })) as Record<string, number>;
};

const normalizeAvatarSeatAdjustmentsPayload = (value: unknown) => {
  const raw = value && typeof value === "object" ? value as Record<string, Partial<AvatarSeatAdjustment>> : {};
  return Object.fromEntries(ACTIVE_AVATAR_ID_LIST.map((id) => {
    const current = raw[id] ?? {};
    return [id, {
      yawOffsetDeg: clamp(readFiniteNumber(current.yawOffsetDeg, DEFAULT_AVATAR_SEAT_ADJUSTMENT.yawOffsetDeg), -180, 180),
      depthOffset: clamp(readFiniteNumber(current.depthOffset, DEFAULT_AVATAR_SEAT_ADJUSTMENT.depthOffset), -2.5, 2.5),
      sideOffset: clamp(readFiniteNumber(current.sideOffset, DEFAULT_AVATAR_SEAT_ADJUSTMENT.sideOffset), -2.5, 2.5),
      heightOffset: clamp(readFiniteNumber(current.heightOffset, DEFAULT_AVATAR_SEAT_ADJUSTMENT.heightOffset), -1.4, 1.4),
    }];
  })) as Record<string, AvatarSeatAdjustment>;
};

const normalizeSeatTuningPayload = (value: unknown) => {
  const raw = value && typeof value === "object" ? value as Partial<AvatarSeatTuning> : {};
  return {
    animated: typeof raw.animated === "boolean" ? raw.animated : DEFAULT_AVATAR_SEAT_TUNING.animated,
    chairDepth: clamp(readFiniteNumber(raw.chairDepth, DEFAULT_AVATAR_SEAT_TUNING.chairDepth), 0.1, 2.2),
    approachSide: clamp(readFiniteNumber(raw.approachSide, DEFAULT_AVATAR_SEAT_TUNING.approachSide), 0.4, 5.5),
    approachBack: clamp(readFiniteNumber(raw.approachBack, DEFAULT_AVATAR_SEAT_TUNING.approachBack), 0, 3.5),
    walkSpeed: clamp(readFiniteNumber(raw.walkSpeed, DEFAULT_AVATAR_SEAT_TUNING.walkSpeed), 1, 8),
    sitDuration: clamp(readFiniteNumber(raw.sitDuration, DEFAULT_AVATAR_SEAT_TUNING.sitDuration), 0.15, 2.5),
  };
};
const getAvatarSeatPose = (seatIndex: number, tableCenter = AVATAR_TABLE_CENTER) => {
  const clampedSeat = clamp(Math.trunc(seatIndex), 0, AVATAR_SEAT_COUNT - 1);
  const angle = Math.PI / 2 - (Math.PI * 2 * clampedSeat) / AVATAR_SEAT_COUNT;
  const position = new THREE.Vector3(
    tableCenter.x + Math.cos(angle) * AVATAR_SEAT_RADIUS,
    0,
    tableCenter.z + Math.sin(angle) * AVATAR_SEAT_RADIUS
  );
  const direction = tableCenter.clone().sub(position);
  const yaw = Math.atan2(-direction.x, -direction.z);
  return { position, yaw };
};

const getNearestAvatarSeatIndex = (position: THREE.Vector3, tableCenter = AVATAR_TABLE_CENTER) => {
  let nearestSeat = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < AVATAR_SEAT_COUNT; index += 1) {
    const seat = getAvatarSeatPose(index, tableCenter);
    const distance = seat.position.distanceToSquared(position);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestSeat = index;
    }
  }
  return nearestSeat;
};
const getPointToSegmentDistance = (point: THREE.Vector3, start: THREE.Vector3, end: THREE.Vector3) => {
  const segment = end.clone().sub(start);
  const lengthSq = segment.lengthSq();
  if (lengthSq < 0.0001) return point.distanceTo(start);
  const t = clamp(point.clone().sub(start).dot(segment) / lengthSq, 0, 1);
  return point.distanceTo(start.clone().addScaledVector(segment, t));
};

const getAvatarSeatPathLength = (path: THREE.Vector3[]) => {
  let length = 0;
  for (let index = 1; index < path.length; index += 1) {
    length += path[index - 1].distanceTo(path[index]);
  }
  return length;
};

const sampleAvatarSeatPath = (path: THREE.Vector3[], pathLength: number, progress: number) => {
  if (path.length === 0) return new THREE.Vector3();
  if (path.length === 1 || pathLength < 0.0001) return path[path.length - 1].clone();
  const targetDistance = clamp(progress, 0, 1) * pathLength;
  let walkedDistance = 0;
  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1];
    const end = path[index];
    const segmentLength = start.distanceTo(end);
    if (walkedDistance + segmentLength >= targetDistance) {
      const segmentProgress = segmentLength < 0.0001 ? 1 : (targetDistance - walkedDistance) / segmentLength;
      return start.clone().lerp(end, segmentProgress);
    }
    walkedDistance += segmentLength;
  }
  return path[path.length - 1].clone();
};

const lerpAngle = (start: number, end: number, progress: number) => {
  const delta = Math.atan2(Math.sin(end - start), Math.cos(end - start));
  return start + delta * clamp(progress, 0, 1);
};

const isAvatarNearCouncilTable = (position: THREE.Vector3, tableCenter = AVATAR_TABLE_CENTER) => {
  const flatPosition = position.clone();
  flatPosition.y = 0;
  const flatCenter = tableCenter.clone();
  flatCenter.y = 0;
  return flatPosition.distanceTo(flatCenter) <= AVATAR_TABLE_INTERACTION_RADIUS;
};

const createAvatarSeatPath = (startPosition: THREE.Vector3, targetPosition: THREE.Vector3, tableCenter = AVATAR_TABLE_CENTER) => {
  const start = startPosition.clone();
  const target = targetPosition.clone();
  start.y = 0;
  target.y = 0;
  const center = tableCenter.clone();
  center.y = 0;
  const distanceToTable = getPointToSegmentDistance(center, start, target);
  if (distanceToTable >= AVATAR_TABLE_AVOID_RADIUS) return [start, target];

  const startRadial = start.clone().sub(center).setY(0);
  const targetRadial = target.clone().sub(center).setY(0);
  if (startRadial.lengthSq() < 0.01) startRadial.set(1, 0, 0);
  if (targetRadial.lengthSq() < 0.01) targetRadial.copy(startRadial).negate();
  startRadial.normalize();
  targetRadial.normalize();

  const cross = startRadial.x * targetRadial.z - startRadial.z * targetRadial.x;
  const side = cross >= 0 ? 1 : -1;
  const startTangent = new THREE.Vector3(-startRadial.z * side, 0, startRadial.x * side);
  const targetTangent = new THREE.Vector3(targetRadial.z * side, 0, -targetRadial.x * side);
  const waypointA = center.clone().addScaledVector(startRadial, AVATAR_TABLE_AVOID_RADIUS).addScaledVector(startTangent, 3.4);
  const waypointB = center.clone().addScaledVector(targetRadial, AVATAR_TABLE_AVOID_RADIUS).addScaledVector(targetTangent, 3.4);
  return [start, waypointA, waypointB, target];
};
const AVATAR_MOTION_OPTIONS = [
  { id: "basic-walking", label: "Базовая ходьба Meshy" },
  { id: "daily-walk-loop", label: "Повседневная прогулка" },
  { id: "fast-walk-loop", label: "Быстрая прогулка" },
  { id: "slow-walk-loop", label: "Медленная походка" },
  { id: "elegant-walk-loop", label: "Парадная походка" },
  { id: "walk-loop", label: "Горячая походка" },
  { id: "walk-turn-left", label: "Идти и повернуть налево" },
  { id: "walk-turn-right", label: "Идти и повернуть направо" },
  { id: "walk-backward", label: "Идти назад" },
  { id: "walk-to-seat", label: "Идти и сесть за стол" },
  { id: "sit-at-table", label: "Сесть за стол" },
  { id: "chair-sitting-idle", label: "Стул: сидит без дела" },
  { id: "male-sit-transition", label: "Переходный мужчина" },
  { id: "sit-transition", label: "Переход: сидеть" },
  { id: "sit-cross-legged", label: "Сидит скрестив ноги" },
  { id: "stand-from-seat", label: "Встать" },
  { id: "spell-charge", label: "Заклинание с зарядом" },
  { id: "female-walk-loop", label: "Идущая женщина" }
];

const AVATAR_MOTION_LABELS = new Map(AVATAR_MOTION_OPTIONS.map((motion) => [motion.id, motion.label]));

const AVATAR_REVERSED_MOTION_IDS = new Set<string>();
const getAvatarMotionFacingOffset = (motion: string) => AVATAR_REVERSED_MOTION_IDS.has(motion) ? Math.PI : 0;

const getAvatarMotionOptions = (avatar?: InitiateAvatar | null) => {
  const byId = new Map<string, { id: string; label: string }>();
  const addMotion = (id?: string, label?: string) => {
    if (!id || byId.has(id)) return;
    byId.set(id, { id, label: label ?? AVATAR_MOTION_LABELS.get(id) ?? id });
  };

  addMotion("basic-walking", AVATAR_MOTION_LABELS.get("basic-walking"));
  if (!avatar) return Array.from(byId.values());

  avatar.motions?.forEach((motion) => {
    const hasLocalModel = Boolean(avatar.animationTasks?.[motion.id ?? ""]?.localModel);
    if (hasLocalModel) addMotion(motion.id, motion.label);
  });

  Object.entries(avatar.animationTasks ?? {}).forEach(([id, task]) => {
    if (task.localModel) addMotion(id, task.label);
  });

  return Array.from(byId.values());
};

const getDefaultAvatarMotion = (avatar?: InitiateAvatar | null) => {
  const options = getAvatarMotionOptions(avatar);
  if (avatar?.id === DLANIS_AVATAR_ID) return options.find((motion) => motion.id === "axe-stance")?.id ?? "axe-stance";
  const preferredId = avatar?.gender === "женщина" ? "female-walk-loop" : "daily-walk-loop";
  return options.find((motion) => motion.id === preferredId)?.id ?? options.find((motion) => motion.id === "daily-walk-loop")?.id ?? options[0]?.id ?? "daily-walk-loop";
};

const holdActionAtEnd = (mixer: THREE.AnimationMixer | null, action: THREE.AnimationAction | null) => {
  if (!mixer || !action) return;
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.enabled = true;
  action.paused = false;
  action.play();
  mixer.setTime(Math.max(action.getClip().duration - 0.001, 0));
  action.paused = true;
};
const getDlanisReplayDelay = () => 180 + Math.random() * 120;
const createDlanisPoseRuntime = (mixer: THREE.AnimationMixer, action: THREE.AnimationAction): DlanisPoseRuntime => {
  mixer.stopAllAction();
  mixer.setTime(0);
  action.reset();
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.enabled = true;
  action.paused = false;
  action.play();
  return { mixer, action, replayIn: getDlanisReplayDelay(), playing: true };
};
const updateDlanisPoseRuntime = (runtime: DlanisPoseRuntime | null, delta: number) => {
  if (!runtime) return;
  if (runtime.playing) {
    runtime.mixer.update(delta);
    if (runtime.action.time >= runtime.action.getClip().duration - 0.02) {
      runtime.action.time = Math.max(runtime.action.getClip().duration - 0.001, 0);
      runtime.mixer.update(0);
      runtime.action.paused = true;
      runtime.playing = false;
      runtime.replayIn = getDlanisReplayDelay();
    }
    return;
  }
  runtime.replayIn -= delta;
  if (runtime.replayIn > 0) return;
  runtime.action.reset();
  runtime.action.setLoop(THREE.LoopOnce, 1);
  runtime.action.clampWhenFinished = true;
  runtime.action.paused = false;
  runtime.action.play();
  runtime.playing = true;
};
const createCouncilMarbleTexture = (variant: "floor" | "ceiling") => {
  const size = 2048;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const center = size / 2;
  const base = ctx.createRadialGradient(center, center, 80, center, center, center);
  base.addColorStop(0, variant === "floor" ? "#fff8e8" : "#f7ead2");
  base.addColorStop(0.56, variant === "floor" ? "#e7dcc8" : "#d6c3a3");
  base.addColorStop(1, variant === "floor" ? "#b7aa96" : "#14100d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.globalAlpha = variant === "floor" ? 0.24 : 0.18;
  for (let index = 0; index < 190; index += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const length = 180 + Math.random() * 620;
    const angle = -0.42 + Math.random() * 0.84;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + Math.cos(angle) * length * 0.3,
      y + Math.sin(angle) * length * 0.5,
      x + Math.cos(angle) * length * 0.7,
      y + Math.sin(angle) * length * 0.2,
      x + Math.cos(angle) * length,
      y + Math.sin(angle) * length
    );
    ctx.strokeStyle = index % 5 === 0 ? "#c7a15a" : "#5c5044";
    ctx.lineWidth = index % 5 === 0 ? 1.8 : 1;
    ctx.stroke();
  }
  ctx.restore();

  const drawRing = (radius: number, width: number, color = "#d8ae5e", alpha = 0.88) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };

  const drawBand = (inner: number, outer: number, color: string, alpha: number) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(center, center, outer, 0, Math.PI * 2);
    ctx.arc(center, center, inner, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.restore();
  };

  if (variant === "ceiling") {
    drawBand(0, 870, "#14100d", 0.78);
    drawBand(610, 770, "#f4ead8", 0.9);
    drawBand(380, 510, "#19130f", 0.82);
    drawBand(150, 250, "#f3e5ca", 0.92);
  } else {
    drawBand(0, 540, "#14110f", 0.28);
    drawBand(260, 390, "#f9efdd", 0.72);
  }

  [132, 215, 330, 462, 620, 810, 940].forEach((radius, index) => {
    drawRing(radius, index % 2 === 0 ? 6 : 3, index % 3 === 0 ? "#f2cf7a" : "#b98d42", 0.82);
  });

  ctx.save();
  ctx.translate(center, center);
  ctx.strokeStyle = "#d8ae5e";
  ctx.globalAlpha = variant === "floor" ? 0.74 : 0.68;
  for (let index = 0; index < 32; index += 1) {
    const angle = (Math.PI * 2 * index) / 32;
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(120, 0);
    ctx.lineTo(920, 0);
    ctx.lineWidth = index % 4 === 0 ? 3 : 1.1;
    ctx.stroke();
    ctx.rotate(-angle);
  }
  ctx.restore();

  ctx.save();
  ctx.translate(center, center);
  ctx.globalAlpha = 0.58;
  ctx.strokeStyle = "#7b5a2e";
  ctx.lineWidth = 2;
  for (let index = 0; index < 16; index += 1) {
    const angle = (Math.PI * 2 * index) / 16;
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(430, -22);
    ctx.quadraticCurveTo(510, -68, 590, -22);
    ctx.quadraticCurveTo(510, 18, 430, -22);
    ctx.stroke();
    ctx.rotate(-angle);
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
};
const SURFACES: SurfaceDefinition[] = [
  { id: "floor", label: "Пол", hint: "ставить на основание", dimensions: [ROOM_WIDTH, ROOM_DEPTH], position: [0, 0, 0], rotation: [-90, 0, 0], defaultRotation: [0, 0, 0], fixedAxis: 1, fixedValue: 0 },
  { id: "back-wall", label: "Задняя стена", hint: "архитектура и фон", dimensions: [ROOM_WIDTH, ROOM_HEIGHT], position: [0, ROOM_HEIGHT / 2, -ROOM_DEPTH / 2], rotation: [0, 0, 0], defaultRotation: [0, 0, 0], fixedAxis: 2, fixedValue: -ROOM_DEPTH / 2 + SURFACE_OFFSET },
  { id: "front-wall", label: "Передняя стена", hint: "входная сторона", dimensions: [ROOM_WIDTH, ROOM_HEIGHT], position: [0, ROOM_HEIGHT / 2, ROOM_DEPTH / 2], rotation: [0, 180, 0], defaultRotation: [0, 180, 0], fixedAxis: 2, fixedValue: ROOM_DEPTH / 2 - SURFACE_OFFSET },
  { id: "left-wall", label: "Левая стена", hint: "боковые детали", dimensions: [ROOM_DEPTH, ROOM_HEIGHT], position: [-ROOM_WIDTH / 2, ROOM_HEIGHT / 2, 0], rotation: [0, 90, 0], defaultRotation: [0, 90, 0], fixedAxis: 0, fixedValue: -ROOM_WIDTH / 2 + SURFACE_OFFSET },
  { id: "right-wall", label: "Правая стена", hint: "боковые детали", dimensions: [ROOM_DEPTH, ROOM_HEIGHT], position: [ROOM_WIDTH / 2, ROOM_HEIGHT / 2, 0], rotation: [0, -90, 0], defaultRotation: [0, -90, 0], fixedAxis: 0, fixedValue: ROOM_WIDTH / 2 - SURFACE_OFFSET },
  { id: "ceiling", label: "Потолок", hint: "верхние элементы", dimensions: [ROOM_WIDTH, ROOM_DEPTH], position: [0, ROOM_HEIGHT, 0], rotation: [90, 0, 0], defaultRotation: [180, 0, 0], fixedAxis: 1, fixedValue: ROOM_HEIGHT - SURFACE_OFFSET }
];

const SURFACE_BY_ID = new Map(SURFACES.map((surface) => [surface.id, surface]));

const toRadVec = (rotation: Vec3): Vec3 => rotation.map((value) => THREE.MathUtils.degToRad(value)) as Vec3;

const getSurfaceSpawnPosition = (surfaceId: SurfaceId, index: number): Vec3 => {
  const col = index % 7;
  const row = Math.floor(index / 7);
  const spread = 4.8;
  const x = (col - 3) * spread;
  const y = 2.8 + (row % 7) * 3.1;
  const z = -8 - row * spread;

  switch (surfaceId) {
    case "back-wall":
      return [x, clamp(y, 2, ROOM_HEIGHT - 2), -ROOM_DEPTH / 2 + SURFACE_OFFSET];
    case "front-wall":
      return [x, clamp(y, 2, ROOM_HEIGHT - 2), ROOM_DEPTH / 2 - SURFACE_OFFSET];
    case "left-wall":
      return [-ROOM_WIDTH / 2 + SURFACE_OFFSET, clamp(y, 2, ROOM_HEIGHT - 2), clamp(z, -ROOM_DEPTH / 2 + 5, ROOM_DEPTH / 2 - 5)];
    case "right-wall":
      return [ROOM_WIDTH / 2 - SURFACE_OFFSET, clamp(y, 2, ROOM_HEIGHT - 2), clamp(z, -ROOM_DEPTH / 2 + 5, ROOM_DEPTH / 2 - 5)];
    case "ceiling":
      return [x, ROOM_HEIGHT - SURFACE_OFFSET, clamp(z, -ROOM_DEPTH / 2 + 5, ROOM_DEPTH / 2 - 5)];
    case "floor":
    default:
      return [x, 0, clamp(z, -ROOM_DEPTH / 2 + 5, ROOM_DEPTH / 2 - 5)];
  }
};

const clampObjectToSurface = (object: THREE.Object3D, surfaceId: SurfaceId) => {
  const surface = SURFACE_BY_ID.get(surfaceId);
  if (!surface) return;
  object.position.x = clamp(object.position.x, -ROOM_WIDTH / 2 + 1, ROOM_WIDTH / 2 - 1);
  object.position.y = clamp(object.position.y, 0, ROOM_HEIGHT);
  object.position.z = clamp(object.position.z, -ROOM_DEPTH / 2 + 1, ROOM_DEPTH / 2 - 1);
  object.position.setComponent(surface.fixedAxis, surface.fixedValue);
};

type PlacedAsset = {
  id: string;
  slug: string;
  label: string;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  opacity: number;
  visible: boolean;
  surface: SurfaceId;
  surfaceLocked: boolean;
};

type ConstructorTemplatePayload = {
  version?: number;
  updatedAt?: string;
  items?: PlacedAsset[];
  avatarSeatMap?: Record<string, number>;
  avatarSeatAdjustments?: Record<string, Partial<AvatarSeatAdjustment>>;
  seatTuning?: Partial<AvatarSeatTuning>;
  controlledAvatarId?: string;
};

type TransformMode = "translate" | "rotate" | "scale";

const STORAGE_KEY = "zerkalo-dao-meshy-scene-v1";
const TEMPLATE_API_URL = "/api/constructor-template";

const ASSET_LABEL_WORDS: Record<string, string> = {
  acoustic: "акустический",
  alcove: "ниша",
  arch: "арка",
  arched: "арочный",
  architecture: "архитектура",
  armrest: "подлокотник",
  artifact: "артефакт",
  astrolabe: "астролябия",
  balcony: "балкон",
  balustrade: "балюстрада",
  banner: "знамя",
  base: "основание",
  basin: "чаша",
  black: "черный",
  botanical: "ботаника",
  bowl: "чаша",
  brace: "крепление",
  bronze: "бронза",
  buttress: "контрфорс",
  candelabrum: "канделябр",
  ceiling: "потолок",
  celestial: "небесный",
  chair: "кресло",
  chandelier: "люстра",
  channel: "канал",
  circular: "круговой",
  cluster: "группа",
  codex: "кодекс",
  column: "колонна",
  compact: "компактный",
  compass: "компас",
  connector: "соединитель",
  council: "совет",
  crescent: "полумесяц",
  crystal: "кристалл",
  curved: "изогнутый",
  dais: "подиум",
  display: "витрина",
  dome: "купол",
  doorway: "проем",
  drape: "драпировка",
  emerald: "изумрудный",
  feature: "элемент",
  filigree: "филигрань",
  flame: "пламя",
  floor: "пол",
  fountain: "фонтан",
  frame: "рама",
  garden: "сад",
  glass: "стекло",
  gold: "золото",
  golden: "золотой",
  gothic: "готический",
  greenery: "зелень",
  hanging: "подвесной",
  hall: "зал",
  illuminated: "подсвеченный",
  incense: "благовоние",
  inlay: "инкрустация",
  indoor: "внутренний",
  jade: "нефрит",
  lamp: "светильник",
  lantern: "фонарь",
  lattice: "решетка",
  light: "свет",
  luminous: "светящийся",
  mandala: "мандала",
  marble: "мрамор",
  medallion: "медальон",
  module: "модуль",
  mountain: "гора",
  neutral: "нейтральный",
  obelisk: "обелиск",
  ornate: "орнаментальный",
  panel: "панель",
  participant: "участник",
  pedestal: "пьедестал",
  planter: "кашпо",
  plaque: "табличка",
  portal: "портал",
  radial: "радиальный",
  rail: "рейка",
  railing: "перила",
  rear: "задний",
  reflective: "отражающий",
  relief: "рельеф",
  rib: "ребро",
  ring: "кольцо",
  rosette: "розетка",
  round: "круглый",
  sacred: "сакральный",
  sanctuary: "святилище",
  seat: "место",
  seven: "семь",
  side: "боковой",
  sconce: "бра",
  slim: "тонкий",
  star: "звезда",
  stone: "камень",
  suspended: "подвесной",
  table: "стол",
  tabletop: "столешница",
  temple: "храм",
  tracery: "ажур",
  tree: "дерево",
  violet: "фиолетовый",
  wall: "стена",
  waterfall: "водопад",
  water: "вода",
  white: "белый",
  window: "окно"
};

const formatLabel = (slug: string) => slug
  .replace(/^\d+-/, "")
  .split("-")
  .map((word) => ASSET_LABEL_WORDS[word] ?? word)
  .join(" ");
const round = (value: number) => Math.round(value * 100) / 100;

const inferInitialScale = (slug: string) => {
  if (slug.includes("table")) return 4.8;
  if (slug.includes("chair") || slug.includes("seat")) return 2.2;
  if (slug.includes("column") || slug.includes("pillar")) return 5.2;
  if (slug.includes("arch") || slug.includes("portal") || slug.includes("doorway")) return 4.2;
  if (slug.includes("ceiling") || slug.includes("wall") || slug.includes("window")) return 3.4;
  if (slug.includes("water") || slug.includes("floor")) return 3.2;
  return 1.8;
};

const categorizeAsset = (slug: string) => {
  if (/chair|seat|table|goblet|codex|plaque/i.test(slug)) return "Совет";
  if (/column|arch|portal|wall|window|ceiling|buttress|cornice|lattice|doorway/i.test(slug)) return "Архитектура";
  if (/water|fountain|bowl|basin|mist|ripple/i.test(slug)) return "Вода";
  if (/lamp|light|lantern|chandelier|crystal|obelisk|sconce/i.test(slug)) return "Свет";
  if (/garden|vine|moss|tree|planter|botanical|flower/i.test(slug)) return "Природа";
  return "Декор";
};

const cloneMaterials = (object: THREE.Object3D) => {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;
      if (Array.isArray(child.material)) {
        child.material = child.material.map((material) => material.clone());
      } else {
        child.material = child.material.clone();
      }
    }
  });
};

const normalizeObject = (object: THREE.Object3D) => {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxSize = Math.max(size.x, size.y, size.z, 0.001);
  object.scale.multiplyScalar(1 / maxSize);
  object.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(object);
  const center = new THREE.Vector3();
  scaledBox.getCenter(center);
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= scaledBox.min.y;
};

const normalizeAvatarObject = (object: THREE.Object3D, targetHeight = AVATAR_TARGET_HEIGHT) => {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  const scale = targetHeight / Math.max(size.y, 0.001);
  object.scale.setScalar(scale);
  object.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(object);
  const center = new THREE.Vector3();
  scaledBox.getCenter(center);
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= scaledBox.min.y;
};

const normalizeAvatarObjectWithScale = (object: THREE.Object3D, scale: number) => {
  object.scale.setScalar(scale);
  object.updateMatrixWorld(true);
  const scaledBox = new THREE.Box3().setFromObject(object);
  const center = new THREE.Vector3();
  scaledBox.getCenter(center);
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= scaledBox.min.y;
};
const getObjectHeight = (object: THREE.Object3D) => {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  return Math.max(size.y, 0.001);
};

const sanitizeAvatarAnimationClip = (clip: THREE.AnimationClip, motion: string, model?: THREE.Object3D) => {
  let changed = false;
  const tracks = clip.tracks.flatMap((track) => {
    if (motion === "female-walk-loop" && /\.scale(?:$|\[)/i.test(track.name)) {
      changed = true;
      return [];
    }
    if (model && AVATAR_LOCOMOTION_MOTION_IDS.has(motion) && /Hips\.position$/i.test(track.name) && track.values.length >= 3) {
      const hips = model.getObjectByName("Hips");
      if (hips) {
        const values = Array.from(track.values);
        const firstY = values[1] ?? hips.position.y;
        for (let index = 0; index < values.length; index += 3) {
          values[index] = hips.position.x;
          values[index + 1] = hips.position.y + ((values[index + 1] ?? firstY) - firstY);
          values[index + 2] = hips.position.z;
        }
        changed = true;
        return [new THREE.VectorKeyframeTrack(track.name, Array.from(track.times), values, track.getInterpolation())];
      }
    }
    if (AVATAR_SEATED_MOTION_IDS.has(motion) && /Hips\.position$/i.test(track.name) && track.values.length >= 3) {
      const values = Array.from(track.values);
      const baseX = values[0] ?? 0;
      const baseZ = values[2] ?? 0;
      for (let index = 0; index < values.length; index += 3) {
        values[index] = baseX;
        values[index + 2] = baseZ;
      }
      changed = true;
      return [new THREE.VectorKeyframeTrack(track.name, Array.from(track.times), values, track.getInterpolation())];
    }
    return [track];
  });
  return changed ? new THREE.AnimationClip(`${clip.name || motion}-sanitized`, clip.duration, tracks) : clip;
};
const prepareDlanisAnimationClip = (clip: THREE.AnimationClip, motion: string) => {
  return sanitizeAvatarAnimationClip(clip, motion);
};
const applyDlanisWeaponVisibility = (model: THREE.Object3D, motion: string) => {
  const visibleWeapon = DLANIS_WEAPON_BY_MOTION[motion] ?? null;
  model.traverse((child) => {
    if (!child.name.startsWith("Weapon_")) return;
    child.visible = child.name === "Weapon_Axe_Back" || child.name === visibleWeapon;
  });
};
const applyDlanisWeaponAdjustments = (groups: Map<DlanisWeaponId, THREE.Group>, adjustments: DlanisWeaponAdjustments) => {
  groups.forEach((group, weaponId) => {
    const adjustment = adjustments[weaponId];
    group.position.fromArray(adjustment.position);
    group.rotation.set(
      THREE.MathUtils.degToRad(adjustment.rotation[0]),
      THREE.MathUtils.degToRad(adjustment.rotation[1]),
      THREE.MathUtils.degToRad(adjustment.rotation[2])
    );
    group.scale.setScalar(adjustment.scale);
  });
};
const createDlanisWeaponAdjustmentGroups = (model: THREE.Object3D) => {
  const weapons: Array<{ id: DlanisWeaponId; object: THREE.Object3D }> = [];
  model.traverse((child) => {
    if (child.name === "Weapon_Spear" || child.name === "Weapon_Axe_Back") {
      weapons.push({ id: child.name, object: child });
    }
  });
  const groups = new Map<DlanisWeaponId, THREE.Group>();
  weapons.forEach(({ id, object }) => {
    const parent = object.parent;
    if (!parent) return;
    const group = new THREE.Group();
    group.name = "DlanisOffset_" + id;
    parent.add(group);
    group.add(object);
    groups.set(id, group);
  });
  return groups;
};
const stabilizeDlanisRendering = (model: THREE.Object3D) => {
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.frustumCulled = false;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      material.side = THREE.DoubleSide;
      material.needsUpdate = true;
    });
  });
};
const disposeObjectTree = (object: THREE.Object3D) => {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points)) return;
    child.geometry?.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material?.dispose?.());
  });
};

const applyOpacity = (object: THREE.Object3D, opacity: number) => {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      material.transparent = opacity < 0.99;
      material.opacity = opacity;
      material.depthWrite = opacity > 0.72;
      material.needsUpdate = true;
    });
  });
};

const snapshotObject = (placed: PlacedAsset, object: THREE.Object3D): PlacedAsset => ({
  ...placed,
  position: [round(object.position.x), round(object.position.y), round(object.position.z)],
  rotation: [round(THREE.MathUtils.radToDeg(object.rotation.x)), round(THREE.MathUtils.radToDeg(object.rotation.y)), round(THREE.MathUtils.radToDeg(object.rotation.z))],
  scale: [round(object.scale.x), round(object.scale.y), round(object.scale.z)],
  visible: object.visible
});

export function MeshySceneConstructor({
  plain = false,
  telegram = false,
  telegramAvatarId,
  telegramParticipantId,
  telegramParticipantNickname,
  telegramParticipants = [],
  onTelegramPose
}: MeshySceneConstructorProps = {}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orbitRef = useRef<OrbitControls | null>(null);
  const transformRef = useRef<TransformControls | null>(null);
  const loaderRef = useRef<GLTFLoader | null>(null);
  const remoteAvatarLayerRef = useRef<THREE.Group | null>(null);
  const remoteAvatarRuntimesRef = useRef(new Map<string, RemoteAvatarRuntime>());
  const remoteAvatarLoadingRef = useRef(new Set<string>());
  const telegramParticipantsRef = useRef(telegramParticipants);
  const telegramParticipantIdRef = useRef(telegramParticipantId);
  const telegramAvatarCatalogRef = useRef(new Map<string, InitiateAvatar>());
  const onTelegramPoseRef = useRef(onTelegramPose);
  const lastTelegramPoseEmitAtRef = useRef(0);
  const sourceCacheRef = useRef(new Map<string, THREE.Object3D>());
  const assetsRef = useRef<MeshyAsset[]>([]);
  const objectRefs = useRef(new Map<string, THREE.Group>());
  const selectedIdRef = useRef<string | null>(null);
  const selectedIdsRef = useRef<string[]>([]);
  const placedRef = useRef<PlacedAsset[]>([]);
  const snapSurfaceRef = useRef(true);
  const templateLoadedRef = useRef(false);
  const flyModeRef = useRef(false);
  const flyKeysRef = useRef(new Set<string>());
  const flyYawPitchRef = useRef({ yaw: 0, pitch: -0.18 });
  const avatarGroupRef = useRef<THREE.Group | null>(null);
  const controlledAvatarRef = useRef<ControlledAvatarRuntime | null>(null);
  const avatarMixersRef = useRef<THREE.AnimationMixer[]>([]);
  const dlanisPoseRef = useRef<DlanisPoseRuntime | null>(null);
  const dlanisRootRef = useRef<THREE.Group | null>(null);
  const councilHologramWorldRef = useRef<CouncilHologramWorldRuntime | null>(null);
  const councilHologramPanelRef = useRef<HTMLElement | null>(null);
  const breathingGuardRootRef = useRef<THREE.Group | null>(null);
  const dlanisWeaponGroupsRef = useRef(new Map<DlanisWeaponId, THREE.Group>());
  const dlanisPlacementRef = useRef<DlanisPlacement | null>(null);
  const breathingGuardPlacementRef = useRef<DlanisPlacement | null>(null);
  const dlanisTransformTargetRef = useRef<DlanisTransformTarget | null>(null);
  const avatarKeysRef = useRef(new Set<string>());
  const avatarControlEnabledRef = useRef(true);
  const avatarNearTableRef = useRef(false);
  const avatarIsSeatedRef = useRef(false);
  const seatedLookRef = useRef({ yaw: 0, pitch: -0.14 });
  const thirdPersonCameraEnabledRef = useRef(true);
  const controlledAvatarPoseRef = useRef<Record<string, { position: THREE.Vector3; yaw: number }>>({});
  const avatarSeatMapRef = useRef<Record<string, number>>(DEFAULT_AVATAR_SEATS);
  const avatarSeatAdjustmentsRef = useRef<Record<string, AvatarSeatAdjustment>>(DEFAULT_AVATAR_SEAT_ADJUSTMENTS);
  const seatTuningRef = useRef<AvatarSeatTuning>(DEFAULT_AVATAR_SEAT_TUNING);
  const pendingSeatCommandRef = useRef<{ avatarId: string; seatIndex: number; targetPosition: THREE.Vector3; targetYaw: number } | null>(null);
  const seatAllAvatarsOnNextLoadRef = useRef(false);

  const [assets, setAssets] = useState<MeshyAsset[]>([]);
  const [placed, setPlaced] = useState<PlacedAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copiedItems, setCopiedItems] = useState<PlacedAsset[]>([]);
  const [mode, setMode] = useState<TransformMode>("translate");
  const [activeSurface, setActiveSurface] = useState<SurfaceId>("floor");
  const [snapSurface, setSnapSurface] = useState(true);
  const [flyMode, setFlyMode] = useState(false);
  const [avatarControlEnabled, setAvatarControlEnabled] = useState(true);
  const [avatarNearTable, setAvatarNearTable] = useState(false);
  const [avatarIsSeated, setAvatarIsSeated] = useState(false);
  const [thirdPersonCameraEnabled, setThirdPersonCameraEnabled] = useState(true);
  const seatStorageHydratedRef = useRef(false);
  const [avatarSeatMap, setAvatarSeatMap] = useState<Record<string, number>>(DEFAULT_AVATAR_SEATS);
  const [seatTuning, setSeatTuning] = useState<AvatarSeatTuning>(DEFAULT_AVATAR_SEAT_TUNING);
  const [avatarSeatAdjustments, setAvatarSeatAdjustments] = useState<Record<string, AvatarSeatAdjustment>>(DEFAULT_AVATAR_SEAT_ADJUSTMENTS);
  const [seatEditorAvatarId, setSeatEditorAvatarId] = useState(DEFAULT_CONTROLLED_AVATAR_ID);
  const [initiateAvatars, setInitiateAvatars] = useState<InitiateAvatar[]>([]);
  const [telegramAvatarCatalogRevision, setTelegramAvatarCatalogRevision] = useState(0);
  const [controlledAvatarId, setControlledAvatarId] = useState<string>(() => telegram ? (telegramAvatarId ?? getTelegramAvatarId()) : DEFAULT_CONTROLLED_AVATAR_ID);
  const [avatarMotion, setAvatarMotion] = useState(() => telegram ? getTelegramAvatarMotion(telegramAvatarId ?? getTelegramAvatarId()) : "daily-walk-loop");
  const avatarMotionRef = useRef(telegram ? getTelegramAvatarMotion(telegramAvatarId ?? getTelegramAvatarId()) : "daily-walk-loop");
  const [dlanisWeaponEditorId, setDlanisWeaponEditorId] = useState<DlanisWeaponId>("Weapon_Spear");
  const [dlanisTransformTarget, setDlanisTransformTarget] = useState<DlanisTransformTarget | null>(null);
  const [dlanisWeaponAdjustments, setDlanisWeaponAdjustments] = useState<DlanisWeaponAdjustments>(DEFAULT_DLANIS_WEAPON_ADJUSTMENTS);
  const dlanisWeaponAdjustmentsRef = useRef<DlanisWeaponAdjustments>(DEFAULT_DLANIS_WEAPON_ADJUSTMENTS);
  useEffect(() => {
    avatarMotionRef.current = avatarMotion;
  }, [avatarMotion]);

  useEffect(() => {
    telegramParticipantsRef.current = telegramParticipants;
  }, [telegramParticipants]);

  useEffect(() => {
    telegramParticipantIdRef.current = telegramParticipantId;
  }, [telegramParticipantId]);

  useEffect(() => {
    onTelegramPoseRef.current = onTelegramPose;
  }, [onTelegramPose]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Все");
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  const [panelsHidden, setPanelsHidden] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [templateRevision, setTemplateRevision] = useState(0);
  const [message, setMessage] = useState("Готовлю библиотеку деталей");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedBreathingGuardPlacement = window.localStorage.getItem(BREATHING_GUARD_PLACEMENT_STORAGE_KEY);
    if (savedBreathingGuardPlacement) {
      try {
        breathingGuardPlacementRef.current = normalizeDlanisPlacement(JSON.parse(savedBreathingGuardPlacement));
      } catch {
        window.localStorage.removeItem(BREATHING_GUARD_PLACEMENT_STORAGE_KEY);
      }
    }

    const savedDlanisPlacement = window.localStorage.getItem(DLANIS_PLACEMENT_STORAGE_KEY);
    if (savedDlanisPlacement) {
      try {
        dlanisPlacementRef.current = normalizeDlanisPlacement(JSON.parse(savedDlanisPlacement));
      } catch {
        window.localStorage.removeItem(DLANIS_PLACEMENT_STORAGE_KEY);
      }
    }

    const savedDlanisWeapons = window.localStorage.getItem(DLANIS_WEAPON_STORAGE_KEY);
    if (savedDlanisWeapons) {
      try {
        const nextDlanisWeapons = normalizeDlanisWeaponAdjustments(JSON.parse(savedDlanisWeapons));
        dlanisWeaponAdjustmentsRef.current = nextDlanisWeapons;
        setDlanisWeaponAdjustments(nextDlanisWeapons);
      } catch {
        window.localStorage.removeItem(DLANIS_WEAPON_STORAGE_KEY);
      }
    }

    const savedSeatMap = window.localStorage.getItem(AVATAR_SEAT_STORAGE_KEY);
    if (savedSeatMap) {
      try {
        const nextSeatMap = normalizeAvatarSeatMapPayload(JSON.parse(savedSeatMap));
        avatarSeatMapRef.current = nextSeatMap;
        setAvatarSeatMap(nextSeatMap);
      } catch {
        window.localStorage.removeItem(AVATAR_SEAT_STORAGE_KEY);
      }
    }

    const savedSeatTuning = window.localStorage.getItem(AVATAR_SEAT_TUNING_STORAGE_KEY);
    if (savedSeatTuning) {
      try {
        const nextSeatTuning = normalizeSeatTuningPayload(JSON.parse(savedSeatTuning));
        seatTuningRef.current = nextSeatTuning;
        setSeatTuning(nextSeatTuning);
      } catch {
        window.localStorage.removeItem(AVATAR_SEAT_TUNING_STORAGE_KEY);
      }
    }

    const savedSeatAdjustments = window.localStorage.getItem(AVATAR_SEAT_ADJUSTMENTS_STORAGE_KEY);
    if (savedSeatAdjustments) {
      try {
        const nextSeatAdjustments = normalizeAvatarSeatAdjustmentsPayload(JSON.parse(savedSeatAdjustments));
        avatarSeatAdjustmentsRef.current = nextSeatAdjustments;
        setAvatarSeatAdjustments(nextSeatAdjustments);
      } catch {
        window.localStorage.removeItem(AVATAR_SEAT_ADJUSTMENTS_STORAGE_KEY);
      }
    }

    window.setTimeout(() => {
      seatStorageHydratedRef.current = true;
    }, 0);
  }, [telegram]);
  useEffect(() => {
    selectedIdRef.current = selectedId;
    const object = selectedId ? objectRefs.current.get(selectedId) ?? null : null;
    if (object) {
      dlanisTransformTargetRef.current = null;
      setDlanisTransformTarget(null);
      transformRef.current?.setSpace("world");
      transformRef.current?.attach(object);
    } else if (!dlanisTransformTargetRef.current) {
      transformRef.current?.detach();
    }
  }, [selectedId]);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    if (!selectedId && selectedIds.length > 0) setSelectedIds([]);
    if (selectedId && selectedIds.length === 0) setSelectedIds([selectedId]);
  }, [selectedId, selectedIds.length]);

  useEffect(() => {
    placedRef.current = placed;
  }, [placed]);

  useEffect(() => {
    snapSurfaceRef.current = snapSurface;
  }, [snapSurface]);

  useEffect(() => {
    flyModeRef.current = flyMode;
    const orbit = orbitRef.current;
    if (orbit) orbit.enabled = !flyMode && !(avatarControlEnabledRef.current && thirdPersonCameraEnabledRef.current);
    const camera = cameraRef.current;
    if (camera && flyMode) {
      camera.rotation.order = "YXZ";
      flyYawPitchRef.current = { yaw: camera.rotation.y, pitch: camera.rotation.x };
    }
  }, [flyMode]);

  useEffect(() => {
    avatarControlEnabledRef.current = avatarControlEnabled;
    const orbit = orbitRef.current;
    if (orbit) orbit.enabled = !flyModeRef.current && !(avatarControlEnabled && thirdPersonCameraEnabledRef.current);
  }, [avatarControlEnabled]);

  useEffect(() => {
    thirdPersonCameraEnabledRef.current = thirdPersonCameraEnabled;
    const orbit = orbitRef.current;
    if (orbit) orbit.enabled = !flyModeRef.current && !(avatarControlEnabledRef.current && thirdPersonCameraEnabled);
  }, [thirdPersonCameraEnabled]);

  useEffect(() => {
    avatarSeatMapRef.current = avatarSeatMap;
    if (typeof window !== "undefined" && seatStorageHydratedRef.current) {
      window.localStorage.setItem(AVATAR_SEAT_STORAGE_KEY, JSON.stringify(avatarSeatMap));
    }
  }, [avatarSeatMap]);

  useEffect(() => {
    seatTuningRef.current = seatTuning;
    if (typeof window !== "undefined" && seatStorageHydratedRef.current) {
      window.localStorage.setItem(AVATAR_SEAT_TUNING_STORAGE_KEY, JSON.stringify(seatTuning));
    }
  }, [seatTuning]);

  const updateSeatTuning = (patch: Partial<AvatarSeatTuning>) => {
    setSeatTuning((current) => {
      const next = { ...current, ...patch };
      seatTuningRef.current = next;
      return next;
    });
  };

  const resetSeatTuning = () => {
    const next = { ...DEFAULT_AVATAR_SEAT_TUNING };
    seatTuningRef.current = next;
    setSeatTuning(next);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AVATAR_SEAT_TUNING_STORAGE_KEY);
    }
    setMessage("Настройки посадки сброшены. Нажми 'Тест посадки', чтобы проверить дефолтную траекторию");
  };

  const controlledAvatar = useMemo(
    () => initiateAvatars.find((avatar) => avatar.id === controlledAvatarId) ?? null,
    [controlledAvatarId, initiateAvatars]
  );
  const sceneAvatarMotion = avatarMotion;
  const dlanisWeaponEditorAdjustment = dlanisWeaponAdjustments[dlanisWeaponEditorId];
  const updateDlanisWeaponAdjustment = (weaponId: DlanisWeaponId, patch: Partial<DlanisWeaponAdjustment>) => {
    setDlanisWeaponAdjustments((current) => {
      const next = {
        ...current,
        [weaponId]: {
          ...current[weaponId],
          ...patch,
          position: patch.position ?? current[weaponId].position,
          rotation: patch.rotation ?? current[weaponId].rotation,
        },
      };
      dlanisWeaponAdjustmentsRef.current = next;
      applyDlanisWeaponAdjustments(dlanisWeaponGroupsRef.current, next);
      return next;
    });
  };
  const replayDlanisAnimation = () => {
    const runtime = dlanisPoseRef.current;
    if (!runtime) {
      setMessage("DLANIS еще загружается");
      return;
    }
    runtime.mixer.stopAllAction();
    runtime.mixer.setTime(0);
    runtime.action.reset();
    runtime.action.setLoop(THREE.LoopOnce, 1);
    runtime.action.clampWhenFinished = true;
    runtime.action.enabled = true;
    runtime.action.paused = false;
    runtime.action.play();
    runtime.playing = true;
    runtime.replayIn = getDlanisReplayDelay();
    setMessage("Анимация DLANIS запущена. После завершения останется последний кадр");
  };
  const holdDlanisFinalPose = () => {
    const runtime = dlanisPoseRef.current;
    if (!runtime) {
      setMessage("DLANIS еще загружается");
      return;
    }
    runtime.action.reset();
    runtime.action.setLoop(THREE.LoopOnce, 1);
    runtime.action.clampWhenFinished = true;
    runtime.action.enabled = true;
    runtime.action.play();
    runtime.mixer.setTime(Math.max(runtime.action.getClip().duration - 0.001, 0));
    runtime.action.paused = true;
    runtime.playing = false;
    runtime.replayIn = getDlanisReplayDelay();
    setMessage("DLANIS зафиксирован на последнем кадре");
  };
  const getDlanisTransformObject = (target: DlanisTransformTarget) =>
    target === "avatar"
      ? dlanisRootRef.current
      : target === "breathing-guard"
        ? breathingGuardRootRef.current
        : dlanisWeaponGroupsRef.current.get(target) ?? null;
  const selectDlanisTransformTarget = (target: DlanisTransformTarget) => {
    const object = getDlanisTransformObject(target);
    if (!object) {
      setMessage("DLANIS или выбранное оружие еще загружается");
      return;
    }
    dlanisTransformTargetRef.current = target;
    setDlanisTransformTarget(target);
    setSelectedId(null);
    setSelectedIds([]);
    transformRef.current?.setSpace(target === "avatar" || target === "breathing-guard" ? "world" : "local");
    transformRef.current?.attach(object);
    setMessage(target === "avatar" ? "DLANIS выбран для перемещения" : target === "breathing-guard" ? "Страж Наблюдатель выбран для перемещения" : "Оружие выбрано для редактирования в сцене");
  };
  const clearDlanisTransformTarget = () => {
    dlanisTransformTargetRef.current = null;
    setDlanisTransformTarget(null);
    transformRef.current?.detach();
    setMessage("Редактирование DLANIS завершено");
  };
  const saveDlanisWeaponAdjustments = () => {
    const breathingGuardRoot = breathingGuardRootRef.current;
    if (breathingGuardRoot) {
      breathingGuardPlacementRef.current = {
        position: [breathingGuardRoot.position.x, breathingGuardRoot.position.y, breathingGuardRoot.position.z],
        rotation: [
          THREE.MathUtils.radToDeg(breathingGuardRoot.rotation.x),
          THREE.MathUtils.radToDeg(breathingGuardRoot.rotation.y),
          THREE.MathUtils.radToDeg(breathingGuardRoot.rotation.z),
        ],
        scale: [breathingGuardRoot.scale.x, breathingGuardRoot.scale.y, breathingGuardRoot.scale.z],
      };
    }
    const root = dlanisRootRef.current;
    if (root) {
      dlanisPlacementRef.current = {
        position: [root.position.x, root.position.y, root.position.z],
        rotation: [
          THREE.MathUtils.radToDeg(root.rotation.x),
          THREE.MathUtils.radToDeg(root.rotation.y),
          THREE.MathUtils.radToDeg(root.rotation.z),
        ],
        scale: [root.scale.x, root.scale.y, root.scale.z],
      };
    }
    window.localStorage.setItem(DLANIS_WEAPON_STORAGE_KEY, JSON.stringify(dlanisWeaponAdjustmentsRef.current));
    if (breathingGuardPlacementRef.current) {
      window.localStorage.setItem(BREATHING_GUARD_PLACEMENT_STORAGE_KEY, JSON.stringify(breathingGuardPlacementRef.current));
    }
    if (dlanisPlacementRef.current) {
      window.localStorage.setItem(DLANIS_PLACEMENT_STORAGE_KEY, JSON.stringify(dlanisPlacementRef.current));
    }
    setMessage("Положение обоих стражей, копья и топора сохранено в браузере");
  };
  const resetDlanisWeaponAdjustment = () => {
    const fallback = DEFAULT_DLANIS_WEAPON_ADJUSTMENTS[dlanisWeaponEditorId];
    updateDlanisWeaponAdjustment(dlanisWeaponEditorId, {
      position: [...fallback.position] as Vec3,
      rotation: [...fallback.rotation] as Vec3,
      scale: fallback.scale,
    });
    setMessage("Смещение выбранного оружия сброшено");
  };
  const seatOptions = useMemo(() => Array.from({ length: AVATAR_SEAT_COUNT }, (_, index) => index), []);
  const updateAvatarSeat = (avatarId: string, seatIndex: number) => {
    setAvatarSeatMap((current) => ({ ...current, [avatarId]: clamp(Math.trunc(seatIndex), 0, AVATAR_SEAT_COUNT - 1) }));
  };

  const getCouncilTableCenter = () => {
    const baseTable = objectRefs.current.get("base-table");
    if (baseTable && baseTable.visible !== false) {
      const center = new THREE.Vector3().setFromMatrixPosition(baseTable.matrixWorld);
      center.y = 0;
      return center;
    }
    const tableItem = placedRef.current.find((item) => {
      const signature = `${item.id} ${item.slug} ${item.label}`.toLowerCase();
      return item.visible !== false && /(table|стол)/.test(signature) && !/(goblet|столешница|tabletop|underside|brace|rim|spoke)/.test(signature);
    });
    if (tableItem) return new THREE.Vector3(tableItem.position[0], 0, tableItem.position[2]);
    return AVATAR_TABLE_CENTER.clone();
  };

  const getCouncilTableSurfaceY = () => {
    const baseTable = objectRefs.current.get("base-table");
    if (baseTable && baseTable.visible !== false) {
      const bounds = new THREE.Box3().setFromObject(baseTable);
      if (Number.isFinite(bounds.max.y)) return bounds.max.y + 0.035;
    }
    return 2.35;
  };

  const getChairCandidatePriority = (item: PlacedAsset) => {
    const signature = `${item.id} ${item.slug} ${item.label}`.toLowerCase();
    if (item.id.startsWith("base-chair") || item.slug === "92-council-chair-v2") return 0;
    if (/council.*chair|совет.*кресл/.test(signature)) return 1;
    if (/(chair|кресл|стул|seat)/.test(signature) && !/(cushion|back|armrest|crest|foot|nameplate|socket|marker|plaque|module)/.test(signature)) return 2;
    return Number.POSITIVE_INFINITY;
  };

  const getRealChairSeatPoses = () => {
    const tableCenter = getCouncilTableCenter();
    const candidates = placedRef.current
      .map((item) => ({ item, priority: getChairCandidatePriority(item) }))
      .filter((candidate) => Number.isFinite(candidate.priority) && candidate.item.visible !== false)
      .sort((a, b) => a.priority - b.priority || a.item.id.localeCompare(b.item.id));

    return candidates
      .map((candidate) => {
        const object = objectRefs.current.get(candidate.item.id);
        const chairPosition = object ? new THREE.Vector3().setFromMatrixPosition(object.matrixWorld) : new THREE.Vector3(candidate.item.position[0], candidate.item.position[1], candidate.item.position[2]);
        chairPosition.y = 0;
        const toTable = tableCenter.clone().sub(chairPosition).setY(0);
        if (toTable.lengthSq() < 0.01) toTable.set(0, 0, -1);
        toTable.normalize();
        const averageChairScale = (Math.abs(candidate.item.scale[0]) + Math.abs(candidate.item.scale[2])) / 2;
        const sitForwardOffset = -Math.max(seatTuningRef.current.chairDepth, averageChairScale * 0.14);
        const targetPosition = chairPosition.clone().addScaledVector(toTable, sitForwardOffset);
        targetPosition.y = 0;
        const targetYaw = Math.atan2(-toTable.x, -toTable.z);
        const angle = Math.atan2(chairPosition.z - tableCenter.z, chairPosition.x - tableCenter.x);
        return { seatIndex: 0, targetPosition, targetYaw, label: candidate.item.label, angle };
      })
      .sort((a, b) => b.angle - a.angle)
      .map((seat, seatIndex) => ({ ...seat, seatIndex }));
  };

  const findNearestRealChairSeat = (position: THREE.Vector3): { seatIndex: number; targetPosition: THREE.Vector3; targetYaw: number; label: string } | null => {
    const seats = getRealChairSeatPoses();
    let nearest: { seatIndex: number; targetPosition: THREE.Vector3; targetYaw: number; label: string } | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    seats.forEach((seat) => {
      const distance = seat.targetPosition.distanceToSquared(position);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = seat;
      }
    });
    return nearest;
  };

  const getOccupiedRealSeatIndexes = (exceptAvatarId?: string) => new Set(
    Object.entries(avatarSeatMapRef.current)
      .filter(([avatarId]) =>
        avatarId !== exceptAvatarId
        && ACTIVE_AVATAR_IDS.has(avatarId)
        && (!telegram || avatarId === controlledAvatarId)
      )
      .map(([, seatIndex]) => clamp(Math.trunc(Number(seatIndex)), 0, AVATAR_SEAT_COUNT - 1))
  );

  const findNearestAvailableRealChairSeat = (position: THREE.Vector3, avatarId?: string): { seatIndex: number; targetPosition: THREE.Vector3; targetYaw: number; label: string } | null => {
    const seats = getRealChairSeatPoses();
    if (seats.length === 0) return null;
    const occupiedSeats = getOccupiedRealSeatIndexes(avatarId);
    const remoteOccupants = Array.from(remoteAvatarRuntimesRef.current.values()).map((runtime) => runtime.targetPosition);
    let nearest: { seatIndex: number; targetPosition: THREE.Vector3; targetYaw: number; label: string } | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    seats.forEach((seat) => {
      if (occupiedSeats.has(seat.seatIndex)) return;
      if (remoteOccupants.some((remotePosition) => remotePosition.distanceToSquared(seat.targetPosition) < 14.1)) return;
      const distance = seat.targetPosition.distanceToSquared(position);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = seat;
      }
    });
    return nearest ?? (telegram && remoteOccupants.length > 0 ? null : findNearestRealChairSeat(position));
  };
  const getAvatarSeatAdjustment = (avatarId: string, map = avatarSeatAdjustmentsRef.current) => ({
    ...DEFAULT_AVATAR_SEAT_ADJUSTMENT,
    ...(map[avatarId] ?? {}),
  });

  const applyAvatarSeatAdjustment = (avatarId: string, targetPosition: THREE.Vector3, targetYaw: number, map = avatarSeatAdjustmentsRef.current) => {
    const adjustment = getAvatarSeatAdjustment(avatarId, map);
    const forward = new THREE.Vector3(-Math.sin(targetYaw), 0, -Math.cos(targetYaw));
    if (forward.lengthSq() < 0.0001) forward.set(0, 0, 1);
    forward.normalize();
    const side = new THREE.Vector3(-forward.z, 0, forward.x).normalize();
    const position = targetPosition.clone()
      .addScaledVector(forward, adjustment.depthOffset)
      .addScaledVector(side, adjustment.sideOffset);
    position.y = targetPosition.y + adjustment.heightOffset;
    return { position, yaw: targetYaw + THREE.MathUtils.degToRad(adjustment.yawOffsetDeg) };
  };

  const getSeatPoseForAvatar = (avatar: InitiateAvatar, fallbackIndex = 0, map = avatarSeatAdjustmentsRef.current) => {
    const seatIndex = clamp(Math.trunc(avatarSeatMapRef.current[avatar.id] ?? fallbackIndex), 0, AVATAR_SEAT_COUNT - 1);
    const realSeatPoses = getRealChairSeatPoses();
    const realSeatPose = realSeatPoses.length > 0 ? realSeatPoses[seatIndex % realSeatPoses.length] : null;
    const fallbackSeatPose = getAvatarSeatPose(seatIndex, getCouncilTableCenter());
    const basePosition = realSeatPose?.targetPosition ?? fallbackSeatPose.position;
    const baseYaw = realSeatPose?.targetYaw ?? fallbackSeatPose.yaw;
    const adjusted = applyAvatarSeatAdjustment(avatar.id, basePosition, baseYaw, map);
    return { seatIndex: realSeatPose?.seatIndex ?? seatIndex, label: realSeatPose?.label ?? `место ${seatIndex + 1}`, targetPosition: adjusted.position, targetYaw: adjusted.yaw };
  };

  const applySeatedAvatarAdjustmentsToScene = (map = avatarSeatAdjustmentsRef.current) => {
    const avatarLayer = avatarGroupRef.current;
    if (!avatarLayer || initiateAvatars.length === 0) return;
    initiateAvatars.filter((avatar) => ACTIVE_AVATAR_IDS.has(avatar.id) && !NON_CONTROLLABLE_AVATAR_IDS.has(avatar.id)).forEach((avatar, index) => {
      const seatPose = getSeatPoseForAvatar(avatar, index, map);
      const avatarRoot = avatarLayer.children.find((child) => child.userData.avatarId === avatar.id) as THREE.Group | undefined;
      if (!avatarRoot) return;
      if (controlledAvatarRef.current?.root === avatarRoot) {
        const runtime = controlledAvatarRef.current;
        if (runtime.isSeated || avatarIsSeatedRef.current) {
          const modelFacingOffset = AVATAR_MODEL_FORWARD_OFFSET + getAvatarMotionFacingOffset(avatarMotionRef.current);
          if (avatarControlEnabledRef.current) {
            setControlledRuntimeSeated(runtime, seatPose.targetPosition, seatPose.targetYaw, modelFacingOffset);
          } else {
            setControlledRuntimeSeatedForEditor(runtime, seatPose.targetPosition, seatPose.targetYaw, modelFacingOffset);
          }
          controlledAvatarPoseRef.current[avatar.id] = { position: seatPose.targetPosition.clone(), yaw: seatPose.targetYaw };
        }
        return;
      }
      avatarRoot.position.copy(seatPose.targetPosition);
      avatarRoot.rotation.y = seatPose.targetYaw + AVATAR_MODEL_FORWARD_OFFSET;
    });
  };

  const updateAvatarSeatAdjustment = (avatarId: string, patch: Partial<AvatarSeatAdjustment>) => {
    setAvatarSeatAdjustments((current) => {
      const next = {
        ...current,
        [avatarId]: { ...DEFAULT_AVATAR_SEAT_ADJUSTMENT, ...(current[avatarId] ?? {}), ...patch },
      };
      avatarSeatAdjustmentsRef.current = next;
      return next;
    });
  };

  const resetAvatarSeatAdjustment = (avatarId: string) => {
    setAvatarSeatAdjustments((current) => {
      const next = { ...current, [avatarId]: { ...DEFAULT_AVATAR_SEAT_ADJUSTMENT } };
      avatarSeatAdjustmentsRef.current = next;
      return next;
    });
    setMessage("Настройки посадки аватара сброшены");
  };

  useEffect(() => {
    avatarSeatAdjustmentsRef.current = avatarSeatAdjustments;
    if (typeof window !== "undefined" && seatStorageHydratedRef.current) {
      window.localStorage.setItem(AVATAR_SEAT_ADJUSTMENTS_STORAGE_KEY, JSON.stringify(avatarSeatAdjustments));
    }
    applySeatedAvatarAdjustmentsToScene(avatarSeatAdjustments);
  }, [avatarSeatAdjustments, avatarSeatMap, initiateAvatars.length]);

  const isAvatarNearCouncilSeat = (position: THREE.Vector3) => {
    const tableCenter = getCouncilTableCenter();
    if (isAvatarNearCouncilTable(position, tableCenter)) return true;

    const flatPosition = position.clone();
    flatPosition.y = 0;
    return placedRef.current.some((item) => {
      if (item.visible === false || !Number.isFinite(getChairCandidatePriority(item))) return false;
      const object = objectRefs.current.get(item.id);
      const chairPosition = object ? new THREE.Vector3().setFromMatrixPosition(object.matrixWorld) : new THREE.Vector3(item.position[0], item.position[1], item.position[2]);
      chairPosition.y = 0;
      const averageChairScale = (Math.abs(item.scale[0]) + Math.abs(item.scale[2])) / 2;
      const interactionRadius = Math.max(AVATAR_CHAIR_INTERACTION_RADIUS, averageChairScale * 1.35);
      return flatPosition.distanceTo(chairPosition) <= interactionRadius;
    });
  };

  const getSeatedFirstPersonEyePosition = (runtime: ControlledAvatarRuntime) => {
    const avatarId = typeof runtime.root.userData.avatarId === "string" ? runtime.root.userData.avatarId : "";
    const isVoidArchon = avatarId === "void-archon-v3-cyber";
    const seatedForward = new THREE.Vector3(-Math.sin(runtime.yaw), 0, -Math.cos(runtime.yaw));
    return runtime.root.position
      .clone()
      .add(new THREE.Vector3(0, isVoidArchon ? 5.25 : 4.65, 0))
      .addScaledVector(seatedForward, isVoidArchon ? 1.45 : 1.05);
  };

  const applySeatedFirstPersonCamera = (runtime: ControlledAvatarRuntime) => {
    const camera = cameraRef.current;
    const orbit = orbitRef.current;
    if (!camera || !orbit) return;
    const eyePosition = getSeatedFirstPersonEyePosition(runtime);
    const look = seatedLookRef.current;
    const direction = new THREE.Vector3(
      -Math.sin(look.yaw) * Math.cos(look.pitch),
      Math.sin(look.pitch),
      -Math.cos(look.yaw) * Math.cos(look.pitch)
    ).normalize();
    const lookTarget = eyePosition.clone().addScaledVector(direction, 10);
    camera.position.copy(eyePosition);
    orbit.target.copy(lookTarget);
    orbit.enabled = false;
    camera.lookAt(orbit.target);
    orbit.update();
  };
  const setControlledRuntimeSeated = (runtime: ControlledAvatarRuntime, targetPosition: THREE.Vector3, targetYaw: number, modelFacingOffset = AVATAR_MODEL_FORWARD_OFFSET + getAvatarMotionFacingOffset(avatarMotionRef.current)) => {
    runtime.root.position.copy(targetPosition);
    runtime.root.position.y = 0;
    runtime.yaw = targetYaw;
    runtime.root.rotation.y = targetYaw + modelFacingOffset;
    const avatarId = typeof runtime.root.userData.avatarId === "string" ? runtime.root.userData.avatarId : null;
    if (avatarId) controlledAvatarPoseRef.current[avatarId] = { position: targetPosition.clone(), yaw: targetYaw };
    runtime.seating = null;
    runtime.isSeated = true;
    runtime.wasMoving = false;
    avatarKeysRef.current.clear();
    flyKeysRef.current.clear();
    avatarIsSeatedRef.current = true;
    avatarNearTableRef.current = false;
    setAvatarIsSeated(true);
    setAvatarNearTable(false);
    setThirdPersonCameraEnabled(false);
    thirdPersonCameraEnabledRef.current = false;
    seatedLookRef.current = { yaw: targetYaw, pitch: -0.14 };
    applySeatedFirstPersonCamera(runtime);
    if (runtime.action) {
      runtime.action.reset();
      runtime.action.paused = true;
      runtime.mixer?.update(0);
    }
    if (runtime.seatedModel) {
      runtime.seatedModel.visible = true;
      runtime.seatedModel.position.copy(runtime.baseSeatedModelPosition ?? runtime.seatedModel.position);
      holdActionAtEnd(runtime.seatedMixer, runtime.seatedAction);
      runtime.model.visible = false;
      if (runtime.idleModel) runtime.idleModel.visible = false;
    } else {
      runtime.model.visible = false;
      if (runtime.idleModel) runtime.idleModel.visible = false;
    }
  };

  const setControlledRuntimeSeatedForEditor = (runtime: ControlledAvatarRuntime, targetPosition: THREE.Vector3, targetYaw: number, modelFacingOffset = AVATAR_MODEL_FORWARD_OFFSET + getAvatarMotionFacingOffset(avatarMotionRef.current)) => {
    runtime.root.position.copy(targetPosition);
    runtime.root.position.y = targetPosition.y;
    runtime.yaw = targetYaw;
    runtime.root.rotation.y = targetYaw + modelFacingOffset;
    const avatarId = typeof runtime.root.userData.avatarId === "string" ? runtime.root.userData.avatarId : null;
    if (avatarId) controlledAvatarPoseRef.current[avatarId] = { position: targetPosition.clone(), yaw: targetYaw };
    runtime.seating = null;
    runtime.isSeated = true;
    runtime.wasMoving = false;
    avatarKeysRef.current.clear();
    flyKeysRef.current.clear();
    avatarIsSeatedRef.current = true;
    avatarNearTableRef.current = false;
    setAvatarIsSeated(true);
    setAvatarNearTable(false);
    setAvatarControlEnabled(false);
    avatarControlEnabledRef.current = false;
    setThirdPersonCameraEnabled(false);
    thirdPersonCameraEnabledRef.current = false;
    seatedLookRef.current = { yaw: targetYaw, pitch: -0.14 };
    if (runtime.action) {
      runtime.action.reset();
      runtime.action.paused = true;
      runtime.mixer?.update(0);
    }
    if (runtime.seatedModel) {
      runtime.seatedModel.visible = true;
      runtime.seatedModel.position.copy(runtime.baseSeatedModelPosition ?? runtime.seatedModel.position);
      holdActionAtEnd(runtime.seatedMixer, runtime.seatedAction);
      runtime.model.visible = false;
      if (runtime.idleModel) runtime.idleModel.visible = false;
    } else {
      runtime.model.visible = true;
      runtime.model.position.copy(runtime.baseModelPosition);
      if (runtime.idleModel) runtime.idleModel.visible = false;
    }
    const orbit = orbitRef.current;
    if (orbit) orbit.enabled = true;
  };

  const seatSelectedAvatarFromEditor = () => {
    const avatar = seatEditorAvatar;
    if (!avatar) {
      setMessage("Выбери аватара для посадки");
      return;
    }
    const seatPose = getSeatPoseForAvatar(avatar, avatarSeatMapRef.current[avatar.id] ?? DEFAULT_AVATAR_SEATS[avatar.id] ?? 0);
    const avatarRoot = avatarGroupRef.current?.children.find((child) => child.userData.avatarId === avatar.id) as THREE.Group | undefined;
    if (!avatarRoot) {
      setMessage("Аватар еще не загружен");
      return;
    }
    if (controlledAvatarRef.current?.root === avatarRoot) {
      const modelFacingOffset = AVATAR_MODEL_FORWARD_OFFSET + getAvatarMotionFacingOffset(avatarMotionRef.current);
      setControlledRuntimeSeatedForEditor(controlledAvatarRef.current, seatPose.targetPosition, seatPose.targetYaw, modelFacingOffset);
    } else {
      avatarRoot.position.copy(seatPose.targetPosition);
      avatarRoot.rotation.y = seatPose.targetYaw + AVATAR_MODEL_FORWARD_OFFSET;
    }
    controlledAvatarPoseRef.current[avatar.id] = { position: seatPose.targetPosition.clone(), yaw: seatPose.targetYaw };
    window.localStorage.setItem(AVATAR_SEAT_STORAGE_KEY, JSON.stringify(avatarSeatMapRef.current));
    window.localStorage.setItem(AVATAR_SEAT_ADJUSTMENTS_STORAGE_KEY, JSON.stringify(avatarSeatAdjustmentsRef.current));
    setMessage(`Аватар посажен через конструктор: ${avatar.title || avatar.id}`);
    rendererRef.current?.domElement.focus();
  };
  const beginSeatAnimation = (runtime: ControlledAvatarRuntime, targetPosition: THREE.Vector3, targetYaw: number) => {
    const tableCenter = getCouncilTableCenter();
    const seatForward = tableCenter.clone().sub(targetPosition).setY(0);
    if (seatForward.lengthSq() < 0.0001) seatForward.set(0, 0, -1);
    seatForward.normalize();
    const seatSide = new THREE.Vector3(-seatForward.z, 0, seatForward.x).normalize();
    const avatarSide = runtime.root.position.clone().sub(targetPosition).setY(0).dot(seatSide) >= 0 ? 1 : -1;
    const approachPosition = targetPosition
      .clone()
      .addScaledVector(seatSide, avatarSide * seatTuningRef.current.approachSide)
      .addScaledVector(seatForward, -seatTuningRef.current.approachBack);
    approachPosition.y = 0;
    const path = createAvatarSeatPath(runtime.root.position, approachPosition, tableCenter);
    const pathLength = getAvatarSeatPathLength(path);
    const walkDuration = Math.max(pathLength / Math.max(seatTuningRef.current.walkSpeed, 0.5), 0.45);
    const sitDuration = seatTuningRef.current.sitDuration;
    runtime.seating = {
      startPosition: runtime.root.position.clone(),
      targetPosition: targetPosition.clone(),
      approachPosition,
      sitStartPosition: approachPosition.clone(),
      settleStartYaw: runtime.yaw,
      targetYaw,
      path,
      pathLength,
      elapsed: 0,
      duration: walkDuration + sitDuration,
      walkDuration,
      sitDuration,
      phase: "approach",
      started: false,
    };
    runtime.isSeated = false;
    avatarIsSeatedRef.current = false;
    setAvatarIsSeated(false);
    runtime.wasMoving = false;
  };
  useEffect(() => {
    if (!controlledAvatar) return;
    const nextMotion = getDefaultAvatarMotion(controlledAvatar);
    const keepsDlanisMotion =
      controlledAvatar?.id === DLANIS_AVATAR_ID && DLANIS_SELECTABLE_MOTION_IDS.has(avatarMotion);
    if (!keepsDlanisMotion && avatarMotion !== "walk-to-seat" && avatarMotion !== nextMotion) {
      setAvatarMotion(nextMotion);
    }
  }, [avatarMotion, controlledAvatar]);

  useEffect(() => {
    transformRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setClearColor(0x020706, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, telegram ? 1.25 : 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.86;
    renderer.shadowMap.enabled = !telegram;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("aria-label", "3D сцена: управление аватаром через WASD и стрелки");
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020706);
    scene.fog = new THREE.FogExp2(0x06110f, 0.008);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(54, mount.clientWidth / mount.clientHeight, 0.08, 620);
    camera.position.set(24, 20.5, 42);
    cameraRef.current = camera;

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.target.set(0, ROOM_HEIGHT * 0.24, -8.4);
    orbit.maxPolarAngle = Math.PI * 0.82;
    orbit.minDistance = 4;
    orbit.maxDistance = 160;
    orbitRef.current = orbit;

    const transform = new TransformControls(camera, renderer.domElement);
    transform.setMode(mode);
    transform.setSize(0.92);
    let isTransformDragging = false;
    transform.addEventListener("dragging-changed", (event) => {
      isTransformDragging = (event as { value: boolean }).value;
      orbit.enabled = !isTransformDragging && !flyModeRef.current;
    });
    transform.addEventListener("objectChange", () => {
      const dlanisTarget = dlanisTransformTargetRef.current;
      if (dlanisTarget) {
        if (dlanisTarget === "avatar" || dlanisTarget === "breathing-guard") {
          const root = dlanisTarget === "avatar" ? dlanisRootRef.current : breathingGuardRootRef.current;
          if (!root) return;
          const placement: DlanisPlacement = {
            position: [root.position.x, root.position.y, root.position.z],
            rotation: [
              THREE.MathUtils.radToDeg(root.rotation.x),
              THREE.MathUtils.radToDeg(root.rotation.y),
              THREE.MathUtils.radToDeg(root.rotation.z),
            ],
            scale: [root.scale.x, root.scale.y, root.scale.z],
          };
          if (dlanisTarget === "avatar") dlanisPlacementRef.current = placement;
          else breathingGuardPlacementRef.current = placement;
          return;
        }
        const group = dlanisWeaponGroupsRef.current.get(dlanisTarget);
        if (!group) return;
        const current = dlanisWeaponAdjustmentsRef.current;
        const next: DlanisWeaponAdjustments = {
          ...current,
          [dlanisTarget]: {
            position: [group.position.x, group.position.y, group.position.z],
            rotation: [
              THREE.MathUtils.radToDeg(group.rotation.x),
              THREE.MathUtils.radToDeg(group.rotation.y),
              THREE.MathUtils.radToDeg(group.rotation.z),
            ],
            scale: (group.scale.x + group.scale.y + group.scale.z) / 3,
          },
        };
        dlanisWeaponAdjustmentsRef.current = next;
        setDlanisWeaponAdjustments(next);
        return;
      }
      const id = selectedIdRef.current;
      if (!id) return;
      const object = objectRefs.current.get(id);
      if (!object) return;
      const item = placedRef.current.find((placedItem) => placedItem.id === id);
      if (item && snapSurfaceRef.current && item.surfaceLocked !== false) clampObjectToSurface(object, item.surface);
      setPlaced((current) =>
        current.map((placedItem) => {
          if (placedItem.id !== id) return placedItem;
          const nextItem = snapSurfaceRef.current ? placedItem : { ...placedItem, surfaceLocked: false };
          return snapshotObject(nextItem, object);
        })
      );
    });
    scene.add(transform.getHelper());
    transformRef.current = transform;

    const ambient = new THREE.HemisphereLight(0xd8efe0, 0x020504, 0.58);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xdde8df, 0.32);
    keyLight.position.set(-8, 12, 9);
    keyLight.castShadow = !telegram;
    keyLight.shadow.mapSize.set(1024, 1024);
    scene.add(keyLight);

    const goldLight = new THREE.PointLight(0xffcf75, 16, 72, 1.9);
    goldLight.position.set(0, ROOM_HEIGHT * 0.36, -18);
    scene.add(goldLight);

    const celestialStartedAt = performance.now();
    const celestialSpheres = createCelestialSpheres({
      telegram,
      roomWidth: ROOM_WIDTH,
      roomHeight: ROOM_HEIGHT,
      roomDepth: ROOM_DEPTH,
    });
    scene.add(celestialSpheres.group);

    const surfaceGroup = new THREE.Group();
    surfaceGroup.name = "constructor-placement-surfaces";
    scene.add(surfaceGroup);

    const remoteAvatarLayer = new THREE.Group();
    remoteAvatarLayer.name = "telegram-remote-participants";
    scene.add(remoteAvatarLayer);
    remoteAvatarLayerRef.current = remoteAvatarLayer;
    remoteAvatarRuntimesRef.current.clear();
    remoteAvatarLoadingRef.current.clear();

    const councilHologramWorld = createCouncilHologramWorldRuntime();
    scene.add(councilHologramWorld.group);
    councilHologramWorldRef.current = councilHologramWorld;

    let councilHologramDisposed = false;
    const councilProjectorLoader = new GLTFLoader();
    councilProjectorLoader.load(
      assetUrl("/models/council-hologram/amethyst-projector-v1.glb"),
      (gltf) => {
        const model = gltf.scene;
        if (councilHologramDisposed) {
          model.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            object.geometry?.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => material.dispose());
          });
          return;
        }

        model.name = "amethyst-aether-projector";
        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        const horizontalSize = Math.max(size.x, size.z, 0.001);
        model.scale.setScalar(0.62 / horizontalSize);

        const scaledBounds = new THREE.Box3().setFromObject(model);
        const scaledCenter = scaledBounds.getCenter(new THREE.Vector3());
        model.position.x -= scaledCenter.x;
        model.position.y -= scaledBounds.min.y;
        model.position.z -= scaledCenter.z;
        model.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.castShadow = !telegram;
          object.receiveShadow = true;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => {
            if (!(material instanceof THREE.MeshStandardMaterial)) return;
            material.envMapIntensity = 1.15;
            for (const map of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap, material.emissiveMap]) {
              if (!map) continue;
              map.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
              map.needsUpdate = true;
            }
          });
        });
        councilHologramWorld.pedestal.add(model);

        const finalBounds = new THREE.Box3().setFromObject(model);
        const crystalCenter = finalBounds.getCenter(new THREE.Vector3());
        councilHologramWorld.crystalHitTarget.position.set(
          crystalCenter.x,
          finalBounds.max.y - 0.025,
          crystalCenter.z,
        );
        councilHologramWorld.light.position.set(crystalCenter.x, finalBounds.max.y + 0.04, crystalCenter.z + 0.1);
      },
      undefined,
      () => undefined,
    );

    const roomTextureLoader = new THREE.TextureLoader();
    const configureRoomTexture = (texture: THREE.Texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
      texture.needsUpdate = true;
      return texture;
    };
    const floorTexture = configureRoomTexture(roomTextureLoader.load(telegram ? "/images/inner-council/council-floor-telegram.webp" : "/images/inner-council/council-floor-generated.png"));
    const floorMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: floorTexture, roughness: 0.16, metalness: 0.04, transparent: true, opacity: 0.98, clearcoat: 0.9, clearcoatRoughness: 0.08, side: THREE.DoubleSide });
    const wallMaterial = new THREE.MeshBasicMaterial({ color: 0x12352d, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xd8ae5e, transparent: true, opacity: 0.46 });

    SURFACES.forEach((surface) => {
      if (surface.id === "ceiling") return;
      if (telegram && surface.id !== "floor") return;
      const geometry = new THREE.PlaneGeometry(surface.dimensions[0], surface.dimensions[1]);
      const material = surface.id === "floor" ? floorMaterial : wallMaterial.clone();
      const plane = new THREE.Mesh(geometry, material);
      plane.name = `placement-surface-${surface.id}`;
      plane.userData.surfaceId = surface.id;
      plane.position.set(surface.position[0], surface.position[1], surface.position[2]);
      const rotation = toRadVec(surface.rotation);
      plane.rotation.set(rotation[0], rotation[1], rotation[2]);
      plane.receiveShadow = surface.id === "floor";
      surfaceGroup.add(plane);

      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial.clone());
      outline.name = `placement-surface-outline-${surface.id}`;
      outline.position.copy(plane.position);
      outline.rotation.copy(plane.rotation);
      surfaceGroup.add(outline);
    });

    const grid = new THREE.GridHelper(ROOM_WIDTH, 66, 0xd8ae5e, 0x1f4a3d);
    grid.name = "constructor-grid";
    grid.position.y = 0.03;
    const gridMaterial = grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.08;
    if (!telegram) scene.add(grid);

    const axisRing = new THREE.Mesh(new THREE.TorusGeometry(7.45 * ROOM_SCALE, 0.024, 8, 220), new THREE.MeshBasicMaterial({ color: 0xd8ae5e, transparent: true, opacity: 0.42 }));
    axisRing.name = "constructor-seat-radius-ring";
    axisRing.position.set(0, 0.07, -2.8 * ROOM_SCALE);
    axisRing.rotation.x = Math.PI / 2;
    if (!telegram) scene.add(axisRing);

    loaderRef.current = new GLTFLoader();

    const selectionRaycaster = new THREE.Raycaster();
    const selectionPointer = new THREE.Vector2();
    const getPlacedIdFromObject = (object: THREE.Object3D | null) => {
      let current: THREE.Object3D | null = object;
      while (current) {
        const placedId = current.userData.placedId;
        if (typeof placedId === "string" && objectRefs.current.has(placedId)) return placedId;
        current = current.parent;
      }
      return null;
    };

    let lastFrameTime = performance.now();
    let mouseLookActive = false;
    let frame = 0;
    const updateControlledAvatar = (delta: number) => {
      const runtime = controlledAvatarRef.current;
      if (!runtime) return;
      const isSeated = Boolean(runtime.isSeated);
      if (avatarIsSeatedRef.current !== isSeated) {
        avatarIsSeatedRef.current = isSeated;
        setAvatarIsSeated(isSeated);
      }
      const nearTable = !isSeated && !runtime.seating && isAvatarNearCouncilSeat(runtime.root.position);
      if (avatarNearTableRef.current !== nearTable) {
        avatarNearTableRef.current = nearTable;
        setAvatarNearTable(nearTable);
      }
      if (runtime.seating) {
        const seating = runtime.seating;
        if (runtime.idleModel) runtime.idleModel.visible = false;
        if (runtime.seatedModel) runtime.seatedModel.visible = false;
        runtime.model.visible = true;
        const currentAvatarMotion = avatarMotionRef.current;
        if (seating.phase === "approach") {
          if (runtime.action && !seating.started) {
            runtime.action.reset();
            runtime.action.setLoop(THREE.LoopRepeat, Infinity);
            runtime.action.clampWhenFinished = false;
            runtime.action.paused = false;
            runtime.action.play();
            seating.started = true;
          }
          seating.elapsed += delta;
          const progress = clamp(seating.elapsed / seating.walkDuration, 0, 1);
          const previousPosition = runtime.root.position.clone();
          const nextPosition = sampleAvatarSeatPath(seating.path, seating.pathLength, progress);
          const lookAheadProgress = clamp(progress + Math.max(0.08, 1.8 / Math.max(seating.pathLength, 1)), 0, 1);
          const lookAheadPosition = sampleAvatarSeatPath(seating.path, seating.pathLength, lookAheadProgress);
          runtime.root.position.copy(nextPosition);
          const lookVector = lookAheadPosition.clone().sub(nextPosition).setY(0);
          const travel = nextPosition.clone().sub(previousPosition).setY(0);
          if (lookVector.lengthSq() < 0.00001 && travel.lengthSq() > 0.00001) lookVector.copy(travel);
          let desiredYaw = runtime.yaw;
          if (lookVector.lengthSq() > 0.00001) desiredYaw = Math.atan2(-lookVector.x, -lookVector.z);
          if (progress > 0.78) desiredYaw = lerpAngle(desiredYaw, seating.targetYaw, (progress - 0.78) / 0.22);
          const yawLerp = 1 - Math.exp(-delta * 5.8);
          runtime.yaw = lerpAngle(runtime.yaw, desiredYaw, yawLerp);
          runtime.root.rotation.y = runtime.yaw + AVATAR_MODEL_FORWARD_OFFSET + getAvatarMotionFacingOffset(currentAvatarMotion);
          runtime.action?.setEffectiveTimeScale(currentAvatarMotion === "female-walk-loop" ? 0.92 : 0.86);
          runtime.mixer?.update(delta);
          applyDlanisWeaponVisibility(runtime.model, currentAvatarMotion);
          runtime.model.position.copy(runtime.baseModelPosition);
          if (progress >= 1) {
            seating.phase = "settle";
            seating.elapsed = 0;
            seating.sitStartPosition = seating.targetPosition.clone();
            seating.settleStartYaw = seating.targetYaw;
            if (runtime.action) {
              runtime.action.reset();
              runtime.action.paused = true;
              runtime.mixer?.update(0);
            }
            runtime.root.position.copy(seating.targetPosition);
            runtime.root.rotation.y = seating.targetYaw + AVATAR_MODEL_FORWARD_OFFSET + getAvatarMotionFacingOffset(currentAvatarMotion);
            runtime.yaw = seating.targetYaw;
            runtime.model.visible = false;
            if (runtime.idleModel) runtime.idleModel.visible = false;
            if (!runtime.seatedModel) {
              const modelFacingOffset = AVATAR_MODEL_FORWARD_OFFSET + getAvatarMotionFacingOffset(currentAvatarMotion);
              setControlledRuntimeSeated(runtime, seating.targetPosition, seating.targetYaw, modelFacingOffset);
              setMessage("Аватар сел за ближайший стул. Обзор: зажми правую кнопку мыши и поворачивай камеру");
              return;
            }
            if (runtime.seatedModel) {
              runtime.seatedModel.visible = true;
              runtime.seatedModel.position.copy(runtime.baseSeatedModelPosition ?? runtime.seatedModel.position);
              holdActionAtEnd(runtime.seatedMixer, runtime.seatedAction);
            }
          }
          return;
        }

        seating.elapsed += delta;
        const progress = clamp(seating.elapsed / seating.sitDuration, 0, 1);
        runtime.root.position.copy(seating.targetPosition);
        runtime.yaw = seating.targetYaw;
        runtime.root.rotation.y = seating.targetYaw + AVATAR_MODEL_FORWARD_OFFSET + getAvatarMotionFacingOffset(currentAvatarMotion);
        runtime.model.visible = false;
        if (runtime.idleModel) runtime.idleModel.visible = false;
        if (runtime.seatedModel) {
          runtime.seatedModel.visible = true;
          runtime.seatedModel.position.copy(runtime.baseSeatedModelPosition ?? runtime.seatedModel.position);
        }
        if (progress >= 1) {
          const modelFacingOffset = AVATAR_MODEL_FORWARD_OFFSET + getAvatarMotionFacingOffset(currentAvatarMotion);
          setControlledRuntimeSeated(runtime, seating.targetPosition, seating.targetYaw, modelFacingOffset);
          setMessage("Аватар сел за ближайший стул. Обзор: зажми правую кнопку мыши и поворачивай камеру");
        }
        return;
      }
      const currentAvatarMotion = avatarMotionRef.current;
      const runtimeAvatarId = typeof runtime.root.userData.avatarId === "string" ? runtime.root.userData.avatarId : "";
      const playsDlanisShowcase =
        runtimeAvatarId === DLANIS_AVATAR_ID &&
        DLANIS_SHOWCASE_MOTION_IDS.has(currentAvatarMotion) &&
        !runtime.isSeated;
      if (playsDlanisShowcase) {
        if (runtime.seatedModel) runtime.seatedModel.visible = false;
        if (runtime.idleModel) runtime.idleModel.visible = false;
        runtime.model.visible = true;
        applyDlanisWeaponVisibility(runtime.model, currentAvatarMotion);
        runtime.model.position.copy(runtime.baseModelPosition);
        runtime.wasMoving = false;
        return;
      }
      if (!avatarControlEnabledRef.current || flyModeRef.current) {
        if (runtime.action) runtime.action.paused = true;
        return;
      }

      if (runtime.isSeated) {
        avatarKeysRef.current.clear();
        flyKeysRef.current.clear();
        runtime.wasMoving = false;
        if (runtime.action) runtime.action.paused = true;
        return;
      }

      const keys = avatarKeysRef.current;
      const verticalInput = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
      const horizontalInput = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
      const move = new THREE.Vector3();
      const thirdPersonActive = thirdPersonCameraEnabledRef.current && avatarControlEnabledRef.current && !flyModeRef.current;
      if (thirdPersonActive) {
        if (Math.abs(horizontalInput) > 0.001) runtime.yaw -= horizontalInput * 2.45 * delta;
        const avatarForward = new THREE.Vector3(-Math.sin(runtime.yaw), 0, -Math.cos(runtime.yaw));
        move.addScaledVector(avatarForward, verticalInput);
      } else {
        const cameraForward = new THREE.Vector3();
        const cameraRight = new THREE.Vector3();
        camera.getWorldDirection(cameraForward);
        cameraForward.y = 0;
        if (cameraForward.lengthSq() < 0.001) cameraForward.set(0, 0, -1);
        cameraForward.normalize();
        cameraRight.crossVectors(cameraForward, new THREE.Vector3(0, 1, 0)).normalize();
        move.addScaledVector(cameraForward, verticalInput);
        move.addScaledVector(cameraRight, horizontalInput);
      }

      const turnOnly = thirdPersonActive && Math.abs(horizontalInput) > 0.001 && Math.abs(verticalInput) < 0.001;
      const moving = move.lengthSq() > 0.001 || turnOnly;
      if (moving && runtime.isSeated) {
        runtime.isSeated = false;
        avatarIsSeatedRef.current = false;
        setAvatarIsSeated(false);
      }
      if (runtime.seatedModel) runtime.seatedModel.visible = false;
      if (runtime.idleModel) {
        runtime.idleModel.visible = !moving && !runtime.isSeated;
        runtime.model.visible = moving || runtime.isSeated;
      } else if (!runtime.isSeated) {
        runtime.model.visible = true;
        runtime.model.position.copy(runtime.baseModelPosition);
      }
      const accelerated = keys.has("ShiftLeft") || keys.has("ShiftRight");
      const motionTimeScale =
        currentAvatarMotion === "fast-walk-loop" ? (accelerated ? 1.45 : 1.18) :
        currentAvatarMotion === "daily-walk-loop" ? (accelerated ? 1.12 : 0.92) :
        (accelerated ? 1.12 : 0.82);
      runtime.action?.setEffectiveTimeScale(motionTimeScale);
      if (runtime.action) {
        if (moving) {
          runtime.action.paused = false;
        } else if (runtime.wasMoving && !runtime.isSeated) {
          runtime.action.reset();
          runtime.action.paused = true;
          runtime.mixer?.update(0);
          runtime.model.position.copy(runtime.baseModelPosition);
          if (runtime.idleModel && runtime.baseIdleModelPosition) runtime.idleModel.position.copy(runtime.baseIdleModelPosition);
        } else {
          runtime.action.paused = true;
        }
      }
      runtime.wasMoving = moving;

      if (moving) {
        const hasTranslation = move.lengthSq() > 0.001;
        if (hasTranslation) {
          move.normalize();
          if (!thirdPersonActive) runtime.yaw = Math.atan2(-move.x, -move.z);
        }
        runtime.root.rotation.y = runtime.yaw + AVATAR_MODEL_FORWARD_OFFSET + getAvatarMotionFacingOffset(currentAvatarMotion);
        const speed =
          currentAvatarMotion === "fast-walk-loop" ? (accelerated ? 8.4 : 5.8) :
          currentAvatarMotion === "daily-walk-loop" ? (accelerated ? 6.4 : 3.8) :
          (accelerated ? 7.2 : 4.1);
        if (hasTranslation) runtime.root.position.addScaledVector(move, speed * delta);
        runtime.root.position.x = clamp(runtime.root.position.x, -ROOM_WIDTH / 2 + 2, ROOM_WIDTH / 2 - 2);
        runtime.root.position.z = clamp(runtime.root.position.z, -ROOM_DEPTH / 2 + 2, ROOM_DEPTH / 2 - 2);
        runtime.mixer?.update(delta);
        applyDlanisWeaponVisibility(runtime.model, currentAvatarMotion);
        runtime.model.position.copy(runtime.baseModelPosition);
      }
    };

    const updateThirdPersonCamera = (delta: number) => {
      const runtime = controlledAvatarRef.current;
      const shouldFollow = Boolean(runtime && avatarControlEnabledRef.current && !flyModeRef.current && (thirdPersonCameraEnabledRef.current || runtime.isSeated));
      orbit.enabled = !shouldFollow;
      if (!runtime || !shouldFollow) return false;

      if (runtime.isSeated) {
        const eyePosition = getSeatedFirstPersonEyePosition(runtime);
        const look = seatedLookRef.current;
        const direction = new THREE.Vector3(
          -Math.sin(look.yaw) * Math.cos(look.pitch),
          Math.sin(look.pitch),
          -Math.cos(look.yaw) * Math.cos(look.pitch)
        ).normalize();
        const lookTarget = eyePosition.clone().addScaledVector(direction, 10);
        const cameraLerp = 1 - Math.exp(-delta * 8.5);
        camera.position.lerp(eyePosition, cameraLerp);
        orbit.target.lerp(lookTarget, cameraLerp);
        camera.lookAt(orbit.target);
        if (runtime.idleModel) runtime.idleModel.visible = false;
        if (runtime.seatedModel) {
          runtime.seatedModel.visible = !telegram;
          runtime.seatedModel.position.copy(runtime.baseSeatedModelPosition ?? runtime.seatedModel.position);
          runtime.seatedMixer?.update(0);
        }
        runtime.model.visible = telegram ? false : !runtime.seatedModel;
        return true;
      }

      const target = runtime.root.position.clone().add(new THREE.Vector3(0, 3.35, 0));
      const backward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), runtime.yaw).multiplyScalar(12.5);
      const desiredPosition = target.clone().add(backward).add(new THREE.Vector3(0, 4.4, 0));
      desiredPosition.x = clamp(desiredPosition.x, -ROOM_WIDTH / 2 + 1.25, ROOM_WIDTH / 2 - 1.25);
      desiredPosition.y = clamp(desiredPosition.y, 2.6, ROOM_HEIGHT - 0.7);
      desiredPosition.z = clamp(desiredPosition.z, -ROOM_DEPTH / 2 + 1.25, ROOM_DEPTH / 2 - 1.25);

      const cameraLerp = 1 - Math.exp(-delta * 5.6);
      const targetLerp = 1 - Math.exp(-delta * 7.2);
      camera.position.lerp(desiredPosition, cameraLerp);
      orbit.target.lerp(target, targetLerp);
      camera.lookAt(orbit.target);
      return true;
    };
    const updateCouncilHologramWorld = (elapsedSeconds: number) => {
      const world = councilHologramWorldRef.current;
      const runtime = controlledAvatarRef.current;
      const panelElement = councilHologramPanelRef.current;
      const active = Boolean(telegram && runtime?.isSeated);

      if (!world || !active || !runtime) {
        if (world) {
          world.group.visible = false;
          world.tabletopY = null;
          world.viewportWidth = 0;
        }
        if (panelElement) panelElement.dataset.worldVisible = "false";
        return;
      }

      const rendererBounds = renderer.domElement.getBoundingClientRect();
      if (Math.abs(world.viewportWidth - rendererBounds.width) > 16) world.tabletopY = null;
      if (world.tabletopY === null) {
        const tableCenter = getCouncilTableCenter();
        const tabletopY = getCouncilTableSurfaceY();
        const avatarRadial = runtime.root.position.clone().sub(tableCenter).setY(0);
        if (avatarRadial.lengthSq() < 0.001) avatarRadial.set(Math.sin(runtime.yaw), 0, Math.cos(runtime.yaw));
        avatarRadial.normalize();

        world.tabletopY = tabletopY;
        world.viewportWidth = rendererBounds.width;
        world.group.position.copy(tableCenter).addScaledVector(avatarRadial, 6.45);
        world.group.position.y = tabletopY;
        world.group.lookAt(camera.position.x, tabletopY, camera.position.z);
      }
      const projectorVisible = panelElement?.dataset.projectorVisible === "true";
      world.group.visible = projectorVisible;

      const pulse = (Math.sin(elapsedSeconds * 3.4) + 1) * 0.5;
      world.rings.forEach((ring, index) => {
        const ringPulse = 1 + Math.sin(elapsedSeconds * (1.15 + index * 0.24) + index) * 0.055;
        ring.scale.setScalar(ringPulse);
        const material = ring.material as THREE.MeshBasicMaterial;
        material.opacity = 0.38 + pulse * 0.18 - index * 0.035;
      });
      world.light.intensity = 3.2 + pulse * 2.4;

      if (!panelElement) return;
      world.group.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);

      const anchorWorld = world.anchor.getWorldPosition(new THREE.Vector3());
      const projected = anchorWorld.clone().project(camera);
      const panelQuaternion = world.anchor.getWorldQuaternion(new THREE.Quaternion());
      const panelNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(panelQuaternion).normalize();
      const towardCamera = camera.position.clone().sub(anchorWorld).normalize();
      const facesCamera = panelNormal.dot(towardCamera) > -0.08;
      const insideView = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1.12 && Math.abs(projected.y) < 1.16;

      if (!facesCamera || !insideView || rendererBounds.width <= 0 || rendererBounds.height <= 0) {
        panelElement.dataset.worldVisible = "false";
        return;
      }

      const screenX = rendererBounds.left + (projected.x * 0.5 + 0.5) * rendererBounds.width;
      const screenY = rendererBounds.top + (-projected.y * 0.5 + 0.5) * rendererBounds.height;
      const viewPosition = anchorWorld.clone().applyMatrix4(camera.matrixWorldInverse);
      const viewDistance = Math.max(0.1, -viewPosition.z);
      const pixelsPerWorldUnit = rendererBounds.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * viewDistance);
      const projectedPanelWidth = 3.9 * pixelsPerWorldUnit;
      const collapsed = panelElement.dataset.collapsed === "true";
      const basePanelWidth = Math.min(collapsed ? 432 : 720, Math.max(1, window.innerWidth - 16));
      const maxPanelScale = rendererBounds.width <= 680 ? 0.96 : 1.08;
      const panelScale = clamp(projectedPanelWidth / basePanelWidth, 0.48, maxPanelScale);

      panelElement.style.setProperty("--council-world-x", `${screenX}px`);
      panelElement.style.setProperty("--council-world-y", `${screenY}px`);
      panelElement.style.setProperty("--council-world-scale", panelScale.toFixed(4));
      panelElement.dataset.worldVisible = "true";
    };
    const animate = () => {
      const now = performance.now();
      const delta = Math.min((now - lastFrameTime) / 1000, 0.04);
      lastFrameTime = now;
      celestialSpheres.update((now - celestialStartedAt) / 1000);
      if (flyModeRef.current) {
        const keys = flyKeysRef.current;
        const forward = new THREE.Vector3();
        const right = new THREE.Vector3();
        const move = new THREE.Vector3();
        camera.rotation.order = "YXZ";
        camera.rotation.y = flyYawPitchRef.current.yaw;
        camera.rotation.x = flyYawPitchRef.current.pitch;
        camera.getWorldDirection(forward);
        right.crossVectors(forward, camera.up).normalize();
        if (keys.has("KeyW") || keys.has("ArrowUp")) move.add(forward);
        if (keys.has("KeyS") || keys.has("ArrowDown")) move.sub(forward);
        if (keys.has("KeyD") || keys.has("ArrowRight")) move.add(right);
        if (keys.has("KeyA") || keys.has("ArrowLeft")) move.sub(right);
        if (keys.has("KeyE") || keys.has("Space")) move.y += 1;
        if (keys.has("KeyQ") || keys.has("ControlLeft")) move.y -= 1;
        if (move.lengthSq() > 0) {
          const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 34 : 15;
          camera.position.addScaledVector(move.normalize(), speed * delta);
          camera.position.x = clamp(camera.position.x, -ROOM_WIDTH / 2 + 1, ROOM_WIDTH / 2 - 1);
          camera.position.y = clamp(camera.position.y, 0.8, ROOM_HEIGHT - 0.8);
          camera.position.z = clamp(camera.position.z, -ROOM_DEPTH / 2 + 1, ROOM_DEPTH / 2 - 1);
        }
      } else {
        updateControlledAvatar(delta);
        if (!updateThirdPersonCamera(delta)) orbit.update();
      }

      const controlledRuntime = controlledAvatarRef.current;
      remoteAvatarRuntimesRef.current.forEach((runtime) => {
        const distanceSquared = runtime.root.position.distanceToSquared(runtime.targetPosition);
        const moving = runtime.looping && (distanceSquared > 0.015 || runtime.animation !== "idle");
        const positionLerp = 1 - Math.exp(-delta * 10);
        const rotationLerp = 1 - Math.exp(-delta * 12);
        runtime.root.position.lerp(runtime.targetPosition, positionLerp);
        runtime.root.rotation.y = lerpAngle(
          runtime.root.rotation.y,
          runtime.targetYaw + AVATAR_MODEL_FORWARD_OFFSET + getAvatarMotionFacingOffset(runtime.motionId),
          rotationLerp
        );
        if (runtime.action) {
          if (!runtime.looping) {
            if (!runtime.action.paused) runtime.mixer?.update(delta);
          } else if (moving) {
            runtime.action.paused = false;
            runtime.mixer?.update(delta);
          } else if (runtime.wasMoving) {
            runtime.action.reset();
            runtime.action.paused = true;
            runtime.mixer?.update(0);
          } else {
            runtime.action.paused = true;
          }
        }
        const overlapsSeatedCamera = Boolean(
          controlledRuntime?.isSeated
          && runtime.root.position.distanceToSquared(controlledRuntime.root.position) < 6.25
        );
        runtime.root.visible = !overlapsSeatedCamera;
        runtime.wasMoving = moving;
      });

      if (telegram && controlledRuntime && onTelegramPoseRef.current && now - lastTelegramPoseEmitAtRef.current >= TELEGRAM_POSE_SAMPLE_MS) {
        lastTelegramPoseEmitAtRef.current = now;
        onTelegramPoseRef.current({
          position: [
            controlledRuntime.root.position.x,
            controlledRuntime.root.position.y,
            controlledRuntime.root.position.z
          ],
          rotationY: controlledRuntime.yaw,
          animation: controlledRuntime.seating
            ? "walk-to-seat"
            : controlledRuntime.isSeated
              ? "sit-at-table"
              : controlledRuntime.wasMoving
                ? avatarMotionRef.current
                : "idle"
        });
      }

      avatarMixersRef.current.forEach((mixer) => mixer.update(delta));
      updateDlanisPoseRuntime(dlanisPoseRef.current, delta);
      updateCouncilHologramWorld((now - celestialStartedAt) / 1000);
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(animate);
    };
    animate();
    setIsReady(true);

    const isEditableTarget = (target: EventTarget | null) => target instanceof HTMLElement && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable);
    const onKeyDown = (event: KeyboardEvent) => {
      const avatarCodes = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"];
      const flyCodes = ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "Space", "ShiftLeft", "ShiftRight", "ControlLeft", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
      const movementCode = avatarCodes.includes(event.code) || flyCodes.includes(event.code);
      if (!isEditableTarget(event.target) && controlledAvatarRef.current?.isSeated && movementCode) {
        avatarKeysRef.current.clear();
        flyKeysRef.current.clear();
        event.preventDefault();
        return;
      }
      if (!flyModeRef.current && avatarControlEnabledRef.current && !isEditableTarget(event.target) && avatarCodes.includes(event.code)) {
        avatarKeysRef.current.add(event.code);
        event.preventDefault();
        return;
      }
      if (!flyModeRef.current || isEditableTarget(event.target)) return;
      flyKeysRef.current.add(event.code);
      if (flyCodes.includes(event.code)) event.preventDefault();
    };    const onKeyUp = (event: KeyboardEvent) => {
      flyKeysRef.current.delete(event.code);
      avatarKeysRef.current.delete(event.code);
    };
    const onPointerDown = (event: PointerEvent) => {
      renderer.domElement.focus();
      if (event.button === 0) {
        const world = councilHologramWorldRef.current;
        const panelElement = councilHologramPanelRef.current;
        if (world?.group.visible && panelElement) {
          const rect = renderer.domElement.getBoundingClientRect();
          selectionPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          selectionPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          selectionRaycaster.setFromCamera(selectionPointer, camera);
          if (selectionRaycaster.intersectObject(world.crystalHitTarget, false).length > 0) {
            window.dispatchEvent(new Event("council-projector-crystal-toggle"));
            event.preventDefault();
            event.stopPropagation();
            return;
          }
        }
      }
      if (isTransformDragging || event.button !== 2) return;
      const seatedLookActive = Boolean(controlledAvatarRef.current?.isSeated && avatarControlEnabledRef.current);
      if (!flyModeRef.current && !seatedLookActive) return;
      mouseLookActive = true;
      renderer.domElement.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!mouseLookActive) return;
      mouseLookActive = false;
      renderer.domElement.releasePointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!mouseLookActive) return;
      const seatedLookActive = Boolean(controlledAvatarRef.current?.isSeated && avatarControlEnabledRef.current && !flyModeRef.current);
      if (seatedLookActive) {
        seatedLookRef.current.yaw -= event.movementX * 0.0022;
        seatedLookRef.current.pitch = clamp(seatedLookRef.current.pitch - event.movementY * 0.0022, -Math.PI / 2 + 0.12, Math.PI / 2 - 0.12);
        return;
      }
      if (!flyModeRef.current) return;
      flyYawPitchRef.current.yaw -= event.movementX * 0.0022;
      flyYawPitchRef.current.pitch = clamp(flyYawPitchRef.current.pitch - event.movementY * 0.0022, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
    };
    const onDoubleClick = (event: MouseEvent) => {
      if (isTransformDragging || event.button !== 0) return;
      const rect = renderer.domElement.getBoundingClientRect();
      selectionPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      selectionPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      selectionRaycaster.setFromCamera(selectionPointer, camera);
      const roots = Array.from(objectRefs.current.values()).filter((object) => object.visible);
      const hit = selectionRaycaster.intersectObjects(roots, true).find((intersection) => getPlacedIdFromObject(intersection.object));
      const placedId = hit ? getPlacedIdFromObject(hit.object) : null;
      if (!placedId) return;
      selectObject(placedId, event.shiftKey || event.ctrlKey || event.metaKey);
      event.preventDefault();
    };
    const onContextMenu = (event: MouseEvent) => {
      if (flyModeRef.current) event.preventDefault();
    };
    const onResize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("dblclick", onDoubleClick);
    renderer.domElement.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("dblclick", onDoubleClick);
      renderer.domElement.removeEventListener("contextmenu", onContextMenu);
      transform.detach();
      transform.dispose();
      orbit.dispose();
      celestialSpheres.dispose();
      remoteAvatarRuntimesRef.current.clear();
      remoteAvatarLoadingRef.current.clear();
      remoteAvatarLayerRef.current = null;
      councilHologramDisposed = true;
      if (councilHologramWorldRef.current === councilHologramWorld) councilHologramWorldRef.current = null;
      mount.removeChild(renderer.domElement);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
          object.geometry?.dispose?.();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material?.dispose?.());
        }
      });
      floorTexture?.dispose();
      renderer.dispose();
    };
  }, [telegram]);

  useEffect(() => {
    if (!plain || !isReady || !sceneRef.current || !loaderRef.current) return;
    let cancelled = false;
    const scene = sceneRef.current;
    const loader = loaderRef.current;
    const avatarLayer = new THREE.Group();
    avatarLayer.name = "inner-live-initiates";
    scene.add(avatarLayer);
    avatarGroupRef.current = avatarLayer;
    avatarMixersRef.current = [];
    dlanisPoseRef.current = null;
    dlanisRootRef.current = null;
    breathingGuardRootRef.current = null;
    dlanisWeaponGroupsRef.current = new Map();
    controlledAvatarRef.current = null;

    const loadGltf = (url: string) => new Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] } | null>((resolve) => {
      loader.load(
        url,
        (gltf) => resolve({ scene: gltf.scene, animations: gltf.animations ?? [] }),
        undefined,
        (error) => {
          console.error("Failed to load initiate avatar", url, error);
          resolve(null);
        }
      );
    });

    const versionedAvatarUrl = (url: string) => url ? `${url}${url.includes("?") ? "&" : "?"}v=${AVATAR_ASSET_VERSION}` : "";
    const getMotionSource = (avatar: InitiateAvatar, motion: string) => {
      if (motion === "sit-at-table") {
        const preferredSeatedMotion = getAvatarSeatedMotionId(avatar);
        const task = [
          avatar.animationTasks?.[preferredSeatedMotion],
          avatar.animationTasks?.["sit-at-table"],
          avatar.animationTasks?.["walk-to-seat"],
        ].find((candidate) => candidate?.localModel);
        return { url: versionedAvatarUrl(task?.localModel ?? ""), clipName: task?.clipName };
      }
      if (motion === "basic-walking") {
        return {
          url: versionedAvatarUrl(avatar.basicAnimations?.walking ?? `/models/initiates/animations/${avatar.id}-basic-walking.glb`),
          clipName: undefined,
        };
      }
      const explicitTask = avatar.animationTasks?.[motion];
      if (explicitTask?.localModel) {
        return { url: versionedAvatarUrl(explicitTask.localModel), clipName: explicitTask.clipName };
      }
      return {
        url: versionedAvatarUrl(avatar.basicAnimations?.walking ?? avatar.riggedModel ?? avatar.localModel ?? ""),
        clipName: undefined,
      };
    };
    const getAvatarAnimationClip = (animations: THREE.AnimationClip[], clipName?: string) =>
      (clipName ? animations.find((clip) => clip.name === clipName) : null) ?? animations[0] ?? null;
    const placeAvatar = async (avatar: InitiateAvatar, index: number, total: number, controlled: boolean) => {
      const permanentGuardMotion = PERMANENT_GUARD_MOTION_BY_ID[avatar.id];
      const motion = permanentGuardMotion ?? (controlled ? sceneAvatarMotion : "sit-at-table");
      const motionSource = getMotionSource(avatar, motion);
      const url = motionSource.url;
      if (!url) return;
      const gltf = await loadGltf(url);
      if (!gltf || cancelled) return;

      const root = new THREE.Group();
      root.name = permanentGuardMotion ? `permanent-guardian-${avatar.id}` : controlled ? "controlled-initiate-avatar" : `seated-initiate-${avatar.id}`;
      root.userData.avatarId = avatar.id;
      const model = gltf.scene;
      cloneMaterials(model);
      let idleModel: THREE.Object3D | null = null;
      let baseIdleModelPosition: THREE.Vector3 | null = null;
      let seatedModel: THREE.Object3D | null = null;
      let seatedMixer: THREE.AnimationMixer | null = null;
      let seatedAction: THREE.AnimationAction | null = null;
      let baseSeatedModelPosition: THREE.Vector3 | null = null;
      const idleUrl = versionedAvatarUrl(avatar.riggedModel ?? "");
      if (!telegram && controlled && idleUrl && idleUrl !== url) {
        const idleGltf = await loadGltf(idleUrl);
        if (idleGltf && !cancelled) {
          idleModel = idleGltf.scene;
          cloneMaterials(idleModel);
          normalizeAvatarObject(idleModel, AVATAR_TARGET_HEIGHT);
          idleModel.visible = true;
          model.visible = false;
          baseIdleModelPosition = idleModel.position.clone();
          root.add(idleModel);
        }
      }

      normalizeAvatarObject(model, AVATAR_TARGET_HEIGHT);
      if (avatar.id === DLANIS_AVATAR_ID) {
        stabilizeDlanisRendering(model);
        const weaponGroups = createDlanisWeaponAdjustmentGroups(model);
        dlanisWeaponGroupsRef.current = weaponGroups;
        applyDlanisWeaponAdjustments(weaponGroups, dlanisWeaponAdjustmentsRef.current);
      }
      root.add(model);

      if (controlled) {
        const marker = new THREE.Mesh(
          new THREE.RingGeometry(2.25, 2.72, 96),
          new THREE.MeshBasicMaterial({ color: 0xf0d99c, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false })
        );
        marker.name = "controlled-avatar-marker";
        marker.rotation.x = -Math.PI / 2;
        marker.position.y = 0.09;
        root.add(marker);

        const markerLight = new THREE.PointLight(0xf0d99c, 12, 8, 1.8);
        markerLight.name = "controlled-avatar-marker-light";
        markerLight.position.set(0, 2.8, 0);
        root.add(markerLight);
      }

      const seatIndex = clamp(Math.trunc(avatarSeatMapRef.current[avatar.id] ?? index), 0, AVATAR_SEAT_COUNT - 1);
      const seatPose = getSeatPoseForAvatar(avatar, seatIndex);
      const forceSeatOnLoad = controlled && avatar.id !== DLANIS_AVATAR_ID && seatAllAvatarsOnNextLoadRef.current;
      const restoredPose = controlled && !forceSeatOnLoad ? controlledAvatarPoseRef.current[avatar.id] ?? null : null;
      const facingOffset = getAvatarMotionFacingOffset(motion);
      const modelFacingOffset = AVATAR_MODEL_FORWARD_OFFSET + facingOffset;
      if (restoredPose) {
        root.position.copy(restoredPose.position);
        root.rotation.y = restoredPose.yaw + modelFacingOffset;
      } else if (telegram && controlled) {
        root.position.set(AVATAR_TABLE_CENTER.x + 7, 0, AVATAR_TABLE_CENTER.z + 15);
        root.rotation.y = seatPose.targetYaw + modelFacingOffset;
      } else {
        root.position.copy(seatPose.targetPosition);
        root.rotation.y = seatPose.targetYaw + modelFacingOffset;
      }
      const permanentGuardPlacement = PERMANENT_GUARD_PLACEMENT_BY_ID[avatar.id];
      if (permanentGuardPlacement) {
        root.position.fromArray(permanentGuardPlacement.position);
        root.rotation.set(0, permanentGuardPlacement.yaw, 0);
      }
      if (avatar.id === BREATHING_GUARD_AVATAR_ID) {
        breathingGuardRootRef.current = root;
        const savedPlacement = breathingGuardPlacementRef.current;
        if (savedPlacement) {
          root.position.fromArray(savedPlacement.position);
          root.rotation.set(
            THREE.MathUtils.degToRad(savedPlacement.rotation[0]),
            THREE.MathUtils.degToRad(savedPlacement.rotation[1]),
            THREE.MathUtils.degToRad(savedPlacement.rotation[2])
          );
          root.scale.fromArray(savedPlacement.scale);
        }
        if (dlanisTransformTargetRef.current === "breathing-guard") {
          transformRef.current?.setSpace("world");
          transformRef.current?.attach(root);
        }
      }
      if (avatar.id === DLANIS_AVATAR_ID) {
        dlanisRootRef.current = root;
        const placement = dlanisPlacementRef.current;
        if (placement) {
          root.position.fromArray(placement.position);
          root.rotation.set(
            THREE.MathUtils.degToRad(placement.rotation[0]),
            THREE.MathUtils.degToRad(placement.rotation[1]),
            THREE.MathUtils.degToRad(placement.rotation[2])
          );
          root.scale.fromArray(placement.scale);
        }
        const editTarget = dlanisTransformTargetRef.current;
        if (editTarget) {
          const editObject = editTarget === "avatar" ? root : editTarget === "breathing-guard" ? breathingGuardRootRef.current : dlanisWeaponGroupsRef.current.get(editTarget) ?? null;
          if (editObject) {
            transformRef.current?.setSpace(editTarget === "avatar" || editTarget === "breathing-guard" ? "world" : "local");
            transformRef.current?.attach(editObject);
          }
        }
      }
      avatarLayer.add(root);

      const motionClips = avatar.id === DLANIS_AVATAR_ID
        ? new Map(
            Object.entries(avatar.animationTasks ?? {}).flatMap(([motionId, task]) => {
              if (!task.clipName) return [];
              const clip = gltf.animations.find((candidate) => candidate.name === task.clipName);
              return clip ? [[motionId, prepareDlanisAnimationClip(clip, motionId)] as const] : [];
            })
          )
        : undefined;
      const sourceClip = getAvatarAnimationClip(gltf.animations, motionSource.clipName);
      const animationClip = motionClips?.get(motion) ?? (sourceClip ? sanitizeAvatarAnimationClip(sourceClip, motion, model) : null);
      const mixer = animationClip ? new THREE.AnimationMixer(model) : null;
      const action = mixer && animationClip ? mixer.clipAction(animationClip) : null;
      if (action) {
        if (avatar.id === BREATHING_GUARD_AVATAR_ID && mixer) {
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.clampWhenFinished = false;
          action.play();
          avatarMixersRef.current.push(mixer);
        } else if (avatar.id === DLANIS_AVATAR_ID && mixer) {
          dlanisPoseRef.current = createDlanisPoseRuntime(mixer, action);
          if (controlled) {
            controlledAvatarRef.current = { root, model, idleModel, seatedModel, mixer, action, motionClips, activeMotion: motion, seatedMixer, seatedAction, baseModelPosition: model.position.clone(), baseIdleModelPosition, baseSeatedModelPosition, yaw: root.rotation.y - modelFacingOffset, wasMoving: false, isSeated: false, seating: null };
          }
        } else if (controlled) {
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.play();
          action.paused = true;
          controlledAvatarRef.current = { root, model, idleModel, seatedModel, mixer, action, motionClips, activeMotion: motion, seatedMixer, seatedAction, baseModelPosition: model.position.clone(), baseIdleModelPosition, baseSeatedModelPosition, yaw: root.rotation.y - modelFacingOffset, wasMoving: false, isSeated: false, seating: null };
        } else {
          holdActionAtEnd(mixer, action);
        }
      } else if (controlled) {
          controlledAvatarRef.current = { root, model, idleModel, seatedModel, mixer, action, motionClips, activeMotion: motion, seatedMixer, seatedAction, baseModelPosition: model.position.clone(), baseIdleModelPosition, baseSeatedModelPosition, yaw: root.rotation.y - modelFacingOffset, wasMoving: false, isSeated: false, seating: null };
      }
      if (avatar.id === DLANIS_AVATAR_ID) applyDlanisWeaponVisibility(model, motion);
      if (controlled && controlledAvatarRef.current) {
        const runtime = controlledAvatarRef.current;
        if (forceSeatOnLoad) {
          setControlledRuntimeSeated(runtime, seatPose.targetPosition, seatPose.targetYaw, modelFacingOffset);
          controlledAvatarPoseRef.current[avatar.id] = { position: seatPose.targetPosition.clone(), yaw: seatPose.targetYaw };
        }
        const seatedSource = getMotionSource(avatar, "sit-at-table");
        const seatedUrl = seatedSource.url;
        if (!telegram && seatedUrl) {
          void loadGltf(seatedUrl).then((seatedGltf) => {
            if (!seatedGltf || cancelled || controlledAvatarRef.current !== runtime) return;
            const nextSeatedModel = seatedGltf.scene;
            cloneMaterials(nextSeatedModel);
            normalizeAvatarObject(nextSeatedModel, AVATAR_TARGET_HEIGHT);
            nextSeatedModel.visible = false;
            runtime.baseSeatedModelPosition = nextSeatedModel.position.clone();
            runtime.root.add(nextSeatedModel);
            runtime.seatedModel = nextSeatedModel;
            const seatedSourceClip = getAvatarAnimationClip(seatedGltf.animations, seatedSource.clipName);
            const seatedClip = seatedSourceClip ? sanitizeAvatarAnimationClip(seatedSourceClip, "sit-at-table") : null;
            runtime.seatedMixer = seatedClip ? new THREE.AnimationMixer(nextSeatedModel) : null;
            runtime.seatedAction = runtime.seatedMixer && seatedClip ? runtime.seatedMixer.clipAction(seatedClip) : null;
            holdActionAtEnd(runtime.seatedMixer, runtime.seatedAction);
            if (runtime.isSeated) {
              setControlledRuntimeSeated(runtime, runtime.root.position.clone(), runtime.yaw);
            }
          });
        }
        const command = pendingSeatCommandRef.current;
        if (command?.avatarId === avatar.id && motion === "walk-to-seat") {
          beginSeatAnimation(runtime, command.targetPosition, command.targetYaw);
          pendingSeatCommandRef.current = null;
        }
      }    };

    const loadInitiates = async () => {
      try {
        const response = await fetch(assetUrl("/models/initiates/manifest.json"), { cache: "no-store" });
        const manifest = (await response.json()) as InitiateManifest;
        if (cancelled) return;
        const activeAvatars = (manifest.avatars ?? []).filter((avatar) => ACTIVE_AVATAR_IDS.has(avatar.id));
        if (telegram) {
          telegramAvatarCatalogRef.current = new Map(activeAvatars.map((avatar) => [avatar.id, avatar]));
          setTelegramAvatarCatalogRevision((revision) => revision + 1);
        }
        const allAvatars = telegram
          ? activeAvatars.filter((avatar) => avatar.id === controlledAvatarId).slice(0, 1)
          : activeAvatars;
        setInitiateAvatars(allAvatars);
        const controllableAvatars = allAvatars.filter((avatar) => !NON_CONTROLLABLE_AVATAR_IDS.has(avatar.id));
        const controlled = controllableAvatars.find((avatar) => avatar.id === controlledAvatarId) ?? controllableAvatars.find((avatar) => avatar.id === DEFAULT_CONTROLLED_AVATAR_ID) ?? controllableAvatars[0];
        if (controlled && controlled.id !== controlledAvatarId) setControlledAvatarId(controlled.id);
        const ordered = controlled ? [controlled, ...allAvatars.filter((avatar) => avatar.id !== controlled.id)] : allAvatars;
        for (const [index, avatar] of ordered.entries()) {
          await placeAvatar(avatar, index, ordered.length, index === 0);
        }
        seatAllAvatarsOnNextLoadRef.current = false;
        if (!cancelled && ordered.length > 0) {
          setMessage(`Аватары в комнате: ${ordered.length}. Управление: WASD/стрелки, Shift - быстрее.`);
        }
      } catch (error) {
        console.error("Failed to load initiate manifest", error);
        if (!cancelled) setMessage("Не удалось загрузить аватаров посвященных");
      }
    };

    void loadInitiates();
    return () => {
      cancelled = true;
      if (controlledAvatarRef.current) {
        const runtime = controlledAvatarRef.current;
        const avatarId = runtime.root.userData.avatarId;
        if (typeof avatarId === "string") {
          controlledAvatarPoseRef.current[avatarId] = { position: runtime.root.position.clone(), yaw: runtime.yaw };
          if (avatarId === DLANIS_AVATAR_ID && !runtime.isSeated) {
            dlanisPlacementRef.current = {
              position: [runtime.root.position.x, runtime.root.position.y, runtime.root.position.z],
              rotation: [
                THREE.MathUtils.radToDeg(runtime.root.rotation.x),
                THREE.MathUtils.radToDeg(runtime.root.rotation.y),
                THREE.MathUtils.radToDeg(runtime.root.rotation.z),
              ],
              scale: [runtime.root.scale.x, runtime.root.scale.y, runtime.root.scale.z],
            };
          }
        }
      }
      controlledAvatarRef.current = null;
      avatarMixersRef.current = [];
      dlanisPoseRef.current = null;
      dlanisRootRef.current = null;
    breathingGuardRootRef.current = null;
      dlanisWeaponGroupsRef.current = new Map();
      avatarKeysRef.current.clear();
      scene.remove(avatarLayer);
      disposeObjectTree(avatarLayer);
      if (avatarGroupRef.current === avatarLayer) avatarGroupRef.current = null;
    };
  }, [sceneAvatarMotion, controlledAvatarId, isReady, plain, telegram, templateRevision]);

  useEffect(() => {
    if (!plain || !telegram || !isReady || !loaderRef.current || !remoteAvatarLayerRef.current) return;

    const loader = loaderRef.current;
    const layer = remoteAvatarLayerRef.current;
    const ownParticipantId = telegramParticipantIdRef.current;
    const desiredParticipants = telegramParticipants.filter((participant) => participant.participantId !== ownParticipantId);
    const desiredIds = new Set(desiredParticipants.map((participant) => participant.participantId));

    remoteAvatarRuntimesRef.current.forEach((runtime, participantId) => {
      if (desiredIds.has(participantId)) return;
      layer.remove(runtime.root);
      disposeObjectTree(runtime.root);
      remoteAvatarRuntimesRef.current.delete(participantId);
    });

    const getTargetPosition = (participant: TelegramPresenceParticipant, index: number) => {
      const [x, y, z] = participant.position.map(Number);
      const hasStoredPosition = [x, y, z].every(Number.isFinite) && Math.abs(x) + Math.abs(y) + Math.abs(z) > 0.01;
      if (hasStoredPosition) {
        return new THREE.Vector3(
          clamp(x, -ROOM_WIDTH / 2 + 2, ROOM_WIDTH / 2 - 2),
          clamp(y, 0, ROOM_HEIGHT - 1),
          clamp(z, -ROOM_DEPTH / 2 + 2, ROOM_DEPTH / 2 - 2)
        );
      }
      let hash = 0;
      for (const character of participant.participantId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
      const angle = ((hash % 360) * Math.PI) / 180 + index * 0.47;
      const radius = 21 + (hash % 4);
      return new THREE.Vector3(
        AVATAR_TABLE_CENTER.x + Math.sin(angle) * radius,
        0,
        AVATAR_TABLE_CENTER.z + Math.cos(angle) * radius
      );
    };

    const getRemoteMotionId = (avatar: InitiateAvatar, animation: string) => {
      if (animation === "sit-at-table" || animation.includes("sit")) return "sit-at-table";
      if (animation === "walk-to-seat") return getDefaultAvatarMotion(avatar);
      if (avatar.animationTasks?.[animation]?.localModel) return animation;
      return getDefaultAvatarMotion(avatar);
    };

    const getRemoteMotionSource = (avatar: InitiateAvatar, motionId: string) => {
      if (motionId === "sit-at-table") {
        const preferredSeatedMotion = getAvatarSeatedMotionId(avatar);
        const task = [
          avatar.animationTasks?.[preferredSeatedMotion],
          avatar.animationTasks?.["sit-at-table"],
          avatar.animationTasks?.["walk-to-seat"],
        ].find((candidate) => candidate?.localModel);
        return { url: task?.localModel ?? "", clipName: task?.clipName };
      }
      const task = avatar.animationTasks?.[motionId];
      return {
        url: task?.localModel
          ?? avatar.basicAnimations?.walking
          ?? avatar.riggedModel
          ?? avatar.localModel
          ?? "",
        clipName: task?.clipName,
      };
    };

    desiredParticipants.forEach((participant, index) => {
      const avatar = telegramAvatarCatalogRef.current.get(participant.avatarId);
      if (!avatar) return;
      const animation = participant.animation || "idle";
      const motionId = getRemoteMotionId(avatar, animation);
      const targetPosition = getTargetPosition(participant, index);
      const targetYaw = Number.isFinite(Number(participant.rotationY)) ? Number(participant.rotationY) : 0;
      const existing = remoteAvatarRuntimesRef.current.get(participant.participantId);
      if (existing && existing.avatarId === participant.avatarId && existing.motionId === motionId) {
        existing.targetPosition.copy(targetPosition);
        existing.targetYaw = targetYaw;
        existing.animation = animation;
        return;
      }
      if (existing) {
        layer.remove(existing.root);
        disposeObjectTree(existing.root);
        remoteAvatarRuntimesRef.current.delete(participant.participantId);
      }
      if (remoteAvatarLoadingRef.current.has(participant.participantId)) return;

      const source = getRemoteMotionSource(avatar, motionId);
      if (!source.url) return;

      remoteAvatarLoadingRef.current.add(participant.participantId);
      const versionedUrl = source.url + (source.url.includes("?") ? "&" : "?") + "v=" + AVATAR_ASSET_VERSION;
      loader.load(
        versionedUrl,
        (gltf) => {
          remoteAvatarLoadingRef.current.delete(participant.participantId);
          const currentParticipant = telegramParticipantsRef.current.find((item) => item.participantId === participant.participantId);
          if (!currentParticipant || currentParticipant.participantId === telegramParticipantIdRef.current || remoteAvatarLayerRef.current !== layer) {
            disposeObjectTree(gltf.scene);
            return;
          }

          const currentAvatar = telegramAvatarCatalogRef.current.get(currentParticipant.avatarId);
          if (!currentAvatar) {
            disposeObjectTree(gltf.scene);
            return;
          }
          const currentAnimation = currentParticipant.animation || "idle";
          const currentMotionId = getRemoteMotionId(currentAvatar, currentAnimation);
          if (currentMotionId !== motionId || currentAvatar.id !== avatar.id) {
            disposeObjectTree(gltf.scene);
            return;
          }

          const model = gltf.scene;
          cloneMaterials(model);
          normalizeAvatarObject(model, AVATAR_TARGET_HEIGHT);
          const root = new THREE.Group();
          root.name = "remote-participant-" + participant.participantId;
          root.userData.participantId = participant.participantId;
          root.userData.nickname = participant.nickname;
          root.userData.avatarId = participant.avatarId;
          root.position.copy(getTargetPosition(currentParticipant, index));
          root.rotation.y = (Number(currentParticipant.rotationY) || 0)
            + AVATAR_MODEL_FORWARD_OFFSET
            + getAvatarMotionFacingOffset(motionId);
          root.add(model);

          const sourceClip = (source.clipName
            ? gltf.animations.find((clip) => clip.name === source.clipName)
            : null) ?? gltf.animations[0] ?? null;
          const animationClip = sourceClip ? sanitizeAvatarAnimationClip(sourceClip, motionId, model) : null;
          const mixer = animationClip ? new THREE.AnimationMixer(model) : null;
          const action = mixer && animationClip ? mixer.clipAction(animationClip) : null;
          const looping = motionId !== "sit-at-table" && AVATAR_LOCOMOTION_MOTION_IDS.has(motionId);
          if (action) {
            if (looping) {
              action.setLoop(THREE.LoopRepeat, Infinity);
              action.play();
              action.paused = currentAnimation === "idle";
            } else {
              holdActionAtEnd(mixer, action);
            }
          }

          const runtime: RemoteAvatarRuntime = {
            participantId: participant.participantId,
            avatarId: participant.avatarId,
            motionId,
            looping,
            root,
            mixer,
            action,
            targetPosition: getTargetPosition(currentParticipant, index),
            targetYaw: Number(currentParticipant.rotationY) || 0,
            animation: currentAnimation,
            wasMoving: false
          };
          layer.add(root);
          remoteAvatarRuntimesRef.current.set(participant.participantId, runtime);
        },
        undefined,
        (error) => {
          remoteAvatarLoadingRef.current.delete(participant.participantId);
          console.error("Failed to load remote Telegram avatar", participant.avatarId, error);
        }
      );
    });
  }, [isReady, plain, telegram, telegramAvatarCatalogRevision, telegramParticipantId, telegramParticipants]);

  useEffect(() => {
    if (controlledAvatarId !== DLANIS_AVATAR_ID) return;
    const runtime = controlledAvatarRef.current;
    const clip = runtime?.motionClips?.get(avatarMotion);
    if (!runtime || !runtime.mixer || !clip || runtime.activeMotion === avatarMotion) return;
    runtime.action?.stop();
    const nextAction = runtime.mixer.clipAction(clip);
    dlanisPoseRef.current = createDlanisPoseRuntime(runtime.mixer, nextAction);
    runtime.action = nextAction;
    runtime.activeMotion = avatarMotion;
    runtime.wasMoving = false;
    runtime.model.visible = true;
    if (runtime.idleModel) runtime.idleModel.visible = false;
    applyDlanisWeaponVisibility(runtime.model, avatarMotion);
  }, [avatarMotion, controlledAvatarId]);

  useEffect(() => {
    let cancelled = false;
    const loadManifest = async () => {
      try {
        const response = await fetch(assetUrl("/models/meshy/manifest.json"), { cache: "no-store" });
        const manifest = (await response.json()) as MeshyManifest;
        if (cancelled) return;
        const nextAssets = (manifest.assets ?? [])
          .filter((asset) => asset.localModel && (!telegram || isTelegramSceneAsset(asset.slug)))
          .sort((a, b) => a.slug.localeCompare(b.slug, "en", { numeric: true }));
        assetsRef.current = nextAssets;
        setAssets(nextAssets);
        setMessage(`В библиотеке ${nextAssets.length} деталей`);
      } catch (error) {
        console.error("Failed to load Meshy constructor manifest", error);
        setMessage("Не удалось загрузить manifest деталей");
      }
    };
    void loadManifest();
    return () => {
      cancelled = true;
    };
  }, [telegram]);

  const selected = useMemo(() => placed.find((item) => item.id === selectedId) ?? null, [placed, selectedId]);
  const selectedItems = useMemo(() => placed.filter((item) => selectedIds.includes(item.id)), [placed, selectedIds]);
  const seatEditorAvatar = useMemo(() => initiateAvatars.find((avatar) => avatar.id === seatEditorAvatarId) ?? initiateAvatars[0] ?? null, [initiateAvatars, seatEditorAvatarId]);
  const seatEditorAdjustment = seatEditorAvatar ? getAvatarSeatAdjustment(seatEditorAvatar.id, avatarSeatAdjustments) : DEFAULT_AVATAR_SEAT_ADJUSTMENT;

  const selectObject = (id: string, additive = false) => {
    if (telegram) return;
    dlanisTransformTargetRef.current = null;
    setDlanisTransformTarget(null);
    if (!additive) {
      setSelectedId(id);
      setSelectedIds([id]);
      return;
    }
    setSelectedIds((current) => {
      const exists = current.includes(id);
      const next = exists ? current.filter((itemId) => itemId !== id) : [...current, id];
      setSelectedId(next.at(-1) ?? null);
      return next;
    });
  };

  const selectAllObjects = () => {
    const ids = placedRef.current.map((item) => item.id);
    setSelectedIds(ids);
    setSelectedId(ids.at(-1) ?? null);
    setMessage(`\u0412\u044b\u0434\u0435\u043b\u0435\u043d\u043e: ${ids.length} \u043e\u0431\u044a\u0435\u043a\u0442\u043e\u0432`);
  };

  const clearSelection = () => {
    setSelectedId(null);
    setSelectedIds([]);
    dlanisTransformTargetRef.current = null;
    setDlanisTransformTarget(null);
    transformRef.current?.detach();
  };

  useEffect(() => {
    if (!selected) return;
    setSnapSurface(selected.surfaceLocked !== false);
  }, [selected?.id, selected?.surfaceLocked]);
  const categories = useMemo(() => ["Все", ...Array.from(new Set(assets.map((asset) => categorizeAsset(asset.slug))))], [assets]);
  const filteredAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return assets.filter((asset) => {
      const label = formatLabel(asset.slug).toLowerCase();
      const matchesQuery = !normalizedQuery || asset.slug.toLowerCase().includes(normalizedQuery) || label.includes(normalizedQuery);
      const matchesCategory = category === "Все" || categorizeAsset(asset.slug) === category;
      return matchesQuery && matchesCategory;
    });
  }, [assets, category, query]);

  const loadSource = async (asset: MeshyAsset) => {
    const cached = sourceCacheRef.current.get(asset.slug);
    if (cached) return cached;
    if (!asset.localModel || !loaderRef.current) return null;

    const object = await new Promise<THREE.Object3D | null>((resolve) => {
      loaderRef.current?.load(
        asset.localModel ?? "",
        (gltf) => {
          const source = gltf.scene;
          cloneMaterials(source);
          normalizeObject(source);
          resolve(source);
        },
        undefined,
        (error) => {
          console.error(`Failed to load ${asset.slug}`, error);
          resolve(null);
        }
      );
    });

    if (object) sourceCacheRef.current.set(asset.slug, object);
    return object;
  };

  const addAsset = async (asset: MeshyAsset) => {
    const scene = sceneRef.current;
    if (!scene) return;
    setLoadingSlug(asset.slug);
    setMessage(`Загружаю ${formatLabel(asset.slug)}`);

    const source = await loadSource(asset);
    setLoadingSlug(null);
    if (!source) {
      setMessage("Модель не загрузилась");
      return;
    }

    const id = `${asset.slug}-${Date.now()}`;
    const instance = source.clone(true);
    cloneMaterials(instance);
    const holder = new THREE.Group();
    holder.name = `placed-${id}`;
    holder.userData.slug = asset.slug;
    holder.userData.placedId = id;
    holder.userData.surfaceId = activeSurface;
    const spawnPosition = getSurfaceSpawnPosition(activeSurface, placedRef.current.length);
    const spawnRotation = SURFACE_BY_ID.get(activeSurface)?.defaultRotation ?? [0, 0, 0];
    holder.position.set(spawnPosition[0], spawnPosition[1], spawnPosition[2]);
    holder.rotation.set(THREE.MathUtils.degToRad(spawnRotation[0]), THREE.MathUtils.degToRad(spawnRotation[1]), THREE.MathUtils.degToRad(spawnRotation[2]));
    const initialScale = inferInitialScale(asset.slug);
    holder.scale.setScalar(initialScale);
    holder.add(instance);
    applyOpacity(holder, 1);
    scene.add(holder);
    objectRefs.current.set(id, holder);

    const nextPlaced: PlacedAsset = {
      id,
      slug: asset.slug,
      label: formatLabel(asset.slug),
      position: [round(holder.position.x), round(holder.position.y), round(holder.position.z)],
      rotation: [round(THREE.MathUtils.radToDeg(holder.rotation.x)), round(THREE.MathUtils.radToDeg(holder.rotation.y)), round(THREE.MathUtils.radToDeg(holder.rotation.z))],
      scale: [initialScale, initialScale, initialScale],
      opacity: 1,
      visible: true,
      surface: activeSurface,
      surfaceLocked: snapSurfaceRef.current
    };

    setPlaced((current) => [...current, nextPlaced]);
    setSelectedId(id);
    setSelectedIds([id]);
    setMessage(`\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u043e: ${nextPlaced.label}`);
  };

  const applyPatchToSelected = (patch: Partial<PlacedAsset>) => {
    if (!selectedId) return;
    setPlaced((current) =>
      current.map((item) => {
        if (item.id !== selectedId) return item;
        const next = { ...item, ...patch };
        const object = objectRefs.current.get(item.id);
        if (object) {
          object.position.set(next.position[0], next.position[1], next.position[2]);
          if (snapSurfaceRef.current && next.surfaceLocked !== false) clampObjectToSurface(object, next.surface);
          object.rotation.set(THREE.MathUtils.degToRad(next.rotation[0]), THREE.MathUtils.degToRad(next.rotation[1]), THREE.MathUtils.degToRad(next.rotation[2]));
          object.scale.set(next.scale[0], next.scale[1], next.scale[2]);
          object.visible = next.visible;
          applyOpacity(object, next.opacity);
        }
        return next;
      })
    );
  };

  const removeSelected = () => {
    const ids = selectedIdsRef.current.length > 0 ? selectedIdsRef.current : selectedId ? [selectedId] : [];
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    transformRef.current?.detach();
    ids.forEach((id) => {
      const object = objectRefs.current.get(id);
      if (object) sceneRef.current?.remove(object);
      objectRefs.current.delete(id);
    });
    setPlaced((current) => {
      const next = current.filter((item) => !idSet.has(item.id));
      const nextId = next.at(-1)?.id ?? null;
      setSelectedId(nextId);
      setSelectedIds(nextId ? [nextId] : []);
      return next;
    });
    setMessage(`\u0423\u0434\u0430\u043b\u0435\u043d\u043e: ${ids.length} \u043e\u0431\u044a\u0435\u043a\u0442\u043e\u0432`);
  };

  const mirrorSelectedHorizontal = () => {
    if (!selectedId) return;
    const item = placedRef.current.find((placedItem) => placedItem.id === selectedId);
    if (!item) return;
    applyPatchToSelected({ scale: [-item.scale[0], item.scale[1], item.scale[2]] });
    setMessage(`Отражено по горизонтали: ${item.label}`);
  };

  const copySelected = () => {
    const ids = selectedIdsRef.current.length > 0 ? selectedIdsRef.current : selectedId ? [selectedId] : [];
    if (ids.length === 0) return;
    const copied = ids
      .map((id) => {
        const object = objectRefs.current.get(id);
        const item = placedRef.current.find((placedItem) => placedItem.id === id);
        return item ? object ? snapshotObject(item, object) : item : null;
      })
      .filter((item): item is PlacedAsset => Boolean(item));
    setCopiedItems(copied);
    setMessage(`\u0421\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d\u043e: ${copied.length} \u043e\u0431\u044a\u0435\u043a\u0442\u043e\u0432`);
  };

  const pasteCopied = async () => {
    const scene = sceneRef.current;
    if (copiedItems.length === 0 || !scene) return;
    const created: PlacedAsset[] = [];

    for (const [index, copied] of copiedItems.entries()) {
      const asset = assets.find((candidate) => candidate.slug === copied.slug);
      if (!asset) continue;
      const source = await loadSource(asset);
      if (!source) continue;

      const id = `${copied.slug}-copy-${Date.now()}-${index}`;
      const instance = source.clone(true);
      cloneMaterials(instance);
      const holder = new THREE.Group();
      holder.name = `placed-${id}`;
      holder.userData.slug = copied.slug;
      holder.userData.placedId = id;
      holder.userData.surfaceId = copied.surface;
      holder.userData.surfaceLocked = copied.surfaceLocked;
      const position: Vec3 = [
        clamp(copied.position[0] + 2.4, -ROOM_WIDTH / 2 + 1, ROOM_WIDTH / 2 - 1),
        copied.position[1],
        clamp(copied.position[2] + 2.4, -ROOM_DEPTH / 2 + 1, ROOM_DEPTH / 2 - 1)
      ];
      holder.position.set(position[0], position[1], position[2]);
      if (snapSurfaceRef.current && copied.surfaceLocked !== false) clampObjectToSurface(holder, copied.surface);
      holder.rotation.set(THREE.MathUtils.degToRad(copied.rotation[0]), THREE.MathUtils.degToRad(copied.rotation[1]), THREE.MathUtils.degToRad(copied.rotation[2]));
      holder.scale.set(copied.scale[0], copied.scale[1], copied.scale[2]);
      holder.visible = copied.visible;
      holder.add(instance);
      applyOpacity(holder, copied.opacity);
      scene.add(holder);
      objectRefs.current.set(id, holder);

      created.push(snapshotObject({ ...copied, id, label: `${copied.label} \u043a\u043e\u043f\u0438\u044f`, position, surface: copied.surface, surfaceLocked: copied.surfaceLocked }, holder));
    }

    if (created.length === 0) {
      setMessage("\u041c\u043e\u0434\u0435\u043b\u0438 \u0434\u043b\u044f \u0432\u0441\u0442\u0430\u0432\u043a\u0438 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u044b");
      return;
    }

    const createdIds = created.map((item) => item.id);
    setPlaced((current) => [...current, ...created]);
    setSelectedIds(createdIds);
    setSelectedId(createdIds.at(-1) ?? null);
    setMessage(`\u0412\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u043e: ${created.length} \u043e\u0431\u044a\u0435\u043a\u0442\u043e\u0432`);
  };


  const clearScene = () => {
    transformRef.current?.detach();
    objectRefs.current.forEach((object) => sceneRef.current?.remove(object));
    objectRefs.current.clear();
    setPlaced([]);
    setSelectedId(null);
    setSelectedIds([]);
  };

  const restoreSceneItems = async (items: PlacedAsset[], sourceLabel: string) => {
    clearScene();
    setMessage(`Загружаю ${sourceLabel}: ${items.length} объектов`);
    const assetsBySlug = new Map(assetsRef.current.map((asset) => [asset.slug, asset]));
    const scene = sceneRef.current;
    if (!scene) return;

    const uniqueAssets = Array.from(new Map(
      items
        .map((item) => assetsBySlug.get(item.slug))
        .filter((asset): asset is MeshyAsset => Boolean(asset))
        .map((asset) => [asset.slug, asset])
    ).values());
    await Promise.all(uniqueAssets.map((asset) => loadSource(asset)));

    const restored: PlacedAsset[] = [];
    for (const rawItem of items) {
      const asset = assetsBySlug.get(rawItem.slug);
      if (!asset) continue;
      const source = await loadSource(asset);
      if (!source) continue;
      const surface = (rawItem.surface ?? "floor") as SurfaceId;
      const fallbackScale = inferInitialScale(rawItem.slug);
      const item: PlacedAsset = {
        ...rawItem,
        id: rawItem.id || `${rawItem.slug}-${Date.now()}-${restored.length}`,
        label: formatLabel(rawItem.slug),
        position: rawItem.position ?? getSurfaceSpawnPosition(surface, restored.length),
        rotation: rawItem.rotation ?? SURFACE_BY_ID.get(surface)?.defaultRotation ?? [0, 0, 0],
        scale: rawItem.scale ?? [fallbackScale, fallbackScale, fallbackScale],
        opacity: rawItem.opacity ?? 1,
        visible: rawItem.visible ?? true,
        surface,
        surfaceLocked: rawItem.surfaceLocked ?? true
      };
      const instance = source.clone(true);
      cloneMaterials(instance);
      const holder = new THREE.Group();
      holder.name = `placed-${item.id}`;
      holder.userData.slug = item.slug;
      holder.userData.placedId = item.id;
      holder.userData.surfaceId = surface;
      holder.userData.surfaceLocked = item.surfaceLocked;
      holder.position.set(item.position[0], item.position[1], item.position[2]);
      if (item.surfaceLocked !== false) clampObjectToSurface(holder, surface);
      holder.rotation.set(THREE.MathUtils.degToRad(item.rotation[0]), THREE.MathUtils.degToRad(item.rotation[1]), THREE.MathUtils.degToRad(item.rotation[2]));
      holder.scale.set(item.scale[0], item.scale[1], item.scale[2]);
      holder.visible = item.visible;
      holder.add(instance);
      applyOpacity(holder, item.opacity);
      scene.add(holder);
      objectRefs.current.set(item.id, holder);
      restored.push(snapshotObject(item, holder));
    }

    setPlaced(restored);
    const restoredSelectionId = telegram ? null : restored.at(-1)?.id ?? null;
    setSelectedId(restoredSelectionId);
    setSelectedIds(restoredSelectionId ? [restoredSelectionId] : []);
    setMessage(`${sourceLabel} \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043d: ${restored.length} \u043e\u0431\u044a\u0435\u043a\u0442\u043e\u0432`);
  };

  const collectPlacedSnapshot = () => {
    const next = placedRef.current.map((item) => {
      const object = objectRefs.current.get(item.id);
      const base = !snapSurfaceRef.current && item.id === selectedIdRef.current ? { ...item, surfaceLocked: false } : item;
      return object ? snapshotObject(base, object) : base;
    });
    placedRef.current = next;
    setPlaced(next);
    return next;
  };

  const saveScene = () => {
    const snapshot = collectPlacedSnapshot();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    window.localStorage.setItem(AVATAR_SEAT_STORAGE_KEY, JSON.stringify(avatarSeatMapRef.current));
    window.localStorage.setItem(AVATAR_SEAT_ADJUSTMENTS_STORAGE_KEY, JSON.stringify(avatarSeatAdjustmentsRef.current));
    window.localStorage.setItem(AVATAR_SEAT_TUNING_STORAGE_KEY, JSON.stringify(seatTuningRef.current));
    setMessage(`Сцена сохранена в браузере: ${snapshot.length} объектов`);
    return snapshot;
  };
  const loadScene = async () => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setMessage("Сохранённой сцены в браузере пока нет");
      return;
    }

    try {
      await restoreSceneItems(JSON.parse(raw) as PlacedAsset[], "локальную сцену");
    } catch {
      setMessage("Сохранённая сцена повреждена");
    }
  };

  const saveProjectTemplate = async () => {
    const snapshot = saveScene();
    try {
      const payload: ConstructorTemplatePayload = {
        items: snapshot,
        avatarSeatMap: avatarSeatMapRef.current,
        avatarSeatAdjustments: avatarSeatAdjustmentsRef.current,
        seatTuning: seatTuningRef.current,
        controlledAvatarId,
      };
      const response = await fetch(TEMPLATE_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`template save failed: ${response.status}`);
      const result = (await response.json()) as { count?: number };
      setMessage(`Шаблон проекта сохранён: ${result.count ?? snapshot.length} объектов + посадка аватаров`);
    } catch (error) {
      console.error("Failed to save project template", error);
      setMessage("Не удалось сохранить шаблон проекта");
    }
  };
  const loadProjectTemplate = async () => {
    try {
      const response = await fetch(TEMPLATE_API_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`template load failed: ${response.status}`);
      const template = (await response.json()) as ConstructorTemplatePayload;
      const templateItems = Array.isArray(template.items) ? template.items : [];
      const items = telegram ? templateItems.filter((item) => isTelegramSceneAsset(item.slug)) : templateItems;
      await restoreSceneItems(items, "шаблон проекта");
      if (template.avatarSeatMap) {
        const nextSeatMap = normalizeAvatarSeatMapPayload(template.avatarSeatMap);
        avatarSeatMapRef.current = nextSeatMap;
        setAvatarSeatMap(nextSeatMap);
        window.localStorage.setItem(AVATAR_SEAT_STORAGE_KEY, JSON.stringify(nextSeatMap));
      }
      if (template.avatarSeatAdjustments) {
        const nextAdjustments = normalizeAvatarSeatAdjustmentsPayload(template.avatarSeatAdjustments);
        avatarSeatAdjustmentsRef.current = nextAdjustments;
        setAvatarSeatAdjustments(nextAdjustments);
        window.localStorage.setItem(AVATAR_SEAT_ADJUSTMENTS_STORAGE_KEY, JSON.stringify(nextAdjustments));
      }
      if (template.seatTuning) {
        const nextTuning = normalizeSeatTuningPayload(template.seatTuning);
        seatTuningRef.current = nextTuning;
        setSeatTuning(nextTuning);
        window.localStorage.setItem(AVATAR_SEAT_TUNING_STORAGE_KEY, JSON.stringify(nextTuning));
      }
      if (!telegram && typeof template.controlledAvatarId === "string" && ACTIVE_AVATAR_IDS.has(template.controlledAvatarId)) {
        setControlledAvatarId(template.controlledAvatarId);
      }
      seatAllAvatarsOnNextLoadRef.current = !telegram;
      controlledAvatarPoseRef.current = {};
      if (!telegram) setTemplateRevision((revision) => revision + 1);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      console.error("Failed to load project template", error);
      setMessage("Не удалось загрузить шаблон проекта");
    }
  };
  const moveSelectedToSurface = (surface: SurfaceId) => {
    if (!selectedId) {
      setActiveSurface(surface);
      return;
    }
    const object = objectRefs.current.get(selectedId);
    const spawnPosition = getSurfaceSpawnPosition(surface, placedRef.current.length);
    const spawnRotation = SURFACE_BY_ID.get(surface)?.defaultRotation ?? [0, 0, 0];
    if (object) {
      object.userData.surfaceId = surface;
      object.userData.surfaceLocked = true;
      object.position.set(spawnPosition[0], spawnPosition[1], spawnPosition[2]);
      object.rotation.set(THREE.MathUtils.degToRad(spawnRotation[0]), THREE.MathUtils.degToRad(spawnRotation[1]), THREE.MathUtils.degToRad(spawnRotation[2]));
      clampObjectToSurface(object, surface);
    }
    setActiveSurface(surface);
    setSnapSurface(true);
    setPlaced((current) => current.map((item) => (item.id === selectedId ? snapshotObject({ ...item, surface, surfaceLocked: true }, object ?? new THREE.Object3D()) : item)));
  };

  const handleSnapSurfaceChange = (enabled: boolean) => {
    setSnapSurface(enabled);
    snapSurfaceRef.current = enabled;
    const id = selectedIdRef.current;
    if (!id) return;
    const object = objectRefs.current.get(id);
    const nextPlaced = placedRef.current.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, surfaceLocked: enabled };
      if (object) {
        object.userData.surfaceLocked = enabled;
        if (enabled) clampObjectToSurface(object, next.surface);
        return snapshotObject(next, object);
      }
      return next;
    });
    placedRef.current = nextPlaced;
    setPlaced(nextPlaced);
  };

  const resetCamera = () => {
    const camera = cameraRef.current;
    const orbit = orbitRef.current;
    if (!camera || !orbit) return;
    camera.position.set(24, 20.5, 42);
    orbit.target.set(0, ROOM_HEIGHT * 0.24, -8.4);
    orbit.update();
  };

  const focusControlledAvatar = () => {
    const runtime = controlledAvatarRef.current;
    const camera = cameraRef.current;
    const orbit = orbitRef.current;
    if (!runtime || !camera || !orbit) {
      setMessage("Управляемый аватар еще загружается");
      return;
    }
    const target = runtime.root.position.clone().add(new THREE.Vector3(0, 3.4, 0));
    const backward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), runtime.yaw).multiplyScalar(14);
    camera.position.copy(target).add(backward).add(new THREE.Vector3(0, 4.8, 0));
    orbit.target.copy(target);
    orbit.update();
    rendererRef.current?.domElement.focus();
  };

  const activateAvatarControls = () => {
    setFlyMode(false);
    flyModeRef.current = false;
    setAvatarControlEnabled(true);
    avatarControlEnabledRef.current = true;
    avatarKeysRef.current.clear();
    flyKeysRef.current.clear();
    rendererRef.current?.domElement.focus();
    focusControlledAvatar();
    setMessage("Управление аватаром включено: WASD/стрелки - движение, Shift - быстрее");
  };

  const toggleFlyMode = () => {
    if (controlledAvatarRef.current?.isSeated) {
      setMessage("Сначала выйди из-за стола");
      return;
    }
    setFlyMode((value) => !value);
  };
  const toggleAvatarControls = () => {
    if (avatarControlEnabled) {
      setAvatarControlEnabled(false);
      avatarControlEnabledRef.current = false;
      avatarKeysRef.current.clear();
      setMessage("Управление аватаром выключено");
      return;
    }
    activateAvatarControls();
  };
  const leaveCouncilTable = () => {
    const runtime = controlledAvatarRef.current;
    const avatar = controlledAvatar;
    if (!runtime || !avatar) {
      setMessage("Управляемый аватар еще загружается");
      return;
    }
    if (!runtime.isSeated) {
      setMessage("Аватар сейчас не сидит за столом");
      return;
    }

    const tableCenter = getCouncilTableCenter();
    const awayFromTable = runtime.root.position.clone().sub(tableCenter);
    awayFromTable.y = 0;
    if (awayFromTable.lengthSq() < 0.01) awayFromTable.set(Math.sin(runtime.yaw), 0, Math.cos(runtime.yaw));
    awayFromTable.normalize();
    runtime.root.position.addScaledVector(awayFromTable, 3.2);
    runtime.root.position.y = 0;
    runtime.seating = null;
    runtime.isSeated = false;
    runtime.wasMoving = false;
    setThirdPersonCameraEnabled(true);
    thirdPersonCameraEnabledRef.current = true;
    avatarIsSeatedRef.current = false;
    setAvatarIsSeated(false);
    avatarNearTableRef.current = isAvatarNearCouncilSeat(runtime.root.position);
    setAvatarNearTable(avatarNearTableRef.current);
    controlledAvatarPoseRef.current[avatar.id] = { position: runtime.root.position.clone(), yaw: runtime.yaw };
    if (runtime.action) {
      runtime.action.reset();
      runtime.action.paused = true;
      runtime.mixer?.update(0);
    }
    if (runtime.seatedModel) runtime.seatedModel.visible = false;
    if (runtime.idleModel) {
      runtime.idleModel.visible = true;
      if (runtime.baseIdleModelPosition) runtime.idleModel.position.copy(runtime.baseIdleModelPosition);
      runtime.model.visible = false;
    } else {
      runtime.model.visible = true;
      runtime.model.position.copy(runtime.baseModelPosition);
    }
    const defaultMotion = getDefaultAvatarMotion(avatar);
    if (avatarMotionRef.current === "walk-to-seat" && defaultMotion !== "walk-to-seat") setAvatarMotion(defaultMotion);
    rendererRef.current?.domElement.focus();
    setMessage("Аватар вышел из-за стола");
  };


  const testControlledSeatAnimation = () => {
    const runtime = controlledAvatarRef.current;
    const avatar = controlledAvatar;
    if (!runtime || !avatar) {
      setMessage("Управляемый аватар еще загружается");
      return;
    }
    const realSeat = findNearestAvailableRealChairSeat(runtime.root.position, avatar.id);
    if (!realSeat && telegram && remoteAvatarRuntimesRef.current.size > 0) {
      setMessage("Свободных кресел рядом нет");
      return;
    }
    const tableCenter = getCouncilTableCenter();
    const fallbackSeatIndex = getNearestAvatarSeatIndex(runtime.root.position, tableCenter);
    const fallbackSeat = getAvatarSeatPose(fallbackSeatIndex, tableCenter);
    const seatIndex = realSeat?.seatIndex ?? fallbackSeatIndex;
    const seatPose = realSeat ?? { seatIndex: fallbackSeatIndex, targetPosition: fallbackSeat.position, targetYaw: fallbackSeat.yaw, label: `место ${fallbackSeatIndex + 1}` };
    const adjustedSeatPose = applyAvatarSeatAdjustment(avatar.id, seatPose.targetPosition, seatPose.targetYaw);
    const seatForward = tableCenter.clone().sub(adjustedSeatPose.position).setY(0);
    if (seatForward.lengthSq() < 0.0001) seatForward.set(0, 0, -1);
    seatForward.normalize();
    const seatSide = new THREE.Vector3(-seatForward.z, 0, seatForward.x).normalize();
    const startPosition = adjustedSeatPose.position
      .clone()
      .addScaledVector(seatSide, seatTuningRef.current.approachSide * 1.35)
      .addScaledVector(seatForward, -(seatTuningRef.current.approachBack + 3.2));
    startPosition.y = 0;

    runtime.seating = null;
    runtime.isSeated = false;
    runtime.wasMoving = false;
    runtime.root.position.copy(startPosition);
    runtime.yaw = adjustedSeatPose.yaw;
    runtime.root.rotation.y = adjustedSeatPose.yaw + AVATAR_MODEL_FORWARD_OFFSET + getAvatarMotionFacingOffset(avatarMotionRef.current);
    runtime.model.visible = true;
    runtime.model.position.copy(runtime.baseModelPosition);
    if (runtime.idleModel) runtime.idleModel.visible = false;
    if (runtime.seatedModel) runtime.seatedModel.visible = false;
    if (runtime.action) {
      runtime.action.reset();
      runtime.action.paused = true;
      runtime.mixer?.update(0);
    }
    avatarIsSeatedRef.current = false;
    setAvatarIsSeated(false);
    avatarNearTableRef.current = true;
    setAvatarNearTable(true);
    avatarSeatMapRef.current = { ...avatarSeatMapRef.current, [avatar.id]: seatIndex };
    setAvatarSeatMap((current) => ({ ...current, [avatar.id]: seatIndex }));
    setFlyMode(false);
    flyModeRef.current = false;
    setAvatarControlEnabled(true);
    avatarControlEnabledRef.current = true;
    setThirdPersonCameraEnabled(true);
    thirdPersonCameraEnabledRef.current = true;
    beginSeatAnimation(runtime, adjustedSeatPose.position, adjustedSeatPose.yaw);
    rendererRef.current?.domElement.focus();
    setMessage(`Тест посадки: ${seatPose.label}. Слайдеры применяются к этому запуску`);
  };
  const seatAllAvatarsAtChairs = () => {
    const avatars = initiateAvatars.filter((avatar) => ACTIVE_AVATAR_IDS.has(avatar.id) && !NON_CONTROLLABLE_AVATAR_IDS.has(avatar.id));
    if (avatars.length === 0) {
      setMessage("Аватары еще загружаются");
      return;
    }
    const realSeatPoses = getRealChairSeatPoses();
    const tableCenter = getCouncilTableCenter();
    if (realSeatPoses.length === 0) {
      setMessage("Не нашел реальные кресла в текущем шаблоне");
      return;
    }

    const nextSeatMap: Record<string, number> = {};
    const avatarLayer = avatarGroupRef.current;
    avatars.forEach((avatar, index) => {
      const seatPose = realSeatPoses[index % realSeatPoses.length];
      const fallbackSeat = getAvatarSeatPose(index, tableCenter);
      const basePosition = seatPose?.targetPosition ?? fallbackSeat.position;
      const baseYaw = seatPose?.targetYaw ?? fallbackSeat.yaw;
      const adjustedSeatPose = applyAvatarSeatAdjustment(avatar.id, basePosition, baseYaw);
      const targetPosition = adjustedSeatPose.position;
      const targetYaw = adjustedSeatPose.yaw;
      nextSeatMap[avatar.id] = seatPose?.seatIndex ?? index;
      const avatarRoot = avatarLayer?.children.find((child) => child.userData.avatarId === avatar.id) as THREE.Group | undefined;
      if (!avatarRoot) return;
      if (controlledAvatarRef.current?.root === avatarRoot) {
        const modelFacingOffset = AVATAR_MODEL_FORWARD_OFFSET + getAvatarMotionFacingOffset(avatarMotionRef.current);
        setControlledRuntimeSeated(controlledAvatarRef.current, targetPosition, targetYaw, modelFacingOffset);
        controlledAvatarPoseRef.current[avatar.id] = { position: targetPosition.clone(), yaw: targetYaw };
      } else {
        avatarRoot.position.copy(targetPosition);
        avatarRoot.rotation.y = targetYaw + AVATAR_MODEL_FORWARD_OFFSET;
      }
    });

    seatAllAvatarsOnNextLoadRef.current = true;
    setAvatarSeatMap((current) => ({ ...current, ...nextSeatMap }));
    setMessage(`Посадил аватаров за реальные кресла: ${avatars.length}`);
    rendererRef.current?.domElement.focus();
  };
  const handleSeatPromptAction = () => {
    if (controlledAvatarRef.current?.isSeated) {
      leaveCouncilTable();
      return;
    }
    seatControlledAvatar();
  };
  const seatControlledAvatar = () => {
    const runtime = controlledAvatarRef.current;
    const avatar = controlledAvatar;
    if (!runtime || !avatar) {
      setMessage("Управляемый аватар еще загружается");
      return;
    }
    if (runtime.isSeated) {
      setMessage("Аватар уже сидит за столом");
      return;
    }
    if (!isAvatarNearCouncilSeat(runtime.root.position)) {
      setMessage("Подойди ближе к столу, чтобы сесть");
      return;
    }
    const realSeat = findNearestAvailableRealChairSeat(runtime.root.position, avatar.id);
    if (!realSeat && telegram && remoteAvatarRuntimesRef.current.size > 0) {
      setMessage("Свободных кресел рядом нет");
      return;
    }
    const tableCenter = getCouncilTableCenter();
    const fallbackSeatIndex = getNearestAvatarSeatIndex(runtime.root.position, tableCenter);
    const fallbackSeat = getAvatarSeatPose(fallbackSeatIndex, tableCenter);
    const seatIndex = realSeat?.seatIndex ?? fallbackSeatIndex;
    const seatPose = realSeat ?? { seatIndex: fallbackSeatIndex, targetPosition: fallbackSeat.position, targetYaw: fallbackSeat.yaw, label: `место ${fallbackSeatIndex + 1}` };
    const adjustedSeatPose = applyAvatarSeatAdjustment(avatar.id, seatPose.targetPosition, seatPose.targetYaw);
    pendingSeatCommandRef.current = null;
    avatarSeatMapRef.current = { ...avatarSeatMapRef.current, [avatar.id]: seatIndex };
    setAvatarSeatMap((current) => ({ ...current, [avatar.id]: seatIndex }));
    setFlyMode(false);
    flyModeRef.current = false;
    setAvatarControlEnabled(true);
    avatarControlEnabledRef.current = true;
    avatarKeysRef.current.clear();
    flyKeysRef.current.clear();
    if (seatTuningRef.current.animated) {
      setThirdPersonCameraEnabled(true);
      thirdPersonCameraEnabledRef.current = true;
      beginSeatAnimation(runtime, adjustedSeatPose.position, adjustedSeatPose.yaw);
      setMessage(`Аватар подходит к ближайшему креслу: ${seatPose.label}`);
    } else {
      const modelFacingOffset = AVATAR_MODEL_FORWARD_OFFSET + getAvatarMotionFacingOffset(avatarMotionRef.current);
      setControlledRuntimeSeated(runtime, adjustedSeatPose.position, adjustedSeatPose.yaw, modelFacingOffset);
      controlledAvatarPoseRef.current[avatar.id] = { position: adjustedSeatPose.position.clone(), yaw: adjustedSeatPose.yaw };
      setMessage(`Аватар сел за ближайшее кресло: ${seatPose.label}`);
    }
    rendererRef.current?.domElement.focus();
  };
  useEffect(() => {
    if (!plain || !isReady || assets.length === 0 || templateLoadedRef.current) return;
    templateLoadedRef.current = true;
    void loadProjectTemplate();
  }, [assets.length, isReady, plain]);

  const setTouchMovement = (code: string, active: boolean) => {
    if (active) {
      avatarKeysRef.current.add(code);
      rendererRef.current?.domElement.focus();
    } else {
      avatarKeysRef.current.delete(code);
    }
  };

  const touchMovementProps = (code: string) => ({
    onPointerDown: () => setTouchMovement(code, true),
    onPointerUp: () => setTouchMovement(code, false),
    onPointerCancel: () => setTouchMovement(code, false),
    onPointerLeave: () => setTouchMovement(code, false)
  });

  return (
    <section className={`meshy-constructor ${plain ? "meshy-constructor--plain" : ""} ${telegram ? "meshy-constructor--telegram" : ""} ${panelsHidden ? "is-clean" : ""}`} aria-label={telegram ? "3D пространство Зеркала Дао" : "3D конструктор Meshy деталей"}>
      <div className="meshy-constructor__viewport" ref={mountRef} />

      {telegram ? (
        <>
          <header className="meshy-telegram-hud">
            <select aria-label="Выбор аватара" onChange={(event) => { const nextAvatar = initiateAvatars.find((avatar) => avatar.id === event.target.value) ?? null; setControlledAvatarId(event.target.value); setAvatarMotion(getDefaultAvatarMotion(nextAvatar)); }} value={controlledAvatarId}>
              {initiateAvatars.length > 0 ? initiateAvatars.filter((avatar) => !NON_CONTROLLABLE_AVATAR_IDS.has(avatar.id)).map((avatar) => <option key={avatar.id} value={avatar.id}>{avatar.title || avatar.id}</option>) : <option value={controlledAvatarId}>Аватар</option>}
            </select>
            <button data-active={thirdPersonCameraEnabled} onClick={() => setThirdPersonCameraEnabled((value) => !value)} type="button">Камера</button>
            <button onClick={focusControlledAvatar} type="button">К аватару</button>
          </header>
          <div className="meshy-touch-controls" aria-label="Управление движением">
            <button {...touchMovementProps("KeyW")} aria-label="Вперёд" type="button">↑</button>
            <button {...touchMovementProps("KeyA")} aria-label="Влево" type="button">←</button>
            <button {...touchMovementProps("KeyS")} aria-label="Назад" type="button">↓</button>
            <button {...touchMovementProps("KeyD")} aria-label="Вправо" type="button">→</button>
          </div>
        </>
      ) : null}

      <header className="meshy-constructor__topbar">
        <div>
          <p className="dao-kicker">3D конструктор</p>
          <h1>Детали храма</h1>
        </div>
        <nav aria-label="Навигация 3D конструктора">
          <Link href="/inner">???</Link>
          <Link href="/space">Пространство</Link>
          <Link href="/optimization">Оптимизация</Link>
          <button onClick={resetCamera} type="button">Камера</button>
          <button data-active={flyMode} onClick={toggleFlyMode} title="WASD, Q/E, Shift; обзор правой кнопкой мыши" type="button">{flyMode ? "Полет вкл" : "Полет"}</button>
          <button data-active={avatarControlEnabled} onClick={toggleAvatarControls} title={"WASD/стрелки двигают аватара относительно камеры; Shift ускоряет"} type="button">{avatarControlEnabled ? "Аватар вкл" : "Аватар"}</button>
          <button data-active={thirdPersonCameraEnabled} onClick={() => setThirdPersonCameraEnabled((value) => !value)} title="Камера следует за управляемым аватаром от третьего лица" type="button">3 лицо</button>
          <button onClick={focusControlledAvatar} type="button">К аватару</button>
          <select aria-label="Выбор управляемого аватара" className="meshy-avatar-motion-select" onChange={(event) => { const nextAvatar = initiateAvatars.find((avatar) => avatar.id === event.target.value) ?? null; setControlledAvatarId(event.target.value); setAvatarMotion(getDefaultAvatarMotion(nextAvatar)); }} title="Кем управлять" value={controlledAvatarId}>
            {initiateAvatars.length > 0 ? initiateAvatars.filter((avatar) => !NON_CONTROLLABLE_AVATAR_IDS.has(avatar.id)).map((avatar) => <option key={avatar.id} value={avatar.id}>{avatar.title || avatar.id}</option>) : <option value={controlledAvatarId}>Аватар</option>}
          </select>
          {controlledAvatar?.id === DLANIS_AVATAR_ID ? (
            <select aria-label="Анимация Стража DLANIS" className="meshy-avatar-motion-select" onChange={(event) => setAvatarMotion(event.target.value)} title="Анимация Стража DLANIS" value={avatarMotion}>
              {getAvatarMotionOptions(controlledAvatar).filter((motion) => DLANIS_SELECTABLE_MOTION_IDS.has(motion.id)).map((motion) => <option key={motion.id} value={motion.id}>{motion.label}</option>)}
            </select>
          ) : null}
          <button onClick={() => setPanelsHidden((value) => !value)} type="button">{panelsHidden ? "Панели" : "Скрыть"}</button>
        </nav>
      </header>
      <div className="meshy-seat-prompt" data-active={avatarIsSeated || avatarNearTable} data-seated={avatarIsSeated} role="group" aria-label="Действие рядом со столом">
        <button onClick={handleSeatPromptAction} type="button">{avatarIsSeated ? "Выйти из-за стола" : avatarNearTable ? "Сесть за стол" : "Подойди к столу"}</button>
      </div>
      {telegram ? (
        <CouncilHologramPanel
          onLeave={leaveCouncilTable}
          panelRef={councilHologramPanelRef}
          participantName={telegramParticipantNickname}
          visible={avatarIsSeated}
        />
      ) : null}

      <aside className="meshy-constructor__panel meshy-constructor__panel--library">
        <div className="meshy-constructor__section">
          <p className="meshy-constructor__label">Библиотека</p>
          <strong>{assets.length} деталей</strong>
          <input aria-label="Поиск детали" className="meshy-constructor__search" onChange={(event) => setQuery(event.target.value)} placeholder="Поиск: column, portal, water..." value={query} />
          <select aria-label="Категория" className="meshy-constructor__search" onChange={(event) => setCategory(event.target.value)} value={category}>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        <div className="meshy-asset-list">
          {filteredAssets.map((asset) => (
            <button className="meshy-asset-card" disabled={loadingSlug === asset.slug} key={asset.slug} onClick={() => void addAsset(asset)} title={asset.slug} type="button">
              {asset.sourceImage ? <img alt="" src={asset.sourceImage} /> : <span className="meshy-asset-card__placeholder" />}
              <span>{formatLabel(asset.slug)}</span>
              <small>{categorizeAsset(asset.slug)}</small>
            </button>
          ))}
        </div>
      </aside>

      <aside className="meshy-constructor__panel meshy-constructor__panel--settings">
        <div className="meshy-constructor__section">
          <p className="meshy-constructor__label">Сцена</p>
          <strong>{placed.length} объектов</strong>
          <div className="meshy-mode-grid">
            <button data-active={mode === "translate"} onClick={() => setMode("translate")} type="button">Двигать</button>
            <button data-active={mode === "rotate"} onClick={() => setMode("rotate")} type="button">Крутить</button>
            <button data-active={mode === "scale"} onClick={() => setMode("scale")} type="button">Масштаб</button>
          </div>
          <div className="meshy-surface-grid" aria-label="Поверхность добавления">
            {SURFACES.map((surface) => (
              <button data-active={activeSurface === surface.id} key={surface.id} onClick={() => setActiveSurface(surface.id)} title={surface.hint} type="button">
                <span>{surface.label}</span>
                <small>{surface.hint}</small>
              </button>
            ))}
          </div>
          <label className="meshy-snap-toggle">
            <input checked={snapSurface} onChange={(event) => handleSnapSurfaceChange(event.target.checked)} type="checkbox" />
            <span>Держать объект на выбранной поверхности</span>
          </label>
          <div className="meshy-constructor__actions">
            <button onClick={saveScene} type="button">Сохранить</button>
                        <button onClick={() => void saveProjectTemplate()} type="button">Сохранить шаблон</button>
            <button onClick={() => void loadScene()} type="button">Загрузить</button>
            <button onClick={() => void loadProjectTemplate()} type="button">Шаблон</button>
            <button onClick={clearScene} type="button">Очистить</button>
          </div>
        </div>

        <div className="meshy-constructor__section meshy-dlanis-editor">
            <p className="meshy-constructor__label">Стражи</p>
            <strong>Положение, оружие и анимация</strong>
            <div className="meshy-mode-grid" aria-label="Страж или оружие для редактирования">
              <button data-active={dlanisTransformTarget === "avatar"} onClick={() => selectDlanisTransformTarget("avatar")} type="button">DLANIS</button>
              <button data-active={dlanisTransformTarget === "breathing-guard"} onClick={() => selectDlanisTransformTarget("breathing-guard")} type="button">Наблюдатель</button>
              <button data-active={dlanisTransformTarget === "Weapon_Spear"} onClick={() => { setDlanisWeaponEditorId("Weapon_Spear"); selectDlanisTransformTarget("Weapon_Spear"); }} type="button">Копье</button>
              <button data-active={dlanisTransformTarget === "Weapon_Axe_Back"} onClick={() => { setDlanisWeaponEditorId("Weapon_Axe_Back"); selectDlanisTransformTarget("Weapon_Axe_Back"); }} type="button">Топор</button>
              <button onClick={clearDlanisTransformTarget} type="button">Снять</button>
            </div>
            <div className="meshy-mode-grid" aria-label="Режим редактирования стражей">
              <button data-active={mode === "translate"} onClick={() => setMode("translate")} type="button">Двигать</button>
              <button data-active={mode === "rotate"} onClick={() => setMode("rotate")} type="button">Крутить</button>
              <button data-active={mode === "scale"} onClick={() => setMode("scale")} type="button">Масштаб</button>
            </div>
            <div className="meshy-constructor__actions">
              <button onClick={replayDlanisAnimation} type="button">Проиграть</button>
              <button onClick={holdDlanisFinalPose} type="button">Последний кадр</button>
            </div>
            <select aria-label="Оружие DLANIS" className="meshy-constructor__search" onChange={(event) => { const weaponId = event.target.value as DlanisWeaponId; setDlanisWeaponEditorId(weaponId); selectDlanisTransformTarget(weaponId); }} value={dlanisWeaponEditorId}>
              <option value="Weapon_Spear">Копье в ладони</option>
              <option value="Weapon_Axe_Back">Топор за спиной</option>
            </select>
            <div className="meshy-seat-tuning">
              <ScalarControl label="Сдвиг X" max={2.5} min={-2.5} onChange={(value) => updateDlanisWeaponAdjustment(dlanisWeaponEditorId, { position: [value, dlanisWeaponEditorAdjustment.position[1], dlanisWeaponEditorAdjustment.position[2]] })} step={0.01} value={dlanisWeaponEditorAdjustment.position[0]} />
              <ScalarControl label="Сдвиг Y" max={2.5} min={-2.5} onChange={(value) => updateDlanisWeaponAdjustment(dlanisWeaponEditorId, { position: [dlanisWeaponEditorAdjustment.position[0], value, dlanisWeaponEditorAdjustment.position[2]] })} step={0.01} value={dlanisWeaponEditorAdjustment.position[1]} />
              <ScalarControl label="Сдвиг Z" max={2.5} min={-2.5} onChange={(value) => updateDlanisWeaponAdjustment(dlanisWeaponEditorId, { position: [dlanisWeaponEditorAdjustment.position[0], dlanisWeaponEditorAdjustment.position[1], value] })} step={0.01} value={dlanisWeaponEditorAdjustment.position[2]} />
              <ScalarControl label="Поворот X" max={180} min={-180} onChange={(value) => updateDlanisWeaponAdjustment(dlanisWeaponEditorId, { rotation: [value, dlanisWeaponEditorAdjustment.rotation[1], dlanisWeaponEditorAdjustment.rotation[2]] })} step={1} value={dlanisWeaponEditorAdjustment.rotation[0]} />
              <ScalarControl label="Поворот Y" max={180} min={-180} onChange={(value) => updateDlanisWeaponAdjustment(dlanisWeaponEditorId, { rotation: [dlanisWeaponEditorAdjustment.rotation[0], value, dlanisWeaponEditorAdjustment.rotation[2]] })} step={1} value={dlanisWeaponEditorAdjustment.rotation[1]} />
              <ScalarControl label="Поворот Z" max={180} min={-180} onChange={(value) => updateDlanisWeaponAdjustment(dlanisWeaponEditorId, { rotation: [dlanisWeaponEditorAdjustment.rotation[0], dlanisWeaponEditorAdjustment.rotation[1], value] })} step={1} value={dlanisWeaponEditorAdjustment.rotation[2]} />
              <ScalarControl label="Масштаб" max={2.5} min={0.2} onChange={(value) => updateDlanisWeaponAdjustment(dlanisWeaponEditorId, { scale: value })} step={0.01} value={dlanisWeaponEditorAdjustment.scale} />
            </div>
            <div className="meshy-constructor__actions">
              <button onClick={saveDlanisWeaponAdjustments} type="button">Сохранить стражей</button>
              <button onClick={resetDlanisWeaponAdjustment} type="button">Сбросить оружие</button>
            </div>
        </div>

        <div className="meshy-constructor__section meshy-avatar-seats">
          <p className="meshy-constructor__label">Посадка</p>
          <strong>Места аватаров</strong>
          <div className="meshy-constructor__actions">
            <button onClick={seatAllAvatarsAtChairs} type="button">Посадить всех</button>
            <button onClick={resetSeatTuning} type="button">Сброс посадки</button>
            <button onClick={testControlledSeatAnimation} type="button">Тест посадки</button>
          </div>
          <label className="meshy-snap-toggle">
            <input checked={seatTuning.animated} onChange={(event) => updateSeatTuning({ animated: event.target.checked })} type="checkbox" />
            <span>Анимировать подход и посадку</span>
          </label>
          <div className="meshy-seat-tuning">
            <ScalarControl label="Глубина в кресле" max={2.2} min={0.1} onChange={(value) => updateSeatTuning({ chairDepth: value })} step={0.05} value={seatTuning.chairDepth} />
            <ScalarControl label="Подход сбоку" max={5.5} min={0.4} onChange={(value) => updateSeatTuning({ approachSide: value })} step={0.05} value={seatTuning.approachSide} />
            <ScalarControl label="Отступ перед посадкой" max={3.5} min={0} onChange={(value) => updateSeatTuning({ approachBack: value })} step={0.05} value={seatTuning.approachBack} />
            <ScalarControl label="Скорость подхода" max={8} min={1} onChange={(value) => updateSeatTuning({ walkSpeed: value })} step={0.1} value={seatTuning.walkSpeed} />
            <ScalarControl label="Длительность посадки" max={2.5} min={0.15} onChange={(value) => updateSeatTuning({ sitDuration: value })} step={0.05} value={seatTuning.sitDuration} />
          </div>
          <div className="meshy-seat-editor">
            <p className="meshy-constructor__label">Настройка аватара</p>
            <select aria-label="Выбор аватара для настройки посадки" className="meshy-constructor__search" onChange={(event) => setSeatEditorAvatarId(event.target.value)} value={seatEditorAvatar?.id ?? seatEditorAvatarId}>
              {initiateAvatars.filter((avatar) => !NON_CONTROLLABLE_AVATAR_IDS.has(avatar.id)).map((avatar) => <option key={avatar.id} value={avatar.id}>{avatar.title || avatar.id}</option>)}
            </select>
            {seatEditorAvatar ? (
              <div className="meshy-seat-tuning">
                <ScalarControl label="Поворот на стуле" max={180} min={-180} onChange={(value) => updateAvatarSeatAdjustment(seatEditorAvatar.id, { yawOffsetDeg: value })} step={1} value={seatEditorAdjustment.yawOffsetDeg} />
                <ScalarControl label="Глубина аватара" max={2.5} min={-2.5} onChange={(value) => updateAvatarSeatAdjustment(seatEditorAvatar.id, { depthOffset: value })} step={0.05} value={seatEditorAdjustment.depthOffset} />
                <ScalarControl label="Сдвиг вбок" max={2.5} min={-2.5} onChange={(value) => updateAvatarSeatAdjustment(seatEditorAvatar.id, { sideOffset: value })} step={0.05} value={seatEditorAdjustment.sideOffset} />
                <ScalarControl label="Высота" max={1.4} min={-1.4} onChange={(value) => updateAvatarSeatAdjustment(seatEditorAvatar.id, { heightOffset: value })} step={0.05} value={seatEditorAdjustment.heightOffset} />
                <div className="meshy-constructor__actions">
                  <button onClick={() => resetAvatarSeatAdjustment(seatEditorAvatar.id)} type="button">Сбросить аватара</button>
                  <button onClick={seatSelectedAvatarFromEditor} type="button">Посадить выбранного</button>
                  <button onClick={() => { window.localStorage.setItem(AVATAR_SEAT_STORAGE_KEY, JSON.stringify(avatarSeatMapRef.current)); window.localStorage.setItem(AVATAR_SEAT_ADJUSTMENTS_STORAGE_KEY, JSON.stringify(avatarSeatAdjustmentsRef.current)); applySeatedAvatarAdjustmentsToScene(); setMessage("Настройки посадки аватара применены и сохранены в браузере"); }} type="button">Применить</button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="meshy-seat-list">
            {initiateAvatars.filter((avatar) => !NON_CONTROLLABLE_AVATAR_IDS.has(avatar.id)).map((avatar) => (
              <label className="meshy-seat-row" key={avatar.id}>
                <span>{avatar.title || avatar.id}</span>
                <select aria-label={`Место для ${avatar.title || avatar.id}`} className="meshy-constructor__search" onChange={(event) => updateAvatarSeat(avatar.id, Number(event.target.value))} value={avatarSeatMap[avatar.id] ?? DEFAULT_AVATAR_SEATS[avatar.id] ?? 0}>
                  {seatOptions.map((seatIndex) => <option key={seatIndex} value={seatIndex}>{`Место ${seatIndex + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>
        {selected ? (
          <div className="meshy-constructor__section">
            <p className="meshy-constructor__label">{"\u0412\u044b\u0431\u0440\u0430\u043d"}</p>
            <strong>{selectedItems.length > 1 ? `\u0413\u0440\u0443\u043f\u043f\u0430: ${selectedItems.length}` : selected.label}</strong>
            <div className="meshy-constructor__actions">
              <button onClick={selectAllObjects} type="button">{"\u0412\u044b\u0434\u0435\u043b\u0438\u0442\u044c \u0432\u0441\u0435"}</button>
              <button onClick={clearSelection} type="button">{"\u0421\u043d\u044f\u0442\u044c"}</button>
              <button onClick={mirrorSelectedHorizontal} type="button">{"\u041e\u0442\u0440\u0430\u0437\u0438\u0442\u044c X"}</button>
              <button onClick={copySelected} type="button">{"\u041a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c"}</button>
              <button disabled={copiedItems.length === 0} onClick={() => void pasteCopied()} type="button">{"\u0412\u0441\u0442\u0430\u0432\u0438\u0442\u044c"}</button>
              <button onClick={() => applyPatchToSelected({ visible: !selected.visible })} type="button">{selected.visible ? "Скрыть" : "Показать"}</button>
              <button onClick={removeSelected} type="button">Удалить</button>
            </div>
            <div className="meshy-object-list">
              {placed.map((item) => (
                <button data-active={selectedIds.includes(item.id)} key={item.id} onClick={(event) => selectObject(item.id, event.shiftKey || event.ctrlKey || event.metaKey)} title={item.slug} type="button">
                  <span>{item.label}</span>
                  <small>{item.visible ? "видим" : "скрыт"}</small>
                </button>
              ))}
            </div>
            <div className="meshy-selected-surface">
              <p className="meshy-constructor__label">Поверхность</p>
              <strong>{selected.surfaceLocked === false ? "\u0421\u0432\u043e\u0431\u043e\u0434\u043d\u043e" : SURFACE_BY_ID.get(selected.surface)?.label ?? "\u041f\u043e\u043b"}</strong>
              <div className="meshy-surface-grid meshy-surface-grid--compact">
                {SURFACES.map((surface) => (
                  <button data-active={selected.surface === surface.id} key={surface.id} onClick={() => moveSelectedToSurface(surface.id)} type="button">
                    <span>{surface.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <VectorControl label="Поворот" max={180} min={-180} onChange={(rotation) => applyPatchToSelected({ rotation })} step={1} value={selected.rotation} />
          </div>
        ) : (
          <div className="meshy-empty">
            <p className="dao-kicker">Пусто</p>
            <p>Выбери деталь слева. После добавления появится gizmo: двигай, вращай и масштабируй прямо в 3D-сцене.</p>
          </div>
        )}
      </aside>
      <div className="meshy-constructor__hint" data-ready={isReady} aria-live="polite">
        {message}
      </div>
    </section>
  );
}

function ScalarControl({ label, max, min, onChange, step, value }: { label: string; max: number; min: number; onChange: (value: number) => void; step: number; value: number }) {
  return (
    <label className="meshy-control">
      <span>{label}<strong>{value.toFixed(step < 0.1 ? 2 : 1)}</strong></span>
      <input max={max} min={min} onChange={(event) => onChange(Number(event.target.value))} step={step} type="range" value={value} />
    </label>
  );
}

function VectorControl({ label, max, min, onChange, step, value }: { label: string; max: number; min: number; onChange: (value: Vec3) => void; step: number; value: Vec3 }) {
  const axes = ["X", "Y", "Z"] as const;
  return (
    <div className="meshy-vector-control">
      <p>{label}</p>
      {axes.map((axis, index) => (
        <label key={axis}>
          <span>{axis}</span>
          <input max={max} min={min} onChange={(event) => {
            const next = [...value] as Vec3;
            next[index] = Number(event.target.value);
            onChange(next);
          }} step={step} type="number" value={value[index]} />
        </label>
      ))}
    </div>
  );
}


















































































































































