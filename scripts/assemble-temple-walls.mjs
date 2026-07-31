import { readFile, writeFile } from "node:fs/promises";

const templatePath = new URL("../data/inner-constructor-template.json", import.meta.url);
const template = JSON.parse(await readFile(templatePath, "utf8"));

const keep = (item) => {
  if (item.id?.startsWith("kit-")) return false;
  if (item.slug === "96-ceremonial-crystal-lamp") return false;
  return true;
};

const make = ({ id, slug, label, position, rotation = [0, 0, 0], scale, surface = "floor", opacity = 1 }) => ({
  id,
  slug,
  label,
  position,
  rotation,
  scale,
  opacity,
  visible: true,
  surface,
  surfaceLocked: true
});

const wall = "239-white-gold-gothic-wall-bay-kit";
const column = "238-white-gold-modular-column-kit";
const corner = "240-white-gold-corner-connector-kit";

const items = template.items.filter(keep);
const architecture = [];

[-28, -14, 0, 14, 28].forEach((x, index) => {
  architecture.push(make({
    id: `kit-wall-back-${index + 1}`,
    slug: wall,
    label: "стена задняя арочная",
    position: [x, 0, -34.82],
    rotation: [0, 0, 0],
    scale: [9.8, 14.35, 9.8],
    surface: "back-wall",
    opacity: 0.98
  }));
});

[-24, -12, 0, 12, 24].forEach((z, index) => {
  architecture.push(make({
    id: `kit-wall-left-${index + 1}`,
    slug: wall,
    label: "стена левая арочная",
    position: [-34.82, 0, z],
    rotation: [0, 90, 0],
    scale: [9.2, 14.25, 9.2],
    surface: "left-wall",
    opacity: 0.98
  }));
  architecture.push(make({
    id: `kit-wall-right-${index + 1}`,
    slug: wall,
    label: "стена правая арочная",
    position: [34.82, 0, z],
    rotation: [0, -90, 0],
    scale: [9.2, 14.25, 9.2],
    surface: "right-wall",
    opacity: 0.98
  }));
});

[-28, -14, 14, 28].forEach((x, index) => {
  architecture.push(make({
    id: `kit-wall-front-side-${index + 1}`,
    slug: wall,
    label: "передняя стена боковой пролет",
    position: [x, 0, 34.82],
    rotation: [0, 180, 0],
    scale: [8.6, 13.8, 8.6],
    surface: "front-wall",
    opacity: 0.92
  }));
});

[
  ["back-left", -34.2, -34.2, 45],
  ["back-right", 34.2, -34.2, -45],
  ["front-left", -34.2, 34.2, 135],
  ["front-right", 34.2, 34.2, -135]
].forEach(([name, x, z, ry]) => {
  architecture.push(make({
    id: `kit-corner-${name}`,
    slug: corner,
    label: "угловой соединитель",
    position: [x, 0, z],
    rotation: [0, ry, 0],
    scale: [3.9, 14.4, 3.9],
    surface: "floor"
  }));
});

[-26, -13, 0, 13, 26].forEach((z, index) => {
  architecture.push(make({
    id: `kit-column-left-row-${index + 1}`,
    slug: column,
    label: "левая несущая колонна",
    position: [-29.2, 0, z],
    scale: [2.65, 14.6, 2.65],
    surface: "floor"
  }));
  architecture.push(make({
    id: `kit-column-right-row-${index + 1}`,
    slug: column,
    label: "правая несущая колонна",
    position: [29.2, 0, z],
    scale: [2.65, 14.6, 2.65],
    surface: "floor"
  }));
});

[-22, -11, 0, 11, 22].forEach((x, index) => {
  architecture.push(make({
    id: `kit-column-back-row-${index + 1}`,
    slug: column,
    label: "задняя несущая колонна",
    position: [x, 0, -29.4],
    scale: [2.55, 14.6, 2.55],
    surface: "floor"
  }));
});

[-22, 22].forEach((x, index) => {
  architecture.push(make({
    id: `kit-column-front-gate-${index + 1}`,
    slug: column,
    label: "передняя входная колонна",
    position: [x, 0, 29.6],
    scale: [2.55, 14.6, 2.55],
    surface: "floor"
  }));
});

template.version = 1;
template.updatedAt = new Date().toISOString();
template.items = [...items, ...architecture];

await writeFile(templatePath, `${JSON.stringify(template, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  total: template.items.length,
  preserved: items.length,
  architecture: architecture.length,
  walls: architecture.filter((item) => item.slug === wall).length,
  columns: architecture.filter((item) => item.slug === column).length,
  corners: architecture.filter((item) => item.slug === corner).length
}, null, 2));
