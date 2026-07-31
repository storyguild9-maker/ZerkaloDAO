import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type ConstructorTemplate = {
  version: number;
  updatedAt: string;
  items: unknown[];
  avatarSeatMap?: unknown;
  avatarSeatAdjustments?: unknown;
  seatTuning?: unknown;
  controlledAvatarId?: unknown;
};

const projectRoot = process.cwd().endsWith(path.join("projects", "zerkalo-dao"))
  ? process.cwd()
  : path.join(process.cwd(), "projects", "zerkalo-dao");
const templatePath = path.join(projectRoot, "data", "inner-constructor-template.json");

async function readTemplate(): Promise<ConstructorTemplate> {
  const raw = await fs.readFile(templatePath, "utf8");
  const parsed = JSON.parse(raw) as ConstructorTemplate;
  return {
    version: parsed.version ?? 1,
    updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
    items: Array.isArray(parsed.items) ? parsed.items : [],
    avatarSeatMap: parsed.avatarSeatMap,
    avatarSeatAdjustments: parsed.avatarSeatAdjustments,
    seatTuning: parsed.seatTuning,
    controlledAvatarId: parsed.controlledAvatarId
  };
}

export async function GET() {
  try {
    const template = await readTemplate();
    return NextResponse.json(template);
  } catch (error) {
    console.error("Failed to read constructor template", error);
    return NextResponse.json({ version: 1, updatedAt: new Date(0).toISOString(), items: [] }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<ConstructorTemplate>;
    const template: ConstructorTemplate = {
      version: 2,
      updatedAt: new Date().toISOString(),
      items: Array.isArray(body.items) ? body.items : [],
      avatarSeatMap: body.avatarSeatMap,
      avatarSeatAdjustments: body.avatarSeatAdjustments,
      seatTuning: body.seatTuning,
      controlledAvatarId: body.controlledAvatarId
    };
    await fs.mkdir(path.dirname(templatePath), { recursive: true });
    await fs.writeFile(templatePath, `${JSON.stringify(template, null, 2)}\n`, "utf8");
    return NextResponse.json({ ok: true, count: template.items.length, updatedAt: template.updatedAt });
  } catch (error) {
    console.error("Failed to save constructor template", error);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
}

