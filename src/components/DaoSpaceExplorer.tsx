"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { daoSpaceBlueprint, type Crop, type Vec3 } from "@/lib/daoSpaceBlueprint";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const toVector3 = (value: Vec3) => new THREE.Vector3(value[0], value[1], value[2]);
const AUTOPLAY_TREE_ANIMATIONS = [
  { name: "dao-tree-idle-breath", weight: 0.42 },
  { name: "dao-tree-wind-slow-sway", weight: 0.72 },
  { name: "dao-tree-crown-breath", weight: 0.62 },
  { name: "dao-tree-leaf-flutter", weight: 0.34 },
  { name: "dao-tree-gold-vein-pulse", weight: 0.85 },
  { name: "dao-tree-firefly-orbit", weight: 1 }
] as const;

const VENDOR_TREE_URL = "/vendor-assets/polyhaven/quiver_tree_02/quiver_tree_02_1k.gltf";
const FALLBACK_TREE_URL = "/models/dao-ancient-tree.glb";
const ROCK_MOSS_URL = "/vendor-assets/polyhaven/rock_moss_set_01/rock_moss_set_01_1k.gltf";
const ROOT_CLUSTER_URL = "/vendor-assets/polyhaven/root_cluster_01/root_cluster_01_1k.gltf";
const BRASS_LANTERN_URL = "/vendor-assets/polyhaven/brass_diya_lantern/brass_diya_lantern_1k.gltf";

const MOSS_ROCK_PLACEMENTS = [
  { id: "left-near-bank", position: [-17.8, -1.23, 5.2] as Vec3, rotationY: 0.48, scale: 1.15 },
  { id: "left-waterline", position: [-14.2, -1.2, -5.8] as Vec3, rotationY: -0.35, scale: 0.92 },
  { id: "left-far-bank", position: [-10.6, -1.18, -18.6] as Vec3, rotationY: 0.92, scale: 0.74 },
  { id: "right-foreground-bank", position: [18.2, -1.24, 2.8] as Vec3, rotationY: -0.82, scale: 1.02 },
  { id: "right-portal-bank", position: [16.6, -1.14, -17.8] as Vec3, rotationY: 0.2, scale: 0.84 },
  { id: "portal-base-left", position: [2.9, -1.06, -20.7] as Vec3, rotationY: 0.64, scale: 0.58 },
  { id: "portal-base-right", position: [13.4, -1.06, -21.1] as Vec3, rotationY: -0.58, scale: 0.62 }
] as const;

const ROOT_CLUSTER_PLACEMENTS = [
  { id: "left-root-bank", position: [-13.2, -1.2, 2.2] as Vec3, rotationY: 0.88, scale: 1.28 },
  { id: "right-root-bank", position: [15.4, -1.18, -6.4] as Vec3, rotationY: -0.72, scale: 1.08 },
  { id: "distant-root-shore", position: [-6.8, -1.16, -22.8] as Vec3, rotationY: 0.18, scale: 0.76 }
] as const;

const BRASS_LANTERN_PLACEMENT = {
  position: [-10.4, -0.58, 9.4] as Vec3,
  rotationY: 0.52,
  scale: 0.82
} as const;

type MeshyManifestAsset = {
  slug: string;
  localModel?: string;
  status?: string;
};

type MeshyManifest = {
  assets?: MeshyManifestAsset[];
};

const MESHY_ASSET_PLACEMENTS: Record<string, { position: Vec3; rotationY: number; scale: number }> = {
  "01-golden-portal-ring": { position: [8.0, 2.7, -23.2], rotationY: 0, scale: 2.9 },
  "02-ritual-bronze-bowl": { position: [8.0, -0.12, -20.9], rotationY: 0, scale: 1.15 },
  "03-stepped-basalt-platform": { position: [7.8, -1.1, -20.6], rotationY: 0.05, scale: 2.1 },
  "04-black-basalt-monolith": { position: [2.9, -0.9, -22.8], rotationY: 0.18, scale: 1.25 },
  "08-jade-brass-lantern": { position: [12.0, -0.46, -14.0], rotationY: -0.32, scale: 0.92 },
  "21-ritual-stone-bridge-segment": { position: [-1.4, -0.9, -4.2], rotationY: 0.42, scale: 1.35 },
  "33-ancient-temple-tree": { position: [-7.4, -1.18, 3.7], rotationY: -0.62, scale: 3.2 },
  "47-vertical-water-barrier-frame": { position: [13.6, -0.62, -25.6], rotationY: -0.18, scale: 1.4 },
  "57-wet-basalt-shoreline-slab": { position: [-12.8, -1.08, 8.6], rotationY: 0.58, scale: 1.3 },
  "60-mossy-basalt-root-arch": { position: [-13.8, -0.96, -2.2], rotationY: 0.78, scale: 1.15 },
  "63-slim-temple-light-column": { position: [15.2, -0.86, -9.8], rotationY: -0.44, scale: 1.25 },
  "64-short-arched-stone-bridge": { position: [1.6, -0.92, -10.2], rotationY: 0.18, scale: 1.25 },
  "69-mist-gate-side-pillar": { position: [3.8, -0.82, -26.0], rotationY: 0.06, scale: 1.4 },
  "70-crescent-stone-quay-module": { position: [11.8, -1.1, 2.4], rotationY: -0.72, scale: 1.45 },
  "71-jade-veined-cliff-wall-segment": { position: [17.4, -1.05, -18.5], rotationY: -0.36, scale: 1.7 },
  "72-circular-reflecting-pool-module": { position: [-5.6, -1.02, -13.2], rotationY: 0.1, scale: 1.28 },
  "76-stone-stepping-island-cluster": { position: [-5.7, -1.06, 2.9], rotationY: 0.42, scale: 1.22 },
  "80-vertical-water-veil-frame": { position: [14.2, -0.8, -24.4], rotationY: -0.22, scale: 1.18 },
  "81-circular-floor-compass-puzzle": { position: [3.6, -0.96, -11.7], rotationY: 0.08, scale: 1.1 }
};

const ROUTE_GLOW_POINTS = [
  { position: [-9.5, -0.82, 8.6] as Vec3, scale: 0.34, intensity: 5.5 },
  { position: [-5.6, -0.76, 4.2] as Vec3, scale: 0.26, intensity: 4.2 },
  { position: [-1.4, -0.66, -1.9] as Vec3, scale: 0.22, intensity: 3.4 },
  { position: [3.4, -0.48, -10.8] as Vec3, scale: 0.2, intensity: 3.1 },
  { position: [7.9, -0.24, -21.6] as Vec3, scale: 0.28, intensity: 6.6 }
] as const;
const GUIDED_ROUTE_POINTS = [
  { position: [-11.6, 2.2, 13.8] as Vec3, yaw: 0.18, pitch: -0.1 },
  { position: [-8.2, 1.85, 7.6] as Vec3, yaw: 0.34, pitch: -0.05 },
  { position: [-3.8, 1.7, 1.2] as Vec3, yaw: 0.46, pitch: -0.03 },
  { position: [1.8, 1.95, -8.6] as Vec3, yaw: 0.32, pitch: -0.02 },
  { position: [6.8, 2.42, -18.6] as Vec3, yaw: 0.08, pitch: -0.12 },
  { position: [8.0, 3.05, -23.4] as Vec3, yaw: 0.0, pitch: -0.2 }
] as const;

const WALKABLE_PATH_POINTS = GUIDED_ROUTE_POINTS.map((point) => point.position);
const WALKABLE_PATH_RADIUS = 13.5;
const ROUTE_COLLISION_SPECS = [
  { id: "left-bamboo-bank", position: [-18.0, 2.1, 1.0] as Vec3, radius: 2.4, height: 4.4 },
  { id: "right-water-bank", position: [18.0, 2.0, -4.0] as Vec3, radius: 2.2, height: 4.2 },
  { id: "mirror-pedestal", position: [-8.0, 1.85, -7.0] as Vec3, radius: 1.35, height: 2.6 },
  { id: "key-pedestal", position: [-10.0, 1.75, -19.0] as Vec3, radius: 1.3, height: 2.5 },
  { id: "lantern-pedestal", position: [12.0, 1.75, -14.0] as Vec3, radius: 1.3, height: 2.5 },
  { id: "portal-left-pillar", position: [4.2, 2.95, -26.4] as Vec3, radius: 1.05, height: 5.4 },
  { id: "portal-right-pillar", position: [14.0, 3.1, -28.2] as Vec3, radius: 1.08, height: 5.4 },
  { id: "distant-gate", position: [1.5, 1.9, -32.0] as Vec3, radius: 1.5, height: 3.1 },
  { id: "shore-rock-left", position: [-14.2, 1.7, -5.8] as Vec3, radius: 1.6, height: 2.9 }
] as const;
const PORTAL_FOCUS = new THREE.Vector3(8, 2.7, -23.2);

function makeCroppedPlaneGeometry(width: number, height: number, crop: Crop) {
  const geometry = new THREE.BufferGeometry();
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const u0 = crop.left;
  const u1 = crop.right;
  const vTop = 1 - crop.top;
  const vBottom = 1 - crop.bottom;

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [-halfWidth, halfHeight, 0, halfWidth, halfHeight, 0, -halfWidth, -halfHeight, 0, halfWidth, -halfHeight, 0],
      3
    )
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute([u0, vTop, u1, vTop, u0, vBottom, u1, vBottom], 2));
  geometry.setIndex([0, 2, 1, 2, 3, 1]);
  geometry.computeVertexNormals();
  return geometry;
}
function makeStoneBlockGeometry(size: Vec3) {
  const edgeRadius = Math.min(0.08, size[0] * 0.035, size[1] * 0.42, size[2] * 0.075);
  return new RoundedBoxGeometry(size[0], size[1], size[2], 3, Math.max(0.012, edgeRadius));
}

function shouldReceiveGoldInlay(id: string) {
  return id.startsWith("walkway-step-") || id.startsWith("platform-") || id.startsWith("side-water-island-") || id.startsWith("foreground-tile-");
}

export function DaoSpaceExplorer() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const resetRef = useRef<(() => void) | null>(null);
  const routeRef = useRef<(() => void) | null>(null);
  const enterRef = useRef<(() => void) | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x07100f, 0.022);

    const camera = new THREE.PerspectiveCamera(66, mount.clientWidth / mount.clientHeight, 0.08, 240);
    const startPosition = toVector3(daoSpaceBlueprint.camera.start);
    camera.position.copy(startPosition);

    const yawPitch = { yaw: daoSpaceBlueprint.camera.yaw, pitch: daoSpaceBlueprint.camera.pitch };
    const velocity = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const side = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const keys = new Set<string>();
    const clock = new THREE.Clock();
    const parallaxLayers: THREE.Object3D[] = [];
    const parallaxBaseY = new Map<THREE.Object3D, number>();
    const animationMixers: THREE.AnimationMixer[] = [];
    const animatedDaoTrees: THREE.Object3D[] = [];
    let pointerActive = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let animationFrame = 0;
    let speedBoost = 1;
    let locomotionPhase = 0;
    let cameraBobOffset = 0;
    const guidedRoute = { active: false, segment: 0, progress: 0 };
    let sceneDisposed = false;
    let portalOpen = false;
    const routeCollisionVolumes = ROUTE_COLLISION_SPECS.map((volume) => ({
      ...volume,
      position: toVector3(volume.position)
    }));
    const writeSceneFeatureDataset = () => {
      const names: string[] = [];
      let anchoredOrganicMotionCount = 0;
      scene.traverse((object) => {
        names.push(object.name);
        if (object.userData.motionAnchor === "organic") anchoredOrganicMotionCount += 1;
      });
      const countPrefix = (prefix: string) => names.filter((name) => name.startsWith(prefix)).length;
      const bambooStemCount = names.filter((name) => /^bamboo-\d+$/.test(name)).length;
      mount.dataset.sceneFeatures = JSON.stringify({
        water: names.includes("dao-water-plane"),
        stonePlatform: names.includes("platform-base") && names.includes("platform-top"),
        circularPortal: names.includes("portal-ring-system"),
        bowl: names.includes("portal-bowl"),
        verticalSlabs: countPrefix("pillar-") + countPrefix("depth-slab-") >= 10,
        bambooForest: bambooStemCount >= 20,
        goldenGeometry: names.includes("golden-route-thread") && countPrefix("water-orbit-line-") >= 3,
        modeledStone: countPrefix("beveled-stone-block-") >= 70 && countPrefix("stone-gold-inlay-") >= 45,
        bambooNodes: countPrefix("bamboo-node-band-") >= 60,
        portalModeling: countPrefix("portal-rib-spoke-") >= 16 && countPrefix("portal-node-cap-") >= 8,
        portalThresholdArchitecture: countPrefix("portal-threshold-block-") >= 6 && countPrefix("portal-throat-segment-") >= 5 && countPrefix("portal-threshold-inlay-") >= 4,
        portalMicroDetail: countPrefix("portal-engraving-tick-") >= 40 && countPrefix("portal-inner-lamella-") >= 16 && countPrefix("portal-glyph-node-") >= 16,
        bowlDetail: names.includes("portal-bowl-rim") && names.includes("portal-bowl-liquid"),
        bowlRitualDetail: countPrefix("bowl-rim-engraving-") >= 20 && countPrefix("bowl-liquid-caustic-") >= 6 && countPrefix("bowl-vapor-veil-") >= 5,
        waterDetail: countPrefix("water-caustic-thread-") >= 8 && countPrefix("water-ripple-ring-") >= 5,
        waterSurfaceLife: countPrefix("water-surface-glint-") >= 18 && countPrefix("water-depth-mote-") >= 24 && countPrefix("water-current-thread-") >= 8,
        waterDepthLayering: countPrefix("underwater-stone-") >= 14 && countPrefix("water-depth-shadow-") >= 10 && countPrefix("submerged-leaf-") >= 18,
        shorelineWaterContact: countPrefix("shoreline-wet-edge-") >= 8 && countPrefix("shoreline-refraction-patch-") >= 6 && countPrefix("stone-water-contact-ring-") >= 10,
        stoneSurfaceDetail: countPrefix("stone-crack-line-") >= 45 && countPrefix("stone-moss-patch-") >= 24,
        stoneEdgeRealism: countPrefix("stone-edge-chip-") >= 50 && countPrefix("stone-wet-edge-highlight-") >= 45 && countPrefix("stone-mineral-vein-") >= 40,
        bambooFoliage: countPrefix("bamboo-leaf-blade-") >= 90,
        bambooCanopyDepth: countPrefix("bamboo-canopy-cluster-") >= 12 && countPrefix("bamboo-leaf-shadow-") >= 10 && countPrefix("bamboo-crown-mist-") >= 6,
        bambooGroundDetail: countPrefix("bamboo-root-runner-") >= 48 && countPrefix("bamboo-base-shadow-") >= 24 && countPrefix("bamboo-fallen-leaf-") >= 48,
        anchoredOrganicMotion: anchoredOrganicMotionCount >= 130,
        portalSurface: names.includes("portal-membrane-surface") && countPrefix("portal-membrane-ripple-") >= 4,
        spatialAtmosphere: countPrefix("depth-mist-plane-") >= 6,
        farDepthArchitecture: countPrefix("far-depth-silhouette-") >= 7 && countPrefix("far-horizon-arc-") >= 5 && countPrefix("far-parallax-depth-plane-") >= 6,
        navigationDepth: names.includes("route-left-boundary-thread") && names.includes("route-right-boundary-thread") && countPrefix("route-threshold-slab-") >= 6 && countPrefix("route-guard-post-") >= 12,
        navigationEmbodiment: countPrefix("route-step-response-ring-") >= 6 && countPrefix("route-motion-trace-") >= 6 && countPrefix("route-flow-streak-") >= 10,
        routeSpatialLandmarks: countPrefix("route-depth-frame-") >= 6 && countPrefix("route-horizon-beacon-") >= 6 && countPrefix("route-occlusion-veil-") >= 5,
        aerialNavigationVolume: names.includes("flight-ceiling-probe") && countPrefix("aerial-flight-ring-") >= 6 && countPrefix("aerial-altitude-beacon-") >= 6 && countPrefix("aerial-depth-ribbon-") >= 5,
        materialRealism: names.includes("water-depth-gradient") && countPrefix("stone-grain-line-") >= 55 && countPrefix("bamboo-highlight-ridge-") >= 24 && countPrefix("portal-light-volume-") >= 5,
        proceduralMaterialTexture: names.includes("procedural-water-bump-texture") && names.includes("procedural-stone-bump-texture") && names.includes("procedural-bamboo-bump-texture"),
        walkPhysics: names.includes("route-ground-contact-probe") && countPrefix("route-collision-volume-") >= 8,
        lightingRealism: countPrefix("contact-shadow-patch-") >= 40 && countPrefix("water-reflection-streak-") >= 10 && countPrefix("moonlight-beam-volume-") >= 4,
        natureRealism: countPrefix("shore-reed-stem-") >= 36 && countPrefix("moss-tuft-clump-") >= 18 && countPrefix("fern-frond-blade-") >= 24,
        terrainRelief: countPrefix("terrain-bank-berm-") >= 6 && countPrefix("shore-stone-cluster-") >= 14 && countPrefix("route-elevation-cue-") >= 6,
        portalWaterInteraction: countPrefix("portal-water-reflection-") >= 6 && countPrefix("portal-caustic-fan-") >= 5 && countPrefix("bowl-light-column-") >= 3,
        meshyGeneratedAssets: countPrefix("meshy-") >= 1,
        navigableRoute: WALKABLE_PATH_RADIUS >= 13,
        counts: {
          bamboo: bambooStemCount,
          slabs: countPrefix("pillar-") + countPrefix("depth-slab-"),
          sidePlatforms: countPrefix("side-water-island-"),
          portalEchoes: countPrefix("portal-depth-echo-"),
          waterOrbits: countPrefix("water-orbit-line-"),
          beveledBlocks: countPrefix("beveled-stone-block-"),
          goldInlays: countPrefix("stone-gold-inlay-"),
          bambooNodeBands: countPrefix("bamboo-node-band-"),
          portalRibs: countPrefix("portal-rib-spoke-"),
          portalNodes: countPrefix("portal-node-cap-"),
          portalThresholdBlocks: countPrefix("portal-threshold-block-"),
          portalThroatSegments: countPrefix("portal-throat-segment-"),
          portalThresholdInlays: countPrefix("portal-threshold-inlay-"),
          portalEngravingTicks: countPrefix("portal-engraving-tick-"),
          portalInnerLamellas: countPrefix("portal-inner-lamella-"),
          portalGlyphNodes: countPrefix("portal-glyph-node-"),
          bowlRimEngravings: countPrefix("bowl-rim-engraving-"),
          bowlLiquidCaustics: countPrefix("bowl-liquid-caustic-"),
          bowlVaporVeils: countPrefix("bowl-vapor-veil-"),
          waterCaustics: countPrefix("water-caustic-thread-"),
          waterRipples: countPrefix("water-ripple-ring-"),
          waterSurfaceGlints: countPrefix("water-surface-glint-"),
          waterDepthMotes: countPrefix("water-depth-mote-"),
          waterCurrentThreads: countPrefix("water-current-thread-"),
          underwaterStones: countPrefix("underwater-stone-"),
          waterDepthShadows: countPrefix("water-depth-shadow-"),
          submergedLeaves: countPrefix("submerged-leaf-"),
          shorelineWetEdges: countPrefix("shoreline-wet-edge-"),
          shorelineRefractionPatches: countPrefix("shoreline-refraction-patch-"),
          stoneWaterContactRings: countPrefix("stone-water-contact-ring-"),
          stoneCracks: countPrefix("stone-crack-line-"),
          mossPatches: countPrefix("stone-moss-patch-"),
          stoneEdgeChips: countPrefix("stone-edge-chip-"),
          stoneWetEdgeHighlights: countPrefix("stone-wet-edge-highlight-"),
          stoneMineralVeins: countPrefix("stone-mineral-vein-"),
          bambooLeaves: countPrefix("bamboo-leaf-blade-"),
          bambooCanopyClusters: countPrefix("bamboo-canopy-cluster-"),
          bambooLeafShadows: countPrefix("bamboo-leaf-shadow-"),
          bambooCrownMists: countPrefix("bamboo-crown-mist-"),
          bambooRootRunners: countPrefix("bamboo-root-runner-"),
          bambooBaseShadows: countPrefix("bamboo-base-shadow-"),
          bambooFallenLeaves: countPrefix("bamboo-fallen-leaf-"),
          anchoredOrganicMotion: anchoredOrganicMotionCount,
          portalMembraneRipples: countPrefix("portal-membrane-ripple-"),
          depthMistPlanes: countPrefix("depth-mist-plane-"),
          farDepthSilhouettes: countPrefix("far-depth-silhouette-"),
          farHorizonArcs: countPrefix("far-horizon-arc-"),
          farParallaxDepthPlanes: countPrefix("far-parallax-depth-plane-"),
          routeThresholds: countPrefix("route-threshold-slab-"),
          routeStepResponseRings: countPrefix("route-step-response-ring-"),
          routeMotionTraces: countPrefix("route-motion-trace-"),
          routeFlowStreaks: countPrefix("route-flow-streak-"),
          routeGuardPosts: countPrefix("route-guard-post-"),
          routeDepthFrames: countPrefix("route-depth-frame-"),
          routeHorizonBeacons: countPrefix("route-horizon-beacon-"),
          routeOcclusionVeils: countPrefix("route-occlusion-veil-"),
          aerialFlightRings: countPrefix("aerial-flight-ring-"),
          aerialAltitudeBeacons: countPrefix("aerial-altitude-beacon-"),
          aerialDepthRibbons: countPrefix("aerial-depth-ribbon-"),
          stoneGrainLines: countPrefix("stone-grain-line-"),
          bambooHighlightRidges: countPrefix("bamboo-highlight-ridge-"),
          portalLightVolumes: countPrefix("portal-light-volume-"),
          proceduralMaterialMarkers: countPrefix("procedural-") ,
          collisionVolumes: countPrefix("route-collision-volume-"),
          contactShadows: countPrefix("contact-shadow-patch-"),
          waterReflectionStreaks: countPrefix("water-reflection-streak-"),
          moonlightBeams: countPrefix("moonlight-beam-volume-"),
          shoreReeds: countPrefix("shore-reed-stem-"),
          mossTufts: countPrefix("moss-tuft-clump-"),
          fernFronds: countPrefix("fern-frond-blade-"),
          terrainBerms: countPrefix("terrain-bank-berm-"),
          shoreStones: countPrefix("shore-stone-cluster-"),
          routeElevationCues: countPrefix("route-elevation-cue-"),
          portalWaterReflections: countPrefix("portal-water-reflection-"),
          portalCausticFans: countPrefix("portal-caustic-fan-"),
          bowlLightColumns: countPrefix("bowl-light-column-"),
          meshyGeneratedAssets: countPrefix("meshy-"),
        }
      });
    };

    const applyCameraRotation = () => {
      camera.rotation.order = "YXZ";
      camera.rotation.y = yawPitch.yaw;
      camera.rotation.x = yawPitch.pitch;
    };
    const stopGuidedRoute = () => {
      guidedRoute.active = false;
      guidedRoute.segment = 0;
      guidedRoute.progress = 0;
    };

    const startGuidedRoute = () => {
      const firstPoint = GUIDED_ROUTE_POINTS[0];
      guidedRoute.active = true;
      guidedRoute.segment = 0;
      guidedRoute.progress = 0;
      velocity.set(0, 0, 0);
      camera.position.copy(toVector3(firstPoint.position));
      yawPitch.yaw = firstPoint.yaw;
      yawPitch.pitch = firstPoint.pitch;
      applyCameraRotation();
    };

    const findNearestWalkablePoint = () => {
      let closestPoint = toVector3(WALKABLE_PATH_POINTS[0]);
      let closestDistanceSq = Infinity;

      for (let index = 0; index < WALKABLE_PATH_POINTS.length - 1; index += 1) {
        const start = toVector3(WALKABLE_PATH_POINTS[index]);
        const end = toVector3(WALKABLE_PATH_POINTS[index + 1]);
        const flatStart = new THREE.Vector3(start.x, 0, start.z);
        const flatEnd = new THREE.Vector3(end.x, 0, end.z);
        const flatCamera = new THREE.Vector3(camera.position.x, 0, camera.position.z);
        const segment = flatEnd.clone().sub(flatStart);
        const lengthSq = segment.lengthSq();
        if (lengthSq === 0) continue;

        const t = clamp(flatCamera.clone().sub(flatStart).dot(segment) / lengthSq, 0, 1);
        const candidate = start.clone().lerp(end, t);
        const flatCandidate = new THREE.Vector3(candidate.x, 0, candidate.z);
        const distanceSq = flatCandidate.distanceToSquared(flatCamera);
        if (distanceSq < closestDistanceSq) {
          closestDistanceSq = distanceSq;
          closestPoint = candidate;
        }
      }

      return { closestPoint, distance: Math.sqrt(closestDistanceSq) };
    };

    const constrainToWalkablePath = () => {
      const { closestPoint, distance } = findNearestWalkablePoint();
      if (distance > WALKABLE_PATH_RADIUS) {
        const sameHeightClosest = new THREE.Vector3(closestPoint.x, camera.position.y, closestPoint.z);
        camera.position.lerp(sameHeightClosest, 0.075);
        velocity.multiplyScalar(0.88);
      }

      const hasVerticalInput = keys.has("Space") || keys.has("ShiftLeft") || keys.has("ShiftRight");
      const flightCeiling = hasVerticalInput || camera.position.y > 4.8 ? 8.8 : 4.8;
      camera.position.y = clamp(camera.position.y, 1.2, flightCeiling);
      mount.dataset.flightEnvelope = `1.20:${flightCeiling.toFixed(2)}`;
    };

    const applyWalkPhysics = (delta: number, movementEnergy: number) => {
      const { closestPoint, distance } = findNearestWalkablePoint();
      const hasVerticalInput = keys.has("Space") || keys.has("ShiftLeft") || keys.has("ShiftRight");
      const groundContact = !guidedRoute.active && !hasVerticalInput && distance < WALKABLE_PATH_RADIUS * 0.72;

      if (groundContact) {
        const groundPull = 1 - Math.pow(0.006, delta);
        camera.position.y += (closestPoint.y - camera.position.y) * groundPull;
      }

      routeCollisionVolumes.forEach((volume) => {
        if (Math.abs(camera.position.y - volume.position.y) > volume.height) return;

        const offset = new THREE.Vector3(camera.position.x - volume.position.x, 0, camera.position.z - volume.position.z);
        const distanceToVolume = offset.length();
        const minDistance = volume.radius + 0.72;
        if (distanceToVolume > 0.001 && distanceToVolume < minDistance) {
          camera.position.addScaledVector(offset.normalize(), (minDistance - distanceToVolume) * 0.42);
          velocity.multiplyScalar(0.82);
        }
      });

      camera.position.x = clamp(camera.position.x, daoSpaceBlueprint.camera.bounds.x[0], daoSpaceBlueprint.camera.bounds.x[1]);
      camera.position.y = clamp(camera.position.y, daoSpaceBlueprint.camera.bounds.y[0], daoSpaceBlueprint.camera.bounds.y[1]);
      camera.position.z = clamp(camera.position.z, daoSpaceBlueprint.camera.bounds.z[0], daoSpaceBlueprint.camera.bounds.z[1]);
      mount.dataset.walkPhysics = `${groundContact ? "ground" : "free"}:${movementEnergy.toFixed(3)}:${routeCollisionVolumes.length}`;
    };

    routeRef.current = startGuidedRoute;
    enterRef.current = () => {
      if (portalOpen) {
        window.location.href = "/inner";
      } else {
        startGuidedRoute();
      }
    };

    resetRef.current = () => {
      stopGuidedRoute();
      camera.position.copy(startPosition);
      velocity.set(0, 0, 0);
      yawPitch.yaw = daoSpaceBlueprint.camera.yaw;
      yawPitch.pitch = daoSpaceBlueprint.camera.pitch;
      applyCameraRotation();
    };

    const textureLoader = new THREE.TextureLoader();
    const gltfLoader = new GLTFLoader();
    const loadTexture = (url: string) => {
      const texture = textureLoader.load(url);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      return texture;
    };
    const tuneGeneratedModel = (object: THREE.Object3D) => {
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => {
            if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
              material.roughness = Math.min(0.98, Math.max(material.roughness, 0.68));
              material.metalness = Math.min(0.72, Math.max(material.metalness, 0.02));
              material.color.lerp(new THREE.Color(0x203b32), 0.08);
              material.needsUpdate = true;
            }
          });
        }
      });
    };
    const loadMeshyGeneratedAssets = async () => {
      try {
        const response = await fetch("/models/meshy/manifest.json", { cache: "no-store" });
        if (!response.ok) return;
        const manifest = (await response.json()) as MeshyManifest;
        const assets = manifest.assets?.filter((asset) => asset.localModel && MESHY_ASSET_PLACEMENTS[asset.slug]) ?? [];

        assets.forEach((asset) => {
          const placement = MESHY_ASSET_PLACEMENTS[asset.slug];
          gltfLoader.load(
            asset.localModel as string,
            (gltf) => {
              const generated = gltf.scene;
              if (sceneDisposed) {
                disposeObject(generated);
                return;
              }

              generated.name = `meshy-${asset.slug}`;
              generated.position.copy(toVector3(placement.position));
              generated.rotation.set(0, placement.rotationY, 0);
              generated.scale.setScalar(placement.scale);
              tuneGeneratedModel(generated);
              model.add(generated);

              if (gltf.animations.length > 0) {
                const mixer = new THREE.AnimationMixer(generated);
                gltf.animations.forEach((clip) => mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play());
                animationMixers.push(mixer);
                generated.userData.availableAnimations = gltf.animations.map((clip) => clip.name);
              }

              writeSceneFeatureDataset();
            },
            undefined,
            (error) => console.error(`Failed to load Meshy asset ${asset.slug}`, error)
          );
        });
      } catch (error) {
        console.error("Failed to load Meshy manifest", error);
      }
    };
    const makeProceduralBumpTexture = (seed: number, repeatX: number, repeatY: number) => {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const context = canvas.getContext("2d");
      if (!context) {
        return null;
      }
      const image = context.createImageData(canvas.width, canvas.height);
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const index = (y * canvas.width + x) * 4;
          const wave = Math.sin((x + seed) * 0.17) * 24 + Math.cos((y - seed) * 0.21) * 18;
          const vein = Math.sin((x * 0.08 + y * 0.13 + seed) * 2.1) * 20;
          const speckle = Math.sin((x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453) * 13;
          const value = clamp(132 + wave + vein + speckle, 42, 236);
          image.data[index] = value;
          image.data[index + 1] = value;
          image.data[index + 2] = value;
          image.data[index + 3] = 255;
        }
      }
      context.putImageData(image, 0, 0);
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return texture;
    };
    const disposeObject = (root: THREE.Object3D) => {
      root.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Sprite || object instanceof THREE.Line) {
          object.geometry?.dispose?.();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => {
            const texturedMaterial = material as THREE.Material & {
              alphaMap?: THREE.Texture | null;
              aoMap?: THREE.Texture | null;
              bumpMap?: THREE.Texture | null;
              displacementMap?: THREE.Texture | null;
              emissiveMap?: THREE.Texture | null;
              map?: THREE.Texture | null;
              metalnessMap?: THREE.Texture | null;
              normalMap?: THREE.Texture | null;
              roughnessMap?: THREE.Texture | null;
            };
            [
              texturedMaterial.map,
              texturedMaterial.alphaMap,
              texturedMaterial.aoMap,
              texturedMaterial.bumpMap,
              texturedMaterial.displacementMap,
              texturedMaterial.emissiveMap,
              texturedMaterial.metalnessMap,
              texturedMaterial.normalMap,
              texturedMaterial.roughnessMap
            ].forEach((texture) => texture?.dispose?.());
            material?.dispose?.();
          });
        }
      });
    };

    const backgroundTexture = loadTexture(daoSpaceBlueprint.sourceImage.url);
    const model = new THREE.Group();
    model.name = "dao-background-detail-model";
    scene.add(model);

    const routeGroundContactProbe = new THREE.Object3D();
    routeGroundContactProbe.name = "route-ground-contact-probe";
    routeGroundContactProbe.position.copy(toVector3(WALKABLE_PATH_POINTS[0]));
    model.add(routeGroundContactProbe);
    const flightCeilingProbe = new THREE.Object3D();
    flightCeilingProbe.name = "flight-ceiling-probe";
    flightCeilingProbe.position.set(0, 8.8, -14);
    model.add(flightCeilingProbe);
    routeCollisionVolumes.forEach((volume) => {
      const marker = new THREE.Object3D();
      marker.name = `route-collision-volume-${volume.id}`;
      marker.position.copy(volume.position);
      model.add(marker);
    });

    const ambient = new THREE.HemisphereLight(0xdff7df, 0x050908, 1.55);
    scene.add(ambient);

    const moon = new THREE.DirectionalLight(0xcfe7d7, 2.95);
    moon.position.set(-9, 18, 9);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    scene.add(moon);

    const goldLight = new THREE.PointLight(0xffcf75, 62, 58, 1.65);
    goldLight.position.set(8, 4.7, -23.5);
    scene.add(goldLight);

    const jadeLight = new THREE.PointLight(0x6ad6a0, 24, 38, 1.85);
    jadeLight.position.set(-9, 2.2, -12);
    scene.add(jadeLight);

    const foregroundTreeLight = new THREE.PointLight(0x7ff0bd, 34, 22, 1.7);
    foregroundTreeLight.position.set(-5.4, 2.8, 4.2);
    scene.add(foregroundTreeLight);

    const foregroundTreeGoldLight = new THREE.PointLight(0xffc878, 18, 16, 1.9);
    foregroundTreeGoldLight.position.set(-6.8, 1.4, 4.8);
    scene.add(foregroundTreeGoldLight);

    const waterBumpTexture = makeProceduralBumpTexture(11, 18, 18);
    const stoneBumpTexture = makeProceduralBumpTexture(29, 9, 9);
    const bambooBumpTexture = makeProceduralBumpTexture(47, 2, 18);
    [
      "procedural-water-bump-texture",
      "procedural-stone-bump-texture",
      "procedural-bamboo-bump-texture"
    ].forEach((name) => {
      const marker = new THREE.Object3D();
      marker.name = name;
      model.add(marker);
    });

    const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x0b1715, metalness: 0.22, roughness: 0.64, bumpMap: stoneBumpTexture ?? undefined, bumpScale: 0.026 });
    const wetStoneMaterial = new THREE.MeshStandardMaterial({ color: 0x101d1a, metalness: 0.38, roughness: 0.36, bumpMap: stoneBumpTexture ?? undefined, bumpScale: 0.018 });
    const jadeGlass = new THREE.MeshPhysicalMaterial({
      color: 0x1c695d,
      metalness: 0.06,
      roughness: 0.18,
      transparent: true,
      opacity: 0.34,
      clearcoat: 0.7
    });
    const goldMaterial = new THREE.MeshStandardMaterial({ color: 0xd8ae5e, emissive: 0x4d3211, emissiveIntensity: 0.36, metalness: 0.72, roughness: 0.22 });
    const goldLineMaterial = new THREE.LineBasicMaterial({ color: 0xd8ae5e, transparent: true, opacity: 0.34 });
    const waterCausticMaterial = new THREE.LineBasicMaterial({ color: 0xf0d99c, transparent: true, opacity: 0.22 });
    const stoneCrackMaterial = new THREE.LineBasicMaterial({ color: 0x050907, transparent: true, opacity: 0.46 });
    const mossPatchMaterial = new THREE.MeshStandardMaterial({ color: 0x2f5237, roughness: 0.94, metalness: 0.02, transparent: true, opacity: 0.42, side: THREE.DoubleSide });
    const portalMembraneMaterial = new THREE.MeshBasicMaterial({ color: 0xf0d99c, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
    const waterDepthMaterial = new THREE.MeshBasicMaterial({ color: 0x153b35, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
    const waterGlintMaterial = new THREE.MeshBasicMaterial({ color: 0xd8ffe9, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const waterDepthMoteMaterial = new THREE.MeshBasicMaterial({ color: 0x8fd9c7, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const waterCurrentMaterial = new THREE.LineBasicMaterial({ color: 0xa9e6d3, transparent: true, opacity: 0.12 });
    const underwaterStoneMaterial = new THREE.MeshStandardMaterial({ color: 0x0c1815, roughness: 0.82, metalness: 0.12, transparent: true, opacity: 0.42, bumpMap: stoneBumpTexture ?? undefined, bumpScale: 0.02 });
    const waterDepthShadowMaterial = new THREE.MeshBasicMaterial({ color: 0x020706, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
    const submergedLeafMaterial = new THREE.MeshBasicMaterial({ color: 0x456c3d, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
    const shorelineWetEdgeMaterial = new THREE.MeshBasicMaterial({ color: 0x9fc6b3, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const shorelineRefractionMaterial = new THREE.MeshBasicMaterial({ color: 0x77c8b0, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const stoneWaterContactMaterial = new THREE.MeshBasicMaterial({ color: 0xf0d99c, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const stoneGrainMaterial = new THREE.LineBasicMaterial({ color: 0x8f7a4f, transparent: true, opacity: 0.16 });
    const stoneChipMaterial = new THREE.MeshStandardMaterial({ color: 0x17221f, roughness: 0.88, metalness: 0.12, bumpMap: stoneBumpTexture ?? undefined, bumpScale: 0.018 });
    const stoneWetEdgeMaterial = new THREE.MeshBasicMaterial({ color: 0x9fc6b3, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const stoneMineralVeinMaterial = new THREE.LineBasicMaterial({ color: 0xc8b77a, transparent: true, opacity: 0.22 });
    const bambooHighlightMaterial = new THREE.MeshBasicMaterial({ color: 0x9acb78, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
    const portalLightVolumeMaterial = new THREE.MeshBasicMaterial({ color: 0xffd68a, transparent: true, opacity: 0.075, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const portalThresholdStoneMaterial = new THREE.MeshStandardMaterial({ color: 0x111b18, emissive: 0x171006, emissiveIntensity: 0.08, metalness: 0.28, roughness: 0.52, bumpMap: stoneBumpTexture ?? undefined, bumpScale: 0.022 });
    const portalThresholdGlowMaterial = new THREE.MeshBasicMaterial({ color: 0xf0d99c, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const portalThroatMaterial = new THREE.MeshBasicMaterial({ color: 0xffd68a, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const bowlEngravingMaterial = new THREE.MeshBasicMaterial({ color: 0xffdfa0, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const bowlLiquidCausticMaterial = new THREE.MeshBasicMaterial({ color: 0xfff0bc, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const bowlVaporMaterial = new THREE.MeshBasicMaterial({ color: 0xf4dfb2, transparent: true, opacity: 0.045, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const portalEngravingMaterial = new THREE.MeshBasicMaterial({ color: 0xffdf95, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const portalInnerLamellaMaterial = new THREE.MeshBasicMaterial({ color: 0xf0d99c, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const portalGlyphNodeMaterial = new THREE.MeshBasicMaterial({ color: 0xffe2a7, transparent: true, opacity: 0.44, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const contactShadowMaterial = new THREE.MeshBasicMaterial({ color: 0x020605, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
    const reflectionStreakMaterial = new THREE.MeshBasicMaterial({ color: 0xf0d99c, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const moonlightBeamMaterial = new THREE.MeshBasicMaterial({ color: 0xbad7c8, transparent: true, opacity: 0.045, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const farSilhouetteMaterial = new THREE.MeshBasicMaterial({ color: 0x0a1412, transparent: true, opacity: 0.36, side: THREE.DoubleSide, depthWrite: false });
    const farHorizonArcMaterial = new THREE.LineBasicMaterial({ color: 0xd8ae5e, transparent: true, opacity: 0.13 });
    const farDepthPlaneMaterial = new THREE.MeshBasicMaterial({ color: 0x9fc6b3, transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const reedMaterial = new THREE.MeshStandardMaterial({ color: 0x486b3d, roughness: 0.84, metalness: 0.03 });
    const reedTipMaterial = new THREE.MeshBasicMaterial({ color: 0xc2a46a, transparent: true, opacity: 0.34, side: THREE.DoubleSide });
    const mossTuftMaterial = new THREE.MeshStandardMaterial({ color: 0x34583a, roughness: 0.96, metalness: 0.01, transparent: true, opacity: 0.62, side: THREE.DoubleSide });
    const fernFrondMaterial = new THREE.MeshBasicMaterial({ color: 0x4f8a55, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false });
    const terrainBermMaterial = new THREE.MeshStandardMaterial({ color: 0x182820, roughness: 0.88, metalness: 0.08, bumpMap: stoneBumpTexture ?? undefined, bumpScale: 0.032 });
    const shoreStoneMaterial = new THREE.MeshStandardMaterial({ color: 0x1a2521, roughness: 0.76, metalness: 0.18, bumpMap: stoneBumpTexture ?? undefined, bumpScale: 0.03 });
    const elevationCueMaterial = new THREE.MeshBasicMaterial({ color: 0xd8ae5e, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
    const portalWaterReflectionMaterial = new THREE.MeshBasicMaterial({ color: 0xffd68a, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const portalCausticFanMaterial = new THREE.MeshBasicMaterial({ color: 0xf0d99c, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const bowlLightColumnMaterial = new THREE.MeshBasicMaterial({ color: 0xffd68a, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const mistMaterial = new THREE.MeshBasicMaterial({ color: 0x9fc6b3, transparent: true, opacity: 0.055, side: THREE.DoubleSide, depthWrite: false });
    const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xf0d99c, transparent: true, opacity: 0.38, side: THREE.DoubleSide });
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x0a1815, metalness: 0.36, roughness: 0.42, bumpMap: stoneBumpTexture ?? undefined, bumpScale: 0.018 });
    const waterMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x0b241f,
      metalness: 0.15,
      roughness: 0.12,
      transparent: true,
      opacity: 0.44,
      clearcoat: 0.8,
      clearcoatRoughness: 0.08,
      bumpMap: waterBumpTexture ?? undefined,
      bumpScale: 0.055
    });

    const materialByName = {
      stone: stoneMaterial,
      wetStone: wetStoneMaterial,
      jade: jadeGlass
    };

    daoSpaceBlueprint.projectionLayers.forEach((layer) => {
      const isRelief = layer.id === "relief-backdrop";
      const material = isRelief
        ? new THREE.MeshStandardMaterial({
            map: backgroundTexture,
            displacementMap: backgroundTexture,
            displacementScale: 1.05,
            color: 0xffffff,
            emissive: 0x07100f,
            emissiveIntensity: 0.12,
            metalness: 0.02,
            roughness: 0.72,
            transparent: true,
            opacity: layer.opacity,
            depthWrite: false
          })
        : new THREE.MeshBasicMaterial({
            map: backgroundTexture,
            transparent: true,
            opacity: layer.opacity,
            depthWrite: false,
            side: THREE.DoubleSide
          });
      const geometry = isRelief ? new THREE.PlaneGeometry(layer.width, layer.height, 128, 72) : makeCroppedPlaneGeometry(layer.width, layer.height, layer.crop);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(toVector3(layer.position));
      mesh.rotation.y = layer.rotationY ?? 0;
      mesh.name = layer.id;
      model.add(mesh);
      parallaxLayers.push(mesh);
      parallaxBaseY.set(mesh, mesh.position.y);
    });

    daoSpaceBlueprint.groundProjections.forEach((projection) => {
      const material = new THREE.MeshBasicMaterial({
        map: backgroundTexture,
        transparent: true,
        opacity: projection.opacity,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(makeCroppedPlaneGeometry(projection.width, projection.depth, projection.crop), material);
      mesh.position.copy(toVector3(projection.position));
      mesh.rotation.x = -Math.PI / 2;
      mesh.name = projection.id;
      model.add(mesh);
    });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160, 1, 1), floorMaterial);
    floor.name = "dao-stone-floor";
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.28;
    floor.receiveShadow = true;
    model.add(floor);

    const water = new THREE.Mesh(new THREE.PlaneGeometry(160, 160, 56, 56), waterMaterial);
    water.name = "dao-water-plane";
    water.rotation.x = -Math.PI / 2;
    water.position.y = -1.16;
    model.add(water);

    const waterDepthGradient = new THREE.Mesh(new THREE.PlaneGeometry(72, 54, 1, 1), waterDepthMaterial);
    waterDepthGradient.name = "water-depth-gradient";
    waterDepthGradient.rotation.x = -Math.PI / 2;
    waterDepthGradient.position.set(-3, -1.075, -16);
    waterDepthGradient.rotation.z = -0.08;
    model.add(waterDepthGradient);

    const waterReflectionStreaks: THREE.Mesh[] = [];
    for (let streakIndex = 0; streakIndex < 10; streakIndex += 1) {
      const streak = new THREE.Mesh(new THREE.PlaneGeometry(0.06 + (streakIndex % 3) * 0.025, 3.2 + streakIndex * 0.42), reflectionStreakMaterial.clone());
      streak.name = `water-reflection-streak-${streakIndex + 1}`;
      streak.position.set(-7.2 + streakIndex * 1.62, -1.03, 6.4 - streakIndex * 3.45);
      streak.rotation.x = -Math.PI / 2;
      streak.rotation.z = -0.08 + (streakIndex % 4) * 0.035;
      model.add(streak);
      waterReflectionStreaks.push(streak);
    }

    const waterCausticLines: THREE.Line[] = [];
    for (let causticIndex = 0; causticIndex < 8; causticIndex += 1) {
      const z = 10 - causticIndex * 5.2;
      const points = Array.from({ length: 64 }, (_, pointIndex) => {
        const x = -24 + pointIndex * 0.76;
        const wave = Math.sin(pointIndex * 0.42 + causticIndex * 0.9) * (0.18 + (causticIndex % 3) * 0.035);
        return new THREE.Vector3(x, -1.045, z + wave);
      });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), waterCausticMaterial.clone());
      line.name = `water-caustic-thread-${causticIndex + 1}`;
      line.userData.baseOpacity = 0.12 + causticIndex * 0.012;
      model.add(line);
      waterCausticLines.push(line);
    }

    const waterRippleRings: THREE.Mesh[] = [];
    ROUTE_GLOW_POINTS.forEach((point, index) => {
      const ripple = new THREE.Mesh(new THREE.TorusGeometry(0.72 + index * 0.18, 0.01, 6, 96), lightMaterial);
      ripple.name = `water-ripple-ring-${index + 1}`;
      ripple.position.copy(toVector3(point.position));
      ripple.position.y = -1.035;
      ripple.rotation.x = -Math.PI / 2;
      ripple.scale.set(1, 0.62 + index * 0.04, 1);
      model.add(ripple);
      waterRippleRings.push(ripple);
    });

    const waterSurfaceGlints: THREE.Mesh[] = [];
    for (let glintIndex = 0; glintIndex < 18; glintIndex += 1) {
      const row = Math.floor(glintIndex / 3);
      const glint = new THREE.Mesh(new THREE.PlaneGeometry(0.035 + (glintIndex % 3) * 0.012, 1.25 + (glintIndex % 5) * 0.24), waterGlintMaterial.clone());
      glint.name = `water-surface-glint-${glintIndex + 1}`;
      glint.position.set(-18 + (glintIndex % 6) * 7.2, -1.026 + glintIndex * 0.0004, 11.5 - row * 5.4);
      glint.rotation.x = -Math.PI / 2;
      glint.rotation.z = -0.18 + (glintIndex % 7) * 0.055;
      glint.userData.baseOpacity = 0.08 + (glintIndex % 4) * 0.014;
      glint.userData.baseScaleY = glint.scale.y;
      glint.renderOrder = 1;
      model.add(glint);
      waterSurfaceGlints.push(glint);
    }

    const waterDepthMotes: THREE.Mesh[] = [];
    for (let moteIndex = 0; moteIndex < 24; moteIndex += 1) {
      const row = Math.floor(moteIndex / 4);
      const mote = new THREE.Mesh(new THREE.CircleGeometry(0.028 + (moteIndex % 4) * 0.006, 12), waterDepthMoteMaterial.clone());
      mote.name = `water-depth-mote-${moteIndex + 1}`;
      mote.position.set(-21 + (moteIndex % 8) * 6.1, -1.048 - (moteIndex % 3) * 0.006, 13.2 - row * 4.2);
      mote.rotation.x = -Math.PI / 2;
      mote.userData.baseY = mote.position.y;
      mote.userData.baseOpacity = 0.045 + (moteIndex % 5) * 0.01;
      mote.renderOrder = 1;
      model.add(mote);
      waterDepthMotes.push(mote);
    }

    const waterCurrentThreads: THREE.Line[] = [];
    for (let currentIndex = 0; currentIndex < 8; currentIndex += 1) {
      const z = 12.5 - currentIndex * 4.7;
      const points = Array.from({ length: 72 }, (_, pointIndex) => {
        const x = -28 + pointIndex * 0.82;
        const wave = Math.sin(pointIndex * 0.25 + currentIndex * 0.7) * (0.08 + (currentIndex % 3) * 0.018);
        return new THREE.Vector3(x, -1.038, z + wave);
      });
      const current = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), waterCurrentMaterial.clone());
      current.name = `water-current-thread-${currentIndex + 1}`;
      current.userData.baseOpacity = 0.055 + currentIndex * 0.007;
      current.userData.baseX = current.position.x;
      model.add(current);
      waterCurrentThreads.push(current);
    }

    const underwaterStones: THREE.Mesh[] = [];
    for (let stoneIndex = 0; stoneIndex < 14; stoneIndex += 1) {
      const side = stoneIndex % 2 === 0 ? -1 : 1;
      const row = Math.floor(stoneIndex / 2);
      const stone = new THREE.Mesh(new RoundedBoxGeometry(0.58 + (stoneIndex % 4) * 0.16, 0.08 + (stoneIndex % 3) * 0.018, 0.42 + (stoneIndex % 5) * 0.09, 2, 0.035), underwaterStoneMaterial.clone());
      stone.name = `underwater-stone-${stoneIndex + 1}`;
      stone.position.set(side * (5.8 + (row % 5) * 3.05), -1.215 + (stoneIndex % 3) * 0.006, 10.4 - row * 4.45);
      stone.rotation.y = side * (0.18 + (stoneIndex % 6) * 0.09);
      stone.rotation.z = side * (0.035 + (stoneIndex % 4) * 0.018);
      stone.userData.baseY = stone.position.y;
      stone.userData.baseRotationZ = stone.rotation.z;
      stone.receiveShadow = true;
      model.add(stone);
      underwaterStones.push(stone);
    }

    const waterDepthShadows: THREE.Mesh[] = [];
    for (let shadowIndex = 0; shadowIndex < 10; shadowIndex += 1) {
      const side = shadowIndex % 2 === 0 ? -1 : 1;
      const row = Math.floor(shadowIndex / 2);
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.4 + (shadowIndex % 4) * 0.22, 28), waterDepthShadowMaterial.clone());
      shadow.name = `water-depth-shadow-${shadowIndex + 1}`;
      shadow.position.set(side * (4.4 + (row % 4) * 4.1), -1.112 + shadowIndex * 0.0005, 11.2 - row * 5.2);
      shadow.rotation.x = -Math.PI / 2;
      shadow.rotation.z = side * (0.24 + shadowIndex * 0.13);
      shadow.scale.set(1.55 + (shadowIndex % 3) * 0.18, 0.48 + (shadowIndex % 4) * 0.07, 1);
      shadow.userData.baseOpacity = 0.075 + (shadowIndex % 4) * 0.012;
      shadow.userData.baseScaleX = shadow.scale.x;
      shadow.userData.baseScaleY = shadow.scale.y;
      shadow.renderOrder = 0;
      model.add(shadow);
      waterDepthShadows.push(shadow);
    }

    const submergedLeaves: THREE.Mesh[] = [];
    for (let leafIndex = 0; leafIndex < 18; leafIndex += 1) {
      const row = Math.floor(leafIndex / 3);
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.32 + (leafIndex % 3) * 0.06, 0.05 + (leafIndex % 2) * 0.012), submergedLeafMaterial.clone());
      leaf.name = `submerged-leaf-${leafIndex + 1}`;
      leaf.position.set(-17.5 + (leafIndex % 6) * 6.6, -1.068 - (leafIndex % 3) * 0.004, 12.4 - row * 4.35);
      leaf.rotation.x = -Math.PI / 2 + Math.sin(leafIndex) * 0.018;
      leaf.rotation.z = -0.36 + leafIndex * 0.41;
      leaf.userData.baseY = leaf.position.y;
      leaf.userData.baseRotationZ = leaf.rotation.z;
      leaf.userData.baseOpacity = 0.12 + (leafIndex % 5) * 0.014;
      leaf.userData.baseX = leaf.position.x;
      leaf.renderOrder = 1;
      model.add(leaf);
      submergedLeaves.push(leaf);
    }

    const depthMistPlanes: THREE.Mesh[] = [];
    for (let mistIndex = 0; mistIndex < 6; mistIndex += 1) {
      const mist = new THREE.Mesh(new THREE.PlaneGeometry(42 + mistIndex * 7, 3.8 + mistIndex * 0.42), mistMaterial.clone());
      mist.name = `depth-mist-plane-${mistIndex + 1}`;
      mist.position.set(-7 + mistIndex * 2.7, 1.35 + mistIndex * 0.16, -10 - mistIndex * 7.5);
      mist.rotation.y = 0.08 - mistIndex * 0.025;
      mist.userData.baseX = mist.position.x;
      mist.userData.motionAnchor = "organic";
      mist.renderOrder = -1;
      model.add(mist);
      depthMistPlanes.push(mist);
    }

    const farDepthSilhouettes: THREE.Mesh[] = [];
    for (let index = 0; index < 7; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const silhouette = new THREE.Mesh(new THREE.PlaneGeometry(0.48 + (index % 3) * 0.22, 5.8 + index * 0.72), farSilhouetteMaterial.clone());
      silhouette.name = `far-depth-silhouette-${index + 1}`;
      silhouette.position.set(side * (13.5 + index * 2.35), 1.25 + index * 0.28, -34 - index * 4.8);
      silhouette.rotation.y = side * (0.12 + index * 0.018);
      silhouette.userData.baseY = silhouette.position.y;
      silhouette.userData.baseOpacity = 0.2 + (index % 4) * 0.028;
      silhouette.renderOrder = -3;
      model.add(silhouette);
      farDepthSilhouettes.push(silhouette);
    }

    const farHorizonArcs: THREE.Line[] = [];
    for (let index = 0; index < 5; index += 1) {
      const radius = 18 + index * 5.4;
      const points = new THREE.EllipseCurve(0, 0, radius, radius * 0.42, Math.PI * 0.05, Math.PI * 0.95, false).getPoints(160);
      const geometry = new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(point.x + 2.2, 0.82 + index * 0.34, point.y - 28 - index * 5.2)));
      const arc = new THREE.Line(geometry, farHorizonArcMaterial.clone());
      arc.name = `far-horizon-arc-${index + 1}`;
      arc.userData.baseOpacity = 0.075 + index * 0.012;
      model.add(arc);
      farHorizonArcs.push(arc);
    }

    const farParallaxDepthPlanes: THREE.Mesh[] = [];
    for (let index = 0; index < 6; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(8.2 + index * 0.9, 2.4 + (index % 3) * 0.38), farDepthPlaneMaterial.clone());
      plane.name = `far-parallax-depth-plane-${index + 1}`;
      plane.position.set(side * (7.5 + index * 2.1), 2.1 + index * 0.18, -30 - index * 5.7);
      plane.rotation.y = side * (0.22 + index * 0.028);
      plane.userData.baseY = plane.position.y;
      plane.userData.baseOpacity = 0.024 + index * 0.004;
      plane.renderOrder = -4;
      model.add(plane);
      farParallaxDepthPlanes.push(plane);
    }

    const moonlightBeams: THREE.Mesh[] = [];
    for (let beamIndex = 0; beamIndex < 4; beamIndex += 1) {
      const beam = new THREE.Mesh(new THREE.PlaneGeometry(4.2 + beamIndex * 1.4, 32 + beamIndex * 5), moonlightBeamMaterial.clone());
      beam.name = `moonlight-beam-volume-${beamIndex + 1}`;
      beam.position.set(-16 + beamIndex * 7.6, 6.4 + beamIndex * 0.4, -24 - beamIndex * 5.4);
      beam.rotation.y = 0.18 - beamIndex * 0.045;
      beam.rotation.z = -0.22 + beamIndex * 0.025;
      beam.renderOrder = -2;
      model.add(beam);
      moonlightBeams.push(beam);
    }

    const contactShadowPatches: THREE.Mesh[] = [];
    const contactShadowPoints = [
      ...daoSpaceBlueprint.blocks.map((block, index) => ({ id: block.id, position: block.position, sx: Math.max(0.65, block.size[0] * 0.36), sz: Math.max(0.38, block.size[2] * 0.52), yaw: index * 0.07 })),
      ...ROUTE_GLOW_POINTS.map((point, index) => ({ id: `route-glow-${index + 1}`, position: point.position, sx: 0.7 + index * 0.06, sz: 0.38, yaw: index * 0.2 })),
      ...daoSpaceBlueprint.sprites.map((sprite, index) => ({ id: `artifact-${sprite.id}`, position: sprite.position, sx: sprite.scale * 0.34, sz: sprite.scale * 0.22, yaw: -0.12 + index * 0.08 }))
    ];
    contactShadowPoints.forEach((shadow, index) => {
      const patch = new THREE.Mesh(new THREE.CircleGeometry(1, 28), contactShadowMaterial.clone());
      patch.name = `contact-shadow-patch-${shadow.id}`;
      patch.position.set(shadow.position[0], -1.018 + index * 0.0006, shadow.position[2]);
      patch.rotation.x = -Math.PI / 2;
      patch.rotation.z = shadow.yaw;
      patch.scale.set(shadow.sx, shadow.sz, 1);
      model.add(patch);
      contactShadowPatches.push(patch);
    });

    const shorelinePlants: THREE.Object3D[] = [];
    const reedClusters = [
      { base: [-16.8, -1.02, 4.4] as Vec3, spread: [3.8, 4.2] as const, side: -1 },
      { base: [-13.2, -1.02, -6.8] as Vec3, spread: [3.2, 4.8] as const, side: -1 },
      { base: [15.6, -1.02, -3.8] as Vec3, spread: [3.4, 5.2] as const, side: 1 },
      { base: [14.4, -1.02, -16.4] as Vec3, spread: [2.8, 4.2] as const, side: 1 }
    ] as const;
    reedClusters.forEach((cluster, clusterIndex) => {
      for (let reedIndex = 0; reedIndex < 10; reedIndex += 1) {
        const offsetX = Math.sin(reedIndex * 1.7 + clusterIndex) * cluster.spread[0] * 0.5;
        const offsetZ = Math.cos(reedIndex * 1.13 + clusterIndex * 0.4) * cluster.spread[1] * 0.5;
        const height = 0.78 + (reedIndex % 5) * 0.13;
        const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, height, 7), reedMaterial);
        reed.name = `shore-reed-stem-${clusterIndex + 1}-${reedIndex + 1}`;
        reed.position.set(cluster.base[0] + offsetX, cluster.base[1] + height / 2, cluster.base[2] + offsetZ);
        reed.rotation.z = cluster.side * (0.08 + (reedIndex % 4) * 0.026);
        reed.rotation.x = Math.sin(reedIndex) * 0.045;
        reed.userData.baseRotationZ = reed.rotation.z;
        reed.userData.motionAnchor = "organic";
        model.add(reed);
        shorelinePlants.push(reed);

        const tip = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.34 + (reedIndex % 3) * 0.05), reedTipMaterial.clone());
        tip.name = `shore-reed-tip-${clusterIndex + 1}-${reedIndex + 1}`;
        tip.position.copy(reed.position);
        tip.position.y += height * 0.48;
        tip.rotation.y = reedIndex * 0.6;
        tip.rotation.z = reed.rotation.z + 0.15;
        tip.userData.baseRotationZ = tip.rotation.z;
        tip.userData.motionAnchor = "organic";
        model.add(tip);
        shorelinePlants.push(tip);
      }
    });

    const mossTufts: THREE.Mesh[] = [];
    for (let tuftIndex = 0; tuftIndex < 22; tuftIndex += 1) {
      const side = tuftIndex % 2 === 0 ? -1 : 1;
      const row = Math.floor(tuftIndex / 2);
      const tuft = new THREE.Mesh(new THREE.CircleGeometry(0.22 + (tuftIndex % 4) * 0.04, 16), mossTuftMaterial.clone());
      tuft.name = `moss-tuft-clump-${tuftIndex + 1}`;
      tuft.position.set(side * (8.2 + (row % 5) * 1.9), -0.96 + tuftIndex * 0.0008, 7.8 - row * 3.4);
      tuft.rotation.x = -Math.PI / 2;
      tuft.rotation.z = tuftIndex * 0.43;
      tuft.scale.set(1.9, 0.72 + (tuftIndex % 3) * 0.15, 1);
      model.add(tuft);
      mossTufts.push(tuft);
    }

    const fernFronds: THREE.Mesh[] = [];
    for (let fernIndex = 0; fernIndex < 28; fernIndex += 1) {
      const side = fernIndex % 2 === 0 ? -1 : 1;
      const row = Math.floor(fernIndex / 2);
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.9 + (fernIndex % 4) * 0.12, 0.16), fernFrondMaterial.clone());
      frond.name = `fern-frond-blade-${fernIndex + 1}`;
      frond.position.set(side * (12.4 + (row % 4) * 1.2), -0.48 + (fernIndex % 3) * 0.03, 4.8 - row * 2.6);
      frond.rotation.y = side * (0.55 + (fernIndex % 4) * 0.12);
      frond.rotation.z = side * (0.2 + (fernIndex % 5) * 0.08);
      frond.rotation.x = -0.12 + (fernIndex % 3) * 0.04;
      frond.userData.baseRotationZ = frond.rotation.z;
      frond.userData.motionAnchor = "organic";
      model.add(frond);
      fernFronds.push(frond);
    }

    const terrainReliefObjects: THREE.Object3D[] = [];
    const bankBerms = [
      { id: "left-near", position: [-17.2, -1.02, 4.2] as Vec3, scale: [4.8, 0.42, 1.25] as Vec3, yaw: 0.34 },
      { id: "left-middle", position: [-14.6, -1.0, -7.8] as Vec3, scale: [4.2, 0.34, 1.05] as Vec3, yaw: -0.18 },
      { id: "left-distant", position: [-10.8, -1.0, -20.4] as Vec3, scale: [3.4, 0.3, 0.95] as Vec3, yaw: 0.28 },
      { id: "right-near", position: [17.4, -1.02, 3.6] as Vec3, scale: [4.5, 0.4, 1.18] as Vec3, yaw: -0.36 },
      { id: "right-middle", position: [15.8, -1.0, -8.6] as Vec3, scale: [4.0, 0.34, 1.05] as Vec3, yaw: 0.2 },
      { id: "right-portal", position: [13.6, -0.96, -19.6] as Vec3, scale: [3.6, 0.3, 0.94] as Vec3, yaw: -0.16 }
    ] as const;
    bankBerms.forEach((berm, index) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 10), terrainBermMaterial.clone());
      mesh.name = `terrain-bank-berm-${berm.id}`;
      mesh.position.copy(toVector3(berm.position));
      mesh.scale.set(berm.scale[0], berm.scale[1], berm.scale[2]);
      mesh.rotation.y = berm.yaw;
      mesh.rotation.z = (index % 2 === 0 ? 1 : -1) * 0.045;
      mesh.userData.baseY = mesh.position.y;
      mesh.userData.motionAnchor = "organic";
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      model.add(mesh);
      terrainReliefObjects.push(mesh);
    });

    const shoreStones: THREE.Mesh[] = [];
    for (let stoneIndex = 0; stoneIndex < 16; stoneIndex += 1) {
      const side = stoneIndex % 2 === 0 ? -1 : 1;
      const row = Math.floor(stoneIndex / 2);
      const stone = new THREE.Mesh(new RoundedBoxGeometry(0.62 + (stoneIndex % 3) * 0.18, 0.22 + (stoneIndex % 4) * 0.035, 0.48 + (stoneIndex % 5) * 0.09, 2, 0.05), shoreStoneMaterial.clone());
      stone.name = `shore-stone-cluster-${stoneIndex + 1}`;
      stone.position.set(side * (10.6 + (row % 4) * 1.35), -0.96 + (stoneIndex % 3) * 0.018, 8.8 - row * 3.65);
      stone.rotation.y = side * (0.25 + (stoneIndex % 5) * 0.11);
      stone.rotation.z = (stoneIndex % 2 === 0 ? 1 : -1) * 0.07;
      stone.userData.baseRotationZ = stone.rotation.z;
      stone.userData.motionAnchor = "organic";
      stone.castShadow = true;
      stone.receiveShadow = true;
      model.add(stone);
      shoreStones.push(stone);
    }

    const shorelineWetEdges: THREE.Mesh[] = [];
    const shorelineEdgeSpecs = [
      { id: "left-near", position: [-15.9, -1.015, 5.4] as Vec3, scale: [4.2, 0.24, 1] as Vec3, yaw: 0.28 },
      { id: "left-mid", position: [-13.4, -1.014, -4.2] as Vec3, scale: [3.7, 0.2, 1] as Vec3, yaw: -0.18 },
      { id: "left-far", position: [-10.2, -1.013, -16.4] as Vec3, scale: [3.0, 0.18, 1] as Vec3, yaw: 0.22 },
      { id: "right-near", position: [16.2, -1.015, 4.6] as Vec3, scale: [4.0, 0.22, 1] as Vec3, yaw: -0.3 },
      { id: "right-mid", position: [14.4, -1.014, -7.2] as Vec3, scale: [3.5, 0.2, 1] as Vec3, yaw: 0.18 },
      { id: "right-far", position: [13.2, -1.013, -18.4] as Vec3, scale: [3.1, 0.18, 1] as Vec3, yaw: -0.16 },
      { id: "portal-left", position: [4.6, -1.012, -21.0] as Vec3, scale: [2.6, 0.16, 1] as Vec3, yaw: 0.42 },
      { id: "portal-right", position: [11.4, -1.012, -21.6] as Vec3, scale: [2.6, 0.16, 1] as Vec3, yaw: -0.38 }
    ] as const;
    shorelineEdgeSpecs.forEach((edge, index) => {
      const wetEdge = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shorelineWetEdgeMaterial.clone());
      wetEdge.name = `shoreline-wet-edge-${edge.id}`;
      wetEdge.position.copy(toVector3(edge.position));
      wetEdge.rotation.x = -Math.PI / 2;
      wetEdge.rotation.z = edge.yaw;
      wetEdge.scale.set(edge.scale[0], edge.scale[1], edge.scale[2]);
      wetEdge.userData.baseOpacity = 0.07 + index * 0.004;
      wetEdge.userData.baseScaleX = edge.scale[0];
      model.add(wetEdge);
      shorelineWetEdges.push(wetEdge);
    });

    const shorelineRefractionPatches: THREE.Mesh[] = [];
    for (let patchIndex = 0; patchIndex < 8; patchIndex += 1) {
      const side = patchIndex % 2 === 0 ? -1 : 1;
      const row = Math.floor(patchIndex / 2);
      const patch = new THREE.Mesh(new THREE.CircleGeometry(0.58 + (patchIndex % 3) * 0.1, 28), shorelineRefractionMaterial.clone());
      patch.name = `shoreline-refraction-patch-${patchIndex + 1}`;
      patch.position.set(side * (9.8 + (row % 3) * 1.6), -1.006 + patchIndex * 0.0004, 7.6 - row * 4.1);
      patch.rotation.x = -Math.PI / 2;
      patch.rotation.z = patchIndex * 0.46;
      patch.scale.set(1.8, 0.62 + (patchIndex % 4) * 0.08, 1);
      patch.userData.baseOpacity = 0.045 + patchIndex * 0.003;
      patch.userData.baseScaleX = patch.scale.x;
      model.add(patch);
      shorelineRefractionPatches.push(patch);
    }

    const stoneWaterContactRings: THREE.Mesh[] = [];
    shoreStones.slice(0, 12).forEach((stone, index) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42 + (index % 4) * 0.055, 0.006, 6, 72), stoneWaterContactMaterial.clone());
      ring.name = `stone-water-contact-ring-${index + 1}`;
      ring.position.copy(stone.position);
      ring.position.y = -1.004 + index * 0.0003;
      ring.rotation.x = -Math.PI / 2;
      ring.rotation.z = stone.rotation.y + (index % 2 === 0 ? 0.08 : -0.08);
      ring.scale.set(1.34 + (index % 3) * 0.12, 0.68 + (index % 4) * 0.06, 1);
      ring.userData.baseOpacity = 0.06 + index * 0.003;
      model.add(ring);
      stoneWaterContactRings.push(ring);
    });

    const elevationCues: THREE.Mesh[] = [];
    WALKABLE_PATH_POINTS.forEach((point, index) => {
      const cue = new THREE.Mesh(new THREE.PlaneGeometry(1.4 + index * 0.08, 0.035), elevationCueMaterial.clone());
      cue.name = `route-elevation-cue-${index + 1}`;
      cue.position.copy(toVector3(point));
      cue.position.y -= 0.58;
      cue.rotation.x = -Math.PI / 2;
      cue.rotation.z = -0.08 + index * 0.035;
      model.add(cue);
      elevationCues.push(cue);
    });

    const grid = new THREE.GridHelper(120, 48, 0xd8ae5e, 0x2d6a54);
    grid.position.y = -1.09;
    const gridMaterial = grid.material as THREE.Material | THREE.Material[];
    if (Array.isArray(gridMaterial)) {
      gridMaterial.forEach((material) => {
        material.transparent = true;
        material.opacity = 0.18;
      });
    } else {
      gridMaterial.transparent = true;
      gridMaterial.opacity = 0.18;
    }
    model.add(grid);

    const stoneWetEdgeHighlights: THREE.Mesh[] = [];
    const stoneMineralVeins: THREE.Line[] = [];
    daoSpaceBlueprint.blocks.forEach((block, blockIndex) => {
      const mesh = new THREE.Mesh(makeStoneBlockGeometry(block.size), materialByName[block.material]);
      mesh.position.copy(toVector3(block.position));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = block.id;
      mesh.userData.modeledStone = true;
      model.add(mesh);

      const marker = new THREE.Object3D();
      marker.name = `beveled-stone-block-${block.id}`;
      marker.position.copy(mesh.position);
      model.add(marker);

      if (block.material !== "jade") {
        const crackLength = Math.min(block.size[0] * 0.62, 2.8);
        const crackOffset = ((blockIndex % 5) - 2) * 0.08;
        const crackPoints = [
          new THREE.Vector3(-crackLength / 2, 0, 0),
          new THREE.Vector3(-crackLength * 0.18, 0, 0.08 + crackOffset),
          new THREE.Vector3(crackLength * 0.22, 0, -0.05 - crackOffset * 0.5),
          new THREE.Vector3(crackLength / 2, 0, 0.035)
        ];
        const crack = new THREE.Line(new THREE.BufferGeometry().setFromPoints(crackPoints), stoneCrackMaterial.clone());
        crack.name = `stone-crack-line-${block.id}`;
        crack.position.set(block.position[0], block.position[1] + block.size[1] / 2 + 0.024, block.position[2] + block.size[2] * (0.08 - (blockIndex % 3) * 0.06));
        crack.rotation.y = block.id.startsWith("walkway-step-") ? -0.045 : ((blockIndex % 7) - 3) * 0.035;
        model.add(crack);

        const grainWidth = Math.min(block.size[0] * 0.52, 2.4);
        const grainPoints = [
          new THREE.Vector3(-grainWidth / 2, 0, -0.035),
          new THREE.Vector3(-grainWidth * 0.1, 0, 0.018),
          new THREE.Vector3(grainWidth * 0.24, 0, -0.018),
          new THREE.Vector3(grainWidth / 2, 0, 0.026)
        ];
        const grain = new THREE.Line(new THREE.BufferGeometry().setFromPoints(grainPoints), stoneGrainMaterial.clone());
        grain.name = `stone-grain-line-${block.id}`;
        grain.position.set(block.position[0] + ((blockIndex % 4) - 1.5) * 0.1, block.position[1] + block.size[1] / 2 + 0.032, block.position[2] - block.size[2] * 0.18);
        grain.rotation.y = block.id.startsWith("walkway-step-") ? -0.045 : ((blockIndex % 5) - 2) * 0.05;
        model.add(grain);

        if (blockIndex % 2 === 0 || block.id.startsWith("side-water-island-")) {
          const moss = new THREE.Mesh(new THREE.CircleGeometry(0.18 + (blockIndex % 4) * 0.035, 18), mossPatchMaterial.clone());
          moss.name = `stone-moss-patch-${block.id}`;
          moss.position.set(block.position[0] - block.size[0] * 0.26 + (blockIndex % 3) * 0.16, block.position[1] + block.size[1] / 2 + 0.028, block.position[2] + block.size[2] * 0.24);
          moss.rotation.x = -Math.PI / 2;
          moss.rotation.z = blockIndex * 0.37;
          moss.scale.set(1.7, 0.72 + (blockIndex % 3) * 0.12, 1);
          model.add(moss);
        }
      }

      if (block.material !== "jade" && blockIndex % 3 !== 1) {
        const chipCount = blockIndex % 4 === 0 ? 2 : 1;
        for (let chipIndex = 0; chipIndex < chipCount; chipIndex += 1) {
          const sideX = (blockIndex + chipIndex) % 2 === 0 ? -1 : 1;
          const sideZ = (blockIndex + chipIndex) % 3 === 0 ? -1 : 1;
          const chip = new THREE.Mesh(new THREE.TetrahedronGeometry(0.055 + ((blockIndex + chipIndex) % 3) * 0.012, 0), stoneChipMaterial.clone());
          chip.name = `stone-edge-chip-${block.id}-${chipIndex + 1}`;
          chip.position.set(block.position[0] + sideX * block.size[0] * 0.43, block.position[1] + block.size[1] / 2 + 0.038, block.position[2] + sideZ * block.size[2] * 0.38);
          chip.rotation.set(0.4 + chipIndex * 0.3, blockIndex * 0.17, sideX * 0.58);
          chip.castShadow = true;
          chip.receiveShadow = true;
          model.add(chip);
        }
      }

      if (block.material !== "jade" && (block.id.startsWith("walkway-step-") || block.id.startsWith("platform-") || block.id.startsWith("side-water-island-") || blockIndex % 5 === 0 || blockIndex % 7 === 2)) {
        const wet = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.42, block.size[0] * 0.62), 0.026), stoneWetEdgeMaterial.clone());
        wet.name = `stone-wet-edge-highlight-${block.id}`;
        wet.position.set(block.position[0], block.position[1] + block.size[1] / 2 + 0.035, block.position[2] + block.size[2] * 0.46);
        wet.rotation.x = -Math.PI / 2;
        wet.rotation.z = block.id.startsWith("walkway-step-") ? -0.045 : ((blockIndex % 5) - 2) * 0.04;
        wet.userData.baseOpacity = 0.055 + (blockIndex % 4) * 0.008;
        model.add(wet);
      }

      if (block.material !== "jade" && (blockIndex % 2 === 0 || blockIndex % 5 === 1)) {
        const veinLength = Math.min(block.size[0] * 0.44, 1.7);
        const veinPoints = [
          new THREE.Vector3(-veinLength / 2, 0, -0.018),
          new THREE.Vector3(-veinLength * 0.12, 0, 0.026),
          new THREE.Vector3(veinLength * 0.2, 0, -0.014),
          new THREE.Vector3(veinLength / 2, 0, 0.02)
        ];
        const vein = new THREE.Line(new THREE.BufferGeometry().setFromPoints(veinPoints), stoneMineralVeinMaterial.clone());
        vein.name = `stone-mineral-vein-${block.id}`;
        vein.position.set(block.position[0] + ((blockIndex % 3) - 1) * 0.12, block.position[1] + block.size[1] / 2 + 0.041, block.position[2] + block.size[2] * (0.02 + (blockIndex % 4) * 0.035));
        vein.rotation.y = block.id.startsWith("walkway-step-") ? -0.045 : ((blockIndex % 6) - 3) * 0.045;
        vein.userData.baseOpacity = 0.12 + (blockIndex % 4) * 0.018;
        model.add(vein);
      }

      if (shouldReceiveGoldInlay(block.id)) {
        const inlay = new THREE.Mesh(new THREE.BoxGeometry(block.size[0] * 0.82, 0.012, 0.028), goldMaterial);
        inlay.name = `stone-gold-inlay-${block.id}`;
        inlay.position.set(block.position[0], block.position[1] + block.size[1] / 2 + 0.012, block.position[2] - block.size[2] * 0.36);
        inlay.rotation.y = block.id.startsWith("walkway-step-") ? -0.045 : 0;
        model.add(inlay);
      }
    });

    const bambooMaterial = new THREE.MeshStandardMaterial({ color: 0x1f4f33, roughness: 0.7, metalness: 0.05, bumpMap: bambooBumpTexture ?? undefined, bumpScale: 0.018 });
    const bambooNodeMaterial = new THREE.MeshStandardMaterial({ color: 0x2f6a45, roughness: 0.62, metalness: 0.08, bumpMap: bambooBumpTexture ?? undefined, bumpScale: 0.012 });
    const leafMaterial = new THREE.MeshBasicMaterial({ color: 0x3a7f52, transparent: true, opacity: 0.26, side: THREE.DoubleSide });
    const bambooCanopyMaterial = new THREE.MeshBasicMaterial({ color: 0x4f8a55, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
    const bambooLeafShadowMaterial = new THREE.MeshBasicMaterial({ color: 0x06110d, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
    const bambooCrownMistMaterial = new THREE.MeshBasicMaterial({ color: 0x9fc6b3, transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const bambooRootMaterial = new THREE.MeshStandardMaterial({ color: 0x1a3b28, roughness: 0.9, metalness: 0.04, bumpMap: bambooBumpTexture ?? undefined, bumpScale: 0.018 });
    const bambooBaseShadowMaterial = new THREE.MeshBasicMaterial({ color: 0x030806, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
    const fallenBambooLeafMaterial = new THREE.MeshBasicMaterial({ color: 0x6f8f48, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false });
    const bambooRootRunners: THREE.Mesh[] = [];
    const bambooBaseShadows: THREE.Mesh[] = [];
    const bambooFallenLeaves: THREE.Mesh[] = [];
    daoSpaceBlueprint.bamboo.forEach((bamboo, bambooIndex) => {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(bamboo.radius, bamboo.radius * 1.32, bamboo.height, 12), bambooMaterial);
      stem.position.copy(toVector3(bamboo.position));
      stem.position.y += bamboo.height / 2;
      stem.rotation.z = bamboo.tilt;
      stem.castShadow = true;
      stem.name = bamboo.id;
      model.add(stem);

      const bambooBase = toVector3(bamboo.position);
      const baseShadow = new THREE.Mesh(new THREE.CircleGeometry(0.42 + (bambooIndex % 4) * 0.035, 24), bambooBaseShadowMaterial.clone());
      baseShadow.name = `bamboo-base-shadow-${bamboo.id}`;
      baseShadow.position.set(bambooBase.x + Math.sin(bamboo.tilt) * 0.12, -1.018 + bambooIndex * 0.0002, bambooBase.z);
      baseShadow.rotation.x = -Math.PI / 2;
      baseShadow.rotation.z = bambooIndex * 0.29;
      baseShadow.scale.set(1.45 + (bambooIndex % 3) * 0.16, 0.54 + (bambooIndex % 4) * 0.06, 1);
      baseShadow.userData.baseOpacity = 0.1 + (bambooIndex % 5) * 0.008;
      baseShadow.userData.baseScaleX = baseShadow.scale.x;
      baseShadow.userData.baseScaleY = baseShadow.scale.y;
      model.add(baseShadow);
      bambooBaseShadows.push(baseShadow);

      for (let rootIndex = 0; rootIndex < 2; rootIndex += 1) {
        const rootAngle = bamboo.tilt * 5.5 + bambooIndex * 0.37 + rootIndex * Math.PI;
        const rootLength = 0.52 + ((bambooIndex + rootIndex) % 4) * 0.08;
        const root = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.032, rootLength, 7), bambooRootMaterial.clone());
        root.name = `bamboo-root-runner-${bamboo.id}-${rootIndex + 1}`;
        root.position.set(bambooBase.x + Math.cos(rootAngle) * rootLength * 0.42, -0.982 + rootIndex * 0.006, bambooBase.z + Math.sin(rootAngle) * rootLength * 0.42);
        root.rotation.set(0.06 * Math.sin(bambooIndex + rootIndex), -rootAngle, Math.PI / 2 + bamboo.tilt * 0.4);
        root.userData.baseY = root.position.y;
        root.userData.baseRotationZ = root.rotation.z;
        root.userData.motionAnchor = "organic";
        root.castShadow = true;
        root.receiveShadow = true;
        model.add(root);
        bambooRootRunners.push(root);
      }

      for (let leafIndex = 0; leafIndex < 2; leafIndex += 1) {
        const leafAngle = bambooIndex * 0.51 + leafIndex * 2.2;
        const fallenLeaf = new THREE.Mesh(new THREE.PlaneGeometry(0.38 + (leafIndex % 2) * 0.08, 0.055), fallenBambooLeafMaterial.clone());
        fallenLeaf.name = `bamboo-fallen-leaf-${bamboo.id}-${leafIndex + 1}`;
        fallenLeaf.position.set(bambooBase.x + Math.cos(leafAngle) * (0.34 + leafIndex * 0.18), -0.966 + (bambooIndex % 4) * 0.002, bambooBase.z + Math.sin(leafAngle) * (0.28 + leafIndex * 0.16));
        fallenLeaf.rotation.x = -Math.PI / 2 + 0.035 * Math.sin(bambooIndex);
        fallenLeaf.rotation.z = leafAngle + bamboo.tilt;
        fallenLeaf.userData.baseY = fallenLeaf.position.y;
        fallenLeaf.userData.baseRotationZ = fallenLeaf.rotation.z;
        fallenLeaf.userData.baseOpacity = 0.24 + ((bambooIndex + leafIndex) % 4) * 0.025;
        fallenLeaf.userData.motionAnchor = "organic";
        model.add(fallenLeaf);
        bambooFallenLeaves.push(fallenLeaf);
      }

      const highlight = new THREE.Mesh(new THREE.PlaneGeometry(bamboo.radius * 1.7, bamboo.height * 0.86), bambooHighlightMaterial.clone());
      highlight.name = `bamboo-highlight-ridge-${bamboo.id}`;
      highlight.position.copy(stem.position);
      highlight.position.y += bamboo.height * 0.03;
      highlight.position.x += Math.sin(bamboo.tilt) * 0.08;
      highlight.rotation.y = Math.PI / 2 + bamboo.tilt * 1.4;
      highlight.rotation.z = bamboo.tilt;
      model.add(highlight);

      const nodeCount = Math.max(3, Math.floor(bamboo.height / 1.55));
      for (let nodeIndex = 1; nodeIndex <= nodeCount; nodeIndex += 1) {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(bamboo.radius * 1.42, bamboo.radius * 1.42, 0.035, 12), bambooNodeMaterial);
        band.name = `bamboo-node-band-${bamboo.id}-${nodeIndex}`;
        band.position.copy(toVector3(bamboo.position));
        band.position.y += (bamboo.height / (nodeCount + 1)) * nodeIndex;
        band.position.x += Math.sin(bamboo.tilt) * (nodeIndex / nodeCount) * 0.22;
        band.rotation.z = bamboo.tilt;
        band.castShadow = true;
        model.add(band);
      }

      for (let index = 0; index < 5; index += 1) {
        const leaf = new THREE.Mesh(new THREE.PlaneGeometry(1.15 + index * 0.22, 0.16 + (index % 2) * 0.04), leafMaterial.clone());
        leaf.name = `bamboo-leaf-blade-${bamboo.id}-${index + 1}`;
        leaf.position.set(stem.position.x + Math.sign(bamboo.tilt || 1) * (0.34 + index * 0.11), stem.position.y + bamboo.height * (0.12 + index * 0.062), stem.position.z + index * 0.1);
        leaf.rotation.y = index * 0.72 + bamboo.tilt * 2.2;
        leaf.rotation.z = bamboo.tilt + 0.38 + index * 0.2;
        leaf.rotation.x = Math.sin(index + bamboo.height) * 0.12;
        model.add(leaf);
      }
    });

    const bambooCanopyClusters: THREE.Mesh[] = [];
    for (let index = 0; index < 16; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const layer = Math.floor(index / 2);
      const cluster = new THREE.Mesh(new THREE.PlaneGeometry(3.8 + (index % 4) * 0.42, 0.5 + (index % 3) * 0.12), bambooCanopyMaterial.clone());
      cluster.name = `bamboo-canopy-cluster-${index + 1}`;
      cluster.position.set(side * (14.8 + (layer % 4) * 2.15), 5.2 + (layer % 5) * 0.42, -4.8 - layer * 1.18);
      cluster.rotation.set(-0.18 + (index % 3) * 0.05, side * (0.42 + (index % 4) * 0.12), side * (0.48 + (index % 5) * 0.08));
      cluster.userData.baseY = cluster.position.y;
      cluster.userData.baseRotationZ = cluster.rotation.z;
      cluster.userData.baseOpacity = 0.18 + (index % 5) * 0.012;
      cluster.renderOrder = 2;
      model.add(cluster);
      bambooCanopyClusters.push(cluster);
    }

    const bambooLeafShadows: THREE.Mesh[] = [];
    for (let index = 0; index < 12; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.55 + (index % 4) * 0.22, 28), bambooLeafShadowMaterial.clone());
      shadow.name = `bamboo-leaf-shadow-${index + 1}`;
      shadow.position.set(side * (5.8 + (index % 6) * 1.85), -0.985, -4.2 - Math.floor(index / 2) * 1.36);
      shadow.rotation.x = -Math.PI / 2;
      shadow.rotation.z = side * (0.42 + index * 0.09);
      shadow.scale.set(1.45, 0.34 + (index % 3) * 0.08, 1);
      shadow.userData.baseScaleX = shadow.scale.x;
      shadow.userData.baseScaleY = shadow.scale.y;
      shadow.userData.baseOpacity = 0.11 + (index % 4) * 0.012;
      shadow.renderOrder = 1;
      model.add(shadow);
      bambooLeafShadows.push(shadow);
    }

    const bambooCrownMists: THREE.Mesh[] = [];
    for (let index = 0; index < 6; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const mist = new THREE.Mesh(new THREE.PlaneGeometry(6.4 + index * 0.38, 2.2 + (index % 3) * 0.36), bambooCrownMistMaterial.clone());
      mist.name = `bamboo-crown-mist-${index + 1}`;
      mist.position.set(side * (13.2 + index * 1.25), 3.7 + (index % 3) * 0.46, -7.2 - index * 1.35);
      mist.rotation.set(-0.06, side * (0.48 + index * 0.05), side * 0.08);
      mist.userData.baseY = mist.position.y;
      mist.userData.baseOpacity = 0.026 + index * 0.003;
      mist.renderOrder = 1;
      model.add(mist);
      bambooCrownMists.push(mist);
    }

    const ringGroup = new THREE.Group();
    ringGroup.position.copy(toVector3(daoSpaceBlueprint.portal.center));
    ringGroup.rotation.y = daoSpaceBlueprint.portal.rotationY;
    ringGroup.name = "portal-ring-system";
    model.add(ringGroup);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(daoSpaceBlueprint.portal.outerRadius, 0.06, 16, 180), goldMaterial);
    ringGroup.add(ring);

    const ringInner = new THREE.Mesh(new THREE.TorusGeometry(daoSpaceBlueprint.portal.innerRadius, 0.036, 12, 160), goldMaterial);
    ringGroup.add(ringInner);

    const ringHalo = new THREE.Mesh(new THREE.TorusGeometry(daoSpaceBlueprint.portal.haloRadius, 0.018, 8, 180), lightMaterial);
    ringGroup.add(ringHalo);

    const portalRibs: THREE.Mesh[] = [];
    for (let ribIndex = 0; ribIndex < 16; ribIndex += 1) {
      const angle = (ribIndex / 16) * Math.PI * 2;
      const radialLength = daoSpaceBlueprint.portal.outerRadius - daoSpaceBlueprint.portal.innerRadius + 0.42;
      const radius = daoSpaceBlueprint.portal.innerRadius + radialLength / 2 - 0.1;
      const rib = new THREE.Mesh(new THREE.BoxGeometry(radialLength, 0.022, 0.022), goldMaterial);
      rib.name = `portal-rib-spoke-${ribIndex + 1}`;
      rib.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, -0.08 - (ribIndex % 2) * 0.035);
      rib.rotation.z = angle;
      ringGroup.add(rib);
      portalRibs.push(rib);
    }

    for (let nodeIndex = 0; nodeIndex < 8; nodeIndex += 1) {
      const angle = (nodeIndex / 8) * Math.PI * 2 + Math.PI / 8;
      const node = new THREE.Mesh(new THREE.SphereGeometry(0.085, 18, 10), goldMaterial);
      node.name = `portal-node-cap-${nodeIndex + 1}`;
      node.position.set(Math.cos(angle) * daoSpaceBlueprint.portal.outerRadius, Math.sin(angle) * daoSpaceBlueprint.portal.outerRadius, 0.06);
      ringGroup.add(node);
    }

    const portalEngravingTicks: THREE.Mesh[] = [];
    for (let tickIndex = 0; tickIndex < 48; tickIndex += 1) {
      const angle = (tickIndex / 48) * Math.PI * 2;
      const tickLength = tickIndex % 4 === 0 ? 0.34 : 0.2;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.018, tickLength, 0.014), portalEngravingMaterial.clone());
      tick.name = `portal-engraving-tick-${tickIndex + 1}`;
      tick.position.set(Math.cos(angle) * (daoSpaceBlueprint.portal.outerRadius - 0.18), Math.sin(angle) * (daoSpaceBlueprint.portal.outerRadius - 0.18), 0.13);
      tick.rotation.z = angle;
      tick.userData.baseOpacity = tickIndex % 4 === 0 ? 0.38 : 0.24;
      ringGroup.add(tick);
      portalEngravingTicks.push(tick);
    }

    const portalInnerLamellas: THREE.Mesh[] = [];
    for (let lamellaIndex = 0; lamellaIndex < 16; lamellaIndex += 1) {
      const angle = (lamellaIndex / 16) * Math.PI * 2 + Math.PI / 16;
      const lamella = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.78, 0.018), portalInnerLamellaMaterial.clone());
      lamella.name = `portal-inner-lamella-${lamellaIndex + 1}`;
      lamella.position.set(Math.cos(angle) * daoSpaceBlueprint.portal.innerRadius * 0.58, Math.sin(angle) * daoSpaceBlueprint.portal.innerRadius * 0.48 - 0.08, -0.36 - (lamellaIndex % 4) * 0.045);
      lamella.rotation.z = angle;
      lamella.userData.baseOpacity = 0.11 + (lamellaIndex % 4) * 0.012;
      lamella.userData.baseScaleY = lamella.scale.y;
      ringGroup.add(lamella);
      portalInnerLamellas.push(lamella);
    }

    const portalGlyphNodes: THREE.Mesh[] = [];
    for (let glyphIndex = 0; glyphIndex < 16; glyphIndex += 1) {
      const angle = (glyphIndex / 16) * Math.PI * 2;
      const radius = glyphIndex % 2 === 0 ? daoSpaceBlueprint.portal.innerRadius * 0.92 : daoSpaceBlueprint.portal.outerRadius * 0.86;
      const glyph = new THREE.Mesh(new THREE.SphereGeometry(glyphIndex % 2 === 0 ? 0.034 : 0.046, 12, 8), portalGlyphNodeMaterial.clone());
      glyph.name = `portal-glyph-node-${glyphIndex + 1}`;
      glyph.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.96 - 0.04, 0.18 - (glyphIndex % 3) * 0.045);
      glyph.userData.baseOpacity = 0.34 + (glyphIndex % 4) * 0.035;
      glyph.userData.baseScale = 1;
      ringGroup.add(glyph);
      portalGlyphNodes.push(glyph);
    }

    const portalEchoRings: THREE.Mesh[] = [];
    const ringDepth = new THREE.Mesh(new THREE.TorusGeometry(daoSpaceBlueprint.portal.outerRadius * 0.93, 0.034, 12, 160), goldMaterial);
    ringDepth.position.z = -0.46;
    ringDepth.scale.set(1.02, 0.94, 1);
    ringGroup.add(ringDepth);
    [-1.35, -2.7, -4.15].forEach((depth, index) => {
      const echo = new THREE.Mesh(new THREE.TorusGeometry(daoSpaceBlueprint.portal.outerRadius * (0.86 - index * 0.045), 0.018, 8, 150), goldMaterial);
      echo.position.z = depth;
      echo.scale.set(1 + index * 0.06, 0.9 - index * 0.035, 1);
      echo.name = `portal-depth-echo-${index + 1}`;
      portalEchoRings.push(echo);
      ringGroup.add(echo);
    });

    const verticalAxis = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 14.5), lightMaterial);
    verticalAxis.position.set(0, -0.35, 0.03);
    ringGroup.add(verticalAxis);

    const horizontalAxis = new THREE.Mesh(new THREE.PlaneGeometry(13.5, 0.035), lightMaterial);
    horizontalAxis.position.set(0, 0, 0.03);
    ringGroup.add(horizontalAxis);

    [6.85, 7.75, 8.65].forEach((radius, index) => {
      const points = new THREE.EllipseCurve(0, 0, radius * 1.03, radius * 0.72, Math.PI * 0.08, Math.PI * 1.18, false).getPoints(160);
      const geometry = new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(point.x, point.y - 0.45, -0.62 - index * 0.09)));
      const line = new THREE.Line(geometry, goldLineMaterial);
      line.name = `portal-gold-orbit-${index + 1}`;
      ringGroup.add(line);
    });

    const portalMembrane = new THREE.Mesh(new THREE.CircleGeometry(daoSpaceBlueprint.portal.innerRadius * 0.9, 96), portalMembraneMaterial);
    portalMembrane.name = "portal-membrane-surface";
    portalMembrane.position.z = -0.18;
    ringGroup.add(portalMembrane);

    const portalLightVolumes: THREE.Mesh[] = [];
    for (let volumeIndex = 0; volumeIndex < 5; volumeIndex += 1) {
      const volume = new THREE.Mesh(new THREE.PlaneGeometry(1.2 + volumeIndex * 1.15, 10.8 + volumeIndex * 0.7), portalLightVolumeMaterial.clone());
      volume.name = `portal-light-volume-${volumeIndex + 1}`;
      volume.position.set((volumeIndex - 2) * 0.36, -0.42, -0.28 - volumeIndex * 0.08);
      volume.rotation.z = (volumeIndex - 2) * 0.055;
      ringGroup.add(volume);
      portalLightVolumes.push(volume);
    }

    const portalMembraneRipples: THREE.Mesh[] = [];
    for (let rippleIndex = 0; rippleIndex < 4; rippleIndex += 1) {
      const ripple = new THREE.Mesh(new THREE.TorusGeometry(daoSpaceBlueprint.portal.innerRadius * (0.24 + rippleIndex * 0.16), 0.01, 6, 128), lightMaterial);
      ripple.name = `portal-membrane-ripple-${rippleIndex + 1}`;
      ripple.position.z = -0.14 - rippleIndex * 0.035;
      ripple.scale.set(1, 0.74 + rippleIndex * 0.035, 1);
      ringGroup.add(ripple);
      portalMembraneRipples.push(ripple);
    }

    const portalThroatSegments: THREE.Mesh[] = [];
    for (let segmentIndex = 0; segmentIndex < 5; segmentIndex += 1) {
      const segment = new THREE.Mesh(new THREE.TorusGeometry(daoSpaceBlueprint.portal.innerRadius * (0.82 - segmentIndex * 0.065), 0.018, 8, 132), portalThroatMaterial.clone());
      segment.name = `portal-throat-segment-${segmentIndex + 1}`;
      segment.position.z = -0.72 - segmentIndex * 0.62;
      segment.scale.set(1 + segmentIndex * 0.038, 0.72 - segmentIndex * 0.025, 1);
      ringGroup.add(segment);
      portalThroatSegments.push(segment);
    }

    const portalThresholdBlocks: THREE.Mesh[] = [];
    const portalThresholdInlays: THREE.Mesh[] = [];
    for (let blockIndex = 0; blockIndex < 6; blockIndex += 1) {
      const sideSign = blockIndex % 2 === 0 ? -1 : 1;
      const row = Math.floor(blockIndex / 2);
      const block = new THREE.Mesh(new RoundedBoxGeometry(1.4 - row * 0.12, 0.28 + row * 0.04, 0.72 + row * 0.16, 3, 0.055), portalThresholdStoneMaterial.clone());
      block.name = `portal-threshold-block-${blockIndex + 1}`;
      block.position.copy(toVector3(daoSpaceBlueprint.portal.center));
      block.position.x += sideSign * (1.34 + row * 0.62);
      block.position.y = -0.78 + row * 0.045;
      block.position.z += 1.12 + row * 0.24;
      block.rotation.y = daoSpaceBlueprint.portal.rotationY + sideSign * (0.08 + row * 0.035);
      block.userData.baseY = block.position.y;
      block.castShadow = true;
      block.receiveShadow = true;
      model.add(block);
      portalThresholdBlocks.push(block);

      if (blockIndex < 4) {
        const inlay = new THREE.Mesh(new THREE.PlaneGeometry(0.82 + row * 0.12, 0.035), portalThresholdGlowMaterial.clone());
        inlay.name = `portal-threshold-inlay-${blockIndex + 1}`;
        inlay.position.copy(block.position);
        inlay.position.y += 0.155 + row * 0.022;
        inlay.position.z -= 0.21;
        inlay.rotation.x = -Math.PI / 2;
        inlay.rotation.z = sideSign * 0.12;
        model.add(inlay);
        portalThresholdInlays.push(inlay);
      }
    }
    [14, 22, 31].forEach((radius, index) => {
      const points = new THREE.EllipseCurve(0, 0, radius, radius * 0.44, Math.PI * 0.04, Math.PI * 1.1, false).getPoints(190);
      const geometry = new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(point.x + 1.5, -1.035, point.y - 9 - index * 4)));
      const line = new THREE.Line(geometry, goldLineMaterial);
      line.name = `water-orbit-line-${index + 1}`;
      model.add(line);
    });

    const bowl = new THREE.Mesh(new THREE.SphereGeometry(1.55, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2), goldMaterial);
    bowl.name = "portal-bowl";
    bowl.position.copy(toVector3(daoSpaceBlueprint.bowl.position));
    bowl.scale.set(daoSpaceBlueprint.bowl.scale[0], daoSpaceBlueprint.bowl.scale[1], daoSpaceBlueprint.bowl.scale[2]);
    bowl.rotation.x = Math.PI;
    bowl.castShadow = true;
    model.add(bowl);

    const bowlRim = new THREE.Mesh(new THREE.TorusGeometry(1.56, 0.045, 12, 128), goldMaterial);
    bowlRim.name = "portal-bowl-rim";
    bowlRim.position.copy(toVector3(daoSpaceBlueprint.bowl.position));
    bowlRim.position.y += 0.02;
    bowlRim.rotation.x = -Math.PI / 2;
    bowlRim.scale.set(daoSpaceBlueprint.bowl.scale[0], daoSpaceBlueprint.bowl.scale[2], 1);
    model.add(bowlRim);

    const bowlLiquid = new THREE.Mesh(
      new THREE.CircleGeometry(1.28, 96),
      new THREE.MeshPhysicalMaterial({
        color: 0xf0d99c,
        emissive: 0x4d3211,
        emissiveIntensity: 0.32,
        metalness: 0.38,
        roughness: 0.12,
        transparent: true,
        opacity: 0.52,
        clearcoat: 0.86
      })
    );
    bowlLiquid.name = "portal-bowl-liquid";
    bowlLiquid.position.copy(toVector3(daoSpaceBlueprint.bowl.position));
    bowlLiquid.position.y += 0.18;
    bowlLiquid.rotation.x = -Math.PI / 2;
    bowlLiquid.scale.set(1.35, 1.35, 1);
    model.add(bowlLiquid);

    const bowlCenter = toVector3(daoSpaceBlueprint.bowl.position);
    const bowlRimEngravings: THREE.Mesh[] = [];
    const bowlRimRadiusX = 1.56 * daoSpaceBlueprint.bowl.scale[0];
    const bowlRimRadiusZ = 1.56 * daoSpaceBlueprint.bowl.scale[2];
    for (let engravingIndex = 0; engravingIndex < 20; engravingIndex += 1) {
      const angle = (engravingIndex / 20) * Math.PI * 2;
      const engraving = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.18), bowlEngravingMaterial.clone());
      engraving.name = `bowl-rim-engraving-${engravingIndex + 1}`;
      engraving.position.set(bowlCenter.x + Math.cos(angle) * bowlRimRadiusX, bowlCenter.y + 0.072, bowlCenter.z + Math.sin(angle) * bowlRimRadiusZ);
      engraving.rotation.x = -Math.PI / 2;
      engraving.rotation.z = angle + Math.PI / 2;
      engraving.userData.baseOpacity = 0.2 + (engravingIndex % 5) * 0.018;
      model.add(engraving);
      bowlRimEngravings.push(engraving);
    }

    const bowlLiquidCaustics: THREE.Mesh[] = [];
    for (let causticIndex = 0; causticIndex < 6; causticIndex += 1) {
      const caustic = new THREE.Mesh(new THREE.TorusGeometry(0.38 + causticIndex * 0.135, 0.006, 5, 96), bowlLiquidCausticMaterial.clone());
      caustic.name = `bowl-liquid-caustic-${causticIndex + 1}`;
      caustic.position.copy(bowlCenter);
      caustic.position.y += 0.205 + causticIndex * 0.002;
      caustic.rotation.x = -Math.PI / 2;
      caustic.rotation.z = causticIndex * 0.37;
      caustic.scale.set(1.34, 0.78 + causticIndex * 0.025, 1);
      caustic.userData.baseOpacity = 0.09 + causticIndex * 0.012;
      caustic.userData.baseScaleX = caustic.scale.x;
      caustic.userData.baseScaleY = caustic.scale.y;
      model.add(caustic);
      bowlLiquidCaustics.push(caustic);
    }

    const bowlVaporVeils: THREE.Mesh[] = [];
    for (let vaporIndex = 0; vaporIndex < 5; vaporIndex += 1) {
      const vapor = new THREE.Mesh(new THREE.PlaneGeometry(0.62 + vaporIndex * 0.16, 2.6 + vaporIndex * 0.48), bowlVaporMaterial.clone());
      vapor.name = `bowl-vapor-veil-${vaporIndex + 1}`;
      vapor.position.copy(bowlCenter);
      vapor.position.y += 1.34 + vaporIndex * 0.34;
      vapor.position.x += (vaporIndex - 2) * 0.16;
      vapor.position.z -= 0.12 + vaporIndex * 0.055;
      vapor.rotation.y = daoSpaceBlueprint.portal.rotationY + (vaporIndex - 2) * 0.18;
      vapor.rotation.z = (vaporIndex - 2) * 0.035;
      vapor.userData.baseY = vapor.position.y;
      vapor.userData.baseOpacity = 0.026 + vaporIndex * 0.006;
      vapor.userData.baseScaleY = vapor.scale.y;
      model.add(vapor);
      bowlVaporVeils.push(vapor);
    }

    const disk = new THREE.Mesh(new THREE.CircleGeometry(1.25, 64), new THREE.MeshBasicMaterial({ color: 0xf0d99c, transparent: true, opacity: 0.42, side: THREE.DoubleSide }));
    disk.position.copy(toVector3(daoSpaceBlueprint.bowl.position));
    disk.position.y += 0.3;
    disk.rotation.x = -Math.PI / 2;
    model.add(disk);

    const portalWaterReflections: THREE.Mesh[] = [];
    for (let reflectionIndex = 0; reflectionIndex < 6; reflectionIndex += 1) {
      const reflection = new THREE.Mesh(new THREE.PlaneGeometry(0.12 + reflectionIndex * 0.035, 4.8 + reflectionIndex * 0.72), portalWaterReflectionMaterial.clone());
      reflection.name = `portal-water-reflection-${reflectionIndex + 1}`;
      reflection.position.set(4.8 + reflectionIndex * 1.08, -1.018 + reflectionIndex * 0.001, -15.8 - reflectionIndex * 1.92);
      reflection.rotation.x = -Math.PI / 2;
      reflection.rotation.z = -0.18 + reflectionIndex * 0.055;
      model.add(reflection);
      portalWaterReflections.push(reflection);
    }

    const portalCausticFans: THREE.Mesh[] = [];
    for (let fanIndex = 0; fanIndex < 5; fanIndex += 1) {
      const fan = new THREE.Mesh(new THREE.CircleGeometry(3.1 + fanIndex * 0.62, 48, Math.PI * (0.08 + fanIndex * 0.025), Math.PI * 0.34), portalCausticFanMaterial.clone());
      fan.name = `portal-caustic-fan-${fanIndex + 1}`;
      fan.position.set(7.8 + (fanIndex - 2) * 0.52, -1.012 + fanIndex * 0.001, -19.4 - fanIndex * 1.28);
      fan.rotation.x = -Math.PI / 2;
      fan.rotation.z = -0.36 + fanIndex * 0.12;
      fan.scale.set(1, 0.46 + fanIndex * 0.035, 1);
      model.add(fan);
      portalCausticFans.push(fan);
    }

    const bowlLightColumns: THREE.Mesh[] = [];
    for (let columnIndex = 0; columnIndex < 3; columnIndex += 1) {
      const column = new THREE.Mesh(new THREE.PlaneGeometry(0.46 + columnIndex * 0.18, 6.8 + columnIndex * 0.92), bowlLightColumnMaterial.clone());
      column.name = `bowl-light-column-${columnIndex + 1}`;
      column.position.copy(toVector3(daoSpaceBlueprint.bowl.position));
      column.position.y += 3.2 + columnIndex * 0.38;
      column.position.z -= 0.32 + columnIndex * 0.18;
      column.rotation.y = daoSpaceBlueprint.portal.rotationY + (columnIndex - 1) * 0.22;
      column.rotation.z = (columnIndex - 1) * 0.045;
      model.add(column);
      bowlLightColumns.push(column);
    }

    const routeThreadMaterial = new THREE.MeshBasicMaterial({ color: 0xf0d99c, transparent: true, opacity: 0.42 });
    const routeThreadCurve = new THREE.CatmullRomCurve3(
      WALKABLE_PATH_POINTS.map((point, index) => {
        const vector = toVector3(point);
        vector.y = -0.72 + index * 0.055;
        return vector;
      })
    );
    const routeThread = new THREE.Mesh(new THREE.TubeGeometry(routeThreadCurve, 180, 0.026, 8, false), routeThreadMaterial);
    routeThread.name = "golden-route-thread";
    model.add(routeThread);

    const routeReflectionMaterial = new THREE.LineBasicMaterial({ color: 0xd8ae5e, transparent: true, opacity: 0.2 });
    const routeReflection = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(routeThreadCurve.getPoints(170).map((point) => new THREE.Vector3(point.x, -1.045, point.z))),
      routeReflectionMaterial
    );
    routeReflection.name = "golden-route-reflection";
    model.add(routeReflection);

    const routeBoundaryMaterial = new THREE.LineBasicMaterial({ color: 0xf0d99c, transparent: true, opacity: 0.18 });
    const routeGuardMaterial = new THREE.MeshStandardMaterial({ color: 0xd8ae5e, emissive: 0x4d3211, emissiveIntensity: 0.18, metalness: 0.62, roughness: 0.28 });
    const routeGuardGlowMaterial = new THREE.MeshBasicMaterial({ color: 0xf0d99c, transparent: true, opacity: 0.28 });
    const routeThresholdMaterial = new THREE.MeshStandardMaterial({ color: 0x14231e, metalness: 0.32, roughness: 0.48 });
    const routeStepResponseMaterial = new THREE.MeshBasicMaterial({ color: 0xf0d99c, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const routeMotionTraceMaterial = new THREE.MeshBasicMaterial({ color: 0x9fc6b3, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const routeFlowStreakMaterial = new THREE.MeshBasicMaterial({ color: 0xffd68a, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const routeDepthFrameMaterial = new THREE.MeshStandardMaterial({ color: 0x17241f, emissive: 0x2c1b08, emissiveIntensity: 0.12, metalness: 0.34, roughness: 0.58, bumpMap: stoneBumpTexture ?? undefined, bumpScale: 0.014 });
    const routeHorizonBeaconMaterial = new THREE.MeshBasicMaterial({ color: 0xf0d99c, transparent: true, opacity: 0.34, depthWrite: false, blending: THREE.AdditiveBlending });
    const routeOcclusionVeilMaterial = new THREE.MeshBasicMaterial({ color: 0x9fc6b3, transparent: true, opacity: 0.045, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const aerialFlightRingMaterial = new THREE.MeshBasicMaterial({ color: 0xf0d99c, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const aerialAltitudeBeaconMaterial = new THREE.MeshBasicMaterial({ color: 0x9fc6b3, transparent: true, opacity: 0.24, depthWrite: false, blending: THREE.AdditiveBlending });
    const aerialDepthRibbonMaterial = new THREE.MeshBasicMaterial({ color: 0xbad7c8, transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const routeLeftPoints: THREE.Vector3[] = [];
    const routeRightPoints: THREE.Vector3[] = [];
    const routeGuardGlows: THREE.Mesh[] = [];
    const routeThresholds: THREE.Mesh[] = [];
    const routeStepResponseRings: THREE.Mesh[] = [];
    const routeMotionTraces: THREE.Mesh[] = [];
    const routeFlowStreaks: THREE.Mesh[] = [];
    WALKABLE_PATH_POINTS.forEach((point, index) => {
      const current = toVector3(point);
      const previous = toVector3(WALKABLE_PATH_POINTS[Math.max(0, index - 1)]);
      const next = toVector3(WALKABLE_PATH_POINTS[Math.min(WALKABLE_PATH_POINTS.length - 1, index + 1)]);
      const tangent = next.sub(previous).setY(0).normalize();
      const lateral = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      const base = new THREE.Vector3(current.x, -0.73 + index * 0.03, current.z);
      const left = base.clone().addScaledVector(lateral, 1.18);
      const right = base.clone().addScaledVector(lateral, -1.18);
      routeLeftPoints.push(left.clone().setY(-0.69 + index * 0.03));
      routeRightPoints.push(right.clone().setY(-0.69 + index * 0.03));

      const threshold = new THREE.Mesh(new THREE.BoxGeometry(2.2 + index * 0.08, 0.045, 0.14), routeThresholdMaterial);
      threshold.name = `route-threshold-slab-${index + 1}`;
      threshold.position.copy(base);
      threshold.position.y -= 0.01;
      threshold.rotation.y = Math.atan2(lateral.x, lateral.z);
      threshold.castShadow = true;
      threshold.receiveShadow = true;
      model.add(threshold);
      routeThresholds.push(threshold);

      const stepRing = new THREE.Mesh(new THREE.TorusGeometry(0.78 + index * 0.08, 0.012, 6, 96), routeStepResponseMaterial.clone());
      stepRing.name = `route-step-response-ring-${index + 1}`;
      stepRing.position.copy(base);
      stepRing.position.y += 0.035;
      stepRing.rotation.x = -Math.PI / 2;
      stepRing.scale.set(1, 0.58 + index * 0.035, 1);
      stepRing.userData.baseScaleX = stepRing.scale.x;
      stepRing.userData.baseScaleY = stepRing.scale.y;
      stepRing.userData.baseOpacity = 0.065 + index * 0.006;
      model.add(stepRing);
      routeStepResponseRings.push(stepRing);

      const motionTrace = new THREE.Mesh(new THREE.PlaneGeometry(1.1 + index * 0.14, 0.34 + index * 0.025), routeMotionTraceMaterial.clone());
      motionTrace.name = `route-motion-trace-${index + 1}`;
      motionTrace.position.copy(base);
      motionTrace.position.y += 0.026;
      motionTrace.rotation.x = -Math.PI / 2;
      motionTrace.rotation.z = Math.atan2(tangent.x, tangent.z);
      motionTrace.userData.baseOpacity = 0.04 + index * 0.005;
      motionTrace.userData.baseScaleY = motionTrace.scale.y;
      model.add(motionTrace);
      routeMotionTraces.push(motionTrace);

      if (index < WALKABLE_PATH_POINTS.length - 1) {
        const segmentCenter = current.clone().lerp(toVector3(WALKABLE_PATH_POINTS[index + 1]), 0.5);
        [-1, 1].forEach((sideSign, sideIndex) => {
          const streak = new THREE.Mesh(new THREE.PlaneGeometry(0.038, 1.1 + index * 0.16), routeFlowStreakMaterial.clone());
          streak.name = `route-flow-streak-${index + 1}-${sideIndex + 1}`;
          streak.position.copy(segmentCenter).addScaledVector(lateral, sideSign * (0.58 + index * 0.035));
          streak.position.y = -0.63 + index * 0.038;
          streak.rotation.x = -Math.PI / 2;
          streak.rotation.z = Math.atan2(tangent.x, tangent.z) + sideSign * 0.08;
          streak.userData.baseOpacity = 0.055 + index * 0.008;
          streak.userData.baseScaleY = streak.scale.y;
          model.add(streak);
          routeFlowStreaks.push(streak);
        });
      }

      [left, right].forEach((postPosition, sideIndex) => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.058, 0.62, 12), routeGuardMaterial);
        post.name = `route-guard-post-${sideIndex === 0 ? "left" : "right"}-${index + 1}`;
        post.position.copy(postPosition);
        post.position.y += 0.22;
        post.castShadow = true;
        model.add(post);

        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 10), routeGuardGlowMaterial.clone());
        glow.name = `route-guard-glow-${sideIndex === 0 ? "left" : "right"}-${index + 1}`;
        glow.position.copy(post.position);
        glow.position.y += 0.36;
        model.add(glow);
        routeGuardGlows.push(glow);
      });
    });

    const routeLeftBoundary = new THREE.Line(new THREE.BufferGeometry().setFromPoints(routeLeftPoints), routeBoundaryMaterial.clone());
    routeLeftBoundary.name = "route-left-boundary-thread";
    model.add(routeLeftBoundary);
    const routeRightBoundary = new THREE.Line(new THREE.BufferGeometry().setFromPoints(routeRightPoints), routeBoundaryMaterial.clone());
    routeRightBoundary.name = "route-right-boundary-thread";
    model.add(routeRightBoundary);

    const routeDepthFrames: THREE.Group[] = [];
    const routeHorizonBeacons: THREE.Mesh[] = [];
    const routeOcclusionVeils: THREE.Mesh[] = [];
    const aerialFlightRings: THREE.Mesh[] = [];
    const aerialAltitudeBeacons: THREE.Mesh[] = [];
    const aerialDepthRibbons: THREE.Mesh[] = [];
    WALKABLE_PATH_POINTS.forEach((point, index) => {
      const current = toVector3(point);
      const previous = toVector3(WALKABLE_PATH_POINTS[Math.max(0, index - 1)]);
      const next = toVector3(WALKABLE_PATH_POINTS[Math.min(WALKABLE_PATH_POINTS.length - 1, index + 1)]);
      const tangent = next.clone().sub(previous).setY(0).normalize();
      const lateral = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      const base = new THREE.Vector3(current.x, -0.58 + index * 0.045, current.z);
      const flightRing = new THREE.Mesh(new THREE.TorusGeometry(1.05 + index * 0.08, 0.012, 8, 96), aerialFlightRingMaterial.clone());
      flightRing.name = `aerial-flight-ring-${index + 1}`;
      flightRing.position.copy(current);
      flightRing.position.y = 3.2 + index * 0.48;
      flightRing.position.addScaledVector(lateral, index % 2 === 0 ? 0.28 : -0.28);
      flightRing.rotation.y = Math.atan2(lateral.x, lateral.z);
      flightRing.rotation.x = Math.PI / 2 + (index % 2 === 0 ? 0.08 : -0.08);
      flightRing.userData.baseY = flightRing.position.y;
      model.add(flightRing);
      aerialFlightRings.push(flightRing);

      const altitudeBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.075 + index * 0.01, 20, 10), aerialAltitudeBeaconMaterial.clone());
      altitudeBeacon.name = `aerial-altitude-beacon-${index + 1}`;
      altitudeBeacon.position.copy(current).addScaledVector(lateral, index % 2 === 0 ? 2.05 : -2.05);
      altitudeBeacon.position.y = 4.1 + index * 0.58;
      altitudeBeacon.userData.baseY = altitudeBeacon.position.y;
      model.add(altitudeBeacon);
      aerialAltitudeBeacons.push(altitudeBeacon);

      if (index < WALKABLE_PATH_POINTS.length - 1) {
        const center = current.clone().lerp(toVector3(WALKABLE_PATH_POINTS[index + 1]), 0.5);
        const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(2.6 + index * 0.2, 0.42 + index * 0.04), aerialDepthRibbonMaterial.clone());
        ribbon.name = `aerial-depth-ribbon-${index + 1}`;
        ribbon.position.set(center.x, 3.0 + index * 0.45, center.z);
        ribbon.rotation.y = Math.atan2(lateral.x, lateral.z);
        ribbon.rotation.z = (index % 2 === 0 ? 1 : -1) * 0.18;
        ribbon.userData.baseY = ribbon.position.y;
        model.add(ribbon);
        aerialDepthRibbons.push(ribbon);
      }

      const frame = new THREE.Group();
      frame.name = `route-depth-frame-${index + 1}`;
      frame.position.copy(base);
      frame.rotation.y = Math.atan2(lateral.x, lateral.z);
      frame.userData.baseY = base.y;
      const height = 1.38 + index * 0.14;
      const width = 2.9 + index * 0.12;
      [-1, 1].forEach((sideSign) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.055, height, 0.06), routeDepthFrameMaterial.clone());
        post.position.set(sideSign * width * 0.5, height * 0.5, 0);
        post.castShadow = true;
        post.receiveShadow = true;
        frame.add(post);
      });
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(width + 0.18, 0.055, 0.06), routeDepthFrameMaterial.clone());
      lintel.position.set(0, height + 0.02, 0);
      lintel.castShadow = true;
      lintel.receiveShadow = true;
      frame.add(lintel);
      model.add(frame);
      routeDepthFrames.push(frame);

      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.08 + index * 0.012, 20, 10), routeHorizonBeaconMaterial.clone());
      beacon.name = `route-horizon-beacon-${index + 1}`;
      beacon.position.copy(base).addScaledVector(lateral, index % 2 === 0 ? -1.34 : 1.34);
      beacon.position.y += height + 0.22;
      beacon.userData.baseY = beacon.position.y;
      model.add(beacon);
      routeHorizonBeacons.push(beacon);

      if (index < WALKABLE_PATH_POINTS.length - 1) {
        const nextPoint = toVector3(WALKABLE_PATH_POINTS[index + 1]);
        const center = current.clone().lerp(nextPoint, 0.5);
        const veil = new THREE.Mesh(new THREE.PlaneGeometry(3.4 + index * 0.18, 1.15 + index * 0.09), routeOcclusionVeilMaterial.clone());
        veil.name = `route-occlusion-veil-${index + 1}`;
        veil.position.set(center.x, 0.55 + index * 0.05, center.z);
        veil.rotation.y = Math.atan2(lateral.x, lateral.z);
        veil.userData.baseY = veil.position.y;
        model.add(veil);
        routeOcclusionVeils.push(veil);
      }
    });

    const waypointMaterial = new THREE.MeshBasicMaterial({ color: 0xf0d99c, transparent: true, opacity: 0.24 });
    ROUTE_GLOW_POINTS.forEach((point, index) => {
      const waypoint = new THREE.Mesh(new THREE.SphereGeometry(point.scale, 24, 12), waypointMaterial);
      waypoint.position.copy(toVector3(point.position));
      waypoint.name = `route-waypoint-${index + 1}`;
      model.add(waypoint);

      const waypointLight = new THREE.PointLight(0xf0d99c, point.intensity, 8, 2);
      waypointLight.position.copy(toVector3(point.position));
      waypointLight.position.y += 0.35;
      model.add(waypointLight);
    });

    daoSpaceBlueprint.sprites.forEach((artifact) => {
      const material = new THREE.SpriteMaterial({ map: loadTexture(artifact.url), transparent: true, opacity: artifact.opacity, depthWrite: false });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(toVector3(artifact.position));
      sprite.scale.set(artifact.scale, artifact.scale, 1);
      sprite.name = `artifact-${artifact.id}`;
      model.add(sprite);
    });

    gltfLoader.load(
      ROCK_MOSS_URL,
      (gltf) => {
        const rockSet = gltf.scene;
        if (sceneDisposed) {
          disposeObject(rockSet);
          return;
        }

        rockSet.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = true;
            object.receiveShadow = true;

            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => {
              if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
                material.roughness = Math.min(0.96, Math.max(material.roughness, 0.78));
                material.color.lerp(new THREE.Color(0x294435), 0.12);
                material.needsUpdate = true;
              }
            });
          }
        });

        MOSS_ROCK_PLACEMENTS.forEach((placement) => {
          const rocks = rockSet.clone(true);
          rocks.name = `moss-rock-bank-${placement.id}`;
          rocks.position.copy(toVector3(placement.position));
          rocks.rotation.set(0, placement.rotationY, 0);
          rocks.scale.setScalar(placement.scale);
          model.add(rocks);
        writeSceneFeatureDataset();
        });
      },
      undefined,
      (error) => {
        console.error("Failed to load moss rock asset", error);
      }
    );

    gltfLoader.load(
      ROOT_CLUSTER_URL,
      (gltf) => {
        const rootCluster = gltf.scene;
        if (sceneDisposed) {
          disposeObject(rootCluster);
          return;
        }

        rootCluster.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = true;
            object.receiveShadow = true;

            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => {
              if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
                material.roughness = Math.min(0.98, Math.max(material.roughness, 0.82));
                material.color.lerp(new THREE.Color(0x22362c), 0.16);
                material.needsUpdate = true;
              }
            });
          }
        });

        ROOT_CLUSTER_PLACEMENTS.forEach((placement) => {
          const roots = rootCluster.clone(true);
          roots.name = `root-cluster-bank-${placement.id}`;
          roots.position.copy(toVector3(placement.position));
          roots.rotation.set(0, placement.rotationY, 0);
          roots.scale.setScalar(placement.scale);
          model.add(roots);
        });
      },
      undefined,
      (error) => {
        console.error("Failed to load root cluster asset", error);
      }
    );

    gltfLoader.load(
      BRASS_LANTERN_URL,
      (gltf) => {
        const lantern = gltf.scene;
        if (sceneDisposed) {
          disposeObject(lantern);
          return;
        }

        lantern.name = "brass-diya-route-lantern";
        lantern.position.copy(toVector3(BRASS_LANTERN_PLACEMENT.position));
        lantern.rotation.set(0, BRASS_LANTERN_PLACEMENT.rotationY, 0);
        lantern.scale.setScalar(BRASS_LANTERN_PLACEMENT.scale);
        lantern.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = true;
            object.receiveShadow = true;
          }
        });
        model.add(lantern);

        const lanternLight = new THREE.PointLight(0xffcf75, 18, 12, 1.8);
        lanternLight.position.copy(toVector3(BRASS_LANTERN_PLACEMENT.position));
        lanternLight.position.y += 1.35;
        model.add(lanternLight);
      },
      undefined,
      (error) => {
        console.error("Failed to load brass lantern asset", error);
      }
    );

    const mountDaoTree = (url: string, isVendorAsset: boolean) => {
      gltfLoader.load(
        url,
        (gltf) => {
          const tree = gltf.scene;
          if (sceneDisposed) {
            disposeObject(tree);
            return;
          }

          tree.userData.instanceName = isVendorAsset ? "polyhaven-quiver-tree-02" : "dao-ancient-tree-model";
          tree.position.set(isVendorAsset ? -7.25 : -6.4, -1.18, isVendorAsset ? 3.65 : 4.8);
          tree.rotation.set(0, isVendorAsset ? -0.72 : 0.32, 0);
          tree.scale.setScalar(isVendorAsset ? 4.85 : 1.42);
          tree.traverse((object) => {
            if (object instanceof THREE.Mesh) {
              object.castShadow = true;
              object.receiveShadow = true;

              const materials = Array.isArray(object.material) ? object.material : [object.material];
              materials.forEach((material) => {
                if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
                  material.roughness = Math.min(0.94, Math.max(material.roughness, 0.62));
                  material.metalness = Math.min(material.metalness, 0.02);
                  material.color.lerp(new THREE.Color(0x406653), isVendorAsset ? 0.1 : 0.04);
                  material.needsUpdate = true;
                }
              });
            }
          });
          model.add(tree);
          writeSceneFeatureDataset();
          animatedDaoTrees.push(tree);

          if (gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(tree);
            AUTOPLAY_TREE_ANIMATIONS.forEach(({ name, weight }) => {
              const clip = THREE.AnimationClip.findByName(gltf.animations, name);
              if (!clip) {
                return;
              }

              const action = mixer.clipAction(clip);
              action.enabled = true;
              action.setEffectiveWeight(weight);
              action.setLoop(THREE.LoopRepeat, Infinity);
              action.play();
            });
            tree.userData.availableAnimations = gltf.animations.map((clip) => clip.name);
            animationMixers.push(mixer);
          }
        },
        undefined,
        (error) => {
          console.error(`Failed to load dao tree model from ${url}`, error);
          if (isVendorAsset) {
            mountDaoTree(FALLBACK_TREE_URL, false);
          }
        }
      );
    };

    mountDaoTree(VENDOR_TREE_URL, true);
    void loadMeshyGeneratedAssets();
    writeSceneFeatureDataset();

    const particlePositions = new Float32Array(daoSpaceBlueprint.particles.count * 3);
    for (let i = 0; i < daoSpaceBlueprint.particles.count; i += 1) {
      particlePositions[i * 3] = daoSpaceBlueprint.particles.origin[0] + (Math.random() - 0.5) * daoSpaceBlueprint.particles.spread[0];
      particlePositions[i * 3 + 1] = daoSpaceBlueprint.particles.origin[1] + Math.random() * daoSpaceBlueprint.particles.spread[1];
      particlePositions[i * 3 + 2] = daoSpaceBlueprint.particles.origin[2] - Math.random() * daoSpaceBlueprint.particles.spread[2];
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({ color: 0xf0d99c, size: 0.034, transparent: true, opacity: 0.58, depthWrite: false })
    );
    model.add(particles);

    const onKeyDown = (event: KeyboardEvent) => {
      stopGuidedRoute();
      keys.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.code);
    };
    const onWheel = (event: WheelEvent) => {
      stopGuidedRoute();
      speedBoost = clamp(speedBoost + (event.deltaY < 0 ? 0.18 : -0.18), 0.55, 2.2);
    };
    const onPointerDown = (event: PointerEvent) => {
      stopGuidedRoute();
      pointerActive = true;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerUp = (event: PointerEvent) => {
      pointerActive = false;
      renderer.domElement.releasePointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!pointerActive) {
        return;
      }
      const dx = event.clientX - lastPointerX;
      const dy = event.clientY - lastPointerY;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      yawPitch.yaw -= dx * 0.0027;
      yawPitch.pitch = clamp(yawPitch.pitch - dy * 0.0027, -1.05, 0.85);
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
    renderer.domElement.addEventListener("wheel", onWheel, { passive: true });
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    window.addEventListener("resize", onResize);

    const animate = () => {
      const rawDelta = clock.getDelta();
      const delta = Math.min(rawDelta, 0.04);
      const routeDelta = Math.min(rawDelta, 0.8);
      const elapsed = clock.elapsedTime;
      animationMixers.forEach((mixer) => mixer.update(delta));

      if (guidedRoute.active && guidedRoute.segment < GUIDED_ROUTE_POINTS.length - 1) {
        const current = GUIDED_ROUTE_POINTS[guidedRoute.segment];
        const next = GUIDED_ROUTE_POINTS[guidedRoute.segment + 1];
        guidedRoute.progress += routeDelta * 0.72;
        const t = Math.min(guidedRoute.progress, 1);
        const eased = t * t * (3 - 2 * t);
        camera.position.lerpVectors(toVector3(current.position), toVector3(next.position), eased);
        yawPitch.yaw = current.yaw + (next.yaw - current.yaw) * eased;
        yawPitch.pitch = current.pitch + (next.pitch - current.pitch) * eased;
        velocity.set(0, 0, 0);

        if (guidedRoute.progress >= 1) {
          guidedRoute.segment += 1;
          guidedRoute.progress = 0;
          if (guidedRoute.segment >= GUIDED_ROUTE_POINTS.length - 1) {
            guidedRoute.active = false;
          }
        }
      }

      applyCameraRotation();
      if (cameraBobOffset !== 0) {
        camera.position.y -= cameraBobOffset;
        cameraBobOffset = 0;
      }
      camera.getWorldDirection(direction);
      side.crossVectors(direction, up).normalize();

      const targetVelocity = new THREE.Vector3();
      const pace = 8.5 * speedBoost;
      if (keys.has("KeyW") || keys.has("ArrowUp")) targetVelocity.addScaledVector(direction, pace);
      if (keys.has("KeyS") || keys.has("ArrowDown")) targetVelocity.addScaledVector(direction, -pace);
      if (keys.has("KeyA") || keys.has("ArrowLeft")) targetVelocity.addScaledVector(side, -pace);
      if (keys.has("KeyD") || keys.has("ArrowRight")) targetVelocity.addScaledVector(side, pace);
      if (keys.has("Space")) targetVelocity.y += pace * 0.8;
      if (keys.has("ShiftLeft") || keys.has("ShiftRight")) targetVelocity.y -= pace * 0.8;

      if (!guidedRoute.active && targetVelocity.lengthSq() === 0) {
        targetVelocity.x = Math.sin(elapsed * 0.18) * 0.12;
        targetVelocity.z = -0.24;
      }

      if (!guidedRoute.active) {
        velocity.lerp(targetVelocity, 1 - Math.pow(0.012, delta));
        camera.position.addScaledVector(velocity, delta);
      }
      camera.position.x = clamp(camera.position.x, daoSpaceBlueprint.camera.bounds.x[0], daoSpaceBlueprint.camera.bounds.x[1]);
      camera.position.y = clamp(camera.position.y, daoSpaceBlueprint.camera.bounds.y[0], daoSpaceBlueprint.camera.bounds.y[1]);
      camera.position.z = clamp(camera.position.z, daoSpaceBlueprint.camera.bounds.z[0], daoSpaceBlueprint.camera.bounds.z[1]);
      constrainToWalkablePath();
      const movementEnergy = guidedRoute.active ? 1 : clamp(velocity.length() / (8.5 * speedBoost), 0, 1);
      applyWalkPhysics(delta, movementEnergy);
      routeGroundContactProbe.position.copy(findNearestWalkablePoint().closestPoint);
      locomotionPhase += delta * (2.6 + movementEnergy * 3.4);
      cameraBobOffset = Math.sin(locomotionPhase) * 0.026 * movementEnergy + Math.sin(locomotionPhase * 2.0) * 0.008 * movementEnergy;
      camera.position.y += cameraBobOffset;
      mount.dataset.navigationMotion = movementEnergy.toFixed(3);

      const wavePositions = water.geometry.attributes.position;
      for (let i = 0; i < wavePositions.count; i += 1) {
        const x = wavePositions.getX(i);
        const y = wavePositions.getY(i);
        wavePositions.setZ(i, Math.sin(x * 0.26 + elapsed * 0.65) * 0.035 + Math.cos(y * 0.22 + elapsed * 0.42) * 0.024);
      }
      wavePositions.needsUpdate = true;
      water.rotation.z = Math.sin(elapsed * 0.06) * 0.003;
      if (waterBumpTexture) {
        waterBumpTexture.offset.x = (Math.sin(elapsed * 0.05) * 0.025 + 1) % 1;
        waterBumpTexture.offset.y = (elapsed * 0.018) % 1;
      }
      waterDepthGradient.position.x = -3 + Math.sin(elapsed * 0.08) * 0.36;
      waterDepthMaterial.opacity = 0.09 + Math.sin(elapsed * 0.24) * 0.025;
      waterReflectionStreaks.forEach((streak, index) => {
        const material = streak.material instanceof THREE.MeshBasicMaterial ? streak.material : null;
        if (material) material.opacity = 0.09 + Math.sin(elapsed * 0.58 + index * 0.7) * 0.045;
        streak.scale.y = 1 + Math.sin(elapsed * 0.42 + index) * 0.035;
      });
      waterCausticLines.forEach((line, index) => {
        line.position.x = Math.sin(elapsed * 0.28 + index) * 0.28;
        const material = line.material instanceof THREE.LineBasicMaterial ? line.material : null;
        if (material) material.opacity = line.userData.baseOpacity + Math.sin(elapsed * 0.9 + index * 0.7) * 0.035;
      });
      waterRippleRings.forEach((ripple, index) => {
        const pulse = 1 + Math.sin(elapsed * 0.85 + index * 0.65) * 0.045;
        ripple.scale.x = pulse;
        ripple.scale.y = (0.62 + index * 0.04) * pulse;
      });
      waterSurfaceGlints.forEach((glint, index) => {
        const material = glint.material instanceof THREE.MeshBasicMaterial ? glint.material : null;
        if (material) material.opacity = (glint.userData.baseOpacity as number) + Math.sin(elapsed * 0.74 + index * 0.33) * 0.045;
        glint.scale.y = (glint.userData.baseScaleY as number) * (1 + Math.sin(elapsed * 0.46 + index * 0.27) * 0.18);
      });
      waterDepthMotes.forEach((mote, index) => {
        const material = mote.material instanceof THREE.MeshBasicMaterial ? mote.material : null;
        if (material) material.opacity = (mote.userData.baseOpacity as number) + Math.sin(elapsed * 0.36 + index * 0.49) * 0.02;
        mote.position.y = (mote.userData.baseY as number) + Math.sin(elapsed * 0.24 + index * 0.31) * 0.008;
      });
      waterCurrentThreads.forEach((current, index) => {
        const material = current.material instanceof THREE.LineBasicMaterial ? current.material : null;
        if (material) material.opacity = (current.userData.baseOpacity as number) + Math.sin(elapsed * 0.32 + index * 0.56) * 0.025;
        current.position.x = (current.userData.baseX as number) + Math.sin(elapsed * 0.16 + index * 0.42) * 0.18;
      });
      underwaterStones.forEach((stone, index) => {
        const material = stone.material instanceof THREE.MeshStandardMaterial ? stone.material : null;
        if (material) material.opacity = 0.34 + Math.sin(elapsed * 0.18 + index * 0.41) * 0.035;
        stone.position.y = (stone.userData.baseY as number) + Math.sin(elapsed * 0.1 + index * 0.29) * 0.003;
        stone.rotation.z = (stone.userData.baseRotationZ as number) + Math.sin(elapsed * 0.11 + index * 0.23) * 0.004;
      });
      waterDepthShadows.forEach((shadow, index) => {
        const material = shadow.material instanceof THREE.MeshBasicMaterial ? shadow.material : null;
        if (material) material.opacity = (shadow.userData.baseOpacity as number) + Math.sin(elapsed * 0.22 + index * 0.47) * 0.024;
        shadow.scale.x = (shadow.userData.baseScaleX as number) * (1 + Math.sin(elapsed * 0.18 + index * 0.31) * 0.04);
        shadow.scale.y = (shadow.userData.baseScaleY as number) * (1 + Math.cos(elapsed * 0.16 + index * 0.27) * 0.026);
      });
      submergedLeaves.forEach((leaf, index) => {
        const material = leaf.material instanceof THREE.MeshBasicMaterial ? leaf.material : null;
        if (material) material.opacity = (leaf.userData.baseOpacity as number) + Math.sin(elapsed * 0.3 + index * 0.37) * 0.025;
        leaf.position.x = (leaf.userData.baseX as number) + Math.sin(elapsed * 0.12 + index * 0.28) * 0.045;
        leaf.position.y = (leaf.userData.baseY as number) + Math.sin(elapsed * 0.16 + index * 0.22) * 0.005;
        leaf.rotation.z = (leaf.userData.baseRotationZ as number) + Math.sin(elapsed * 0.2 + index * 0.33) * 0.028;
      });
      shorelineWetEdges.forEach((edge, index) => {
        const material = edge.material instanceof THREE.MeshBasicMaterial ? edge.material : null;
        if (material) material.opacity = edge.userData.baseOpacity + Math.sin(elapsed * 0.42 + index * 0.5) * 0.026;
        edge.scale.x = (edge.userData.baseScaleX as number) + Math.sin(elapsed * 0.18 + index) * 0.018;
      });
      shorelineRefractionPatches.forEach((patch, index) => {
        const material = patch.material instanceof THREE.MeshBasicMaterial ? patch.material : null;
        if (material) material.opacity = patch.userData.baseOpacity + Math.sin(elapsed * 0.58 + index * 0.7) * 0.018;
        const pulse = 1 + Math.sin(elapsed * 0.36 + index * 0.44) * 0.035;
        patch.scale.x = (patch.userData.baseScaleX as number) * pulse;
      });
      stoneWaterContactRings.forEach((ring, index) => {
        const material = ring.material instanceof THREE.MeshBasicMaterial ? ring.material : null;
        if (material) material.opacity = ring.userData.baseOpacity + Math.sin(elapsed * 0.64 + index * 0.52) * 0.026;
        ring.rotation.z += delta * (0.012 + index * 0.001);
      });
      routeGuardGlows.forEach((glow, index) => {
        const material = glow.material instanceof THREE.MeshBasicMaterial ? glow.material : null;
        if (material) material.opacity = 0.18 + Math.sin(elapsed * 1.05 + index * 0.34) * 0.07;
        glow.scale.setScalar(1 + Math.sin(elapsed * 0.9 + index * 0.27) * 0.08);
      });
      routeThresholds.forEach((threshold, index) => {
        threshold.position.y = -0.74 + index * 0.03 + Math.sin(elapsed * 0.5 + index) * 0.004;
      });
      routeStepResponseRings.forEach((ring, index) => {
        const material = ring.material instanceof THREE.MeshBasicMaterial ? ring.material : null;
        const pulse = 1 + movementEnergy * 0.12 + Math.sin(elapsed * 0.72 + index * 0.56) * 0.035;
        if (material) material.opacity = (ring.userData.baseOpacity as number) + movementEnergy * 0.12 + Math.sin(elapsed * 0.48 + index * 0.38) * 0.026;
        ring.scale.x = (ring.userData.baseScaleX as number) * pulse;
        ring.scale.y = (ring.userData.baseScaleY as number) * pulse;
      });
      routeMotionTraces.forEach((trace, index) => {
        const material = trace.material instanceof THREE.MeshBasicMaterial ? trace.material : null;
        if (material) material.opacity = (trace.userData.baseOpacity as number) + movementEnergy * 0.09 + Math.sin(elapsed * 0.34 + index * 0.42) * 0.018;
        trace.scale.y = (trace.userData.baseScaleY as number) * (1 + movementEnergy * 0.18 + Math.sin(elapsed * 0.28 + index * 0.31) * 0.045);
      });
      routeFlowStreaks.forEach((streak, index) => {
        const material = streak.material instanceof THREE.MeshBasicMaterial ? streak.material : null;
        if (material) material.opacity = (streak.userData.baseOpacity as number) + movementEnergy * 0.12 + Math.sin(elapsed * 0.58 + index * 0.27) * 0.026;
        streak.scale.y = (streak.userData.baseScaleY as number) * (1 + movementEnergy * 0.24 + Math.sin(elapsed * 0.42 + index * 0.22) * 0.06);
      });
      routeDepthFrames.forEach((frame, index) => {
        frame.position.y = (frame.userData.baseY as number) + Math.sin(elapsed * 0.26 + index * 0.38) * 0.012;
        frame.scale.y = 1 + Math.sin(elapsed * 0.22 + index * 0.44) * 0.012;
      });
      routeHorizonBeacons.forEach((beacon, index) => {
        const material = beacon.material instanceof THREE.MeshBasicMaterial ? beacon.material : null;
        if (material) material.opacity = 0.22 + Math.sin(elapsed * 0.74 + index * 0.62) * 0.08;
        beacon.position.y = (beacon.userData.baseY as number) + Math.sin(elapsed * 0.5 + index) * 0.035;
        beacon.scale.setScalar(1 + Math.sin(elapsed * 0.68 + index * 0.7) * 0.07);
      });
      routeOcclusionVeils.forEach((veil, index) => {
        const material = veil.material instanceof THREE.MeshBasicMaterial ? veil.material : null;
        if (material) material.opacity = 0.026 + Math.sin(elapsed * 0.32 + index * 0.8) * 0.012;
        veil.position.y = (veil.userData.baseY as number) + Math.sin(elapsed * 0.18 + index) * 0.02;
      });
      aerialFlightRings.forEach((ringObject, index) => {
        const material = ringObject.material instanceof THREE.MeshBasicMaterial ? ringObject.material : null;
        if (material) material.opacity = 0.09 + Math.sin(elapsed * 0.48 + index * 0.65) * 0.035;
        ringObject.position.y = (ringObject.userData.baseY as number) + Math.sin(elapsed * 0.28 + index * 0.5) * 0.055;
        ringObject.rotation.z += delta * (0.018 + index * 0.003);
      });
      aerialAltitudeBeacons.forEach((beacon, index) => {
        const material = beacon.material instanceof THREE.MeshBasicMaterial ? beacon.material : null;
        if (material) material.opacity = 0.16 + Math.sin(elapsed * 0.7 + index * 0.58) * 0.06;
        beacon.position.y = (beacon.userData.baseY as number) + Math.sin(elapsed * 0.44 + index) * 0.075;
        beacon.scale.setScalar(1 + Math.sin(elapsed * 0.62 + index) * 0.08);
      });
      aerialDepthRibbons.forEach((ribbon, index) => {
        const material = ribbon.material instanceof THREE.MeshBasicMaterial ? ribbon.material : null;
        if (material) material.opacity = 0.022 + Math.sin(elapsed * 0.24 + index * 0.8) * 0.01;
        ribbon.position.y = (ribbon.userData.baseY as number) + Math.sin(elapsed * 0.2 + index * 0.7) * 0.04;
      });

      parallaxLayers.forEach((layer, index) => {
        layer.position.y = (parallaxBaseY.get(layer) ?? layer.position.y) + Math.sin(elapsed * 0.22 + index) * 0.035;
      });
      depthMistPlanes.forEach((mist, index) => {
        mist.position.x = (mist.userData.baseX as number) + Math.sin(elapsed * 0.11 + index) * 0.055;
        const material = mist.material instanceof THREE.MeshBasicMaterial ? mist.material : null;
        if (material) material.opacity = 0.04 + Math.sin(elapsed * 0.36 + index * 0.9) * 0.014;
      });
      farDepthSilhouettes.forEach((silhouette, index) => {
        const material = silhouette.material instanceof THREE.MeshBasicMaterial ? silhouette.material : null;
        if (material) material.opacity = (silhouette.userData.baseOpacity as number) + Math.sin(elapsed * 0.16 + index * 0.7) * 0.035;
        silhouette.position.y = (silhouette.userData.baseY as number) + Math.sin(elapsed * 0.12 + index * 0.44) * 0.045;
      });
      farHorizonArcs.forEach((arc, index) => {
        const material = arc.material instanceof THREE.LineBasicMaterial ? arc.material : null;
        if (material) material.opacity = (arc.userData.baseOpacity as number) + Math.sin(elapsed * 0.18 + index * 0.5) * 0.025;
      });
      farParallaxDepthPlanes.forEach((plane, index) => {
        const material = plane.material instanceof THREE.MeshBasicMaterial ? plane.material : null;
        if (material) material.opacity = (plane.userData.baseOpacity as number) + Math.sin(elapsed * 0.14 + index * 0.6) * 0.01;
        plane.position.y = (plane.userData.baseY as number) + Math.sin(elapsed * 0.1 + index * 0.36) * 0.06;
      });
      moonlightBeams.forEach((beam, index) => {
        const material = beam.material instanceof THREE.MeshBasicMaterial ? beam.material : null;
        if (material) material.opacity = 0.032 + Math.sin(elapsed * 0.18 + index * 0.8) * 0.012;
      });
      contactShadowPatches.forEach((patch, index) => {
        const material = patch.material instanceof THREE.MeshBasicMaterial ? patch.material : null;
        if (material) material.opacity = 0.18 + Math.sin(elapsed * 0.22 + index * 0.11) * 0.025;
      });
      shorelinePlants.forEach((plant, index) => {
        plant.rotation.z = (plant.userData.baseRotationZ as number) + Math.sin(elapsed * 0.72 + index * 0.31) * 0.026;
      });
      mossTufts.forEach((tuft, index) => {
        const material = tuft.material instanceof THREE.MeshStandardMaterial ? tuft.material : null;
        if (material) material.opacity = 0.52 + Math.sin(elapsed * 0.28 + index * 0.4) * 0.05;
      });
      stoneWetEdgeHighlights.forEach((edge, index) => {
        const material = edge.material instanceof THREE.MeshBasicMaterial ? edge.material : null;
        if (material) material.opacity = (edge.userData.baseOpacity as number) + Math.sin(elapsed * 0.34 + index * 0.23) * 0.026;
      });
      stoneMineralVeins.forEach((vein, index) => {
        const material = vein.material instanceof THREE.LineBasicMaterial ? vein.material : null;
        if (material) material.opacity = (vein.userData.baseOpacity as number) + Math.sin(elapsed * 0.22 + index * 0.31) * 0.035;
      });
      fernFronds.forEach((frond, index) => {
        frond.rotation.z = (frond.userData.baseRotationZ as number) + Math.sin(elapsed * 0.62 + index * 0.28) * 0.038;
      });
      bambooBaseShadows.forEach((shadow, index) => {
        const material = shadow.material instanceof THREE.MeshBasicMaterial ? shadow.material : null;
        if (material) material.opacity = (shadow.userData.baseOpacity as number) + Math.sin(elapsed * 0.2 + index * 0.27) * 0.018;
        shadow.scale.x = (shadow.userData.baseScaleX as number) * (1 + Math.sin(elapsed * 0.16 + index * 0.2) * 0.025);
        shadow.scale.y = (shadow.userData.baseScaleY as number) * (1 + Math.cos(elapsed * 0.15 + index * 0.23) * 0.018);
      });
      bambooRootRunners.forEach((root, index) => {
        root.position.y = (root.userData.baseY as number) + Math.sin(elapsed * 0.12 + index * 0.19) * 0.0025;
        root.rotation.z = (root.userData.baseRotationZ as number) + Math.sin(elapsed * 0.18 + index * 0.13) * 0.006;
      });
      bambooFallenLeaves.forEach((leaf, index) => {
        const material = leaf.material instanceof THREE.MeshBasicMaterial ? leaf.material : null;
        if (material) material.opacity = (leaf.userData.baseOpacity as number) + Math.sin(elapsed * 0.24 + index * 0.31) * 0.025;
        leaf.position.y = (leaf.userData.baseY as number) + Math.sin(elapsed * 0.1 + index * 0.17) * 0.003;
        leaf.rotation.z = (leaf.userData.baseRotationZ as number) + Math.sin(elapsed * 0.22 + index * 0.29) * 0.018;
      });
      bambooCanopyClusters.forEach((cluster, index) => {
        const material = cluster.material instanceof THREE.MeshBasicMaterial ? cluster.material : null;
        if (material) material.opacity = (cluster.userData.baseOpacity as number) + Math.sin(elapsed * 0.33 + index * 0.41) * 0.032;
        cluster.position.y = (cluster.userData.baseY as number) + Math.sin(elapsed * 0.26 + index * 0.37) * 0.055;
        cluster.rotation.z = (cluster.userData.baseRotationZ as number) + Math.sin(elapsed * 0.38 + index * 0.29) * 0.032;
      });
      bambooLeafShadows.forEach((shadow, index) => {
        const material = shadow.material instanceof THREE.MeshBasicMaterial ? shadow.material : null;
        if (material) material.opacity = (shadow.userData.baseOpacity as number) + Math.sin(elapsed * 0.31 + index * 0.46) * 0.028;
        shadow.scale.x = (shadow.userData.baseScaleX as number) * (1 + Math.sin(elapsed * 0.24 + index * 0.4) * 0.05);
        shadow.scale.y = (shadow.userData.baseScaleY as number) * (1 + Math.cos(elapsed * 0.2 + index * 0.34) * 0.035);
      });
      bambooCrownMists.forEach((mist, index) => {
        const material = mist.material instanceof THREE.MeshBasicMaterial ? mist.material : null;
        if (material) material.opacity = (mist.userData.baseOpacity as number) + Math.sin(elapsed * 0.18 + index * 0.72) * 0.01;
        mist.position.y = (mist.userData.baseY as number) + Math.sin(elapsed * 0.14 + index * 0.5) * 0.08;
      });
      terrainReliefObjects.forEach((object, index) => {
        object.position.y = (object.userData.baseY as number) + Math.sin(elapsed * 0.18 + index) * 0.012;
      });
      shoreStones.forEach((stone, index) => {
        stone.rotation.z = (stone.userData.baseRotationZ as number) + Math.sin(elapsed * 0.2 + index) * 0.012;
      });
      elevationCues.forEach((cue, index) => {
        const material = cue.material instanceof THREE.MeshBasicMaterial ? cue.material : null;
        if (material) material.opacity = 0.14 + Math.sin(elapsed * 0.42 + index * 0.35) * 0.035;
      });
      portalWaterReflections.forEach((reflection, index) => {
        const material = reflection.material instanceof THREE.MeshBasicMaterial ? reflection.material : null;
        if (material) material.opacity = 0.1 + Math.sin(elapsed * 0.7 + index * 0.58) * 0.045;
        reflection.scale.y = 1 + Math.sin(elapsed * 0.38 + index * 0.62) * 0.075;
        reflection.rotation.z = -0.18 + index * 0.055 + Math.sin(elapsed * 0.22 + index) * 0.012;
      });
      portalCausticFans.forEach((fan, index) => {
        const material = fan.material instanceof THREE.MeshBasicMaterial ? fan.material : null;
        if (material) material.opacity = 0.07 + Math.sin(elapsed * 0.48 + index * 0.72) * 0.03;
        fan.scale.x = 1 + Math.sin(elapsed * 0.34 + index * 0.4) * 0.045;
      });
      bowlLightColumns.forEach((column, index) => {
        const material = column.material instanceof THREE.MeshBasicMaterial ? column.material : null;
        if (material) material.opacity = 0.055 + Math.sin(elapsed * 0.62 + index * 0.84) * 0.024;
        column.scale.y = 1 + Math.sin(elapsed * 0.44 + index) * 0.035;
      });
      bowlRimEngravings.forEach((engraving, index) => {
        const material = engraving.material instanceof THREE.MeshBasicMaterial ? engraving.material : null;
        if (material) material.opacity = (engraving.userData.baseOpacity as number) + Math.sin(elapsed * 0.74 + index * 0.33) * 0.035;
      });
      bowlLiquidCaustics.forEach((caustic, index) => {
        const material = caustic.material instanceof THREE.MeshBasicMaterial ? caustic.material : null;
        const pulse = 1 + Math.sin(elapsed * 0.58 + index * 0.72) * 0.045;
        if (material) material.opacity = (caustic.userData.baseOpacity as number) + Math.sin(elapsed * 0.82 + index * 0.61) * 0.03;
        caustic.rotation.z += delta * (0.025 + index * 0.006);
        caustic.scale.x = (caustic.userData.baseScaleX as number) * pulse;
        caustic.scale.y = (caustic.userData.baseScaleY as number) * (1 + Math.cos(elapsed * 0.5 + index * 0.5) * 0.035);
      });
      bowlVaporVeils.forEach((vapor, index) => {
        const material = vapor.material instanceof THREE.MeshBasicMaterial ? vapor.material : null;
        if (material) material.opacity = (vapor.userData.baseOpacity as number) + Math.sin(elapsed * 0.28 + index * 0.67) * 0.011;
        vapor.position.y = (vapor.userData.baseY as number) + Math.sin(elapsed * 0.2 + index * 0.58) * 0.07;
        vapor.scale.y = (vapor.userData.baseScaleY as number) * (1 + Math.sin(elapsed * 0.18 + index * 0.43) * 0.045);
      });
      const portalDistance = camera.position.distanceTo(PORTAL_FOCUS);
      const portalProximity = clamp(1 - portalDistance / 19, 0, 1);
      ring.scale.setScalar(1 + portalProximity * 0.028);
      ringInner.scale.setScalar(1 + portalProximity * 0.044);
      ringHalo.scale.setScalar(1 + portalProximity * 0.08);
      lightMaterial.opacity = 0.3 + portalProximity * 0.34;
      routeThreadMaterial.opacity = 0.3 + portalProximity * 0.3 + Math.sin(elapsed * 1.35) * 0.04;
      routeReflectionMaterial.opacity = 0.16 + portalProximity * 0.18;
      goldMaterial.emissiveIntensity = 0.28 + portalProximity * 0.58;
      goldLight.intensity = 54 + Math.sin(elapsed * 1.6) * 7 + portalProximity * 34;
      mount.dataset.portalProximity = portalProximity.toFixed(3);
      mount.dataset.cameraPosition = `${camera.position.x.toFixed(2)},${camera.position.y.toFixed(2)},${camera.position.z.toFixed(2)}`;
      const nextPortalReady = portalProximity > 0.52;
      if (portalOpen !== nextPortalReady) {
        portalOpen = nextPortalReady;
        setPortalReady(nextPortalReady);
      }

      ring.rotation.z += delta * (0.08 + portalProximity * 0.06);
      ringInner.rotation.z -= delta * (0.055 + portalProximity * 0.04);
      ringHalo.rotation.z += delta * (0.028 + portalProximity * 0.08);
      portalMembrane.rotation.z -= delta * (0.018 + portalProximity * 0.045);
      portalMembraneMaterial.opacity = 0.08 + portalProximity * 0.16 + Math.sin(elapsed * 0.8) * 0.018;
      portalMembraneRipples.forEach((ripple, index) => {
        const pulse = 1 + Math.sin(elapsed * 0.72 + index * 0.8) * 0.035 + portalProximity * 0.06;
        ripple.scale.x = pulse;
        ripple.scale.y = (0.74 + index * 0.035) * pulse;
      });
      portalLightVolumes.forEach((volume, index) => {
        const material = volume.material instanceof THREE.MeshBasicMaterial ? volume.material : null;
        if (material) material.opacity = 0.045 + portalProximity * 0.08 + Math.sin(elapsed * 0.55 + index) * 0.014;
        volume.scale.y = 1 + Math.sin(elapsed * 0.38 + index * 0.5) * 0.025;
      });
      portalThroatSegments.forEach((segment, index) => {
        const material = segment.material instanceof THREE.MeshBasicMaterial ? segment.material : null;
        if (material) material.opacity = 0.035 + portalProximity * 0.065 + Math.sin(elapsed * 0.5 + index * 0.68) * 0.012;
        segment.rotation.z -= delta * (0.012 + index * 0.008 + portalProximity * 0.026);
        segment.scale.x = 1 + index * 0.038 + portalProximity * 0.025;
      });
      portalThresholdBlocks.forEach((block, index) => {
        block.position.y = (block.userData.baseY as number) + Math.sin(elapsed * 0.22 + index * 0.41) * 0.006;
      });
      portalThresholdInlays.forEach((inlay, index) => {
        const material = inlay.material instanceof THREE.MeshBasicMaterial ? inlay.material : null;
        if (material) material.opacity = 0.16 + portalProximity * 0.16 + Math.sin(elapsed * 0.82 + index * 0.5) * 0.045;
      });
      portalRibs.forEach((rib, index) => {
        rib.scale.x = 1 + Math.sin(elapsed * 0.7 + index * 0.42) * 0.025 + portalProximity * 0.03;
      });
      portalEngravingTicks.forEach((tick, index) => {
        const material = tick.material instanceof THREE.MeshBasicMaterial ? tick.material : null;
        if (material) material.opacity = (tick.userData.baseOpacity as number) + portalProximity * 0.12 + Math.sin(elapsed * 0.9 + index * 0.19) * 0.035;
      });
      portalInnerLamellas.forEach((lamella, index) => {
        const material = lamella.material instanceof THREE.MeshBasicMaterial ? lamella.material : null;
        if (material) material.opacity = (lamella.userData.baseOpacity as number) + portalProximity * 0.12 + Math.sin(elapsed * 0.54 + index * 0.31) * 0.026;
        lamella.scale.y = (lamella.userData.baseScaleY as number) * (1 + portalProximity * 0.08 + Math.sin(elapsed * 0.32 + index * 0.4) * 0.035);
      });
      portalGlyphNodes.forEach((glyph, index) => {
        const material = glyph.material instanceof THREE.MeshBasicMaterial ? glyph.material : null;
        const pulse = 1 + portalProximity * 0.18 + Math.sin(elapsed * 0.82 + index * 0.47) * 0.09;
        if (material) material.opacity = (glyph.userData.baseOpacity as number) + portalProximity * 0.16 + Math.sin(elapsed * 0.68 + index * 0.51) * 0.04;
        glyph.scale.setScalar(pulse);
      });
      bowlLiquid.scale.setScalar(1.35 + Math.sin(elapsed * 1.15) * 0.025 + portalProximity * 0.05);
      portalEchoRings.forEach((echo, index) => {
        echo.rotation.z -= delta * (0.018 + index * 0.012 + portalProximity * 0.04);
      });
      particles.rotation.y += delta * 0.012;
      animatedDaoTrees.forEach((tree, index) => {
        tree.rotation.x = Math.sin(elapsed * 0.31 + index) * 0.006;
        tree.rotation.z = Math.sin(elapsed * 0.55 + index * 0.7) * 0.024;
      });
      goldLight.intensity = 54 + Math.sin(elapsed * 1.6) * 7 + portalProximity * 34;
      foregroundTreeLight.intensity = 28 + Math.sin(elapsed * 1.15) * 8;
      foregroundTreeGoldLight.intensity = 14 + Math.sin(elapsed * 1.55 + 0.8) * 5;

      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };

    setIsReady(true);
    animate();

    return () => {
      sceneDisposed = true;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      animationMixers.forEach((mixer) => mixer.stopAllAction());
      mount.removeChild(renderer.domElement);
      renderer.dispose();
      backgroundTexture.dispose();
      disposeObject(scene);
    };
  }, []);

  return (
    <section className="dao-space" data-portal-ready={portalReady} aria-label="РџСЂРѕСЃС‚СЂР°РЅСЃС‚РІРѕ Р”Р°Рѕ">
      <div className="dao-space__viewport" ref={mountRef} />
      <nav className="dao-space__nav" aria-label="РќР°РІРёРіР°С†РёСЏ РїСЂРѕСЃС‚СЂР°РЅСЃС‚РІР°">
        <Link href="/">РћСЃРЅРѕРІРЅР°СЏ</Link>
        <Link href="/constructor">РљРѕРЅСЃС‚СЂСѓРєС‚РѕСЂ</Link>
        <button onClick={() => routeRef.current?.()} type="button">
          РџСѓС‚СЊ
        </button>
        <button className="dao-space__enter" disabled={!portalReady} onClick={() => enterRef.current?.()} type="button">
          Р’РѕР№С‚Рё
        </button>
        <button onClick={() => resetRef.current?.()} type="button">
          РЎР±СЂРѕСЃ
        </button>
      </nav>
      <div className="dao-space__sigil" aria-hidden="true" />
      <div className="dao-space__status" data-ready={isReady} data-portal-ready={portalReady} aria-hidden="true" />
    </section>
  );
}


