import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { setConfig } from "@/lib/data";
import { isConfigured } from "@/lib/redis";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isConfigured) {
    return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
  }
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const config = await setConfig({ diasParada: body.diasParada });
  return NextResponse.json(config);
}
