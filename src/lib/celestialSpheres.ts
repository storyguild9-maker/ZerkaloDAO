import * as THREE from "three";

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

function addStarGeometry(
  parent: THREE.Object3D,
  positions: number[],
  color: number,
  size: number,
  opacity: number,
  disposables: Set<THREE.BufferGeometry | THREE.Material>,
) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = setNoFog(new THREE.PointsMaterial({
    color,
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity,
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
  disposables: Set<THREE.BufferGeometry | THREE.Material>,
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
  root.position.y = options.roomHeight * 0.62;

  const disposables = new Set<THREE.BufferGeometry | THREE.Material>();
  const orbitRuntimes: OrbitRuntime[] = [];
  const minRoomSpan = Math.min(options.roomWidth, options.roomDepth);
  const orbitScale = THREE.MathUtils.clamp((minRoomSpan / 70) * 0.15, 0.11, 0.2);
  const bodyScale = orbitScale * 2.7;

  const orbitLayer = new THREE.Group();
  orbitLayer.name = "graha-orbits";
  root.add(orbitLayer);

  const bodyGeometry = new THREE.SphereGeometry(1, telegram ? 18 : 28, telegram ? 12 : 20);
  disposables.add(bodyGeometry);

  const grahas = [
    { name: "Chandra", radius: 79, size: 2.7, color: 0xf2f5e9, emissive: 0xc8dcff, glow: 1.35, speed: 0.038, phase: 0.5, inclination: 0.12 },
    { name: "Shukra", radius: 91, size: 1.45, color: 0xffe3ab, emissive: 0xffbd64, glow: 1.0, speed: 0.018, phase: 1.6, inclination: -0.08 },
    { name: "Budha", radius: 104, size: 1.15, color: 0x75d6aa, emissive: 0x2aa97f, glow: 0.95, speed: 0.023, phase: 2.7, inclination: 0.16 },
    { name: "Mangala", radius: 119, size: 1.35, color: 0xc85c4b, emissive: 0xa61e16, glow: 1.05, speed: 0.011, phase: 4.2, inclination: -0.12 },
    { name: "Brihaspati", radius: 138, size: 2.25, color: 0xd4a85b, emissive: 0x9d6b21, glow: 0.72, speed: 0.0062, phase: 5.25, inclination: 0.08 },
    { name: "Shani", radius: 161, size: 1.85, color: 0x8193a3, emissive: 0x334766, glow: 0.78, speed: 0.0038, phase: 3.35, inclination: -0.17 },
  ];

  grahas.forEach((graha, index) => {
    const radius = graha.radius * orbitScale;
    const pivot = new THREE.Group();
    pivot.name = `${graha.name.toLowerCase()}-orbit`;
    pivot.rotation.x = graha.inclination;
    pivot.rotation.z = graha.inclination * 0.55;
    orbitLayer.add(pivot);

    const ringGeometry = new THREE.TorusGeometry(radius, telegram ? 0.035 : 0.052, 5, telegram ? 128 : 192);
    const ringMaterial = makeOrbitMaterial(index % 2 === 0 ? 0xd6c080 : 0x72a89a, telegram ? 0.1 : 0.14);
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.name = `${graha.name.toLowerCase()}-mandala`;
    ring.rotation.x = Math.PI / 2;
    pivot.add(ring);
    disposables.add(ringGeometry);
    disposables.add(ringMaterial);

    const bodyMaterial = makeBodyMaterial(graha.color, graha.emissive, graha.glow);
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.name = graha.name;
    body.scale.setScalar(graha.size * bodyScale);
    body.position.x = radius;
    pivot.add(body);
    disposables.add(bodyMaterial);

    if (graha.name === "Chandra") {
      const crescentGeometry = new THREE.TorusGeometry(1.08, 0.11, 8, 56, Math.PI * 1.45);
      const crescentMaterial = makeOrbitMaterial(0xeaf5ff, 0.88);
      const crescent = new THREE.Mesh(crescentGeometry, crescentMaterial);
      crescent.rotation.y = Math.PI / 2;
      crescent.rotation.z = 0.34;
      body.add(crescent);
      disposables.add(crescentGeometry);
      disposables.add(crescentMaterial);
    }

    if (graha.name === "Brihaspati" || graha.name === "Shani") {
      const bandGeometry = new THREE.TorusGeometry(1.52, 0.055, 7, 64);
      const bandMaterial = makeOrbitMaterial(graha.name === "Shani" ? 0xaac2cd : 0xf0bf6d, 0.72);
      const band = new THREE.Mesh(bandGeometry, bandMaterial);
      band.rotation.x = Math.PI / 2.35;
      band.rotation.z = graha.name === "Shani" ? 0.24 : -0.16;
      body.add(band);
      disposables.add(bandGeometry);
      disposables.add(bandMaterial);
    }

    orbitRuntimes.push({ pivot, speed: graha.speed, phase: graha.phase, body });
  });

  const nodeLayer = new THREE.Group();
  nodeLayer.name = "rahu-ketu-nodal-axis";
  nodeLayer.rotation.x = 0.36;
  nodeLayer.rotation.z = -0.18;
  orbitLayer.add(nodeLayer);
  const nodeRadius = 86 * orbitScale;
  const nodeRingGeometry = new THREE.TorusGeometry(nodeRadius, telegram ? 0.045 : 0.065, 5, telegram ? 128 : 192);
  const nodeRingMaterial = makeOrbitMaterial(0x7a6fc4, telegram ? 0.12 : 0.2);
  const nodeRing = new THREE.Mesh(nodeRingGeometry, nodeRingMaterial);
  nodeRing.rotation.x = Math.PI / 2;
  nodeLayer.add(nodeRing);
  disposables.add(nodeRingGeometry);
  disposables.add(nodeRingMaterial);

  const nodeGeometry = new THREE.IcosahedronGeometry(0.74, telegram ? 1 : 2);
  const rahuMaterial = makeBodyMaterial(0x242332, 0x6b4ed1, 1.65);
  const ketuMaterial = makeBodyMaterial(0x242b2c, 0x42b7a0, 1.55);
  const rahu = new THREE.Mesh(nodeGeometry, rahuMaterial);
  const ketu = new THREE.Mesh(nodeGeometry, ketuMaterial);
  rahu.name = "Rahu";
  ketu.name = "Ketu";
  rahu.position.x = nodeRadius;
  ketu.position.x = -nodeRadius;
  nodeLayer.add(rahu, ketu);
  disposables.add(nodeGeometry);
  disposables.add(rahuMaterial);
  disposables.add(ketuMaterial);

  const starLayer = new THREE.Group();
  starLayer.name = "nakshatra-celestial-vault";
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
    telegram ? 0.85 : 0.72,
    telegram ? 0.72 : 0.82,
    disposables,
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
  const nakshatraMaterial = addStarGeometry(starLayer, nakshatraPoints, 0xffd983, telegram ? 1.12 : 0.96, 0.94, disposables);
  const nakshatraLineMaterial = addLineGeometry(starLayer, nakshatraLines, 0xc7ad6d, telegram ? 0.13 : 0.2, disposables);

  const sacredConstellations = new THREE.Group();
  sacredConstellations.name = "sacred-constellations";
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
  const saptarishiMaterial = addStarGeometry(sacredConstellations, saptarishiPoints, 0x9fe6d1, 1.55, 1, disposables);
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

  const nodeSpeed = -0.0027;
  const baseOrbitRotation = orbitLayer.rotation.y;
  const update = (elapsedSeconds: number) => {
    orbitRuntimes.forEach((runtime, index) => {
      runtime.pivot.rotation.y = runtime.phase + elapsedSeconds * runtime.speed;
      runtime.body.rotation.y = -runtime.pivot.rotation.y * (index % 2 === 0 ? 0.65 : 0.42);
    });
    nodeLayer.rotation.y = elapsedSeconds * nodeSpeed;
    rahu.rotation.y = elapsedSeconds * 0.18;
    ketu.rotation.y = -elapsedSeconds * 0.15;
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
    root.removeFromParent();
    disposables.forEach((resource) => resource.dispose());
    disposables.clear();
  };

  update(0);
  return { group: root, update, dispose };
}
