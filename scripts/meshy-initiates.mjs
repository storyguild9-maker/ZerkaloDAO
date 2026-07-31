import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const imageManifestPath = path.join(root, "public", "images", "initiates", "manifest.json");
const outputDir = path.join(root, "public", "models", "initiates", "generated");
const manifestPath = path.join(root, "public", "models", "initiates", "manifest.json");

loadDotEnv(path.join(root, ".env"));

const apiBase = (process.env.MESHY_API_BASE || "https://api.meshy.ai/openapi/v1").replace(/\/$/, "");
const apiKey = process.env.MESHY_API_KEY;

const motionSlots = [
  { id: "walk-to-seat", label: "Идти к месту", prompt: "walk forward toward a council table, ceremonial calm gait, 4 seconds, loop false" },
  { id: "sit-at-table", label: "Сесть за стол", prompt: "approach chair and sit down with dignified ceremonial movement, 5 seconds, loop false" },
  { id: "stand-from-seat", label: "Встать", prompt: "rise from council chair, straighten posture, calm ceremonial movement, 4 seconds, loop false" },
  { id: "walk-loop", label: "Идти", prompt: "neutral forward walking loop, dignified initiate gait, robe cloth motion, 3 seconds, loop true" },
  { id: "spell-charge", label: "Заклинание с зарядом", prompt: "raise hands and charge a glowing violet-gold energy spell, controlled mystical motion, 5 seconds, loop false" },
];

const femaleMotionSlots = [
  ...motionSlots,
  { id: "female-walk-loop", label: "Идущая женщина", prompt: "elegant adult female walking loop, ceremonial robe movement, calm confident gait, 3 seconds, loop true" },
];

const commands = { plan, create, status, wait, download };
const command = process.argv[2];

if (!command || !commands[command]) {
  printHelp();
  process.exit(command ? 1 : 0);
}

await commands[command](parseArgs(process.argv.slice(3)));

function printHelp() {
  console.log(`Meshy initiate pipeline

Commands:
  node scripts/meshy-initiates.mjs plan --variant cyber
  node scripts/meshy-initiates.mjs create --variant cyber --limit 8
  node scripts/meshy-initiates.mjs status
  node scripts/meshy-initiates.mjs wait --interval 20000 --timeout 3600000
  node scripts/meshy-initiates.mjs download

Variants:
  temple | cyber
`);
}

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      parsed._.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const equalsIndex = trimmed.indexOf("=");
    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function requireApiKey() {
  if (!apiKey) throw new Error("MESHY_API_KEY is missing in projects/zerkalo-dao/.env");
}

function ensureDirs() {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
}

function readImageManifest() {
  if (!fs.existsSync(imageManifestPath)) throw new Error(`Missing ${imageManifestPath}`);
  return JSON.parse(stripBom(fs.readFileSync(imageManifestPath, "utf8")));
}

function readManifest() {
  ensureDirs();
  if (!fs.existsSync(manifestPath)) return { updatedAt: null, avatars: [] };
  return JSON.parse(stripBom(fs.readFileSync(manifestPath, "utf8")));
}

function writeManifest(manifest) {
  ensureDirs();
  manifest.updatedAt = new Date().toISOString();
  manifest.avatars.sort((a, b) => a.id.localeCompare(b.id, "en"));
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function selectAvatars(args) {
  const variant = args.variant || "cyber";
  if (!["temple", "cyber"].includes(variant)) throw new Error("--variant must be temple or cyber");
  const limit = Number(args.limit || 0);
  const only = args.only ? new Set(String(args.only).split(",").map((item) => item.trim()).filter(Boolean)) : null;
  const avatars = readImageManifest()
    .filter((item) => !only || only.has(item.id))
    .map((item) => {
      const image = variant === "cyber" ? item.cyberImage : item.image;
      const relativeImage = image.startsWith("/") ? image.slice(1) : image;
      return {
        id: `${item.id}-${variant}`,
        baseId: item.id,
        title: item.title,
        gender: item.gender,
        direction: item.direction,
        role: item.role,
        variant,
        sourceImage: image,
        sourceImagePath: path.join(root, "public", relativeImage),
        motions: item.gender === "женщина" ? femaleMotionSlots : motionSlots,
      };
    });
  const selected = limit > 0 ? avatars.slice(0, limit) : avatars;
  for (const avatar of selected) {
    if (!fs.existsSync(avatar.sourceImagePath)) throw new Error(`Missing source image: ${avatar.sourceImagePath}`);
  }
  return selected;
}

function imageToDataUri(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;
}

async function meshyFetch(endpoint, options = {}) {
  requireApiKey();
  const response = await fetch(`${apiBase}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? safeJson(text) : null;
  if (!response.ok) throw new Error(`Meshy API ${response.status}: ${text}`);
  return data;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function upsertAvatar(patch) {
  const manifest = readManifest();
  const existing = manifest.avatars.find((avatar) => avatar.id === patch.id || (patch.taskId && avatar.taskId === patch.taskId));
  if (existing) {
    Object.assign(existing, patch, { updatedAt: new Date().toISOString() });
  } else {
    manifest.avatars.push({ createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...patch });
  }
  writeManifest(manifest);
}

async function plan(args) {
  const avatars = selectAvatars(args);
  for (const avatar of avatars) {
    upsertAvatar({
      id: avatar.id,
      baseId: avatar.baseId,
      title: avatar.title,
      gender: avatar.gender,
      direction: avatar.direction,
      role: avatar.role,
      variant: avatar.variant,
      sourceImage: avatar.sourceImage,
      motions: avatar.motions,
      status: "planned",
    });
  }
  console.log(JSON.stringify({ planned: avatars.map((avatar) => avatar.id) }, null, 2));
}

async function create(args) {
  const avatars = selectAvatars(args);
  await plan(args);
  for (const avatar of avatars) {
    const current = readManifest().avatars.find((item) => item.id === avatar.id);
    if (current?.taskId && args.force !== "true") {
      console.log(JSON.stringify({ id: avatar.id, skipped: true, taskId: current.taskId }, null, 2));
      continue;
    }
    const body = {
      image_url: imageToDataUri(avatar.sourceImagePath),
      enable_pbr: args.pbr !== "false",
      should_remesh: args.remesh !== "false",
      should_texture: args.texture !== "false",
    };
    const data = await meshyFetch("/image-to-3d", { method: "POST", body: JSON.stringify(body) });
    const taskId = data?.result || data?.id || data?.task_id || data?.taskId;
    if (!taskId) {
      console.log(JSON.stringify(data, null, 2));
      throw new Error(`Meshy response did not include task id for ${avatar.id}`);
    }
    upsertAvatar({
      id: avatar.id,
      baseId: avatar.baseId,
      title: avatar.title,
      gender: avatar.gender,
      direction: avatar.direction,
      role: avatar.role,
      variant: avatar.variant,
      sourceImage: avatar.sourceImage,
      motions: avatar.motions,
      taskId,
      status: "created",
      pbr: body.enable_pbr,
      remesh: body.should_remesh,
      texture: body.should_texture,
    });
    console.log(JSON.stringify({ id: avatar.id, taskId }, null, 2));
  }
}

async function status(args) {
  const manifest = readManifest();
  const targets = targetAvatars(manifest, args);
  for (const avatar of targets) {
    if (!avatar.taskId) continue;
    const normalized = normalizeTask(await getTask(avatar.taskId));
    upsertAvatar({
      id: avatar.id,
      taskId: avatar.taskId,
      status: normalized.status,
      progress: normalized.progress,
      modelUrls: normalized.modelUrls,
      thumbnailUrl: normalized.thumbnailUrl,
      rawStatus: normalized.raw,
    });
    console.log(JSON.stringify({ id: avatar.id, taskId: avatar.taskId, status: normalized.status, progress: normalized.progress }, null, 2));
  }
}

async function wait(args) {
  const intervalMs = Number(args.interval || 20000);
  const timeoutMs = Number(args.timeout || 60 * 60 * 1000);
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await status(args);
    const manifest = readManifest();
    const targets = targetAvatars(manifest, args).filter((avatar) => avatar.taskId);
    if (targets.length && targets.every((avatar) => isDone(avatar.status))) return;
    if (targets.some((avatar) => isFailed(avatar.status))) throw new Error("At least one Meshy initiate task failed.");
    await sleep(intervalMs);
  }
  throw new Error("Timed out waiting for Meshy initiate tasks.");
}

async function download(args) {
  await status(args);
  const manifest = readManifest();
  const targets = targetAvatars(manifest, args);
  for (const avatar of targets) {
    if (!avatar.taskId || !isDone(avatar.status)) {
      console.log(JSON.stringify({ id: avatar.id, skipped: true, status: avatar.status || "no-task" }, null, 2));
      continue;
    }
    const modelUrl = avatar.modelUrls?.glb || firstModelUrl(avatar.modelUrls);
    if (!modelUrl) {
      console.log(JSON.stringify({ id: avatar.id, skipped: true, reason: "no model url" }, null, 2));
      continue;
    }
    const outPath = path.join(outputDir, `${avatar.id}.glb`);
    await downloadFile(modelUrl, outPath);
    upsertAvatar({
      id: avatar.id,
      taskId: avatar.taskId,
      status: avatar.status,
      progress: avatar.progress,
      localModel: `/models/initiates/generated/${path.basename(outPath)}`,
      modelUrls: avatar.modelUrls,
      thumbnailUrl: avatar.thumbnailUrl,
    });
    console.log(JSON.stringify({ id: avatar.id, localModel: outPath }, null, 2));
  }
}

function targetAvatars(manifest, args) {
  const only = args.only ? new Set(String(args.only).split(",").map((item) => item.trim()).filter(Boolean)) : null;
  return manifest.avatars.filter((avatar) => !only || only.has(avatar.id) || only.has(avatar.baseId));
}

async function getTask(taskId) {
  return meshyFetch(`/image-to-3d/${taskId}`, { method: "GET" });
}

function normalizeTask(data) {
  const status = data?.status || data?.task_status || data?.state || data?.result?.status || "unknown";
  const progress = data?.progress ?? data?.task_progress ?? data?.result?.progress ?? null;
  const modelUrls = data?.model_urls || data?.modelUrls || data?.result?.model_urls || data?.result?.modelUrls || null;
  const thumbnailUrl = data?.thumbnail_url || data?.thumbnailUrl || data?.result?.thumbnail_url || data?.result?.thumbnailUrl || null;
  return { status, progress, modelUrls, thumbnailUrl, raw: data };
}

function isDone(status) {
  return ["succeeded", "success", "finished", "completed"].includes(String(status).toLowerCase());
}

function isFailed(status) {
  return ["failed", "failure", "canceled", "cancelled", "error"].includes(String(status).toLowerCase());
}

function firstModelUrl(modelUrls) {
  if (!modelUrls || typeof modelUrls !== "object") return null;
  return Object.values(modelUrls).find((value) => typeof value === "string");
}

async function downloadFile(url, outPath) {
  ensureDirs();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed ${response.status}: ${url}`);
  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(outPath, Buffer.from(arrayBuffer));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


