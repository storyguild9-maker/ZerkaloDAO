"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { councilSeats } from "@/lib/councilHall";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const INNER_BACKDROP_URL = "/images/inner-council/final-inner-space-backdrop.png";
type Vec3 = [number, number, number];

type MeshyManifestAsset = {
  slug: string;
  localModel?: string;
  status?: string;
};

type MeshyManifest = {
  assets?: MeshyManifestAsset[];
};

const INNER_MESHY_SLUGS = {
  table: "82-council-round-marble-gold-table",
  chair: "92-council-chair-v2",
  neutralChair: "83-ornate-council-chair-neutral",
  ceilingCircularMandalaDisk: "89-ceiling-circular-mandala-disk",
  goldFiligreeFloorInlaySet: "90-gold-filigree-floor-inlay-set",
  seatPresenceLightMarker: "91-council-seat-presence-light-marker",
  circularTableWedge: "93-circular-table-wedge",
  gothicGardenArchV2: "94-gothic-garden-arch-v2",
  whiteColumn: "84-white-gold-gothic-column",
  violetColumn: "85-black-gold-violet-crystal-column",
  arch: "86-gothic-gold-arch-window-module",
  stainedGlass: "87-stained-glass-lancet-panel",
  waterfall: "88-marble-gold-side-waterfall-feature",
  ceilingMedallion: "95-ceiling-mandala-medallion-v2",
  lamp: "96-ceremonial-crystal-lamp",
  planter: "97-garden-water-planter",
  columnCapital: "98-white-gold-column-capital",
  columnBase: "99-white-gold-column-base-plinth",
  ceilingRib: "100-ceiling-rib-segment",
  wallRelief: "101-wall-relief-panel",
  floorTile: "102-radial-marble-floor-tile",
  candelabrum: "103-seven-flame-candelabrum",
  crystalObelisk: "104-violet-crystal-obelisk",
  balustrade: "105-gold-marble-balustrade",
  innerPortal: "106-inner-temple-doorway-portal",
  hostThrone: "107-host-council-throne-chair",
  sideFountain: "108-side-fountain-basin",
  chandelier: "109-suspended-chandelier-ring",
  tableSigil: "110-tabletop-council-sigil-disk",
  lectern: "111-ceremonial-lectern-scroll",
  gardenArch: "112-garden-lattice-arch",
  skylight: "113-arched-skylight-window",
  goblet: "114-council-table-goblet",
  seatPlaque: "115-blank-seat-name-plaque",
  wallSconce: "116-wall-sconce-lamp",
  stairStep: "117-marble-stair-step-module",
  waterChannel: "118-marble-water-channel",
  hangingPlanter: "119-hanging-garden-planter",
  jadeOrb: "120-luminous-jade-orb-device",
  displayPedestal: "121-side-display-pedestal",
  wallAlcove: "122-wall-alcove-niche",
  astrolabe: "123-celestial-astrolabe-instrument",
  curtainDrape: "124-ceremonial-curtain-drape",
  floorCompass: "125-floor-compass-medallion",
  incenseBurner: "126-incense-burner-bowl",
  floorVase: "127-ornate-floor-vase-greenery",
  bridgeWalkway: "128-floating-bridge-walkway",
  cornerPlinth: "129-corner-plinth-module",
  balconyRailingCorner: "130-curved-balcony-railing-corner",
  crystalChain: "131-hanging-crystal-chain-cluster",
  councilCodex: "132-closed-council-codex-book",
  chairCushion: "133-emerald-chair-cushion-module",
  gardenStone: "134-mossy-gold-inlay-garden-stone",
  glassPartition: "135-jade-glass-partition-panel",
  ceilingRosette: "136-ceiling-rosette-connector",
  tableMarkers: "137-three-blank-table-markers",
  rootGardenBase: "138-root-stone-garden-base",
  smallFootbridge: "139-small-arched-footbridge",
  reflectiveWaterBowl: "140-reflective-water-bowl",
  gongStand: "141-bronze-gold-gong-stand",
  livingVineArch: "142-living-vine-arch",
  blankBanner: "143-blank-wall-banner",
  sidePylon: "144-illuminated-side-pylon",
  mossyIsland: "145-mossy-water-island-platform",
  artifactSideTable: "146-round-artifact-side-table",
  columnCeilingBrace: "147-column-ceiling-brace",
  floorBorderInlay: "148-curved-floor-border-inlay",
  councilPlaceModule: "149-council-place-module",
  gothicJadeWindow: "150-gothic-jade-window-panel",
  vineCurtain: "151-hanging-vine-curtain",
  waterEndcap: "152-water-channel-endcap-basin",
  lanternCluster: "153-suspended-crystal-lantern-cluster",
  thresholdStep: "154-marble-threshold-step",
  slimPedestal: "155-slim-artifact-pedestal",
  chairCrest: "156-chair-crest-crown",
  sanctuaryBlade: "157-luminous-sanctuary-blade",
  rearGallery: "158-rear-gallery-balcony-module",
  sidePassagePortal: "159-side-arched-passage-portal",
  ceilingCornice: "160-curved-ceiling-cornice-segment",
  floorWaterChannelLong: "161-straight-floor-water-channel",
  sideWalkwaySlab: "162-floating-side-walkway-slab",
  artifactNiche: "163-artifact-display-niche",
  indoorTreePlanter: "164-sacred-indoor-tree-planter",
  floorNodeEmblem: "165-circular-floor-node-emblem",
  seatDaisBase: "166-participant-seat-dais-base",
  wallLightRail: "167-horizontal-luminous-wall-rail",
  mountainRelief: "168-mountain-window-horizon-relief",
  wetFloorEdge: "169-wet-black-marble-floor-edge",
  mistVessel: "170-jade-gold-mist-vessel",
  wallButtress: "171-compact-wall-buttress-support",
  waterPlaneTile: "172-reflective-water-plane-tile",
  ceilingChainSupport: "173-ornate-ceiling-chain-support",
  rootMossCluster: "174-root-moss-wall-cluster",
  sideTransitionFrame: "175-side-transition-frame",
  acousticWallFin: "176-vertical-acoustic-wall-fin",
  compassPlinthMarker: "177-compass-plinth-marker",
  rearLightObelisks: "178-paired-rear-light-obelisks",
  curvedWaterIsland: "179-curved-water-edge-island",
  ceilingDomeCapModule: "180-ceiling-dome-cap-module",
  columnCeilingJunctionBracket: "181-column-ceiling-junction-bracket",
  vaultedCeilingRibSegment: "182-vaulted-ceiling-rib-segment",
  floorWaterTransitionCorner: "183-floor-water-transition-corner",
  councilTableUndersidePedestal: "184-council-table-underside-pedestal",
  participantChairBackModule: "185-participant-chair-back-module",
  rearArchedWindowFrame: "186-rear-arched-window-frame",
  hangingChainLampConnector: "187-hanging-chain-lamp-connector",
  gothicWallLatticePanel: "188-gothic-wall-lattice-panel",
  circularFloorInlayMedallion: "189-circular-floor-inlay-medallion",
  ceilingPendentiveCornerModule: "190-ceiling-pendentive-corner-module",
  curvedMarbleStairRiserModule: "191-curved-marble-stair-riser-module",
  councilSeatArmrestPairModule: "192-council-seat-armrest-pair-module",
  shallowWaterRipplePlate: "193-shallow-water-ripple-plate",
  rearBalconySupportArch: "194-rear-balcony-support-arch",
  botanicalPlanterCluster: "195-botanical-planter-cluster",
  portalKeystoneCrown: "196-portal-keystone-crown",
  ceilingLightRailArc: "197-ceiling-light-rail-arc",
  upperWallCorniceModule: "198-upper-wall-cornice-module",
  luminousWallGrooveInsert: "199-luminous-wall-groove-insert",
  roundTableRimSegment: "200-round-table-rim-segment",
  blankSeatPlaqueSocket: "201-blank-seat-plaque-socket",
  waterChannelLipFallingSheet: "202-water-channel-lip-falling-sheet",
  hangingCrystalPrismCluster: "203-hanging-crystal-prism-cluster",
  sideAlcoveShelfModule: "204-side-alcove-shelf-module",
  floorSeamGoldRepairStrip: "205-floor-seam-gold-repair-strip",
  archFootTransitionBlock: "206-arch-foot-transition-block",
  rearWallButtressTower: "207-rear-wall-buttress-tower",
  archedWindowTraceryInsert: "208-arched-window-tracery-insert",
  ceilingLockstoneStarNode: "209-ceiling-lockstone-star-node",
  curvedBalconyRailSegment: "210-curved-balcony-rail-segment",
  tabletopRadialCompassSpoke: "211-tabletop-radial-compass-spoke",
  floorReflectionCatchBasin: "212-floor-reflection-catch-basin",
  rearWallMountainReliefPlaque: "213-rear-wall-mountain-relief-plaque",
  circularSeatDaisTrimRing: "214-circular-seat-dais-trim-ring",
  slimFloorLanternPylon: "215-slim-floor-lantern-pylon",
  wallVineBracket: "216-wall-vine-bracket",
  doorwaySidePilaster: "217-doorway-side-pilaster",
  triangularArtifactPedestal: "218-triangular-artifact-pedestal",
  doubleChainLightBridge: "219-double-chain-light-bridge",
  crescentWaterSpillwayBowl: "220-crescent-water-spillway-bowl",
  blackMarbleWallMapRelief: "221-black-marble-wall-map-relief",
  lowMistIncenseBrazier: "222-low-mist-incense-brazier",
  chairFootOrnament: "223-chair-foot-ornament",
  narrowFloorBridgeThreshold: "224-narrow-floor-bridge-threshold",
  ornateTableGobletSet: "225-ornate-table-goblet-set",
  ceilingCrescentRibConnector: "226-ceiling-crescent-rib-connector",
  distantRearColonnadeFragment: "227-distant-rear-colonnade-fragment",
  vaultedCeilingWedgePanel: "228-vaulted-ceiling-wedge-panel",
  columnBaseGreeneryCluster: "229-column-base-greenery-cluster",
  ornateWallLanternSconce: "230-ornate-wall-lantern-sconce",
  blankChairNameplateRail: "231-blank-chair-nameplate-rail",
  tableUndersideGoldFiligreeBrace: "232-table-underside-gold-filigree-brace",
  floorLotusGoldInlayTile: "233-floor-lotus-gold-inlay-tile",
  distantMountainWindowInsert: "234-distant-mountain-window-insert",
  sideWaterfallSpoutBasin: "235-side-waterfall-spout-basin",
  archedCeilingButtressBrace: "236-arched-ceiling-buttress-brace",
  marbleStairFanSegment: "237-marble-stair-fan-segment"
} as const;
const INNER_COLUMN_PLACEMENTS = [
  { slug: INNER_MESHY_SLUGS.whiteColumn, position: [-9.15, -1.22, -9.4] as Vec3, rotation: [0, 0.05, 0] as Vec3, size: 7.15 },
  { slug: INNER_MESHY_SLUGS.whiteColumn, position: [9.15, -1.22, -9.4] as Vec3, rotation: [0, -0.05, 0] as Vec3, size: 7.15 },
  { slug: INNER_MESHY_SLUGS.violetColumn, position: [-9.05, -1.22, 2.75] as Vec3, rotation: [0, 0.08, 0] as Vec3, size: 7.0 },
  { slug: INNER_MESHY_SLUGS.violetColumn, position: [9.05, -1.22, 2.75] as Vec3, rotation: [0, -0.08, 0] as Vec3, size: 7.0 }
] as const;

const ACTIVE_INNER_MESHY_SLUGS = new Set<string>([
  INNER_MESHY_SLUGS.table,
  INNER_MESHY_SLUGS.chair,
  INNER_MESHY_SLUGS.whiteColumn,
  INNER_MESHY_SLUGS.violetColumn,
  INNER_MESHY_SLUGS.arch,
  INNER_MESHY_SLUGS.ceilingLockstoneStarNode
]);

export function DaoInnerSanctum() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const resetRef = useRef<(() => void) | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    renderer.setClearColor(0x020706, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x06110f, 0.032);

    const camera = new THREE.PerspectiveCamera(58, mount.clientWidth / mount.clientHeight, 0.08, 160);
    const startPosition = new THREE.Vector3(0, 2.65, 16.2);
    const yawPitch = { yaw: 0, pitch: -0.08 };
    const velocity = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const side = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const keys = new Set<string>();
    const clock = new THREE.Clock();
    let pointerActive = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let animationFrame = 0;
    let sceneDisposed = false;

    const applyCameraRotation = () => {
      camera.rotation.order = "YXZ";
      camera.rotation.y = yawPitch.yaw;
      camera.rotation.x = yawPitch.pitch;
    };

    resetRef.current = () => {
      camera.position.copy(startPosition);
      velocity.set(0, 0, 0);
      yawPitch.yaw = 0;
      yawPitch.pitch = -0.08;
      applyCameraRotation();
    };
    resetRef.current();

    const ambient = new THREE.HemisphereLight(0xd8efe0, 0x020504, 1.35);
    scene.add(ambient);

    const moon = new THREE.DirectionalLight(0xd2ebda, 2.1);
    moon.position.set(-8, 12, 8);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    scene.add(moon);

    const goldLight = new THREE.PointLight(0xffcf75, 56, 44, 1.6);
    goldLight.position.set(0, 3.6, -10);
    scene.add(goldLight);

    const jadeLight = new THREE.PointLight(0x5fd39b, 16, 28, 1.8);
    jadeLight.position.set(-6, 1.8, 1);
    scene.add(jadeLight);

    const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x0b1715, roughness: 0.68, metalness: 0.22 });
    const wetStoneMaterial = new THREE.MeshStandardMaterial({ color: 0x101d19, roughness: 0.36, metalness: 0.42 });
    const whiteMarbleMaterial = new THREE.MeshPhysicalMaterial({ color: 0xf2eadc, roughness: 0.26, metalness: 0.12, clearcoat: 0.72, clearcoatRoughness: 0.18 });
    const jadeMaterial = new THREE.MeshPhysicalMaterial({ color: 0x1a5d50, roughness: 0.18, metalness: 0.04, transparent: true, opacity: 0.34, clearcoat: 0.8 });
    const goldMaterial = new THREE.MeshStandardMaterial({ color: 0xd8ae5e, emissive: 0x4d3211, emissiveIntensity: 0.44, roughness: 0.22, metalness: 0.72 });
    const darkUpholsteryMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2524, roughness: 0.58, metalness: 0.08 });
    const openSeatMaterial = new THREE.MeshBasicMaterial({ color: 0xd8ae5e, transparent: true, opacity: 0.16 });
    const reservedSeatMaterial = new THREE.MeshBasicMaterial({ color: 0xb492f0, transparent: true, opacity: 0.32 });
    const presentSeatMaterial = new THREE.MeshBasicMaterial({ color: 0x74f4bf, transparent: true, opacity: 0.46 });
    const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xf0d99c, transparent: true, opacity: 0.34, side: THREE.DoubleSide });
    const waterMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x09231e,
      roughness: 0.1,
      metalness: 0.12,
      transparent: true,
      opacity: 0.58,
      clearcoat: 0.9,
      clearcoatRoughness: 0.06
    });

    const textureLoader = new THREE.TextureLoader();
    const backdropTexture = textureLoader.load(INNER_BACKDROP_URL);
    backdropTexture.colorSpace = THREE.SRGBColorSpace;
    backdropTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    const backdropMaterial = new THREE.MeshBasicMaterial({
      map: backdropTexture,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide
    });
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(54, 30.375), backdropMaterial);
    backdrop.name = "generated-inner-space-backdrop";
    backdrop.position.set(0, 7.1, -34);
    backdrop.renderOrder = -20;
    scene.add(backdrop);

    const model = new THREE.Group();
    scene.add(model);

    const generatedAssets = new THREE.Group();
    generatedAssets.name = "inner-meshy-generated-assets";
    model.add(generatedAssets);

    const gltfLoader = new GLTFLoader();
    const normalizeGeneratedObject = (object: THREE.Object3D, targetSize: number) => {
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.frustumCulled = false;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => {
            material.needsUpdate = true;
          });
        }
      });
      object.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(object);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxSize = Math.max(size.x, size.y, size.z, 0.001);
      object.scale.multiplyScalar(targetSize / maxSize);
      object.updateMatrixWorld(true);
      const scaledBox = new THREE.Box3().setFromObject(object);
      const center = new THREE.Vector3();
      scaledBox.getCenter(center);
      object.position.x -= center.x;
      object.position.z -= center.z;
      object.position.y -= scaledBox.min.y;
    };

    const loadGeneratedModel = (assetMap: Map<string, MeshyManifestAsset>, slug: string) => {
      if (!ACTIVE_INNER_MESHY_SLUGS.has(slug)) return Promise.resolve<THREE.Object3D | null>(null);
      const asset = assetMap.get(slug);
      if (!asset?.localModel) return Promise.resolve<THREE.Object3D | null>(null);
      const modelUrl = asset.localModel;
      return new Promise<THREE.Object3D | null>((resolve) => {
        gltfLoader.load(
          modelUrl,
          (gltf) => {
            gltf.scene.name = `source-${slug}`;
            resolve(gltf.scene);
          },
          undefined,
          (error) => {
            console.error(`Failed to load Meshy asset ${slug}`, error);
            resolve(null);
          }
        );
      });
    };

    const addGeneratedInstance = (
      source: THREE.Object3D,
      options: { name: string; position: Vec3; rotation?: Vec3; size: number }
    ) => {
      const object = source.clone(true);
      normalizeGeneratedObject(object, options.size);
      const holder = new THREE.Group();
      holder.name = `meshy-${options.name}`;
      holder.position.set(options.position[0], options.position[1], options.position[2]);
      holder.userData.baseY = options.position[1];
      if (options.rotation) holder.rotation.set(options.rotation[0], options.rotation[1], options.rotation[2]);
      holder.add(object);
      generatedAssets.add(holder);
      return holder;
    };

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 26), whiteMarbleMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -1.22, -3.2);
    floor.receiveShadow = true;
    model.add(floor);

    const placementAnchors = new THREE.Group();
    placementAnchors.name = "inner-placement-anchors";
    model.add(placementAnchors);

    const tableDais = new THREE.Mesh(new THREE.CylinderGeometry(5.35, 5.55, 0.05, 160), wetStoneMaterial);
    tableDais.name = "council-table-placement-dais";
    tableDais.position.set(0, -1.185, -2.8);
    tableDais.receiveShadow = true;
    placementAnchors.add(tableDais);

    const tableDaisRim = new THREE.Mesh(new THREE.TorusGeometry(5.55, 0.026, 8, 180), goldMaterial);
    tableDaisRim.name = "council-table-placement-rim";
    tableDaisRim.position.set(0, -1.152, -2.8);
    tableDaisRim.rotation.x = Math.PI / 2;
    placementAnchors.add(tableDaisRim);

    councilSeats.forEach((seat) => {
      const seatPad = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.78, 0.035, 48), stoneMaterial);
      seatPad.name = `${seat.id}-placement-pad`;
      seatPad.position.set(seat.position[0], -1.16, seat.position[2]);
      seatPad.rotation.y = seat.rotationY;
      seatPad.scale.set(1.45, 1, 1.0);
      seatPad.castShadow = true;
      seatPad.receiveShadow = true;
      placementAnchors.add(seatPad);

      const seatPadLine = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.012, 6, 64), goldMaterial);
      seatPadLine.name = `${seat.id}-placement-line`;
      seatPadLine.position.set(seat.position[0], -1.13, seat.position[2]);
      seatPadLine.rotation.x = Math.PI / 2;
      seatPadLine.scale.set(1.45, 1, 1.0);
      placementAnchors.add(seatPadLine);
    });

    INNER_COLUMN_PLACEMENTS.forEach((placement, index) => {
      const columnPad = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.32, 0.08, 64), wetStoneMaterial);
      columnPad.name = `column-placement-pad-${index + 1}`;
      columnPad.position.set(placement.position[0], -1.17, placement.position[2]);
      columnPad.castShadow = true;
      columnPad.receiveShadow = true;
      placementAnchors.add(columnPad);
    });

    const ceilingGroup = new THREE.Group();
    ceilingGroup.name = "inner-architectural-ceiling";
    ceilingGroup.position.set(0, 0, -2.8);
    model.add(ceilingGroup);

    const ceilingY = 6.08;
    const ceilingDeck = new THREE.Mesh(new THREE.CylinderGeometry(11.8, 11.8, 0.11, 192), whiteMarbleMaterial);
    ceilingDeck.position.set(0, ceilingY + 0.12, 0);
    ceilingDeck.castShadow = true;
    ceilingDeck.receiveShadow = true;
    ceilingGroup.add(ceilingDeck);

    const ceilingShadowInset = new THREE.Mesh(new THREE.CylinderGeometry(6.75, 6.75, 0.045, 160), stoneMaterial);
    ceilingShadowInset.position.set(0, ceilingY + 0.035, 0);
    ceilingShadowInset.castShadow = true;
    ceilingShadowInset.receiveShadow = true;
    ceilingGroup.add(ceilingShadowInset);

    [7.25, 5.45, 3.25, 1.35].forEach((radius, index) => {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, index === 0 ? 0.055 : 0.035, 14, 180), goldMaterial);
      rim.name = `ceiling-gold-ring-${index + 1}`;
      rim.rotation.x = Math.PI / 2;
      rim.position.set(0, ceilingY - index * 0.012, 0);
      ceilingGroup.add(rim);
    });

    for (let index = 0; index < 16; index += 1) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.06, 10.6), goldMaterial);
      rib.name = `ceiling-radial-rib-${index + 1}`;
      rib.position.set(0, ceilingY - 0.03, 0);
      rib.rotation.y = (index / 16) * Math.PI;
      rib.castShadow = true;
      rib.receiveShadow = true;
      ceilingGroup.add(rib);
    }

    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2;
      const node = new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 12), goldMaterial);
      node.name = `ceiling-gold-node-${index + 1}`;
      node.position.set(Math.cos(angle) * 5.45, ceilingY - 0.08, Math.sin(angle) * 5.45);
      ceilingGroup.add(node);
    }

    const causeway = new THREE.Group();
    causeway.name = "inner-causeway";
    model.add(causeway);
    causeway.visible = false;

    for (let index = 0; index < 13; index += 1) {
      const width = 5.8 - Math.min(index, 8) * 0.18;
      const step = new THREE.Mesh(new THREE.BoxGeometry(width, 0.16, 1.4), index % 2 === 0 ? wetStoneMaterial : stoneMaterial);
      step.position.set(0, -0.76 + index * 0.018, 10.5 - index * 1.55);
      step.castShadow = true;
      step.receiveShadow = true;
      causeway.add(step);
    }

    const innerRing = new THREE.Group();
    innerRing.name = "inner-portal-axis";
    innerRing.position.set(0, 3.45, -12.5);
    model.add(innerRing);
    innerRing.visible = false;

    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.7, 0.055, 16, 180), goldMaterial);
    innerRing.add(ring);
    const ringBack = new THREE.Mesh(new THREE.TorusGeometry(3.28, 0.034, 12, 160), goldMaterial);
    ringBack.position.z = -0.34;
    innerRing.add(ringBack);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(4.45, 0.018, 8, 180), lightMaterial);
    halo.position.z = -0.06;
    innerRing.add(halo);

    const verticalAxis = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 9.8), lightMaterial);
    verticalAxis.position.z = 0.04;
    innerRing.add(verticalAxis);

    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.88, 40, 18, 0, Math.PI * 2, 0, Math.PI / 2), goldMaterial);
    bowl.rotation.x = Math.PI;
    bowl.position.set(0, -0.48, -10.4);
    bowl.scale.set(1.5, 0.36, 1.5);
    bowl.castShadow = true;
    model.add(bowl);
    bowl.visible = false;

    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 16), new THREE.MeshBasicMaterial({ color: 0xf0d99c, transparent: true, opacity: 0.48 }));
    flame.position.set(0, 0.08, -10.4);
    model.add(flame);
    flame.visible = false;

    const council = new THREE.Group();
    council.name = "inner-council-table-system";
    model.add(council);
    council.visible = false;

    const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(3.95, 4.18, 0.32, 128), whiteMarbleMaterial);
    tableTop.name = "council-round-table-top";
    tableTop.position.set(0, -0.56, -2.8);
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    council.add(tableTop);

    const tableRim = new THREE.Mesh(new THREE.TorusGeometry(4.18, 0.055, 12, 160), goldMaterial);
    tableRim.name = "council-table-gold-rim";
    tableRim.position.set(0, -0.36, -2.8);
    tableRim.rotation.x = Math.PI / 2;
    council.add(tableRim);

    const tableInlay = new THREE.Mesh(new THREE.TorusGeometry(2.38, 0.018, 8, 140), goldMaterial);
    tableInlay.name = "council-table-inner-inlay";
    tableInlay.position.set(0, -0.34, -2.8);
    tableInlay.rotation.x = Math.PI / 2;
    council.add(tableInlay);

    const tableCore = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.74, 1.14, 48), goldMaterial);
    tableCore.name = "council-table-central-core";
    tableCore.position.set(0, -1.16, -2.8);
    tableCore.castShadow = true;
    tableCore.receiveShadow = true;
    council.add(tableCore);

    const proceduralSeatGroups: THREE.Group[] = [];
    councilSeats.forEach((seat) => {
      const seatGroup = new THREE.Group();
      seatGroup.name = seat.id;
      seatGroup.position.set(seat.position[0], seat.position[1], seat.position[2]);
      seatGroup.rotation.y = seat.rotationY;
      seatGroup.userData.status = seat.status;

      const chairBase = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.18, 0.78), darkUpholsteryMaterial);
      chairBase.name = `${seat.id}-base`;
      chairBase.position.y = 0.25;
      chairBase.castShadow = true;
      chairBase.receiveShadow = true;
      seatGroup.add(chairBase);

      const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.18, 0.16), darkUpholsteryMaterial);
      chairBack.name = `${seat.id}-back`;
      chairBack.position.set(0, 0.92, 0.36);
      chairBack.castShadow = true;
      chairBack.receiveShadow = true;
      seatGroup.add(chairBack);

      const crest = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 10), goldMaterial);
      crest.name = `${seat.id}-gold-crest`;
      crest.position.set(0, 1.58, 0.38);
      seatGroup.add(crest);

      const statusMaterial = seat.status === "present" ? presentSeatMaterial : seat.status === "reserved" ? reservedSeatMaterial : openSeatMaterial;
      const statusRing = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.016, 8, 72), statusMaterial.clone());
      statusRing.name = `${seat.id}-presence-ring`;
      statusRing.position.set(0, 0.08, -0.04);
      statusRing.rotation.x = Math.PI / 2;
      seatGroup.add(statusRing);

      const markerLight = new THREE.PointLight(seat.status === "present" ? 0x74f4bf : seat.status === "reserved" ? 0xb492f0 : 0xd8ae5e, seat.status === "open" ? 0.8 : 2.2, 3.2, 2);
      markerLight.name = `${seat.id}-presence-light`;
      markerLight.position.set(0, 0.8, 0);
      seatGroup.add(markerLight);

      council.add(seatGroup);
    });

    const loadGeneratedCouncilHall = async () => {
      try {
        const response = await fetch("/models/meshy/manifest.json", { cache: "no-store" });
        if (!response.ok) return;
        const manifest = (await response.json()) as MeshyManifest;
        const assetMap = new Map(
          (manifest.assets ?? [])
            .filter((asset) => asset.localModel && String(asset.status ?? "").toUpperCase() === "SUCCEEDED")
            .map((asset) => [asset.slug, asset])
        );

        const [table, chair, neutralChair, ceilingCircularMandalaDisk, goldFiligreeFloorInlaySet, seatPresenceLightMarker, circularTableWedge, gothicGardenArchV2, whiteColumn, violetColumn, arch, stainedGlass, waterfall, ceilingMedallion, lamp, planter, columnCapital, columnBase, ceilingRib, wallRelief, floorTile, candelabrum, crystalObelisk, balustrade, innerPortal, hostThrone, sideFountain, chandelier, tableSigil, lectern, gardenArch, skylight, goblet, seatPlaque, wallSconce, stairStep, waterChannel, hangingPlanter, jadeOrb, displayPedestal, wallAlcove, astrolabe, curtainDrape, floorCompass, incenseBurner, floorVase, bridgeWalkway, cornerPlinth, balconyRailingCorner, crystalChain, councilCodex, chairCushion, gardenStone, glassPartition, ceilingRosette, tableMarkers, rootGardenBase, smallFootbridge, reflectiveWaterBowl, gongStand, livingVineArch, blankBanner, sidePylon, mossyIsland, artifactSideTable, columnCeilingBrace, floorBorderInlay, councilPlaceModule, gothicJadeWindow, vineCurtain, waterEndcap, lanternCluster, thresholdStep, slimPedestal, chairCrest, sanctuaryBlade, rearGallery, sidePassagePortal, ceilingCornice, floorWaterChannelLong, sideWalkwaySlab, artifactNiche, indoorTreePlanter, floorNodeEmblem, seatDaisBase, wallLightRail, mountainRelief, wetFloorEdge, mistVessel, wallButtress, waterPlaneTile, ceilingChainSupport, rootMossCluster, sideTransitionFrame, acousticWallFin, compassPlinthMarker, rearLightObelisks, curvedWaterIsland, ceilingDomeCapModule, columnCeilingJunctionBracket, vaultedCeilingRibSegment, floorWaterTransitionCorner, councilTableUndersidePedestal, participantChairBackModule, rearArchedWindowFrame, hangingChainLampConnector, gothicWallLatticePanel, circularFloorInlayMedallion, ceilingPendentiveCornerModule, curvedMarbleStairRiserModule, councilSeatArmrestPairModule, shallowWaterRipplePlate, rearBalconySupportArch, botanicalPlanterCluster, portalKeystoneCrown, ceilingLightRailArc, upperWallCorniceModule, luminousWallGrooveInsert, roundTableRimSegment, blankSeatPlaqueSocket, waterChannelLipFallingSheet, hangingCrystalPrismCluster, sideAlcoveShelfModule, floorSeamGoldRepairStrip, archFootTransitionBlock, rearWallButtressTower, archedWindowTraceryInsert, ceilingLockstoneStarNode, curvedBalconyRailSegment, tabletopRadialCompassSpoke, floorReflectionCatchBasin, rearWallMountainReliefPlaque, circularSeatDaisTrimRing, slimFloorLanternPylon, wallVineBracket, doorwaySidePilaster, triangularArtifactPedestal, doubleChainLightBridge, crescentWaterSpillwayBowl, blackMarbleWallMapRelief, lowMistIncenseBrazier, chairFootOrnament, narrowFloorBridgeThreshold, ornateTableGobletSet, ceilingCrescentRibConnector, distantRearColonnadeFragment, vaultedCeilingWedgePanel, columnBaseGreeneryCluster, ornateWallLanternSconce, blankChairNameplateRail, tableUndersideGoldFiligreeBrace, floorLotusGoldInlayTile, distantMountainWindowInsert, sideWaterfallSpoutBasin, archedCeilingButtressBrace, marbleStairFanSegment] = await Promise.all([
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.table),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.chair),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.neutralChair),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.ceilingCircularMandalaDisk),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.goldFiligreeFloorInlaySet),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.seatPresenceLightMarker),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.circularTableWedge),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.gothicGardenArchV2),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.whiteColumn),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.violetColumn),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.arch),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.stainedGlass),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.waterfall),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.ceilingMedallion),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.lamp),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.planter),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.columnCapital),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.columnBase),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.ceilingRib),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.wallRelief),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.floorTile),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.candelabrum),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.crystalObelisk),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.balustrade),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.innerPortal),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.hostThrone),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.sideFountain),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.chandelier),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.tableSigil),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.lectern),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.gardenArch),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.skylight),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.goblet),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.seatPlaque),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.wallSconce),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.stairStep),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.waterChannel),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.hangingPlanter),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.jadeOrb),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.displayPedestal),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.wallAlcove),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.astrolabe),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.curtainDrape),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.floorCompass),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.incenseBurner),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.floorVase),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.bridgeWalkway),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.cornerPlinth),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.balconyRailingCorner),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.crystalChain),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.councilCodex),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.chairCushion),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.gardenStone),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.glassPartition),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.ceilingRosette),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.tableMarkers),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.rootGardenBase),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.smallFootbridge),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.reflectiveWaterBowl),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.gongStand),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.livingVineArch),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.blankBanner),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.sidePylon),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.mossyIsland),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.artifactSideTable),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.columnCeilingBrace),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.floorBorderInlay),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.councilPlaceModule),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.gothicJadeWindow),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.vineCurtain),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.waterEndcap),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.lanternCluster),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.thresholdStep),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.slimPedestal),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.chairCrest),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.sanctuaryBlade),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.rearGallery),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.sidePassagePortal),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.ceilingCornice),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.floorWaterChannelLong),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.sideWalkwaySlab),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.artifactNiche),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.indoorTreePlanter),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.floorNodeEmblem),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.seatDaisBase),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.wallLightRail),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.mountainRelief),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.wetFloorEdge),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.mistVessel),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.wallButtress),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.waterPlaneTile),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.ceilingChainSupport),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.rootMossCluster),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.sideTransitionFrame),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.acousticWallFin),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.compassPlinthMarker),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.rearLightObelisks),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.curvedWaterIsland),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.ceilingDomeCapModule),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.columnCeilingJunctionBracket),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.vaultedCeilingRibSegment),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.floorWaterTransitionCorner),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.councilTableUndersidePedestal),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.participantChairBackModule),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.rearArchedWindowFrame),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.hangingChainLampConnector),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.gothicWallLatticePanel),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.circularFloorInlayMedallion),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.ceilingPendentiveCornerModule),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.curvedMarbleStairRiserModule),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.councilSeatArmrestPairModule),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.shallowWaterRipplePlate),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.rearBalconySupportArch),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.botanicalPlanterCluster),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.portalKeystoneCrown),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.ceilingLightRailArc),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.upperWallCorniceModule),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.luminousWallGrooveInsert),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.roundTableRimSegment),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.blankSeatPlaqueSocket),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.waterChannelLipFallingSheet),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.hangingCrystalPrismCluster),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.sideAlcoveShelfModule),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.floorSeamGoldRepairStrip),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.archFootTransitionBlock),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.rearWallButtressTower),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.archedWindowTraceryInsert),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.ceilingLockstoneStarNode),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.curvedBalconyRailSegment),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.tabletopRadialCompassSpoke),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.floorReflectionCatchBasin),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.rearWallMountainReliefPlaque),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.circularSeatDaisTrimRing),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.slimFloorLanternPylon),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.wallVineBracket),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.doorwaySidePilaster),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.triangularArtifactPedestal),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.doubleChainLightBridge),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.crescentWaterSpillwayBowl),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.blackMarbleWallMapRelief),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.lowMistIncenseBrazier),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.chairFootOrnament),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.narrowFloorBridgeThreshold),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.ornateTableGobletSet),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.ceilingCrescentRibConnector),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.distantRearColonnadeFragment),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.vaultedCeilingWedgePanel),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.columnBaseGreeneryCluster),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.ornateWallLanternSconce),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.blankChairNameplateRail),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.tableUndersideGoldFiligreeBrace),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.floorLotusGoldInlayTile),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.distantMountainWindowInsert),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.sideWaterfallSpoutBasin),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.archedCeilingButtressBrace),
          loadGeneratedModel(assetMap, INNER_MESHY_SLUGS.marbleStairFanSegment)
        ]);
        if (sceneDisposed) return;

        let generatedCount = 0;
        if (table) {
          addGeneratedInstance(table, { name: INNER_MESHY_SLUGS.table, position: [0, -1.58, -2.8], rotation: [0, 0, 0], size: 5.95 });
          [tableTop, tableRim, tableInlay, tableCore].forEach((object) => {
            object.visible = false;
          });
          generatedCount += 1;
        }
        if (chair) {
          councilSeats.forEach((seat) => {
            addGeneratedInstance(chair, {
              name: `${INNER_MESHY_SLUGS.chair}-${seat.index}`,
              position: [seat.position[0], -1.27, seat.position[2]],
              rotation: [0, seat.rotationY + Math.PI, 0],
              size: 3.05
            });
          });
          proceduralSeatGroups.forEach((seatGroup) => {
            seatGroup.visible = false;
          });
          generatedCount += councilSeats.length;
        }
        if (neutralChair) {
          // Disabled: all meeting seats now belong to the main council ring around the table.
        }
        if (ceilingCircularMandalaDisk) {
          // Disabled: wall mandala disks looked like extra loose plates before the room layout was settled.
        }
        if (goldFiligreeFloorInlaySet) {
          // Disabled: floor ornament waits until the main walking surfaces are clean.
        }
        if (seatPresenceLightMarker) {
          // Disabled: chair positions are now defined by the actual seats, not extra glowing markers.
        }
        if (circularTableWedge) {
          // Disabled: the imported table already provides the main tabletop silhouette.
        }
        if (gothicGardenArchV2) {
          // Disabled as an alternate side-wall arch set; columns, windows and water features now carry the side walls.
        }
        INNER_COLUMN_PLACEMENTS.forEach((placement, index) => {
          const column = placement.slug === INNER_MESHY_SLUGS.whiteColumn ? whiteColumn : violetColumn;
          if (!column) return;
          addGeneratedInstance(column, { name: `${placement.slug}-${index + 1}`, position: placement.position, rotation: placement.rotation, size: placement.size });
          generatedCount += 1;
        });
        if (arch) {
          addGeneratedInstance(arch, { name: INNER_MESHY_SLUGS.arch, position: [0, -1.14, -16.85], rotation: [0, 0, 0], size: 4.95 });
          generatedCount += 1;
        }
        if (stainedGlass) {
          // Disabled for the clean placement pass: side glass panels were stacking into the same visual band as the portal.
        }
        if (waterfall) {
          // Disabled for now: water features are a later pass after the council layout stops reading as a pile.
        }
        if (ceilingMedallion) {
          // Legacy Meshy ceiling medallion imports as a vertical disk in some runs; keep the newer dome module as the active ceiling piece.
        }
        if (lamp) {
          // Disabled: floor lamps crowded the entry sightline while the base furniture is being aligned.
        }
        if (planter) {
          // Disabled: greenery returns after the columns, seats and ceiling are visually approved.
        }
        if (columnCapital || columnBase) {
  
        INNER_COLUMN_PLACEMENTS.forEach((placement, index) => {
            if (columnBase) {
              addGeneratedInstance(columnBase, {
                name: `${INNER_MESHY_SLUGS.columnBase}-${index + 1}`,
                position: [placement.position[0], -1.23, placement.position[2]],
                rotation: placement.rotation,
                size: 1.35
              });
              generatedCount += 1;
            }
            if (columnCapital) {
              addGeneratedInstance(columnCapital, {
                name: `${INNER_MESHY_SLUGS.columnCapital}-${index + 1}`,
                position: [placement.position[0], 5.18, placement.position[2]],
                rotation: placement.rotation,
                size: 1.65
              });
              generatedCount += 1;
            }
          });
        }
        if (ceilingRib) {
          // Disabled: the procedural ceiling already provides the primary radial ribs.
        }
        if (wallRelief) {
          // Disabled: wall reliefs competed with the cleaner rear portal and window tracery.
        }
        if (floorTile) {
          // Disabled: individual floor tiles made the already-modeled floor read as stacked loose plates.
        }
        if (candelabrum) {
          // Disabled: repeated floor candles competed with the council table and wall lighting.
        }
        if (crystalObelisk) {
          // Disabled: obelisks are later accent objects; the base hall now prioritizes clean architecture.
        }
        if (balustrade) {
          // Disabled: side rails were adding another repeated wall layer before the room structure was settled.
        }
        if (chandelier) {
          // This Meshy import can arrive as a vertical ceiling disk; keep the procedural ceiling as the reliable active ceiling.
        }
        if (tableSigil) {
          // Disabled: this sigil import was acting like a stray decorative disk, not a placed table detail.
        }
        if (ceilingRosette) {
          // Disabled: rosettes were forming a second decorative ring over the procedural ceiling.
        }
        if (innerPortal) {
          // Disabled: the rear arch is the single active portal shape in this cleanup pass.
        }
        if (hostThrone) {
          // Meeting seats are equal around the table; the throne is disabled to avoid a second focal center behind the council.
        }
        if (wallSconce) {
          // Disabled: ornate wall lantern sconces now carry the wall lighting role alone.
        }
        if (rootGardenBase) {
          // Disabled: garden bases made the side floor zones feel crowded before final landscaping.
        }
        if (smallFootbridge) {
          // Disabled: footbridges are later navigation props; they cluttered the rear water zone in the placement pass.
        }
        if (reflectiveWaterBowl) {
          // Disabled: reflective bowls are later interactives, not core council-hall architecture.
        }
        if (gongStand) {
          // Disabled: the gong belongs to a dedicated ritual-object pass, not the base room layout.
        }
        if (livingVineArch) {
          // Disabled: large vine arches competed with the rear portal silhouette.
        }
        if (blankBanner) {
          // Disabled: flat banners added noise on the side walls without helping the council layout.
        }
        if (sidePylon) {
          // Disabled: side pylons competed with the column rhythm and made the walls look piled up.
        }
        if (mossyIsland) {
          // Disabled: root garden bases and water islands already establish the planted floor zones.
        }
        if (artifactSideTable) {
          // Disabled: side tables duplicated the council table and crowded the entrance lanes.
        }
        if (columnCeilingBrace) {
          // Disabled: junction brackets now handle the column-to-ceiling connection without a second overlay.
        }
        if (floorBorderInlay) {
          // Disabled: broad floor geometry should stay quiet around the council ring.
        }
        if (councilPlaceModule) {
          // Disabled: individual place modules duplicated the chair bases and made the table edge busy.
        }
        if (gothicJadeWindow) {
          // Disabled: arched window tracery is the single active side-window language for this pass.
        }
        if (vineCurtain) {
          // Disabled: vine curtains are a later greenery pass, not part of the first clean room layout.
        }
        if (waterEndcap) {
          // Disabled: water endcaps were another small water system over the base water planes.
        }
        if (lanternCluster) {
          // Disabled: wall sconces and ceiling connectors are enough lighting hierarchy for now.
        }
        if (thresholdStep) {
          // Disabled: threshold props are deferred until the furniture and architecture are stable.
        }
        if (slimPedestal) {
          // Disabled: the main side pylons and artifact pedestals already define the side rhythm.
        }
        if (chairCrest) {
          // Disabled: full chair meshes already carry their silhouettes; crest overlays doubled the backs.
        }
        if (sanctuaryBlade) {
          // Disabled: tall blade artifacts read as stray foreground props instead of architecture.
        }
        if (rearGallery) {
          // The rear portal and window frame now define the back wall; this broad gallery mesh was flattening over them.
        }
        if (mountainRelief) {
          // Mountain relief duplicates the painted backdrop/window inserts, so keep it inactive until a dedicated wall slot exists.
        }
        if (sidePassagePortal) {
          // Disabled while the side walls are kept as open window/water bays instead of stacked portal frames.
        }
        if (ceilingCornice) {
          // Disabled: upper wall cornices provide the perimeter; this circular cornice made the roof too layered.
        }
        if (floorWaterChannelLong) {
          // Disabled: water planes now carry the main water read without extra channel strips.
        }
        if (sideWalkwaySlab) {
          // Disabled: floating side walkway slabs made the floor composition feel layered instead of architectural.
        }
        if (artifactNiche) {
          // Disabled: side niches added object clutter before the walls were visually settled.
        }
        if (indoorTreePlanter) {
          // Disabled: tree planters will be hand-placed after columns, walls and walking lanes are confirmed.
        }
        if (floorNodeEmblem) {
          // Disabled: extra floor symbols distract from the readable chair circle.
        }
        if (seatDaisBase) {
          // Disabled: imported chairs define their own footprint; extra dais bases tightened the ring too much.
        }
        if (wallLightRail) {
          // Disabled: rail lights competed with sconces, lanterns and window tracery.
        }
        if (wetFloorEdge) {
          // Disabled: wet edge overlays created another competing floor system.
        }
        if (mistVessel) {
          // Disabled: mist is handled by the scene atmosphere and rear water elements.
        }
        if (wallButtress) {
          // Disabled: buttress modules were one of the remaining repeated wall clutter layers.
        }
        if (waterPlaneTile) {
          // Disabled: water planes are held back until they can be placed as a coherent floor/water system.
        }
        if (ceilingChainSupport) {
          // Disabled: the simplified ceiling should read as architecture, not suspended hardware.
        }
        if (rootMossCluster) {
          // Disabled: moss clusters belong to the final vegetation pass, not base interior placement.
        }
        if (sideTransitionFrame) {
          // Disabled as duplicate side-wall transition geometry; it was sitting inside the same bays as portals and windows.
        }
        if (acousticWallFin) {
          // Disabled; these vertical fins duplicated the wall lattice/window rhythm and crowded the side bays.
        }
        if (compassPlinthMarker) {
          // Disabled: extra floor markers made the central approach visually noisy.
        }
        if (rearLightObelisks) {
          // Disabled: rear light obelisks created a second focal row behind the portal.
        }
        if (curvedWaterIsland) {
          // Disabled: water islands duplicated garden bases and side water planes.
        }
        if (ceilingDomeCapModule) {
          // Disabled for now: generated dome caps sometimes import on edge and read as a loose slab over the council table.
        }
        if (columnCeilingJunctionBracket) {
  
        INNER_COLUMN_PLACEMENTS.forEach((placement, index) => {
            addGeneratedInstance(columnCeilingJunctionBracket, {
              name: `${INNER_MESHY_SLUGS.columnCeilingJunctionBracket}-${index + 1}`,
              position: [placement.position[0], 5.08, placement.position[2]],
              rotation: placement.rotation,
              size: 1.35
            });
            generatedCount += 1;
          });
        }
        if (vaultedCeilingRibSegment) {
          // Disabled: duplicate vaulted rib ring competing with the built ceiling ribs.
        }
        if (floorWaterTransitionCorner) {
          // Disabled: transition corners made the floor edges too busy for this placement pass.
        }
        if (councilTableUndersidePedestal) {
          // Disabled: the center of the table stays open instead of gaining another block underneath.
        }
        if (participantChairBackModule) {
          // Full chair models already include backs; keeping this disabled prevents duplicate geometry on every seat.
        }
        if (rearArchedWindowFrame) {
          // Disabled: one rear arch is enough until the back wall composition is manually detailed.
        }
        if (hangingChainLampConnector) {
          // Disabled: hanging connectors cluttered the upper airspace before the roof is visually approved.
        }
        if (gothicWallLatticePanel) {
          // Disabled: lattice panels duplicated the arched tracery inserts.
        }
        if (circularFloorInlayMedallion) {
          // Disabled: floor medallions are later detail, not core placement.
        }
        if (ceilingPendentiveCornerModule) {
          // Disabled: pendentive modules overlapped with column junction brackets and the procedural dome.
        }
        if (curvedMarbleStairRiserModule) {
          // Disabled as a duplicate of the fan stair pieces; keeping both made the entry floor read as stacked slabs.
        }
        if (councilSeatArmrestPairModule) {
          // Full chair models already include arms; disabling the overlay keeps the council ring readable.
        }
        if (shallowWaterRipplePlate) {
          // Disabled: broad waterPlaneTile meshes already define the water surface.
        }
        if (rearBalconySupportArch) {
          // Disabled while the rear wall is being kept as a single readable portal/window composition.
        }
        if (botanicalPlanterCluster) {
          // Disabled: botanical clusters wait for a dedicated landscaping pass.
        }
        if (portalKeystoneCrown) {
          // Disabled: keystone overlay was adding a loose ornament over the main portal.
        }
        if (ceilingLightRailArc) {
          // Disabled: the ceiling light ring duplicated the procedural gold rings.
        }
        if (upperWallCorniceModule) {
          // Disabled: upper cornices are deferred until the column-to-ceiling line is clean.
        }
        if (luminousWallGrooveInsert) {
          // Disabled: luminous groove inserts were a second wall-light system over the lanterns and windows.
        }
        if (roundTableRimSegment) {
          // Disabled: rim segments made a second ring around the table mesh.
        }
        if (blankSeatPlaqueSocket) {
          // Disabled until nameplates become functional UI rather than loose floor props.
        }
        if (waterChannelLipFallingSheet) {
          // Disabled: falling sheets are a later water-detail pass, not core room placement.
        }
        if (hangingCrystalPrismCluster) {
          // Disabled: crystal clusters add ceiling clutter before the main roof alignment is fully verified.
        }
        if (sideAlcoveShelfModule) {
          // Disabled: shelves made side walls read as prop storage instead of architecture.
        }
        if (floorSeamGoldRepairStrip) {
          // Disabled: the floor needs larger calm surfaces while the architecture is being placed.
        }
        if (archFootTransitionBlock) {
          // Disabled as a duplicate foot block for side arches; doorway pilasters handle the rear portal feet.
        }
        if (rearWallButtressTower) {
          // Disabled: rear buttress towers stacked behind the portal instead of clarifying the back wall.
        }
        if (archedWindowTraceryInsert) {
          // Disabled: window tracery created repeated side/rear layers over the main hall silhouette.
        }
        if (ceilingLockstoneStarNode) {
          addGeneratedInstance(ceilingLockstoneStarNode, { name: INNER_MESHY_SLUGS.ceilingLockstoneStarNode, position: [0, 6.32, -2.8], rotation: [0, 0, 0], size: 0.95 });
          generatedCount += 1;
        }
        if (curvedBalconyRailSegment) {
          // Disabled: balcony rails looked like loose mid-wall strips before the main wall composition was settled.
        }
        if (tabletopRadialCompassSpoke) {
          // Disabled: the table surface should read clean before symbolic tabletop details return.
        }
        if (floorReflectionCatchBasin) {
          // Disabled: extra basins duplicated the remaining water surface and rear waterfall logic.
        }
        if (rearWallMountainReliefPlaque) {
          // Disabled: rear mountain plaques duplicated the main rear window image.
        }
        if (circularSeatDaisTrimRing) {
          // Disabled: seat bases are enough to anchor each chair for the current composition pass.
        }
        if (slimFloorLanternPylon) {
          // Disabled: side-wall lighting now stays on the walls, not as repeated floor pylons.
        }
        if (wallVineBracket) {
          // Disabled: vine curtains and planters are enough greenery while positioning architecture.
        }
        if (doorwaySidePilaster) {
          // Disabled: the rear arch and portal already define the doorway sides for the base layout.
        }
        if (triangularArtifactPedestal) {
          // Disabled: artifact pedestals will be reintroduced one by one as real section objects.
        }
        if (doubleChainLightBridge) {
          // Disabled: chain bridges made the upper airspace too busy after the ceiling was simplified.
        }
        if (crescentWaterSpillwayBowl) {
          // Disabled: spillway bowls belong to a later hand-placed water pass.
        }
        if (blackMarbleWallMapRelief) {
          // Disabled on side walls; map reliefs were competing with lanterns, vines and window inserts on the same plane.
        }
        if (lowMistIncenseBrazier) {
          // Disabled: low braziers made the rear floor read crowded before final object placement.
        }
        if (chairFootOrnament) {
          // Disabled: small ornaments at chair feet turned the council ring into visual noise.
        }
        if (narrowFloorBridgeThreshold) {
          // Disabled: threshold steps and stair fan now define the walking path alone.
        }
        if (ornateTableGobletSet) {
          // Disabled until table-scale props are placed manually as purposeful interactive objects.
        }
        if (ceilingCrescentRibConnector) {
          // Disabled: crescent connectors were a third ceiling rib system.
        }
        if (distantRearColonnadeFragment) {
          // Disabled: the rear portal/window frame now owns the back wall depth.
        }
        if (vaultedCeilingWedgePanel) {
          // Disabled: wedge panels stacked over the procedural dome and made the ceiling look like loose plates.
        }
        if (columnBaseGreeneryCluster) {
          // Disabled: greenery around every column made the floor read busy; vegetation returns after placement approval.
        }
        if (ornateWallLanternSconce) {
          // Disabled: wall sconces return after the base architecture no longer reads as stacked props.
        }
        if (blankChairNameplateRail) {
          // Disabled until participant name rails become real UI slots.
        }
        if (tableUndersideGoldFiligreeBrace) {
          // Disabled: underside braces made the table feel stacked and heavy.
        }
        if (floorLotusGoldInlayTile) {
          // Disabled: floor ornament will be reintroduced only after the main scene reads cleanly.
        }
        if (distantMountainWindowInsert) {
          // Disabled: distant window inserts were another rear layer behind the current single arch.
        }
        if (sideWaterfallSpoutBasin) {
          // Disabled: side spout basins duplicated the main waterfall pair.
        }
        if (archedCeilingButtressBrace) {
          // Disabled: column junction brackets now define the ceiling support points cleanly.
        }
        if (marbleStairFanSegment) {
          // Disabled: stair fan pieces are deferred until the entry axis is rebuilt as one floor system.
        }
        mount.dataset.generatedCouncilAssets = String(generatedCount);
      } catch (error) {
        console.error("Failed to load inner Meshy council hall", error);
      }
    };

    void loadGeneratedCouncilHall();

    const legacyScaffold = new THREE.Group();
    legacyScaffold.name = 'inner-legacy-procedural-scaffold';
    legacyScaffold.visible = false;
    model.add(legacyScaffold);

    const slabPositions = [-9.2, -6.2, -3.4, 3.4, 6.2, 9.2];
    slabPositions.forEach((x, index) => {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.45, 5 + (index % 3) * 1.2, 1.1), index % 2 === 0 ? jadeMaterial : stoneMaterial);
      slab.position.set(x, 1.2 + (index % 3) * 0.38, -8 - Math.abs(x) * 0.32);
      slab.rotation.y = x < 0 ? 0.16 : -0.16;
      slab.castShadow = true;
      slab.receiveShadow = true;
      legacyScaffold.add(slab);
    });

    const goldLineMaterial = new THREE.LineBasicMaterial({ color: 0xd8ae5e, transparent: true, opacity: 0.28 });
    [4.8, 6.2, 7.8].forEach((radius, index) => {
      const curve = new THREE.EllipseCurve(0, 0, radius, radius * 0.56, Math.PI * 0.02, Math.PI * 1.15, false);
      const points = curve.getPoints(140).map((point) => new THREE.Vector3(point.x, -1.04, point.y - 4.5 - index * 2.8));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), goldLineMaterial);
      legacyScaffold.add(line);
    });

    const particlesGeometry = new THREE.BufferGeometry();
    const particles = new Float32Array(700 * 3);
    for (let index = 0; index < 700; index += 1) {
      particles[index * 3] = (Math.random() - 0.5) * 38;
      particles[index * 3 + 1] = -0.2 + Math.random() * 7;
      particles[index * 3 + 2] = 16 - Math.random() * 52;
    }
    particlesGeometry.setAttribute("position", new THREE.BufferAttribute(particles, 3));
    const particleCloud = new THREE.Points(particlesGeometry, new THREE.PointsMaterial({ color: 0xf0d99c, size: 0.026, transparent: true, opacity: 0.48, depthWrite: false }));
    model.add(particleCloud);
    particleCloud.visible = false;

    const onKeyDown = (event: KeyboardEvent) => {
      keys.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.code);
    };
    const onPointerDown = (event: PointerEvent) => {
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
      if (!pointerActive) return;
      const dx = event.clientX - lastPointerX;
      const dy = event.clientY - lastPointerY;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      yawPitch.yaw -= dx * 0.0024;
      yawPitch.pitch = clamp(yawPitch.pitch - dy * 0.0024, -0.78, 0.55);
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
    window.addEventListener("resize", onResize);

    const animate = () => {
      const delta = Math.min(clock.getDelta(), 0.04);
      const elapsed = clock.elapsedTime;
      applyCameraRotation();
      camera.getWorldDirection(direction);
      side.crossVectors(direction, up).normalize();

      const targetVelocity = new THREE.Vector3();
      const pace = 5.8;
      if (keys.has("KeyW") || keys.has("ArrowUp")) targetVelocity.addScaledVector(direction, pace);
      if (keys.has("KeyS") || keys.has("ArrowDown")) targetVelocity.addScaledVector(direction, -pace);
      if (keys.has("KeyA") || keys.has("ArrowLeft")) targetVelocity.addScaledVector(side, -pace);
      if (keys.has("KeyD") || keys.has("ArrowRight")) targetVelocity.addScaledVector(side, pace);

      velocity.lerp(targetVelocity, 1 - Math.pow(0.02, delta));
      camera.position.addScaledVector(velocity, delta);
      camera.position.x = clamp(camera.position.x, -7.2, 7.2);
      camera.position.y = clamp(camera.position.y, 1.3, 5.35);
      camera.position.z = clamp(camera.position.z, -18.8, 15);

      goldLight.intensity = 50;
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
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      resetRef.current = null;
      mount.removeChild(renderer.domElement);
      renderer.dispose();
      backdropTexture.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
          object.geometry?.dispose?.();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material?.dispose?.());
        }
      });
    };
  }, []);

  return (
    <section className="dao-inner-world">
      <div className="dao-inner-world__viewport" ref={mountRef} />
      <div className="dao-inner-world__status" data-ready={isReady} aria-hidden="true" />
    </section>
  );
}