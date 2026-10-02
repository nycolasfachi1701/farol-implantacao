import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createArea } from "@/lib/data";
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

  const { nome } = await req.json().catch(() => ({}));
  try {
    const area = await createArea(String(nome || ""));
    return NextResponse.json(area, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Informe o nome da área." }, { status: 400 });
  }
}
