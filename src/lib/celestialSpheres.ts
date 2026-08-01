import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { assetUrl } from "@/lib/assetUrl";

type CelestialSpheresOptions = {
  telegram?: boolean;
  roomWidth: number;
  roomHeight: number;
  roomDepth: number;
};

export type CelestialSpheresRuntime = {
  group: THREE.Group;
  update: (elapsedSeconds: number) => void;
  dispose: () => void;
};

type OrbitRuntime = {
  pivot: THREE.Group;
  speed: number;
  phase: number;
  body: THREE.Object3D;
};

type GrahaModelMount = {
  mount: THREE.Group;
  placeholder: THREE.Object3D;
  modelUrl: string;
  displaySize: number;
};

const TAU = Math.PI * 2;

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function sphericalPoint(radius: number, azimuth: number, elevation: number) {
  const horizontal = Math.cos(elevation) * radius;
  return new THREE.Vector3(
    Math.sin(azimuth) * horizontal,
    Math.sin(elevation) * radius,
    Math.cos(azimuth) * horizontal,
  );
}

function setNoFog(material: THREE.Material) {
  if ("fog" in material) (material as THREE.Material & { fog: boolean }).fog = false;
  return material;
}

function makeOrbitMaterial(color: number, opacity: number) {
  return setNoFog(new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
}

function makeBodyMaterial(color: number, emissive: number, emissiveIntensity: number) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0.28,
    emissive,
    emissiveIntensity,
  });
}

function disposeObjectTree(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) value.dispose();
      });
      material.dispose();
    });
  });
}

function makeRoundPointTexture() {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5) / size * 2 - 1;
      const dy = (y + 0.5) / size * 2 - 1;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const alpha = THREE.MathUtils.clamp((1 - distance) * 2.8, 0, 1);
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function addStarGeometry(
  parent: THREE.Object3D,
  positions: number[],
  color: number,
  size: number,
  opacity: number,
  disposables: Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>,
  pointTexture: THREE.Texture,
) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = setNoFog(new THREE.PointsMaterial({
    color,
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity,
    map: pointTexture,
    alphaTest: 0.025,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  const points = new THREE.Points(geometry, material);
  parent.add(points);
  disposables.add(geometry);
  disposables.add(material);
  return material;
}

function addLineGeometry(
  parent: THREE.Object3D,
  positions: number[],
  color: number,
  opacity: number,
  disposables: Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>,
) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = setNoFog(new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  const lines = new THREE.LineSegments(geometry, material);
  parent.add(lines);
  disposables.add(geometry);
  disposables.add(material);
  return material;
}

export function createCelestialSpheres(options: CelestialSpheresOptions): CelestialSpheresRuntime {
  const telegram = Boolean(options.telegram);
  const root = new THREE.Group();
  root.name = "puranic-celestial-spheres";
  root.position.y = options.roomHeight * 1.4;

  const disposables = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  const roundPointTexture = makeRoundPointTexture();
  disposables.add(roundPointTexture);
  const orbitRuntimes: OrbitRuntime[] = [];
  const minRoomSpan = Math.min(options.roomWidth, options.roomDepth);
  const orbitScale = THREE.MathUtils.clamp((minRoomSpan / 70) * 0.15, 0.11, 0.2);
  const grahaDistanceScale = THREE.MathUtils.clamp(minRoomSpan / 70, 0.72, 1.1);

  const orbitLayer = new THREE.Group();
  orbitLayer.name = "graha-orbits";
  root.add(orbitLayer);

  const bodyGeometry = new THREE.SphereGeometry(1, telegram ? 14 : 20, telegram ? 10 : 14);
  disposables.add(bodyGeometry);
  const modelMounts: GrahaModelMount[] = [];
  const loadedModels: THREE.Object3D[] = [];
  let disposed = false;

  const luminaryLayer = new THREE.Group();
  luminaryLayer.name = "surya-chandra-diametric-orbit";
  root.add(luminaryLayer);
  const luminaryRadius = Math.max(options.roomWidth, options.roomDepth) * 0.99;

  const createLuminary = (
    name: "Surya" | "Chandra",
    modelUrl: string,
    displaySize: number,
    color: number,
    emissive: number,
    glow: number,
  ) => {
    const mount = new THREE.Group();
    mount.name = `${name.toLowerCase()}-body-mount`;
    luminaryLayer.add(mount);

    const material = makeBodyMaterial(color, emissive, glow);
    const placeholder = new THREE.Mesh(bodyGeometry, material);
    placeholder.name = `${name}-loading-placeholder`;
    placeholder.scale.setScalar(displaySize * 0.28);
    mount.add(placeholder);
    disposables.add(material);

    modelMounts.push({
      mount,
      placeholder,
      modelUrl,
      displaySize: displaySize * (telegram ? 0.88 : 1),
    });
    return mount;
  };

  const suryaMount = createLuminary(
    "Surya",
    "/models/celestial-grahas/surya-web-v1.glb",
    11.5,
    0xffc44f,
    0xff8a16,
    2.2,
  );
  const chandraMount = createLuminary(
    "Chandra",
    "/models/celestial-grahas/chandra-web-v1.glb",
    7.5,
    0xf2f5e9,
    0xc8dcff,
    1.35,
  );
  const suryaLight = new THREE.PointLight(0xffd27a, telegram ? 28 : 52, 32, 1.5);
  suryaLight.name = "surya-local-radiance";
  suryaMount.add(suryaLight);
  const chandraLight = new THREE.PointLight(0xc9dcff, telegram ? 3 : 7, 20, 1.7);
  chandraLight.name = "chandra-local-radiance";
  chandraMount.add(chandraLight);

  // The remaining grahas occupy increasingly high, compressed celestial tiers
  // above the council table, while Surya and Chandra travel around the hall.
  const grahas = [
    { name: "Shukra", distance: 8, tier: 0, displaySize: 1.8, color: 0xffe3ab, emissive: 0xffbd64, glow: 1, speed: 0.018, phase: 1.85, inclination: -0.08, modelUrl: "/models/celestial-grahas/shukra-web-v1.glb" },
    { name: "Budha", distance: 11.5, tier: 1.4, displaySize: 1.15, color: 0x75d6aa, emissive: 0x2aa97f, glow: 0.95, speed: 0.023, phase: 2.7, inclination: 0.16, modelUrl: "/models/celestial-grahas/budha-web-v1.glb" },
    { name: "Mangala", distance: 16.5, tier: 3.1, displaySize: 1.45, color: 0xc85c4b, emissive: 0xa61e16, glow: 1.05, speed: 0.011, phase: 4.2, inclination: -0.12, modelUrl: "/models/celestial-grahas/mangala-web-v1.glb" },
    { name: "Brihaspati", distance: 24.5, tier: 5.5, displaySize: 5.2, color: 0xd4a85b, emissive: 0x9d6b21, glow: 0.72, speed: 0.0062, phase: 5.25, inclination: 0.08, modelUrl: "/models/celestial-grahas/brihaspati-web-v1.glb" },
    { name: "Shani", distance: 34, tier: 8.4, displaySize: 4.7, color: 0x8193a3, emissive: 0x334766, glow: 0.78, speed: 0.0038, phase: 3.35, inclination: -0.17, modelUrl: "/models/celestial-grahas/shani-web-v1.glb" },
  ];

  grahas.forEach((graha, index) => {
    const radius = graha.distance * grahaDistanceScale;
    const pivot = new THREE.Group();
    pivot.name = `${graha.name.toLowerCase()}-orbit`;
    pivot.position.y = graha.tier;
    pivot.rotation.x = graha.inclination;
    pivot.rotation.z = graha.inclination * 0.55;
    orbitLayer.add(pivot);

    const ringGeometry = new THREE.TorusGeometry(radius, telegram ? 0.02 : 0.032, 5, telegram ? 96 : 160);
    const ringMaterial = makeOrbitMaterial(index % 2 === 0 ? 0xd6c080 : 0x72a89a, telegram ? 0.055 : 0.085);
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.name = `${graha.name.toLowerCase()}-mandala`;
    ring.rotation.x = Math.PI / 2;
    pivot.add(ring);
    disposables.add(ringGeometry);
    disposables.add(ringMaterial);

    const bodyMount = new THREE.Group();
    bodyMount.name = `${graha.name.toLowerCase()}-body-mount`;
    bodyMount.position.x = radius;
    pivot.add(bodyMount);

    const bodyMaterial = makeBodyMaterial(graha.color, graha.emissive, graha.glow);
    const placeholder = new THREE.Mesh(bodyGeometry, bodyMaterial);
    placeholder.name = `${graha.name}-loading-placeholder`;
    placeholder.scale.setScalar(graha.displaySize * 0.34);
    bodyMount.add(placeholder);
    disposables.add(bodyMaterial);

    modelMounts.push({
      mount: bodyMount,
      placeholder,
      modelUrl: graha.modelUrl,
      displaySize: graha.displaySize * (telegram ? 0.94 : 1),
    });
    orbitRuntimes.push({ pivot, speed: graha.speed, phase: graha.phase, body: bodyMount });
  });

  const gltfLoader = new GLTFLoader();
  void (async () => {
    for (const entry of modelMounts) {
      if (disposed) break;
      try {
        const gltf = await gltfLoader.loadAsync(assetUrl(entry.modelUrl));
        const model = gltf.scene;
        model.name = `${entry.mount.name}-meshy`;
        model.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          child.castShadow = false;
          child.receiveShadow = false;
          child.frustumCulled = false;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => {
            if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
              material.envMapIntensity = Math.max(material.envMapIntensity, 1.15);
            }
          });
        });
        model.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        model.scale.setScalar(entry.displaySize / Math.max(size.x, size.y, size.z, 0.001));
        model.updateMatrixWorld(true);
        const center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
        model.position.sub(center);
        if (disposed) {
          disposeObjectTree(model);
          break;
        }
        entry.mount.add(model);
        entry.placeholder.visible = false;
        loadedModels.push(model);
      } catch (error) {
        console.info(`Celestial graha model could not be loaded: ${entry.modelUrl}`, error);
      }
    }
  })();

  const starLayer = new THREE.Group();
  starLayer.name = "nakshatra-celestial-vault";
  starLayer.position.y = 4.2;
  starLayer.scale.y = 0.18;
  root.add(starLayer);
  const random = seededRandom(0x28a7c41);
  const starfieldPositions: number[] = [];
  const starCount = telegram ? 190 : 420;
  for (let index = 0; index < starCount; index += 1) {
    const azimuth = random() * TAU;
    const elevation = THREE.MathUtils.lerp(-0.16, 1.38, Math.pow(random(), 0.72));
    const radius = THREE.MathUtils.lerp(198, 232, random()) * orbitScale;
    const point = sphericalPoint(radius, azimuth, elevation);
    starfieldPositions.push(point.x, point.y, point.z);
  }
  const starfieldMaterial = addStarGeometry(
    starLayer,
    starfieldPositions,
    0xdde9dc,
    telegram ? 0.2 : 0.16,
    telegram ? 0.34 : 0.42,
    disposables,
    roundPointTexture,
  );

  const nakshatraPoints: number[] = [];
  const nakshatraLines: number[] = [];
  const nakshatraRadius = 46 * orbitScale;
  for (let index = 0; index < 28; index += 1) {
    const azimuth = (index / 28) * TAU;
    const elevation = 0.48 + Math.sin(index * 1.73) * 0.16 + Math.cos(index * 0.63) * 0.07;
    const center = sphericalPoint(nakshatraRadius, azimuth, elevation);
    const radial = center.clone().normalize();
    const tangent = new THREE.Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth)).normalize();
    const vertical = new THREE.Vector3().crossVectors(radial, tangent).normalize();
    const localRandom = seededRandom(0x9e3779b9 ^ (index * 7919));
    const constellation: THREE.Vector3[] = [];
    const pointCount = telegram ? 4 + (index % 2) : 5 + (index % 3);
    for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
      const horizontalOffset = (localRandom() - 0.5) * 8.5 * orbitScale;
      const verticalOffset = (localRandom() - 0.5) * 6.5 * orbitScale;
      const point = center.clone()
        .addScaledVector(tangent, horizontalOffset)
        .addScaledVector(vertical, verticalOffset)
        .normalize()
        .multiplyScalar(nakshatraRadius + (localRandom() - 0.5) * 2.5 * orbitScale);
      constellation.push(point);
      nakshatraPoints.push(point.x, point.y, point.z);
    }
    constellation.forEach((point, pointIndex) => {
      const next = constellation[(pointIndex + 1) % constellation.length];
      nakshatraLines.push(point.x, point.y, point.z, next.x, next.y, next.z);
    });
  }
  const nakshatraMaterial = addStarGeometry(starLayer, nakshatraPoints, 0xffd983, telegram ? 0.3 : 0.24, 0.72, disposables, roundPointTexture);
  const nakshatraLineMaterial = addLineGeometry(starLayer, nakshatraLines, 0xc7ad6d, telegram ? 0.13 : 0.2, disposables);

  const sacredConstellations = new THREE.Group();
  sacredConstellations.name = "sacred-constellations";
  sacredConstellations.position.y = 5.6;
  sacredConstellations.scale.y = 0.14;
  root.add(sacredConstellations);

  const saptarishiPattern = [
    [-14, 2], [-9, 0], [-4, 3], [1, 1], [5, 5], [10, 8], [15, 6],
  ];
  const saptarishiCenter = sphericalPoint(181 * orbitScale, -0.72, 0.9);
  const saptarishiRadial = saptarishiCenter.clone().normalize();
  const saptarishiTangent = new THREE.Vector3(Math.cos(-0.72), 0, -Math.sin(-0.72)).normalize();
  const saptarishiVertical = new THREE.Vector3().crossVectors(saptarishiRadial, saptarishiTangent).normalize();
  const saptarishiVectors = saptarishiPattern.map(([x, y]) => saptarishiCenter.clone()
    .addScaledVector(saptarishiTangent, x * orbitScale)
    .addScaledVector(saptarishiVertical, y * orbitScale));
  const saptarishiPoints: number[] = [];
  const saptarishiLines: number[] = [];
  saptarishiVectors.forEach((point, index) => {
    saptarishiPoints.push(point.x, point.y, point.z);
    if (index > 0) {
      const previous = saptarishiVectors[index - 1];
      saptarishiLines.push(previous.x, previous.y, previous.z, point.x, point.y, point.z);
    }
  });
  const saptarishiMaterial = addStarGeometry(sacredConstellations, saptarishiPoints, 0x9fe6d1, 0.38, 0.82, disposables, roundPointTexture);
  const saptarishiLineMaterial = addLineGeometry(sacredConstellations, saptarishiLines, 0x7fc5b5, 0.52, disposables);

  const dhruvaGeometry = new THREE.OctahedronGeometry(0.82, telegram ? 1 : 2);
  const dhruvaMaterial = setNoFog(new THREE.MeshBasicMaterial({ color: 0xfff4c4 }));
  const dhruva = new THREE.Mesh(dhruvaGeometry, dhruvaMaterial);
  dhruva.name = "Dhruva";
  dhruva.position.set(0, 206 * orbitScale, 0);
  sacredConstellations.add(dhruva);
  disposables.add(dhruvaGeometry);
  disposables.add(dhruvaMaterial);
  const dhruvaRays = [
    -9, 206, 0, 9, 206, 0,
    0, 197, 0, 0, 215, 0,
    -6.4, 199.6, 0, 6.4, 212.4, 0,
    -6.4, 212.4, 0, 6.4, 199.6, 0,
  ].map((value) => value * orbitScale);
  const dhruvaRayMaterial = addLineGeometry(sacredConstellations, dhruvaRays, 0xffe5a0, 0.7, disposables);

  const axisGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -options.roomHeight * 0.28, 0),
    dhruva.position.clone(),
  ]);
  const axisMaterial = setNoFog(new THREE.LineBasicMaterial({ color: 0xd8bf7a, transparent: true, opacity: 0.09, depthWrite: false }));
  const axis = new THREE.Line(axisGeometry, axisMaterial);
  axis.name = "dhruva-axis";
  sacredConstellations.add(axis);
  disposables.add(axisGeometry);
  disposables.add(axisMaterial);

  const shishumaraPoints: THREE.Vector3[] = [];
  for (let index = 0; index <= 34; index += 1) {
    const t = index / 34;
    const azimuth = -1.95 + t * 3.9 + Math.sin(t * Math.PI * 3) * 0.12;
    const elevation = 0.3 + Math.sin(t * Math.PI) * 0.82 + Math.sin(t * Math.PI * 4) * 0.08;
    shishumaraPoints.push(sphericalPoint((187 + Math.sin(t * Math.PI * 2) * 7) * orbitScale, azimuth, elevation));
  }
  const shishumaraCurve = new THREE.CatmullRomCurve3(shishumaraPoints);
  const shishumaraGeometry = new THREE.BufferGeometry().setFromPoints(shishumaraCurve.getPoints(150));
  const shishumaraMaterial = setNoFog(new THREE.LineBasicMaterial({
    color: 0x6fa394,
    transparent: true,
    opacity: telegram ? 0.08 : 0.12,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  const shishumara = new THREE.Line(shishumaraGeometry, shishumaraMaterial);
  shishumara.name = "shishumara-constellation-outline";
  sacredConstellations.add(shishumara);
  disposables.add(shishumaraGeometry);
  disposables.add(shishumaraMaterial);

  const baseOrbitRotation = orbitLayer.rotation.y;
  const updateLuminaryPosition = (mount: THREE.Object3D, phase: number) => {
    const x = -Math.sin(phase) * luminaryRadius;
    const z = Math.cos(phase) * luminaryRadius;
    const worldY = options.roomHeight * 0.42 + Math.sin(phase) * options.roomHeight * 0.78;
    mount.position.set(x, worldY - root.position.y, z);
    mount.rotation.y = -phase;
  };
  const update = (elapsedSeconds: number) => {
    const luminaryPhase = (elapsedSeconds / 240) * TAU;
    updateLuminaryPosition(suryaMount, luminaryPhase);
    updateLuminaryPosition(chandraMount, luminaryPhase + Math.PI);
    orbitRuntimes.forEach((runtime, index) => {
      runtime.pivot.rotation.y = runtime.phase + elapsedSeconds * runtime.speed;
      runtime.body.rotation.y = -runtime.pivot.rotation.y * (index % 2 === 0 ? 0.65 : 0.42);
    });
    orbitLayer.rotation.y = baseOrbitRotation + Math.sin(elapsedSeconds * 0.004) * 0.035;
    starLayer.rotation.y = elapsedSeconds * 0.0009;
    sacredConstellations.rotation.y = elapsedSeconds * 0.00018;
    dhruva.rotation.y = elapsedSeconds * 0.12;
    const pulse = 0.5 + Math.sin(elapsedSeconds * 1.4) * 0.5;
    dhruva.scale.setScalar(0.92 + pulse * 0.14);
    dhruvaRayMaterial.opacity = 0.5 + pulse * 0.28;
    starfieldMaterial.opacity = 0.72 + Math.sin(elapsedSeconds * 0.21) * 0.08;
    nakshatraMaterial.opacity = 0.88 + Math.sin(elapsedSeconds * 0.31) * 0.08;
    nakshatraLineMaterial.opacity = (telegram ? 0.11 : 0.17) + Math.sin(elapsedSeconds * 0.17) * 0.035;
    saptarishiMaterial.opacity = 0.9 + pulse * 0.1;
    saptarishiLineMaterial.opacity = 0.44 + pulse * 0.12;
  };

  const dispose = () => {
    disposed = true;
    root.removeFromParent();
    loadedModels.forEach(disposeObjectTree);
    loadedModels.length = 0;
    disposables.forEach((resource) => resource.dispose());
    disposables.clear();
  };

  update(0);
  return { group: root, update, dispose };
}
