const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env");

if (fs.existsSync(envPath)) {
  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = process.env[key] || value;
  }
}

process.env.DATABASE_URL = process.env.DATABASE_URL || "file:./dev.db";

const { PrismaClient } = require("@prisma/client");

const statements = [
`CREATE TABLE IF NOT EXISTS "CandidateSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'created',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "currentGateId" TEXT,
    "userAgent" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'ru',
    "optionalEmail" TEXT,
    "isProspect" BOOLEAN NOT NULL DEFAULT false,
    "consentAccepted" BOOLEAN NOT NULL DEFAULT false,
    "seed" TEXT NOT NULL
)`,
`CREATE TABLE IF NOT EXISTS "GateAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "gateId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'started',
    "primaryChoice" TEXT,
    "reflectionText" TEXT,
    "trapTriggered" BOOLEAN NOT NULL DEFAULT false,
    "scoreDelta" TEXT NOT NULL,
    "metadata" TEXT,
    CONSTRAINT "GateAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CandidateSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
`CREATE TABLE IF NOT EXISTS "SessionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "gateId" TEXT,
    "eventType" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "elapsedMs" INTEGER,
    "payload" TEXT,
    CONSTRAINT "SessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CandidateSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
`CREATE TABLE IF NOT EXISTS "ScoreProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metrics" TEXT NOT NULL,
    "archetype" TEXT NOT NULL,
    "accessLevel" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "strengths" TEXT NOT NULL,
    "shadows" TEXT NOT NULL,
    "practices" TEXT NOT NULL,
    "riskFlags" TEXT NOT NULL,
    "manualAccessLevel" TEXT,
    "accessConfirmed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ScoreProfile_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CandidateSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
`CREATE TABLE IF NOT EXISTS "AdminNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT NOT NULL,
    "reviewer" TEXT,
    CONSTRAINT "AdminNote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CandidateSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
`CREATE INDEX IF NOT EXISTS "GateAttempt_sessionId_idx" ON "GateAttempt"("sessionId")`,
`CREATE INDEX IF NOT EXISTS "GateAttempt_gateId_idx" ON "GateAttempt"("gateId")`,
`CREATE INDEX IF NOT EXISTS "SessionEvent_sessionId_idx" ON "SessionEvent"("sessionId")`,
`CREATE INDEX IF NOT EXISTS "SessionEvent_gateId_idx" ON "SessionEvent"("gateId")`,
`CREATE INDEX IF NOT EXISTS "SessionEvent_eventType_idx" ON "SessionEvent"("eventType")`,
`CREATE UNIQUE INDEX IF NOT EXISTS "ScoreProfile_sessionId_key" ON "ScoreProfile"("sessionId")`,
`CREATE INDEX IF NOT EXISTS "AdminNote_sessionId_idx" ON "AdminNote"("sessionId")`
];

async function ensureColumn(prisma, table, column, definition) {
  const columns = await prisma.$queryRawUnsafe(`PRAGMA table_info("${table}")`);
  if (!columns.some((entry) => entry.name === column)) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN ${definition}`);
  }
}

async function main() {
  const prisma = new PrismaClient();
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
  await ensureColumn(prisma, "CandidateSession", "isProspect", "\"isProspect\" BOOLEAN NOT NULL DEFAULT false");
  await ensureColumn(prisma, "ScoreProfile", "manualAccessLevel", "\"manualAccessLevel\" TEXT");
  await ensureColumn(prisma, "ScoreProfile", "accessConfirmed", "\"accessConfirmed\" BOOLEAN NOT NULL DEFAULT false");
  const tables = await prisma.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  console.log("SQLite ready:", tables.map((row) => row.name).join(", "));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
