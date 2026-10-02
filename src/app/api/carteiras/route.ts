import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createCarteira } from "@/lib/data";
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
    const carteira = await createCarteira(String(nome || ""));
    return NextResponse.json(carteira, { status: 201 });
  } catch (e) {
    const dup = e instanceof Error && e.message === "DUPLICATE";
    return NextResponse.json(
      { error: dup ? "Já existe uma carteira com esse nome." : "Informe o nome da carteira." },
      { status: 400 }
    );
  }
}
