import fs from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

class NodeFileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      const base64 = Buffer.from(buffer).toString("base64");
      this.result = `data:${blob.type || "application/octet-stream"};base64,${base64}`;
      this.onloadend?.();
    });
  }
}

globalThis.FileReader ??= NodeFileReader;

const outputDir = path.resolve("public/models");
const outputPath = path.join(outputDir, "dao-ancient-tree.glb");
const manifestPath = path.join(outputDir, "dao-ancient-tree.animations.json");
const rand = mulberry32(732916);
const terminalTips = [];
const branchNames = [];
const rootNames = [];
const sapLineNames = [];
const fireflyNames = [];

function mulberry32(seed) {
  return function next() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function range(min, max) {
  return min + (max - min) * rand();
}

function hashNoise(a, b, c = 0) {
  return Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453123 % 1;
}

function randomHorizontal() {
  const angle = rand() * Math.PI * 2;
  return new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
}

function safeFrame(tangent, seed = 0) {
  const preferred = Math.abs(tangent.y) > 0.86 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3().crossVectors(tangent, preferred).normalize();
  const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
  const twist = seed * 0.37;
  normal.applyAxisAngle(tangent, twist);
  binormal.crossVectors(tangent, normal).normalize();
  return { normal, binormal };
}

function createOrganicTubeGeometry(curve, options) {
  const segments = options.segments ?? 24;
  const radialSegments = options.radialSegments ?? 16;
  const radiusStart = options.radiusStart;
  const radiusEnd = options.radiusEnd;
  const twist = options.twist ?? 0;
  const barkDark = new THREE.Color(0x121a15);
  const barkMid = new THREE.Color(0x28392b);
  const barkLight = new THREE.Color(0x5a4a2c);
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const center = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    const { normal, binormal } = safeFrame(tangent, options.seed + i * 0.04);
    const baseRadius = THREE.MathUtils.lerp(radiusStart, radiusEnd, Math.pow(t, 0.72));

    for (let j = 0; j < radialSegments; j += 1) {
      const angle = (j / radialSegments) * Math.PI * 2 + twist * t;
      const ridge = Math.sin(angle * 6.0 + t * 18.0 + options.seed) * 0.055 + Math.sin(angle * 13.0 - t * 9.0) * 0.025;
      const rough = (hashNoise(i, j, options.seed) - 0.5) * 0.05;
      const radius = baseRadius * (1 + ridge + rough);
      const radial = normal.clone().multiplyScalar(Math.cos(angle)).add(binormal.clone().multiplyScalar(Math.sin(angle))).normalize();
      const pos = center.clone().add(radial.multiplyScalar(radius));
      positions.push(pos.x, pos.y, pos.z);

      const stripe = 0.45 + Math.sin(angle * 5 + t * 23 + options.seed) * 0.32 + (hashNoise(j, i, options.seed) - 0.5) * 0.22;
      const color = stripe > 0.63 ? barkLight.clone().lerp(barkMid, 0.45) : barkDark.clone().lerp(barkMid, Math.max(0, stripe));
      colors.push(color.r, color.g, color.b);
      uvs.push(j / radialSegments, t);
    }
  }

  for (let i = 0; i < segments; i += 1) {
    for (let j = 0; j < radialSegments; j += 1) {
      const a = i * radialSegments + j;
      const b = i * radialSegments + ((j + 1) % radialSegments);
      const c = (i + 1) * radialSegments + j;
      const d = (i + 1) * radialSegments + ((j + 1) % radialSegments);
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function curveFrom(start, direction, length, bend = 0.5, lift = 0.2) {
  const dir = direction.clone().normalize();
  const side = randomHorizontal().multiplyScalar(bend);
  const points = [];
  for (let i = 0; i < 6; i += 1) {
    const t = i / 5;
    const liftVector = new THREE.Vector3(0, Math.sin(t * Math.PI) * lift, 0);
    const sideVector = side.clone().multiplyScalar(Math.sin(t * Math.PI) * (0.35 + t * 0.65));
    const forward = dir.clone().multiplyScalar(length * t);
    points.push(start.clone().add(forward).add(sideVector).add(liftVector));
  }
  return new THREE.CatmullRomCurve3(points);
}

function addOrganicBranch(group, name, curve, radiusStart, radiusEnd, material, seed, segments = 24) {
  const mesh = new THREE.Mesh(
    createOrganicTubeGeometry(curve, {
      radiusStart,
      radiusEnd,
      segments,
      radialSegments: radiusStart > 0.22 ? 20 : 14,
      twist: range(-0.7, 0.7),
      seed
    }),
    material
  );
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  branchNames.push(name);
  return mesh;
}

function addSapLine(group, name, curve, material, radius = 0.012) {
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, radius, 6), material);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
  sapLineNames.push(name);
  return mesh;
}

function buildLeafCanopyGeometry(tips) {
  const positions = [];
  const colors = [];
  const indices = [];
  const leafDark = new THREE.Color(0x1f4a30);
  const leafMid = new THREE.Color(0x39734c);
  const leafLight = new THREE.Color(0x77b77a);
  let vertexOffset = 0;

  tips.forEach((tip, tipIndex) => {
    const count = 18 + Math.floor(rand() * 20);
    for (let leafIndex = 0; leafIndex < count; leafIndex += 1) {
      const outward = tip.direction.clone().add(randomHorizontal().multiplyScalar(0.85)).add(new THREE.Vector3(0, range(0.2, 0.85), 0)).normalize();
      const center = tip.position
        .clone()
        .add(outward.clone().multiplyScalar(range(0.12, 0.86)))
        .add(randomHorizontal().multiplyScalar(range(0.05, 0.35)))
        .add(new THREE.Vector3(0, range(-0.18, 0.28), 0));
      const length = range(0.18, 0.42) * tip.leafScale;
      const width = length * range(0.22, 0.38);
      const normalSeed = randomHorizontal().add(new THREE.Vector3(0, range(0.1, 0.5), 0)).normalize();
      const right = new THREE.Vector3().crossVectors(outward, normalSeed).normalize();
      if (right.lengthSq() < 0.001) right.set(1, 0, 0);
      const forward = outward.clone();
      const bend = new THREE.Vector3(0, range(-0.018, 0.035), 0);
      const base = center.clone().add(forward.clone().multiplyScalar(-length * 0.42));
      const lower = center.clone().add(forward.clone().multiplyScalar(-length * 0.08));
      const upper = center.clone().add(forward.clone().multiplyScalar(length * 0.28)).add(bend);
      const tipPoint = center.clone().add(forward.clone().multiplyScalar(length * 0.58)).add(bend.clone().multiplyScalar(1.6));
      const vertices = [
        base,
        lower.clone().add(right.clone().multiplyScalar(-width * 0.78)),
        upper.clone().add(right.clone().multiplyScalar(-width)),
        tipPoint,
        upper.clone().add(right.clone().multiplyScalar(width)),
        lower.clone().add(right.clone().multiplyScalar(width * 0.78))
      ];
      vertices.forEach((vertex, i) => {
        positions.push(vertex.x, vertex.y, vertex.z);
        const color = leafDark.clone().lerp(leafMid, range(0.25, 0.9)).lerp(leafLight, i === 3 ? 0.18 : range(0, 0.09));
        colors.push(color.r, color.g, color.b);
      });
      indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 5, vertexOffset + 1, vertexOffset + 2, vertexOffset + 5, vertexOffset + 2, vertexOffset + 4, vertexOffset + 5, vertexOffset + 2, vertexOffset + 3, vertexOffset + 4);
      vertexOffset += 6;
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeQuaternionTrack(object, duration, poses) {
  const base = object.quaternion.clone();
  const times = poses.map((pose) => pose[0] * duration);
  const values = [];
  poses.forEach((pose) => {
    const [, x, y, z] = pose;
    const delta = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, "XYZ"));
    const result = base.clone().multiply(delta);
    values.push(result.x, result.y, result.z, result.w);
  });
  return new THREE.QuaternionKeyframeTrack(`${object.name}.quaternion`, times, values);
}

function makeScaleTrack(object, duration, multipliers) {
  const base = object.scale.clone();
  const times = multipliers.map((entry) => entry[0] * duration);
  const values = [];
  multipliers.forEach((entry) => {
    const [, x, y = x, z = x] = entry;
    values.push(base.x * x, base.y * y, base.z * z);
  });
  return new THREE.VectorKeyframeTrack(`${object.name}.scale`, times, values);
}

function makePositionTrack(object, duration, offsets) {
  const base = object.position.clone();
  const times = offsets.map((entry) => entry[0] * duration);
  const values = [];
  offsets.forEach((entry) => {
    const [, x, y, z] = entry;
    values.push(base.x + x, base.y + y, base.z + z);
  });
  return new THREE.VectorKeyframeTrack(`${object.name}.position`, times, values);
}

function createAnimations(tree, leafCanopy, branchObjects, rootObjects, sapObjects, fireflyObjects) {
  const clips = [];
  const manifest = [];
  const addClip = (name, duration, description, tracks) => {
    clips.push(new THREE.AnimationClip(name, duration, tracks));
    manifest.push({ name, duration, tracks: tracks.length, description });
  };
  const upperBranches = branchObjects.filter((object) => object.name.includes("major-branch") || object.name.includes("twig"));
  const mainBranches = branchObjects.filter((object) => object.name.includes("major-branch")).slice(0, 10);

  addClip("dao-tree-idle-breath", 12, "Slow organic tree breathing with tiny trunk and canopy motion.", [
    makeScaleTrack(tree, 12, [[0, 1], [0.5, 1.012, 1.007, 1.012], [1, 1]]),
    makeQuaternionTrack(leafCanopy, 12, [[0, 0, 0, 0], [0.5, 0.006, 0.018, 0.01], [1, 0, 0, 0]]),
    ...mainBranches.slice(0, 4).map((object, index) => makeQuaternionTrack(object, 12, [[0, 0, 0, 0], [0.45, 0.003 * (index + 1), 0.004, 0.007 * (index + 1)], [1, 0, 0, 0]]))
  ]);

  addClip("dao-tree-wind-slow-sway", 8, "Readable slow wind across branches and leaf canopy.", [
    makeQuaternionTrack(leafCanopy, 8, [[0, 0, 0, 0], [0.25, 0.025, 0.045, 0.035], [0.5, -0.014, -0.032, -0.025], [0.75, 0.012, 0.02, 0.016], [1, 0, 0, 0]]),
    ...upperBranches.slice(0, 18).map((object, index) => makeQuaternionTrack(object, 8, [[0, 0, 0, 0], [0.25, 0.012 * Math.sin(index), 0.006, 0.028 * Math.cos(index * 0.7)], [0.5, -0.01, -0.004, -0.02], [1, 0, 0, 0]]))
  ]);

  addClip("dao-tree-wind-strong-gust", 3.2, "Short stronger gust for portal or threshold events.", [
    makeQuaternionTrack(leafCanopy, 3.2, [[0, 0, 0, 0], [0.2, 0.055, 0.09, 0.075], [0.48, -0.034, -0.05, -0.04], [1, 0, 0, 0]]),
    ...upperBranches.slice(0, 12).map((object, index) => makeQuaternionTrack(object, 3.2, [[0, 0, 0, 0], [0.2, 0.03, 0.016, 0.065 + index * 0.002], [0.55, -0.018, -0.012, -0.045], [1, 0, 0, 0]]))
  ]);

  addClip("dao-tree-crown-breath", 5.6, "Canopy expands and contracts like a single living mass.", [
    makeScaleTrack(leafCanopy, 5.6, [[0, 1], [0.25, 1.055, 1.035, 1.05], [0.52, 0.985, 0.99, 0.985], [0.78, 1.035, 1.02, 1.03], [1, 1]])
  ]);

  addClip("dao-tree-leaf-flutter", 3.8, "Higher-frequency flutter for the leaf-card canopy.", [
    makeQuaternionTrack(leafCanopy, 3.8, [[0, 0, 0, 0], [0.25, 0.018, 0.035, 0.018], [0.5, -0.012, -0.026, -0.016], [0.75, 0.016, 0.022, 0.02], [1, 0, 0, 0]])
  ]);

  addClip("dao-tree-root-awakening", 6, "Surface roots press outward and settle into the ground.", rootObjects.flatMap((object, index) => [
    makeScaleTrack(object, 6, [[0, 0.86, 0.96, 0.86], [0.35, 1.1 + index * 0.01, 1.02, 1.08], [0.7, 0.98, 0.99, 0.98], [1, 1]]),
    makePositionTrack(object, 6, [[0, 0, 0.06, 0], [0.35, 0, -0.02, 0], [1, 0, 0, 0]])
  ]));

  addClip("dao-tree-growth-reveal", 9, "One-shot growth layer for assembling the tree from a seed scale.", [
    makeScaleTrack(tree, 9, [[0, 0.04, 0.02, 0.04], [0.2, 0.16, 0.42, 0.16], [0.48, 0.5, 0.82, 0.5], [0.78, 0.92, 1.07, 0.92], [1, 1]]),
    makePositionTrack(tree, 9, [[0, 0, -0.28, 0], [0.48, 0, -0.08, 0], [1, 0, 0, 0]])
  ]);

  addClip("dao-tree-gold-vein-pulse", 4.4, "Subtle pulse through amber sap lines and bark highlights.", sapObjects.flatMap((object, index) => [
    makeScaleTrack(object, 4.4, [[0, 1], [0.25, 1.16 + index * 0.01, 1.08, 1.16], [0.52, 0.94, 0.96, 0.94], [1, 1]]),
    makeQuaternionTrack(object, 4.4, [[0, 0, 0, 0], [0.5, 0, 0.012 + index * 0.002, 0], [1, 0, 0, 0]])
  ]));

  addClip("dao-tree-firefly-orbit", 7.2, "Small warm light points drift around the trunk and canopy.", fireflyObjects.map((object, index) => {
    const radius = 0.18 + (index % 5) * 0.08;
    return makePositionTrack(object, 7.2, [[0, 0, 0, 0], [0.25, Math.cos(index) * radius, 0.08, Math.sin(index) * radius], [0.5, Math.sin(index * 0.7) * radius, -0.03, Math.cos(index * 0.7) * radius], [0.75, -Math.cos(index) * radius * 0.6, 0.05, -Math.sin(index) * radius * 0.6], [1, 0, 0, 0]]);
  }));

  addClip("dao-tree-night-settle", 14, "Long calm loop for quiet inspection of the tree.", [
    makeQuaternionTrack(leafCanopy, 14, [[0, 0, 0, 0], [0.5, 0.006, 0.012, 0.008], [1, 0, 0, 0]]),
    makeScaleTrack(leafCanopy, 14, [[0, 1], [0.5, 1.018, 1.01, 1.018], [1, 1]])
  ]);

  return { clips, manifest };
}

const tree = new THREE.Group();
tree.name = "dao-realistic-jade-tree";
tree.userData = {
  title: "Dao Realistic Jade Tree",
  style: "organic bark, leaf-card canopy, dark jade forest, subtle amber sap lines",
  generatedBy: "Codex procedural Three.js generator"
};

const barkMaterial = new THREE.MeshStandardMaterial({
  name: "layered_organic_bark_vertex_color",
  vertexColors: true,
  color: 0xffffff,
  roughness: 0.88,
  metalness: 0.04
});
const leafMaterial = new THREE.MeshStandardMaterial({
  name: "individual_leaf_cards_vertex_color",
  vertexColors: true,
  color: 0xffffff,
  roughness: 0.62,
  metalness: 0.02,
  side: THREE.DoubleSide
});
const sapMaterial = new THREE.MeshStandardMaterial({
  name: "subtle_amber_sap_lines",
  color: 0xc99a52,
  emissive: 0x3e250c,
  emissiveIntensity: 0.45,
  roughness: 0.4,
  metalness: 0.35
});
const mossMaterial = new THREE.MeshStandardMaterial({ name: "soft_moss_base", color: 0x25442d, roughness: 0.9, metalness: 0.02 });
const glowMaterial = new THREE.MeshBasicMaterial({ name: "warm_living_dust", color: 0xf0cd80, transparent: true, opacity: 0.72 });

const trunkCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(-0.16, 0.9, 0.08),
  new THREE.Vector3(0.18, 1.9, -0.08),
  new THREE.Vector3(-0.04, 3.0, 0.14),
  new THREE.Vector3(0.28, 4.15, -0.06),
  new THREE.Vector3(0.06, 5.35, 0.1),
  new THREE.Vector3(0.24, 6.45, -0.04),
  new THREE.Vector3(0.08, 7.3, 0.08)
]);
const trunk = addOrganicBranch(tree, "trunk-main", trunkCurve, 0.5, 0.16, barkMaterial, 1.7, 44);

const branchObjects = [trunk];
const rootObjects = [];
const sapObjects = [];
const fireflyObjects = [];

for (let index = 0; index < 9; index += 1) {
  const t = 0.24 + index * 0.075;
  const base = trunkCurve.getPoint(t);
  const tangent = trunkCurve.getTangent(t).normalize();
  const angle = index * 2.38 + range(-0.35, 0.35);
  const outward = new THREE.Vector3(Math.cos(angle), range(0.22, 0.52), Math.sin(angle)).normalize();
  const direction = outward.add(tangent.clone().multiplyScalar(0.18)).normalize();
  const length = range(2.0, 3.6) * (1.1 - t * 0.42);
  const curve = curveFrom(base, direction, length, range(0.25, 0.65), range(0.2, 0.55));
  const branch = addOrganicBranch(tree, `major-branch-${index + 1}`, curve, range(0.15, 0.22) * (1.1 - t * 0.3), range(0.045, 0.07), barkMaterial, 10 + index, 24);
  branchObjects.push(branch);

  if (index % 2 === 0) {
    const sapStart = curve.getPoint(0.08);
    const sapMid = curve.getPoint(0.45).add(randomHorizontal().multiplyScalar(0.04));
    const sapEnd = curve.getPoint(0.82);
    const sap = addSapLine(tree, `gold-sap-line-${sapLineNames.length + 1}`, new THREE.CatmullRomCurve3([sapStart, sapMid, sapEnd]), sapMaterial, 0.007);
    sapObjects.push(sap);
  }

  for (let child = 0; child < 3; child += 1) {
    const childT = 0.38 + child * 0.21 + range(-0.04, 0.04);
    const childBase = curve.getPoint(Math.max(0.22, Math.min(0.92, childT)));
    const childDir = direction.clone().add(randomHorizontal().multiplyScalar(range(0.45, 0.9))).add(new THREE.Vector3(0, range(0.15, 0.55), 0)).normalize();
    const childLength = range(0.9, 1.85) * (1.05 - childT * 0.25);
    const twigCurve = curveFrom(childBase, childDir, childLength, range(0.12, 0.36), range(0.05, 0.24));
    const twig = addOrganicBranch(tree, `twig-${index + 1}-${child + 1}`, twigCurve, range(0.045, 0.075), range(0.012, 0.024), barkMaterial, 40 + index * 5 + child, 14);
    branchObjects.push(twig);
    terminalTips.push({ position: twigCurve.getPoint(1), direction: childDir, leafScale: range(0.8, 1.25) });
  }
  terminalTips.push({ position: curve.getPoint(1), direction, leafScale: range(0.9, 1.35) });
}

for (let index = 0; index < 7; index += 1) {
  const angle = (index / 7) * Math.PI * 2 + range(-0.22, 0.22);
  const start = new THREE.Vector3(0, 0.08, 0);
  const endDir = new THREE.Vector3(Math.cos(angle), -0.06, Math.sin(angle)).normalize();
  const curve = curveFrom(start, endDir, range(1.25, 2.15), range(0.18, 0.42), range(-0.04, 0.08));
  const root = addOrganicBranch(tree, `surface-root-${index + 1}`, curve, range(0.18, 0.28), range(0.04, 0.08), barkMaterial, 90 + index, 16);
  rootObjects.push(root);
  rootNames.push(root.name);
}

for (let index = 0; index < 7; index += 1) {
  const t0 = 0.08 + index * 0.09;
  const sapCurve = new THREE.CatmullRomCurve3([
    trunkCurve.getPoint(t0).add(randomHorizontal().multiplyScalar(0.08)),
    trunkCurve.getPoint(Math.min(0.96, t0 + 0.2)).add(randomHorizontal().multiplyScalar(0.06)),
    trunkCurve.getPoint(Math.min(1, t0 + 0.38)).add(randomHorizontal().multiplyScalar(0.05))
  ]);
  const sap = addSapLine(tree, `gold-sap-line-${sapLineNames.length + 1}`, sapCurve, sapMaterial, index % 3 === 0 ? 0.01 : 0.006);
  sapObjects.push(sap);
}

const leafCanopy = new THREE.Mesh(buildLeafCanopyGeometry(terminalTips), leafMaterial);
leafCanopy.name = "leaf-canopy";
leafCanopy.castShadow = true;
leafCanopy.receiveShadow = true;
tree.add(leafCanopy);

for (let index = 0; index < 15; index += 1) {
  const moss = new THREE.Mesh(new THREE.IcosahedronGeometry(range(0.12, 0.28), 1), mossMaterial);
  moss.name = `moss-lump-${index + 1}`;
  const angle = rand() * Math.PI * 2;
  moss.position.set(Math.cos(angle) * range(0.25, 1.35), range(-0.12, 0.08), Math.sin(angle) * range(0.25, 1.2));
  moss.scale.set(range(1.1, 1.8), range(0.22, 0.52), range(0.8, 1.35));
  moss.rotation.set(range(0, Math.PI), range(0, Math.PI), range(0, Math.PI));
  moss.castShadow = true;
  moss.receiveShadow = true;
  tree.add(moss);
}

for (let index = 0; index < 14; index += 1) {
  const firefly = new THREE.Mesh(new THREE.SphereGeometry(range(0.025, 0.055), 10, 8), glowMaterial);
  firefly.name = `tree-firefly-${index + 1}`;
  const angle = index * 1.63;
  const radius = range(0.75, 2.55);
  firefly.position.set(Math.cos(angle) * radius, range(1.2, 6.4), Math.sin(angle) * radius);
  tree.add(firefly);
  fireflyObjects.push(firefly);
  fireflyNames.push(firefly.name);
}

const { clips: animationClips, manifest: animationManifest } = createAnimations(tree, leafCanopy, branchObjects, rootObjects, sapObjects, fireflyObjects);
tree.userData.animationClips = animationManifest.map((clip) => clip.name);
tree.userData.branchCount = branchObjects.length;
tree.userData.leafTipCount = terminalTips.length;

const exporter = new GLTFExporter();
const glb = await exporter.parseAsync(tree, {
  binary: true,
  trs: true,
  onlyVisible: true,
  animations: animationClips
});

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(outputPath, Buffer.from(glb));
await fs.writeFile(manifestPath, JSON.stringify(animationManifest, null, 2));

const box = new THREE.Box3().setFromObject(tree);
const size = box.getSize(new THREE.Vector3());
const vertexCount = tree.children.reduce((sum, object) => {
  if (object instanceof THREE.Mesh && object.geometry.attributes.position) {
    return sum + object.geometry.attributes.position.count;
  }
  return sum;
}, 0);

console.log(
  JSON.stringify(
    {
      output: outputPath,
      bytes: Buffer.byteLength(Buffer.from(glb)),
      objectCount: tree.children.length,
      branchCount: branchObjects.length,
      terminalTipCount: terminalTips.length,
      vertexCount,
      animationCount: animationManifest.length,
      animations: animationManifest.map((clip) => clip.name),
      bounds: {
        width: Number(size.x.toFixed(2)),
        height: Number(size.y.toFixed(2)),
        depth: Number(size.z.toFixed(2))
      }
    },
    null,
    2
  )
);
