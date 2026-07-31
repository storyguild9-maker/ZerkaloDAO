import { copyFile, readFile, writeFile } from "node:fs/promises";

const templatePath = new URL("../data/inner-constructor-template.json", import.meta.url);
const backupPath = new URL(`../data/inner-constructor-template.backup-before-four-wall-reflect-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, import.meta.url);

const template = JSON.parse(await readFile(templatePath, "utf8"));
await copyFile(templatePath, backupPath);

const round = (value) => Math.round(value * 100) / 100;
const norm = (value) => {
  let next = value % 360;
  if (next > 180) next -= 360;
  if (next < -180) next += 360;
  return round(next);
};

const coreKeep = (item) => {
  if (item.id?.startsWith("base-")) return true;
  if (item.id === "floor-inlay-soft") return true;
  if (item.slug?.includes("candelabrum")) return true;
  return false;
};

const isUserWallSource = (item) => {
  const [x = 0, , z = 0] = item.position ?? [];
  if (coreKeep(item)) return false;
  if (z > -29) return false;
  if (Math.abs(x) > 26) return false;
  if (item.slug?.includes("council-round") || item.slug?.includes("chair")) return false;
  return true;
};

const rotatePosition = ([x, y, z], angleDeg) => {
  const angle = (Math.PI * angleDeg) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    round(x * cos + z * sin),
    round(y),
    round(-x * sin + z * cos)
  ];
};

const rotateItem = (item, side) => {
  const next = structuredClone(item);
  next.id = `wall-${side.name}-${item.id}`;
  next.label = `${item.label ?? item.slug} ${side.label}`;
  next.position = rotatePosition(item.position, side.angle);
  next.rotation = [
    norm((item.rotation?.[0] ?? 0)),
    norm((item.rotation?.[1] ?? 0) + side.angle),
    norm((item.rotation?.[2] ?? 0))
  ];
  next.surface = side.surface;
  next.surfaceLocked = false;
  next.visible = item.visible ?? true;
  next.opacity = item.opacity ?? 1;
  return next;
};

const source = template.items.filter(isUserWallSource);

if (source.length < 8) {
  throw new Error(`Source wall looks too small: ${source.length} objects`);
}

const sides = [
  { name: "back", label: "задняя сторона", angle: 0, surface: "back-wall" },
  { name: "right", label: "правая сторона", angle: -90, surface: "right-wall" },
  { name: "front", label: "передняя сторона", angle: 180, surface: "front-wall" },
  { name: "left", label: "левая сторона", angle: 90, surface: "left-wall" }
];

const base = template.items.filter(coreKeep);
const reflectedWalls = sides.flatMap((side) => source.map((item) => rotateItem(item, side)));

template.version = 1;
template.updatedAt = new Date().toISOString();
template.items = [...base, ...reflectedWalls];

await writeFile(templatePath, `${JSON.stringify(template, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  backup: backupPath.pathname,
  base: base.length,
  sourceWall: source.length,
  reflectedWallObjects: reflectedWalls.length,
  total: template.items.length,
  sourceIds: source.map((item) => item.id)
}, null, 2));
