import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "public", "models", "initiates", "manifest.json");
const riggedDir = path.join(root, "public", "models", "initiates", "rigged");
const animationsDir = path.join(root, "public", "models", "initiates", "animations");

loadDotEnv(path.join(root, ".env"));

const apiBase = (process.env.MESHY_API_BASE || "https://api.meshy.ai/openapi/v1").replace(/\/$/, "");
const apiKey = process.env.MESHY_API_KEY;

const motionDefinitions = {
  "walk-to-seat": { label: "Идти и сесть за стол", actionId: 60, actionName: "Walk_to_Sit" },
  "sit-at-table": { label: "Сесть за стол", actionId: 58, actionName: "Step_to_Sit_Transition" },
  "chair-sitting-idle": { label: "Стул: сидит без дела", actionName: "Chair_Sitting_Idle", planned: true },
  "male-sit-transition": { label: "Переходный мужчина", actionName: "Transition_Male", maleOnly: true, planned: true },
  "sit-transition": { label: "Переход: сидеть", actionName: "Transition_Sit", planned: true },
  "sit-cross-legged": { label: "Сидит скрестив ноги", actionName: "Sitting_Cross_Legged", planned: true },
  "stand-from-seat": { label: "Встать", actionIdMale: 53, actionIdFemale: 52, actionNameMale: "Sit_to_Stand_Transition_M", actionNameFemale: "Sit_to_Stand_Transition_F" },
  "daily-walk-loop": { label: "Повседневная прогулка", actionId: 121, actionName: "Thoughtful_Walk" },
  "fast-walk-loop": { label: "Быстрая прогулка", actionId: 106, actionName: "Confident_Walk" },
  "slow-walk-loop": { label: "Медленная походка", actionId: 341, actionName: "Walk_Slowly_and_Look_Around" },
  "elegant-walk-loop": { label: "Парадная походка", actionId: 117, actionName: "Red_Carpet_Walk" },
  "walk-backward": { label: "Идти назад", actionId: 544, actionName: "Walk_Backward" },
  "walk-turn-left": { label: "Идти и повернуть налево", actionId: 572, actionName: "Walk_Turn_Left" },
  "walk-turn-right": { label: "Идти и повернуть направо", actionIdMale: 583, actionIdFemale: 584, actionNameMale: "Walk_Turn_Right", actionNameFemale: "Walk_Turn_Right_Female" },
  "walk-loop": { label: "Горячая походка", actionId: 106, actionName: "Hot_Walk" },
  "spell-charge": { label: "Заклинание с зарядом", actionId: 125, actionName: "Charged_Spell_Cast" },
  "female-walk-loop": { label: "Идущая женщина", actionId: 1, actionName: "Walking_Woman", femaleOnly: true },
};

const commands = {
  sanitize,
  "rig-create": rigCreate,
  "rig-status": rigStatus,
  "rig-wait": rigWait,
  "rig-download": rigDownload,
  "anim-create": animationCreate,
  "anim-status": animationStatus,
  "anim-wait": animationWait,
  "anim-download": animationDownload,
};

const command = process.argv[2];
if (!command || !commands[command]) {
  printHelp();
  process.exit(command ? 1 : 0);
}

await commands[command](parseArgs(process.argv.slice(3)));

function printHelp() {
  console.log(`Meshy initiate rigging and animation pipeline

Commands:
  node scripts/meshy-initiate-animate.mjs sanitize
  node scripts/meshy-initiate-animate.mjs rig-create
  node scripts/meshy-initiate-animate.mjs rig-wait --interval 20000 --timeout 3600000
  node scripts/meshy-initiate-animate.mjs rig-download
  node scripts/meshy-initiate-animate.mjs anim-create
  node scripts/meshy-initiate-animate.mjs anim-wait --interval 20000 --timeout 3600000
  node scripts/meshy-initiate-animate.mjs anim-download

Filters:
  --only avatar-id-1,avatar-id-2
  --motions walk-loop,spell-charge
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
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
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.mkdirSync(riggedDir, { recursive: true });
  fs.mkdirSync(animationsDir, { recursive: true });
}

function readManifest() {
  ensureDirs();
  if (!fs.existsSync(manifestPath)) throw new Error(`Missing ${manifestPath}`);
  return JSON.parse(stripBom(fs.readFileSync(manifestPath, "utf8")));
}

function writeManifest(manifest) {
  manifest.updatedAt = new Date().toISOString();
  for (const avatar of manifest.avatars) {
    delete avatar.rawStatus;
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function avatarTargets(manifest, args) {
  const only = args.only ? new Set(String(args.only).split(",").map((item) => item.trim()).filter(Boolean)) : null;
  return manifest.avatars.filter((avatar) => !only || only.has(avatar.id) || only.has(avatar.baseId));
}

function motionTargets(avatar, args) {
  const only = args.motions ? new Set(String(args.motions).split(",").map((item) => item.trim()).filter(Boolean)) : null;
  return (avatar.motions || [])
    .map((motion) => normalizedMotion(avatar, motion.id))
    .filter(Boolean)
    .filter((motion) => !only || only.has(motion.id));
}

function normalizedMotion(avatar, motionId) {
  const definition = motionDefinitions[motionId];
  if (!definition) return null;
  if (definition.femaleOnly && avatar.gender !== "женщина") return null;
  if (definition.maleOnly && avatar.gender === "женщина") return null;
  const isFemale = avatar.gender === "женщина";
  const actionId = isFemale && definition.actionIdFemale ? definition.actionIdFemale : definition.actionIdMale || definition.actionId;
  const actionName = isFemale && definition.actionNameFemale ? definition.actionNameFemale : definition.actionName;
  if (!actionId && definition.planned) {
    return { id: motionId, label: definition.label, actionId: null, actionName, planned: true };
  }
  return {
    id: motionId,
    label: definition.label,
    actionId,
    actionName,
  };
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
  try { return JSON.parse(text); } catch { return text; }
}

async function sanitize(args = {}) {
  const manifest = readManifest();
  for (const avatar of avatarTargets(manifest, args)) {
    avatar.motions = Object.keys(motionDefinitions).map((motionId) => normalizedMotion(avatar, motionId)).filter(Boolean).map((motion) => ({
      id: motion.id,
      label: motion.label,
      actionId: motion.actionId,
      actionName: motion.actionName,
    }));
    avatar.animationTasks ||= {};
  }
  writeManifest(manifest);
  console.log(JSON.stringify({ sanitized: avatarTargets(manifest, args).map((avatar) => avatar.id) }, null, 2));
}

async function rigCreate(args) {
  await sanitize(args);
  const manifest = readManifest();
  for (const avatar of avatarTargets(manifest, args)) {
    if (!avatar.taskId) {
      console.log(JSON.stringify({ id: avatar.id, skipped: true, reason: "missing image-to-3d task" }, null, 2));
      continue;
    }
    if (avatar.rigTaskId && args.force !== "true") {
      console.log(JSON.stringify({ id: avatar.id, skipped: true, rigTaskId: avatar.rigTaskId }, null, 2));
      continue;
    }
    const data = await meshyFetch("/rigging", {
      method: "POST",
      body: JSON.stringify({ input_task_id: avatar.taskId, height_meters: avatar.gender === "женщина" ? 1.68 : 1.78 }),
    });
    const rigTaskId = data?.result || data?.id || data?.task_id || data?.taskId;
    if (!rigTaskId) throw new Error(`No rig task id for ${avatar.id}: ${JSON.stringify(data)}`);
    avatar.rigTaskId = rigTaskId;
    avatar.rigStatus = "created";
    avatar.updatedAt = new Date().toISOString();
    console.log(JSON.stringify({ id: avatar.id, rigTaskId }, null, 2));
    writeManifest(manifest);
  }
}

async function rigStatus(args) {
  const manifest = readManifest();
  for (const avatar of avatarTargets(manifest, args)) {
    if (!avatar.rigTaskId) continue;
    const data = await meshyFetch(`/rigging/${avatar.rigTaskId}`, { method: "GET" });
    avatar.rigStatus = data?.status || "unknown";
    avatar.rigProgress = data?.progress ?? null;
    avatar.rigResult = data?.result || null;
    avatar.updatedAt = new Date().toISOString();
    console.log(JSON.stringify({ id: avatar.id, rigTaskId: avatar.rigTaskId, status: avatar.rigStatus, progress: avatar.rigProgress }, null, 2));
  }
  writeManifest(manifest);
}

async function rigWait(args) {
  const intervalMs = Number(args.interval || 20000);
  const timeoutMs = Number(args.timeout || 60 * 60 * 1000);
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await rigStatus(args);
    const manifest = readManifest();
    const targets = avatarTargets(manifest, args).filter((avatar) => avatar.rigTaskId);
    if (targets.length && targets.every((avatar) => isDone(avatar.rigStatus))) return;
    if (targets.some((avatar) => isFailed(avatar.rigStatus))) throw new Error("At least one rigging task failed.");
    await sleep(intervalMs);
  }
  throw new Error("Timed out waiting for rigging tasks.");
}

async function rigDownload(args) {
  await rigStatus(args);
  const manifest = readManifest();
  for (const avatar of avatarTargets(manifest, args)) {
    if (!isDone(avatar.rigStatus) || !avatar.rigResult?.rigged_character_glb_url) {
      console.log(JSON.stringify({ id: avatar.id, skipped: true, rigStatus: avatar.rigStatus || "no-rig" }, null, 2));
      continue;
    }
    const rigPath = path.join(riggedDir, `${avatar.id}-rigged.glb`);
    await downloadFile(avatar.rigResult.rigged_character_glb_url, rigPath);
    avatar.riggedModel = `/models/initiates/rigged/${path.basename(rigPath)}`;
    avatar.basicAnimations ||= {};
    const walkingUrl = avatar.rigResult.basic_animations?.walking_glb_url;
    if (walkingUrl) {
      const walkingPath = path.join(animationsDir, `${avatar.id}-basic-walking.glb`);
      await downloadFile(walkingUrl, walkingPath);
      avatar.basicAnimations.walking = `/models/initiates/animations/${path.basename(walkingPath)}`;
    }
    avatar.updatedAt = new Date().toISOString();
    console.log(JSON.stringify({ id: avatar.id, riggedModel: avatar.riggedModel, walking: avatar.basicAnimations?.walking || null }, null, 2));
    writeManifest(manifest);
  }
}

async function animationCreate(args) {
  await sanitize(args);
  const manifest = readManifest();
  for (const avatar of avatarTargets(manifest, args)) {
    if (!isDone(avatar.rigStatus) || !avatar.rigTaskId) {
      console.log(JSON.stringify({ id: avatar.id, skipped: true, reason: "rig not ready" }, null, 2));
      continue;
    }
    avatar.animationTasks ||= {};
    for (const motion of motionTargets(avatar, args)) {
      const existing = avatar.animationTasks[motion.id];
      if (existing?.taskId && args.force !== "true") {
        console.log(JSON.stringify({ id: avatar.id, motion: motion.id, skipped: true, taskId: existing.taskId }, null, 2));
        continue;
      }
      if (!motion.actionId) {
        avatar.animationTasks[motion.id] = { ...motion, status: "planned", progress: null };
        console.log(JSON.stringify({ id: avatar.id, motion: motion.id, skipped: true, reason: "missing Meshy actionId", actionName: motion.actionName }, null, 2));
        writeManifest(manifest);
        continue;
      }
      const data = await meshyFetch("/animations", {
        method: "POST",
        body: JSON.stringify({ rig_task_id: avatar.rigTaskId, action_id: motion.actionId }),
      });
      const taskId = data?.result || data?.id || data?.task_id || data?.taskId;
      if (!taskId) throw new Error(`No animation task id for ${avatar.id}/${motion.id}: ${JSON.stringify(data)}`);
      avatar.animationTasks[motion.id] = { ...motion, taskId, status: "created", progress: null };
      avatar.updatedAt = new Date().toISOString();
      console.log(JSON.stringify({ id: avatar.id, motion: motion.id, actionId: motion.actionId, taskId }, null, 2));
      writeManifest(manifest);
    }
  }
}

async function animationStatus(args) {
  const manifest = readManifest();
  for (const avatar of avatarTargets(manifest, args)) {
    avatar.animationTasks ||= {};
    for (const motion of motionTargets(avatar, args)) {
      const task = avatar.animationTasks[motion.id];
      if (!task?.taskId) continue;
      const data = await meshyFetch(`/animations/${task.taskId}`, { method: "GET" });
      avatar.animationTasks[motion.id] = {
        ...task,
        status: data?.status || "unknown",
        progress: data?.progress ?? null,
        result: data?.result || null,
      };
      console.log(JSON.stringify({ id: avatar.id, motion: motion.id, taskId: task.taskId, status: data?.status, progress: data?.progress }, null, 2));
    }
    avatar.updatedAt = new Date().toISOString();
  }
  writeManifest(manifest);
}

async function animationWait(args) {
  const intervalMs = Number(args.interval || 20000);
  const timeoutMs = Number(args.timeout || 60 * 60 * 1000);
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await animationStatus(args);
    const manifest = readManifest();
    const tasks = [];
    for (const avatar of avatarTargets(manifest, args)) {
      for (const motion of motionTargets(avatar, args)) {
        const task = avatar.animationTasks?.[motion.id];
        if (task?.taskId) tasks.push(task);
      }
    }
    if (tasks.length && tasks.every((task) => isDone(task.status))) return;
    if (tasks.some((task) => isFailed(task.status))) throw new Error("At least one animation task failed.");
    await sleep(intervalMs);
  }
  throw new Error("Timed out waiting for animation tasks.");
}

async function animationDownload(args) {
  await animationStatus(args);
  const manifest = readManifest();
  for (const avatar of avatarTargets(manifest, args)) {
    avatar.animationTasks ||= {};
    for (const motion of motionTargets(avatar, args)) {
      const task = avatar.animationTasks[motion.id];
      if (!task || !isDone(task.status) || !task.result?.animation_glb_url) {
        console.log(JSON.stringify({ id: avatar.id, motion: motion.id, skipped: true, status: task?.status || "no-task" }, null, 2));
        continue;
      }
      const outPath = path.join(animationsDir, `${avatar.id}-${motion.id}.glb`);
      await downloadFile(task.result.animation_glb_url, outPath);
      const { result, ...taskWithoutResult } = task;
      avatar.animationTasks[motion.id] = { ...taskWithoutResult, localModel: `/models/initiates/animations/${path.basename(outPath)}` };
      console.log(JSON.stringify({ id: avatar.id, motion: motion.id, localModel: avatar.animationTasks[motion.id].localModel }, null, 2));
      writeManifest(manifest);
    }
  }
}

function isDone(status) {
  return ["succeeded", "success", "finished", "completed"].includes(String(status).toLowerCase());
}

function isFailed(status) {
  return ["failed", "failure", "canceled", "cancelled", "error"].includes(String(status).toLowerCase());
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







