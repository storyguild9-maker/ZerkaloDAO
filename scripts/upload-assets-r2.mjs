import fs from "node:fs";
import path from "node:path";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

const required = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Заполните в .env.local: ${missing.join(", ")}`);
}

const publicDir = path.resolve("public");
const roots = ["models", "images", "videos", "vendor-assets"];
const contentTypes = new Map([
  [".bin", "application/octet-stream"],
  [".glb", "model/gltf-binary"],
  [".gltf", "model/gltf+json"],
  [".json", "application/json; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".ktx2", "image/ktx2"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"]
]);

const client = new S3Client({
  region: "auto",
  maxAttempts: 8,
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

function collectFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(target) : [target];
  });
}

const requestedFiles = process.argv.slice(2);
const files = requestedFiles.length > 0
  ? requestedFiles.map((file) => path.resolve(publicDir, file))
  : roots.flatMap((root) => collectFiles(path.join(publicDir, root)));

for (const file of files) {
  if (!file.startsWith(`${publicDir}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error(`Ресурс не найден внутри public: ${file}`);
  }
}
let uploaded = 0;
let skipped = 0;
let bytesUploaded = 0;
let nextIndex = 0;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function isRetryable(error) {
  const status = error?.$metadata?.httpStatusCode;
  return (
    ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENETUNREACH"].includes(error?.code) ||
    error?.name === "TimeoutError" ||
    status === 429 ||
    status >= 500
  );
}

async function uploadFileOnce(filePath) {
  const stat = fs.statSync(filePath);
  const key = path.relative(publicDir, filePath).split(path.sep).join("/");

  try {
    const remote = await client.send(new HeadObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key
    }));
    if (Number(remote.ContentLength) === stat.size) {
      skipped += 1;
      console.log(`Пропущен ${key}`);
      return;
    }
  } catch (error) {
    if (error?.$metadata?.httpStatusCode !== 404 && error?.name !== "NotFound") throw error;
  }

  const extension = path.extname(filePath).toLowerCase();
  const isMutable = extension === ".json";
  const upload = new Upload({
    client,
    params: {
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: fs.createReadStream(filePath),
      ContentLength: stat.size,
      ContentType: contentTypes.get(extension) ?? "application/octet-stream",
      CacheControl: isMutable ? "no-cache" : "public, max-age=31536000, immutable"
    },
    queueSize: 2,
    partSize: 16 * 1024 * 1024,
    leavePartsOnError: false
  });
  await upload.done();
  uploaded += 1;
  bytesUploaded += stat.size;
  console.log(`Загружен ${key}`);
}

async function uploadFile(filePath) {
  const key = path.relative(publicDir, filePath).split(path.sep).join("/");
  const maxAttempts = 10;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await uploadFileOnce(filePath);
      return;
    } catch (error) {
      if (!isRetryable(error) || attempt === maxAttempts) throw error;
      const delay = Math.min(30_000, 1_500 * 2 ** (attempt - 1));
      console.warn(`Сетевой сбой для ${key}; повтор ${attempt + 1}/${maxAttempts} через ${Math.round(delay / 1000)} с`);
      await sleep(delay);
    }
  }
}

async function worker() {
  while (nextIndex < files.length) {
    const index = nextIndex;
    nextIndex += 1;
    await uploadFile(files[index]);
  }
}

console.log(`Найдено ресурсов: ${files.length}`);
await Promise.all([worker(), worker()]);
console.log(JSON.stringify({
  uploaded,
  skipped,
  uploadedGigabytes: Number((bytesUploaded / 1024 ** 3).toFixed(2))
}, null, 2));

