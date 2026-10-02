import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createImplantacao, canUseCarteira } from "@/lib/data";
import { isConfigured } from "@/lib/redis";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isConfigured) {
    return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
  }
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  // Usuário comum só cria dentro das próprias carteiras.
  const carteira = String((body as Record<string, unknown>).carteira || "");
  if (!canUseCarteira(session, carteira)) {
    return NextResponse.json(
      { error: "Selecione uma carteira à qual você tem acesso." },
      { status: 403 }
    );
  }

  try {
    const imp = await createImplantacao(body, session.name);
    return NextResponse.json(imp, { status: 201 });
  } catch (e) {
    const msg =
      e instanceof Error && e.message === "CLIENTE_REQUIRED"
        ? "Informe o cliente."
        : "Não foi possível salvar.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
