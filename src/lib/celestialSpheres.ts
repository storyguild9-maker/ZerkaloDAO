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
  normalizeToSphere?: boolean;
  radiance?: "sun" | "moon";
  reflectedLight?: {
    color: number;
    intensity: number;
    lift: number;
    metalnessCap: number;
    mappedIntensityCap?: number;
  };
};

const TAU = Math.PI * 2;

export function getDiametricLuminaryPositions(
  phase: number,
  radius: number,
  centerY: number,
  inclination: number,
) {
  const sine = Math.sin(phase);
  const cosine = Math.cos(phase);
  const orbitX = -sine * Math.cos(inclination) * radius;
  const orbitY = sine * Math.sin(inclination) * radius;
  const orbitZ = cosine * radius;
  return {
    sun: new THREE.Vector3(orbitX, centerY + orbitY, orbitZ),
    moon: new THREE.Vector3(-orbitX, centerY - orbitY, -orbitZ),
  };
}

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

function setNoFog<T extends THREE.Material>(material: T): T {
  if ("fog" in material) (material as T & { fog: boolean }).fog = false;
  return material;
}


function makeBodyMaterial(color: number, emissive: number, emissiveIntensity: number) {
  return setNoFog(new THREE.MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0.28,
    emissive,
    emissiveIntensity,
  }));
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

function makeSolarGlowTexture() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5) / size * 2 - 1;
      const dy = (y + 0.5) / size * 2 - 1;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const alpha = distance >= 1 ? 0 : Math.pow(1 - distance, 2.15);
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = Math.round(218 + (1 - distance) * 37);
      data[offset + 2] = Math.round(120 + (1 - distance) * 135);
      data[offset + 3] = Math.round(THREE.MathUtils.clamp(alpha, 0, 1) * 255);
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
    sizeAttenuation: false,
    transparent: true,
    opacity,
    map: pointTexture,
    alphaTest: 0.025,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  material.toneMapped = false;
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
  lines.visible = false;
  parent.add(lines);
  disposables.add(geometry);
  disposables.add(material);
  return material;
}

export function createCelestialSpheres(options: CelestialSpheresOptions): CelestialSpheresRuntime {
  const telegram = Boolean(options.telegram);
  const root = new THREE.Group();
  root.name = "puranic-celestial-spheres";
  root.position.y = options.roomHeight * 2.6;

  const disposables = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  const roundPointTexture = makeRoundPointTexture();
  const solarGlowTexture = makeSolarGlowTexture();
  disposables.add(roundPointTexture);
  disposables.add(solarGlowTexture);
  const orbitRuntimes: OrbitRuntime[] = [];
  const luminaryRadius = Math.max(options.roomWidth, options.roomDepth) * 0.99;
  const orbitScale = luminaryRadius / 70;

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
      normalizeToSphere: true,
      radiance: name === "Surya" ? "sun" : "moon",
    });
    return mount;
  };

  const suryaMount = createLuminary(
    "Surya",
    "/models/celestial-grahas/surya-solar-fury-v2.glb",
    14.8,
    0xffc44f,
    0xff8a16,
    3.4,
  );
  const chandraMount = createLuminary(
    "Chandra",
    "/models/celestial-grahas/chandra-web-v1.glb",
    6.2,
    0xf2f5e9,
    0xc8dcff,
    1.35,
  );
  // The disk supplies its own visual radiance. Illumination is directional at
  // room scale, so a nearby point source must not burn a moving stripe into the floor.
  const suryaLight = new THREE.PointLight(0xffdf91, 0, 0, 2);
  suryaLight.name = "surya-local-radiance";
  suryaMount.add(suryaLight);

  const solarKey = new THREE.DirectionalLight(0xffe4b0, telegram ? 0.78 : 0.92);
  solarKey.name = "surya-celestial-key-light";
  solarKey.castShadow = false;
  solarKey.target.position.set(0, -root.position.y + options.roomHeight * 0.22, 0);
  root.add(solarKey, solarKey.target);

  const solarCoronaMaterial = setNoFog(new THREE.SpriteMaterial({
    map: solarGlowTexture,
    color: 0xffd75a,
    transparent: true,
    opacity: 0.96,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  solarCoronaMaterial.toneMapped = false;
  const solarCorona = new THREE.Sprite(solarCoronaMaterial);
  solarCorona.name = "surya-outer-corona";
  solarCorona.scale.set(27, 27, 1);
  solarCorona.renderOrder = 20;
  suryaMount.add(solarCorona);

  const solarCoreMaterial = setNoFog(new THREE.SpriteMaterial({
    map: solarGlowTexture,
    color: 0xffffdf,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  solarCoreMaterial.toneMapped = false;
  const solarCoreGlow = new THREE.Sprite(solarCoreMaterial);
  solarCoreGlow.name = "surya-white-gold-core";
  solarCoreGlow.scale.set(17, 17, 1);
  solarCoreGlow.renderOrder = 21;
  suryaMount.add(solarCoreGlow);
  disposables.add(solarCoronaMaterial);
  disposables.add(solarCoreMaterial);

  const solarShellMaterial = setNoFog(new THREE.MeshBasicMaterial({
    color: 0xffd447,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  solarShellMaterial.toneMapped = false;
  const solarShell = new THREE.Mesh(bodyGeometry, solarShellMaterial);
  solarShell.name = "surya-luminous-sphere";
  solarShell.scale.setScalar(7.5);
  solarShell.renderOrder = 19;
  suryaMount.add(solarShell);
  disposables.add(solarShellMaterial);
  const chandraLight = new THREE.PointLight(0xc9dcff, telegram ? 12 : 24, 72, 1.45);
  chandraLight.name = "chandra-local-radiance";
  chandraMount.add(chandraLight);

  const lunarAuraMaterial = setNoFog(new THREE.SpriteMaterial({
    map: solarGlowTexture,
    color: 0xbfd8ff,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  lunarAuraMaterial.toneMapped = false;
  const lunarAura = new THREE.Sprite(lunarAuraMaterial);
  lunarAura.name = "chandra-silver-blue-aura";
  lunarAura.scale.set(9, 9, 1);
  lunarAura.renderOrder = 19;
  chandraMount.add(lunarAura);
  disposables.add(lunarAuraMaterial);

  // The remaining grahas occupy increasingly high external celestial tiers
  // above the council table, while Surya and Chandra travel around the hall.
  const grahas = [
    { name: "Shukra", orbitFactor: 1.22, tier: 0, displaySize: 8, color: 0xffe3ab, emissive: 0xffbd64, glow: 0.4, reflectColor: 0xffd79a, reflectIntensity: 0.26, lift: 0.05, metalnessCap: 0.68, auraOpacity: 0.11, auraScale: 1.45, speed: 0.018, phase: 1.85, inclination: -0.08, modelUrl: "/models/celestial-grahas/shukra-web-v1.glb" },
    { name: "Budha", orbitFactor: 1.46, tier: 7, displaySize: 6, color: 0x75d6aa, emissive: 0x2aa97f, glow: 0.42, reflectColor: 0x75d6aa, reflectIntensity: 0.28, lift: 0.05, metalnessCap: 0.64, auraOpacity: 0.12, auraScale: 1.47, speed: 0.023, phase: 2.7, inclination: 0.16, modelUrl: "/models/celestial-grahas/budha-web-v1.glb" },
    { name: "Mangala", orbitFactor: 1.78, tier: 14, displaySize: 7.2, color: 0xf05235, emissive: 0xff210d, glow: 1.8, reflectColor: 0xff351f, reflectIntensity: 1.2, mappedIntensityCap: 1.15, lift: 0.12, metalnessCap: 0.58, auraOpacity: 0.46, auraScale: 1.92, speed: 0.011, phase: 4.2, inclination: -0.12, modelUrl: "/models/celestial-grahas/mangala-web-v1.glb" },
    { name: "Brihaspati", orbitFactor: 2.24, tier: 24, displaySize: 19, color: 0xd4a85b, emissive: 0x9d6b21, glow: 0.38, reflectColor: 0xffd98a, reflectIntensity: 0.28, lift: 0.06, metalnessCap: 0.62, auraOpacity: 0.1, auraScale: 1.42, speed: 0.0062, phase: 5.25, inclination: 0.08, modelUrl: "/models/celestial-grahas/brihaspati-web-v1.glb" },
    { name: "Shani", orbitFactor: 2.78, tier: 36, displaySize: 20.5, color: 0x91a9bd, emissive: 0x6f93bd, glow: 0.42, reflectColor: 0x8bb4df, reflectIntensity: 0.32, lift: 0.04, metalnessCap: 0.46, auraOpacity: 0.14, auraScale: 1.5, speed: 0.0038, phase: 3.35, inclination: -0.17, modelUrl: "/models/celestial-grahas/shani-web-v1.glb" },
  ];

  grahas.forEach((graha) => {
    const radius = luminaryRadius * graha.orbitFactor;
    const pivot = new THREE.Group();
    pivot.name = `${graha.name.toLowerCase()}-orbit`;
    pivot.position.y = graha.tier;
    pivot.rotation.x = graha.inclination;
    pivot.rotation.z = graha.inclination * 0.55;
    orbitLayer.add(pivot);


    const bodyMount = new THREE.Group();
    bodyMount.name = `${graha.name.toLowerCase()}-body-mount`;
    bodyMount.position.x = radius;
    pivot.add(bodyMount);

    const lightProfile = {
      Shukra: { key: 0xffe8bc, rim: 0xd79646 },
      Budha: { key: 0x91e8c2, rim: 0x2b8f70 },
      Mangala: { key: 0xff896f, rim: 0x8e241c },
      Brihaspati: { key: 0xffdfa0, rim: 0xb87832 },
      Shani: { key: 0x9fc9ff, rim: 0x6d8fca },
    }[graha.name];
    const lightIntensityScale = graha.name === "Mangala" ? 3.1 : 1;

    if (lightProfile) {
      const surfaceKey = new THREE.PointLight(
        lightProfile.key,
        (telegram ? 34 : 48) * lightIntensityScale,
        graha.displaySize * 7,
        1.55,
      );
      surfaceKey.name = `${graha.name}-surface-key-light`;
      surfaceKey.position.set(
        -graha.displaySize * 1.15,
        graha.displaySize * 0.75,
        graha.displaySize * 1.9,
      );
      bodyMount.add(surfaceKey);

      const surfaceRim = new THREE.PointLight(
        lightProfile.rim,
        (telegram ? 13 : 18) * lightIntensityScale,
        graha.displaySize * 5.5,
        1.7,
      );
      surfaceRim.name = `${graha.name}-surface-rim-light`;
      surfaceRim.position.set(
        graha.displaySize * 1.25,
        -graha.displaySize * 0.25,
        -graha.displaySize * 1.35,
      );
      bodyMount.add(surfaceRim);
    }

    const reflectedAuraMaterial = setNoFog(new THREE.SpriteMaterial({
      map: solarGlowTexture,
      color: graha.reflectColor,
      transparent: true,
      opacity: graha.auraOpacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    reflectedAuraMaterial.toneMapped = false;
    const reflectedAura = new THREE.Sprite(reflectedAuraMaterial);
    reflectedAura.name = `${graha.name}-reflected-solar-aura`;
    reflectedAura.scale.setScalar(graha.displaySize * graha.auraScale);
    reflectedAura.renderOrder = 4;
    bodyMount.add(reflectedAura);
    disposables.add(reflectedAuraMaterial);

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
      reflectedLight: {
        color: graha.reflectColor,
        intensity: graha.reflectIntensity,
        lift: graha.lift,
        metalnessCap: graha.metalnessCap,
        mappedIntensityCap: graha.mappedIntensityCap,
      },
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
              material.fog = false;
              material.envMapIntensity = Math.max(material.envMapIntensity, 1.15);
              if (entry.radiance === "sun") {
                material.emissive.set(0xffd34d);
                material.emissiveIntensity = Math.max(material.emissiveIntensity, 14);
                material.toneMapped = false;
              } else if (entry.radiance === "moon") {
                material.emissive.set(0x9dbfff);
                material.emissiveIntensity = Math.max(material.emissiveIntensity, 0.85);
              } else if (entry.reflectedLight) {
                material.emissive.set(entry.reflectedLight.color);
                if (material.map && !material.emissiveMap) material.emissiveMap = material.map;
                material.emissiveIntensity = Math.max(
                  material.emissiveIntensity,
                  material.map
                    ? Math.min(
                      entry.reflectedLight.intensity,
                      entry.reflectedLight.mappedIntensityCap ?? 0.32,
                    )
                    : Math.min(entry.reflectedLight.intensity, 0.5),
                );
                material.color.offsetHSL(0, 0, entry.reflectedLight.lift);
                material.roughness = THREE.MathUtils.clamp(material.roughness, 0.26, 0.58);
                material.metalness = Math.min(material.metalness, entry.reflectedLight.metalnessCap);
              }
              material.needsUpdate = true;
            }
          });
        });
        model.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        if (entry.normalizeToSphere) {
          model.scale.set(
            entry.displaySize / Math.max(size.x, 0.001),
            entry.displaySize / Math.max(size.y, 0.001),
            entry.displaySize / Math.max(size.z, 0.001),
          );
        } else {
          model.scale.setScalar(entry.displaySize / Math.max(size.x, size.y, size.z, 0.001));
        }
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
  starLayer.position.y = -root.position.y + options.roomHeight * 0.35;
  root.add(starLayer);
  const random = seededRandom(0x28a7c41);
  const starfieldPositions: number[] = [];
  const starCount = 1200;
  for (let index = 0; index < starCount; index += 1) {
    const azimuth = random() * TAU;
    const elevation = THREE.MathUtils.lerp(-0.08, 1.48, Math.asin(random()) / (Math.PI * 0.5));
    const radius = THREE.MathUtils.lerp(205, 238, random()) * orbitScale;
    const point = sphericalPoint(radius, azimuth, elevation);
    starfieldPositions.push(point.x, point.y, point.z);
  }
  const starfieldMaterial = addStarGeometry(
    starLayer,
    starfieldPositions,
    0xf4fbff,
    2.1,
    0.9,
    disposables,
    roundPointTexture,
  );

  const nakshatraPoints: number[] = [];
  const nakshatraLines: number[] = [];
  const nakshatraRadius = 214 * orbitScale;
  for (let index = 0; index < 28; index += 1) {
    const azimuth = (index / 28) * TAU;
    const elevation = 0.48 + Math.sin(index * 1.73) * 0.16 + Math.cos(index * 0.63) * 0.07;
    const center = sphericalPoint(nakshatraRadius, azimuth, elevation);
    const radial = center.clone().normalize();
    const tangent = new THREE.Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth)).normalize();
    const vertical = new THREE.Vector3().crossVectors(radial, tangent).normalize();
    const localRandom = seededRandom(0x9e3779b9 ^ (index * 7919));
    const constellation: THREE.Vector3[] = [];
    const pointCount = 5 + (index % 3);
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
  const nakshatraMaterial = addStarGeometry(starLayer, nakshatraPoints, 0xffe7a3, 3.4, 0.94, disposables, roundPointTexture);
  const nakshatraLineMaterial = addLineGeometry(starLayer, nakshatraLines, 0xc7ad6d, telegram ? 0.13 : 0.2, disposables);

  const planetariumPoints: number[] = [];
  const planetariumLines: number[] = [];
  const planetariumRadius = 221 * orbitScale;
  const constellationCount = 72;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let index = 0; index < constellationCount; index += 1) {
    const azimuth = (index * goldenAngle + 0.31) % TAU;
    const skyFraction = (index + 0.7) / constellationCount;
    const elevation = Math.asin(THREE.MathUtils.lerp(0.035, 0.985, skyFraction));
    const center = sphericalPoint(planetariumRadius, azimuth, elevation);
    const radial = center.clone().normalize();
    const tangent = new THREE.Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth)).normalize();
    const vertical = new THREE.Vector3().crossVectors(radial, tangent).normalize();
    const localRandom = seededRandom(0x51f15e5d ^ (index * 104729));
    const pointCount = 5 + (index % 4);
    const constellation: THREE.Vector3[] = [];
    for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
      const progress = pointIndex / Math.max(pointCount - 1, 1) - 0.5;
      const horizontalOffset = progress * 11.5 * orbitScale + (localRandom() - 0.5) * 4.2 * orbitScale;
      const verticalOffset = (localRandom() - 0.5) * 8.4 * orbitScale
        + Math.sin((pointIndex + index * 0.37) * 1.8) * 1.8 * orbitScale;
      const point = center.clone()
        .addScaledVector(tangent, horizontalOffset)
        .addScaledVector(vertical, verticalOffset)
        .normalize()
        .multiplyScalar(planetariumRadius + (localRandom() - 0.5) * 3.2 * orbitScale);
      constellation.push(point);
      planetariumPoints.push(point.x, point.y, point.z);
      if (pointIndex > 0) {
        const previous = constellation[pointIndex - 1];
        planetariumLines.push(previous.x, previous.y, previous.z, point.x, point.y, point.z);
      }
    }
    if (constellation.length >= 5) {
      const branchFrom = constellation[1];
      const branchTo = constellation[constellation.length - 2];
      planetariumLines.push(branchFrom.x, branchFrom.y, branchFrom.z, branchTo.x, branchTo.y, branchTo.z);
    }
  }
  const planetariumStarMaterial = addStarGeometry(
    starLayer,
    planetariumPoints,
    0xddeeff,
    3,
    0.95,
    disposables,
    roundPointTexture,
  );
  const planetariumLineMaterial = addLineGeometry(
    starLayer,
    planetariumLines,
    0x8facce,
    telegram ? 0.16 : 0.22,
    disposables,
  );

  const sacredConstellations = new THREE.Group();
  sacredConstellations.name = "sacred-constellations";
  sacredConstellations.position.y = -root.position.y + options.roomHeight * 0.35;
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
  const saptarishiMaterial = addStarGeometry(sacredConstellations, saptarishiPoints, 0xbffff0, 4.2, 1, disposables, roundPointTexture);
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
  const axisMaterial = setNoFog(new THREE.LineBasicMaterial({ color: 0xd8bf7a, transparent: true, opacity: 0, depthWrite: false }));
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
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  const shishumara = new THREE.Line(shishumaraGeometry, shishumaraMaterial);
  shishumara.name = "shishumara-constellation-outline";
  sacredConstellations.add(shishumara);
  disposables.add(shishumaraGeometry);
  disposables.add(shishumaraMaterial);

  const baseOrbitRotation = orbitLayer.rotation.y;
  const luminaryOrbitCenterY = options.roomHeight * 1.9 - root.position.y;
  const luminaryOrbitInclination = 0;
  const update = (elapsedSeconds: number) => {
    const luminaryPhase = Math.PI * 0.5 + (elapsedSeconds / 240) * TAU;
    const luminaryPositions = getDiametricLuminaryPositions(
      luminaryPhase,
      luminaryRadius,
      luminaryOrbitCenterY,
      luminaryOrbitInclination,
    );
    suryaMount.position.copy(luminaryPositions.sun);
    chandraMount.position.copy(luminaryPositions.moon);
    suryaMount.rotation.y = -luminaryPhase;
    chandraMount.rotation.y = -(luminaryPhase + Math.PI);
    solarKey.position.copy(suryaMount.position);
    const solarPulse = 0.5 + Math.sin(elapsedSeconds * 0.72) * 0.5;
    solarCoronaMaterial.opacity = 0.94 + solarPulse * 0.06;
    solarCorona.scale.setScalar(34 + solarPulse * 7);
    solarCoreMaterial.opacity = 0.86 + solarPulse * 0.14;
    solarCoreGlow.scale.setScalar(18 + solarPulse * 3.4);
    solarShellMaterial.opacity = 0.62 + solarPulse * 0.18;
    solarShell.scale.setScalar(7.48 + solarPulse * 0.18);
    suryaLight.intensity = 0;
    solarKey.intensity = (telegram ? 4.8 : 5.6) + solarPulse * (telegram ? 0.7 : 0.9);
    lunarAuraMaterial.opacity = 0.42 + (1 - solarPulse) * 0.16;
    lunarAura.scale.setScalar(15.5 + (1 - solarPulse) * 2.5);
    chandraLight.intensity = (telegram ? 10 : 20) + (1 - solarPulse) * (telegram ? 4 : 8);
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
    starfieldMaterial.opacity = 0.82 + Math.sin(elapsedSeconds * 0.21) * 0.08;
    nakshatraMaterial.opacity = 0.9 + Math.sin(elapsedSeconds * 0.31) * 0.08;
    nakshatraLineMaterial.opacity = (telegram ? 0.11 : 0.17) + Math.sin(elapsedSeconds * 0.17) * 0.035;
    planetariumStarMaterial.opacity = 0.9 + Math.sin(elapsedSeconds * 0.13) * 0.07;
    planetariumLineMaterial.opacity = (telegram ? 0.13 : 0.19) + Math.sin(elapsedSeconds * 0.09) * 0.035;
    saptarishiMaterial.opacity = 0.96 + pulse * 0.04;
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
