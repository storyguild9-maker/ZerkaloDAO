import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.MESHY_WEBHOOK_SECRET;
  const receivedSecret =
    request.headers.get("x-meshy-webhook-secret") ??
    request.headers.get("x-webhook-secret") ??
    request.nextUrl.searchParams.get("secret");

  if (configuredSecret && receivedSecret !== configuredSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);

  console.log("Meshy webhook received", {
    receivedAt: new Date().toISOString(),
    taskId: payload?.id ?? payload?.task_id ?? payload?.taskId ?? payload?.result?.id ?? null,
    status: payload?.status ?? payload?.task_status ?? payload?.state ?? payload?.result?.status ?? null
  });

  return NextResponse.json({ ok: true });
}
