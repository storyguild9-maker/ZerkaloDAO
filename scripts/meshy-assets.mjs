import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const referencesDir = path.join(root, "public", "images", "meshy-references");
const outputDir = path.join(root, "public", "models", "meshy", "generated");
const manifestPath = path.join(root, "public", "models", "meshy", "manifest.json");

loadDotEnv(path.join(root, ".env"));

const apiBase = (process.env.MESHY_API_BASE || "https://api.meshy.ai/openapi/v1").replace(/\/$/, "");
const apiKey = process.env.MESHY_API_KEY;

const commands = { list, create, status, wait, download, one, batch };
const command = process.argv[2];

if (!command || !commands[command]) {
  printHelp();
  process.exit(command ? 1 : 0);
}

await commands[command](parseArgs(process.argv.slice(3)));

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

function printHelp() {
  console.log(`Meshy asset pipeline

Commands:
  npm run meshy:list
  npm run meshy:create -- --input public/images/meshy-references/01-golden-portal-ring.png
  npm run meshy:status -- --task <task_id>
  npm run meshy:wait -- --task <task_id>
  npm run meshy:download -- --task <task_id> --name 01-golden-portal-ring
  npm run meshy:one -- --input public/images/meshy-references/01-golden-portal-ring.png
  npm run meshy:batch -- --from 1 --to 5 --concurrency 1

Environment:
  MESHY_API_KEY is required for API calls.
`);
}

function requireApiKey() {
  if (!apiKey) {
    throw new Error("MESHY_API_KEY is missing. Put it into projects/zerkalo-dao/.env, not into source code.");
  }
}

function ensureDirs() {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
}

function readManifest() {
  ensureDirs();
  if (!fs.existsSync(manifestPath)) return { updatedAt: null, assets: [] };
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function writeManifest(manifest) {
  ensureDirs();
  manifest.updatedAt = new Date().toISOString();
  manifest.assets.sort((a, b) => a.slug.localeCompare(b.slug, "en"));
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function upsertAsset(patch) {
  const manifest = readManifest();
  const existing = manifest.assets.find((asset) => asset.slug === patch.slug || asset.taskId === patch.taskId);
  if (existing) {
    Object.assign(existing, patch, { updatedAt: new Date().toISOString() });
  } else {
    manifest.assets.push({ createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...patch });
  }
  writeManifest(manifest);
}

function slugFromInput(input) {
  const absolute = path.resolve(root, input);
  return path.basename(absolute, path.extname(absolute));
}

function referenceFiles() {
  return fs
    .readdirSync(referencesDir)
    .filter((file) => file.toLowerCase().endsWith(".png"))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    .map((file) => path.join(referencesDir, file));
}

function resolveInput(input) {
  if (!input) throw new Error("--input is required");
  const absolute = path.isAbsolute(input) ? input : path.resolve(root, input);
  if (!fs.existsSync(absolute)) throw new Error(`Input file not found: ${absolute}`);
  return absolute;
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
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? safeJson(text) : null;
  if (!response.ok) throw new Error(`Meshy API ${response.status}: ${text}`);
  return data;
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return text; }
}

async function list() {
  const files = referenceFiles();
  for (const file of files) console.log(path.relative(root, file));
  console.log(`\nTotal references: ${files.length}`);
}

async function create(args) {
  const input = resolveInput(args.input);
  const slug = args.name || slugFromInput(input);
  const body = {
    image_url: imageToDataUri(input),
    enable_pbr: args.pbr !== "false",
    should_remesh: args.remesh !== "false",
    should_texture: args.texture !== "false"
  };
  const data = await meshyFetch("/image-to-3d", { method: "POST", body: JSON.stringify(body) });
  const taskId = data?.result || data?.id || data?.task_id || data?.taskId;
  if (!taskId) {
    console.log(JSON.stringify(data, null, 2));
    throw new Error("Meshy response did not include a task id.");
  }
  upsertAsset({
    slug,
    taskId,
    sourceImage: `/images/meshy-references/${path.basename(input)}`,
    status: "created",
    pbr: body.enable_pbr,
    remesh: body.should_remesh,
    texture: body.should_texture
  });
  console.log(JSON.stringify({ slug, taskId }, null, 2));
}

async function status(args) {
  const taskId = requireTask(args);
  const data = await getTask(taskId);
  const normalized = normalizeTask(data);
  if (args.save !== "false") {
    upsertAsset({
      taskId,
      slug: args.name || findSlugByTask(taskId) || taskId,
      status: normalized.status,
      progress: normalized.progress,
      modelUrls: normalized.modelUrls,
      thumbnailUrl: normalized.thumbnailUrl,
      rawStatus: normalized.raw
    });
  }
  console.log(JSON.stringify(normalized, null, 2));
}

async function wait(args) {
  const taskId = requireTask(args);
  const intervalMs = Number(args.interval || 15000);
  const timeoutMs = Number(args.timeout || 30 * 60 * 1000);
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const data = await getTask(taskId);
    const normalized = normalizeTask(data);
    upsertAsset({
      taskId,
      slug: args.name || findSlugByTask(taskId) || taskId,
      status: normalized.status,
      progress: normalized.progress,
      modelUrls: normalized.modelUrls,
      thumbnailUrl: normalized.thumbnailUrl,
      rawStatus: normalized.raw
    });
    console.log(`[${new Date().toLocaleTimeString()}] ${taskId}: ${normalized.status} ${normalized.progress ?? ""}`);
    if (isDone(normalized.status)) {
      console.log(JSON.stringify(normalized, null, 2));
      return;
    }
    if (isFailed(normalized.status)) throw new Error(`Meshy task failed: ${taskId}`);
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${taskId}`);
}

async function download(args) {
  const taskId = requireTask(args);
  const slug = args.name || findSlugByTask(taskId) || taskId;
  const format = args.format || "glb";
  const data = await getTask(taskId);
  const normalized = normalizeTask(data);
  if (!isDone(normalized.status)) throw new Error(`Task is not complete yet: ${normalized.status}`);
  const modelUrl = normalized.modelUrls?.[format] || normalized.modelUrls?.glb || firstModelUrl(normalized.modelUrls);
  if (!modelUrl) {
    console.log(JSON.stringify(normalized, null, 2));
    throw new Error("No model URL found in Meshy response.");
  }
  ensureDirs();
  const extension = extensionFromUrl(modelUrl, format);
  const outPath = path.join(outputDir, `${slug}.${extension}`);
  await downloadFile(modelUrl, outPath);
  upsertAsset({
    taskId,
    slug,
    status: normalized.status,
    progress: normalized.progress,
    modelUrls: normalized.modelUrls,
    thumbnailUrl: normalized.thumbnailUrl,
    localModel: `/models/meshy/generated/${path.basename(outPath)}`,
    rawStatus: normalized.raw
  });
  console.log(JSON.stringify({ slug, taskId, localModel: outPath }, null, 2));
}

async function one(args) {
  await create(args);
  const slug = args.name || slugFromInput(resolveInput(args.input));
  const asset = readManifest().assets.find((item) => item.slug === slug);
  if (!asset?.taskId) throw new Error(`Could not find task for ${slug}`);
  await wait({ task: asset.taskId, name: slug, interval: args.interval, timeout: args.timeout });
  await download({ task: asset.taskId, name: slug, format: args.format });
}

async function batch(args) {
  const from = Number(args.from || 1);
  const to = Number(args.to || from);
  const concurrency = Math.max(1, Number(args.concurrency || 1));
  const files = referenceFiles().filter((file) => {
    const numericPrefix = Number(path.basename(file).match(/^(\d+)/)?.[1]);
    return numericPrefix >= from && numericPrefix <= to;
  });
  if (!files.length) throw new Error(`No reference files found for range ${from}-${to}`);
  console.log(`Creating ${files.length} Meshy task(s), concurrency ${concurrency}.`);
  const queue = [...files];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const input = queue.shift();
      const slug = slugFromInput(input);
      await create({ ...args, input, name: slug });
      if (args.wait === "true") {
        const taskId = readManifest().assets.find((item) => item.slug === slug)?.taskId;
        await wait({ task: taskId, name: slug, interval: args.interval, timeout: args.timeout });
        await download({ task: taskId, name: slug, format: args.format });
      }
    }
  });
  await Promise.all(workers);
}

function requireTask(args) {
  const taskId = args.task || args.id;
  if (!taskId) throw new Error("--task is required");
  return taskId;
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

function extensionFromUrl(url, fallback) {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).replace(".", "");
    return ext || fallback || "glb";
  } catch {
    return fallback || "glb";
  }
}

async function downloadFile(url, outPath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed ${response.status}: ${url}`);
  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(outPath, Buffer.from(arrayBuffer));
}

function findSlugByTask(taskId) {
  return readManifest().assets.find((asset) => asset.taskId === taskId)?.slug;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
