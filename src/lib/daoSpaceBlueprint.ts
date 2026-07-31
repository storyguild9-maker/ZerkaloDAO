export type Vec3 = readonly [number, number, number];

export type Crop = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type ProjectionLayer = {
  id: string;
  crop: Crop;
  width: number;
  height: number;
  position: Vec3;
  opacity: number;
  rotationY?: number;
};

export type GroundProjection = {
  id: string;
  crop: Crop;
  width: number;
  depth: number;
  position: Vec3;
  opacity: number;
};

export type BlockSpec = {
  id: string;
  position: Vec3;
  size: Vec3;
  material: "stone" | "wetStone" | "jade";
};

export type BambooSpec = {
  id: string;
  position: Vec3;
  height: number;
  radius: number;
  tilt: number;
};

export type SpriteSpec = {
  id: string;
  url: string;
  position: Vec3;
  scale: number;
  opacity: number;
};

const walkwaySteps: BlockSpec[] = Array.from({ length: 18 }, (_, index) => ({
  id: `walkway-step-${index + 1}`,
  position: [-2.6 + index * 0.48, -0.9 + index * 0.055, 7 - index * 1.75] as Vec3,
  size: [4.6 + index * 0.08, 0.18, 1.05] as Vec3,
  material: index % 2 === 0 ? "wetStone" : "stone"
}));

const sideBamboo: BambooSpec[] = Array.from({ length: 24 }, (_, index) => {
  const side = index % 2 === 0 ? -1 : 1;
  return {
    id: `bamboo-${index + 1}`,
    position: [side * (19 + (index % 6) * 1.25), -1.1, 8 - index * 2.9] as Vec3,
    height: 5 + (index % 5) * 1.05,
    radius: 0.08 + (index % 3) * 0.014,
    tilt: side * (0.05 + (index % 4) * 0.025)
  };
});

const foregroundTiles: BlockSpec[] = Array.from({ length: 20 }, (_, index) => {
  const row = Math.floor(index / 5);
  const col = index % 5;
  return {
    id: `foreground-tile-${index + 1}`,
    position: [-12 + col * 5.6 + row * 0.9, -1.12, 12 - row * 3.7] as Vec3,
    size: [5.1, 0.08, 3.2] as Vec3,
    material: "wetStone"
  };
});
const sidePlatforms: BlockSpec[] = Array.from({ length: 14 }, (_, index) => {
  const side = index % 2 === 0 ? -1 : 1;
  const row = Math.floor(index / 2);
  return {
    id: `side-water-island-${index + 1}`,
    position: [side * (9.8 + (row % 3) * 2.3), -1.02 + row * 0.012, 6.2 - row * 4.55] as Vec3,
    size: [3.4 + (row % 2) * 1.2, 0.12, 2.7 + (row % 3) * 0.55] as Vec3,
    material: row % 2 === 0 ? "wetStone" : "stone"
  };
});

const depthSlabs: BlockSpec[] = Array.from({ length: 12 }, (_, index) => {
  const side = index % 2 === 0 ? -1 : 1;
  const row = Math.floor(index / 2);
  return {
    id: `depth-slab-${index + 1}`,
    position: [8 + side * (7.2 + row * 2.15), 1.2 + row * 0.55, -29.5 - row * 3.35] as Vec3,
    size: [0.38 + (row % 2) * 0.14, 4.8 + row * 0.9, 0.92] as Vec3,
    material: row % 3 === 1 ? "jade" : "stone"
  };
});

export const daoSpaceBlueprint = {
  sourceImage: {
    url: "/images/dao-intro-poster-4k.jpg",
    width: 3840,
    height: 2160,
    detailMapUrl: "/images/space-blueprint/dao-background-detail-map.jpg"
  },
  camera: {
    start: [-1.4, 2.55, 15.8] as Vec3,
    yaw: 0.08,
    pitch: -0.08,
    bounds: {
      x: [-28, 28] as readonly [number, number],
      y: [0.35, 12.5] as readonly [number, number],
      z: [-58, 18] as readonly [number, number]
    }
  },
  projectionLayers: [
    {
      id: "relief-backdrop",
      crop: { left: 0, top: 0, right: 1, bottom: 1 },
      width: 92,
      height: 51.75,
      position: [7, 8.8, -74] as Vec3,
      opacity: 0.72
    },
    {
      id: "left-forest-bamboo",
      crop: { left: 0.0, top: 0.0, right: 0.28, bottom: 0.78 },
      width: 30,
      height: 25,
      position: [-24, 5.4, -28] as Vec3,
      opacity: 0.52,
      rotationY: 0.24
    },
    {
      id: "right-portal-architecture",
      crop: { left: 0.55, top: 0.0, right: 1.0, bottom: 0.75 },
      width: 45,
      height: 27,
      position: [14, 6.2, -28] as Vec3,
      opacity: 0.54,
      rotationY: -0.08
    },
    {
      id: "left-near-bamboo",
      crop: { left: 0.0, top: 0.0, right: 0.18, bottom: 0.78 },
      width: 17,
      height: 24,
      position: [-26, 5.3, -12] as Vec3,
      opacity: 0.5,
      rotationY: 0.36
    },
    {
      id: "right-near-forest",
      crop: { left: 0.82, top: 0.0, right: 1.0, bottom: 0.78 },
      width: 18,
      height: 26,
      position: [23, 5.3, -13] as Vec3,
      opacity: 0.44,
      rotationY: -0.24
    },
    {
      id: "distant-water-mist",
      crop: { left: 0.05, top: 0.42, right: 0.7, bottom: 0.77 },
      width: 52,
      height: 18,
      position: [-7, 2.9, -43] as Vec3,
      opacity: 0.28
    }
  ] satisfies ProjectionLayer[],
  groundProjections: [
    {
      id: "water-reflections-projection",
      crop: { left: 0, top: 0.63, right: 1, bottom: 1 },
      width: 98,
      depth: 72,
      position: [0, -1.03, -14] as Vec3,
      opacity: 0.36
    },
    {
      id: "foreground-stone-projection",
      crop: { left: 0.52, top: 0.72, right: 1, bottom: 1 },
      width: 45,
      depth: 28,
      position: [12, -0.98, 1.5] as Vec3,
      opacity: 0.28
    }
  ] satisfies GroundProjection[],
  blocks: [
    ...foregroundTiles,
    ...sidePlatforms,
    ...depthSlabs,
    ...walkwaySteps,
    { id: "platform-base", position: [8.1, -0.82, -21.5], size: [12, 0.42, 3.6], material: "wetStone" },
    { id: "platform-mid", position: [8.1, -0.54, -23.7], size: [10.2, 0.42, 3.3], material: "wetStone" },
    { id: "platform-top", position: [8.1, -0.26, -25.6], size: [8.4, 0.42, 3], material: "wetStone" },
    { id: "pillar-small-left", position: [1.2, 1.58, -25.5], size: [0.55, 5.6, 1.1], material: "jade" },
    { id: "pillar-left", position: [4.2, 2.98, -26.4], size: [0.72, 8.4, 1.1], material: "stone" },
    { id: "pillar-center-left", position: [7.1, 4.18, -27.1], size: [0.82, 10.8, 1.1], material: "jade" },
    { id: "pillar-center-right", position: [10.8, 5.38, -27.6], size: [0.9, 13.2, 1.1], material: "stone" },
    { id: "pillar-right", position: [14, 4.38, -28.2], size: [0.82, 11.2, 1.1], material: "jade" },
    { id: "pillar-far-right", position: [17.4, 3.08, -29.3], size: [0.76, 8.6, 1.1], material: "stone" },
    { id: "far-left-slab", position: [-13.8, 1.38, -18.4], size: [0.72, 5.2, 1.1], material: "stone" },
    { id: "far-left-jade-slab", position: [-17.4, 2.13, -25.3], size: [0.78, 6.7, 1.1], material: "jade" }
  ] satisfies BlockSpec[],
  bamboo: sideBamboo,
  portal: {
    center: [8, 5.25, -25.15] as Vec3,
    rotationY: -0.06,
    outerRadius: 5.25,
    innerRadius: 4.25,
    haloRadius: 5.85
  },
  bowl: {
    position: [8, -0.05, -22.8] as Vec3,
    scale: [1.6, 0.38, 1.6] as Vec3
  },
  sprites: [
    { id: "mirror", url: "/images/artifacts/artifact-mirror-pedestal-v2.png", position: [-8, 1.1, -7] as Vec3, scale: 4.2, opacity: 0.8 },
    { id: "key", url: "/images/artifacts/artifact-key-pedestal-v2.png", position: [-10, 0.9, -19] as Vec3, scale: 3.6, opacity: 0.8 },
    { id: "lantern", url: "/images/artifacts/artifact-lantern-pedestal-v2.png", position: [12, 0.95, -14] as Vec3, scale: 3.1, opacity: 0.8 },
    { id: "gate", url: "/images/artifacts/artifact-gate-pedestal-v2.png", position: [1.5, 1.2, -32] as Vec3, scale: 4.8, opacity: 0.8 }
  ] satisfies SpriteSpec[],
  particles: {
    count: 1100,
    spread: [82, 13, 78] as Vec3,
    origin: [0, -0.6, 12] as Vec3
  }
};
