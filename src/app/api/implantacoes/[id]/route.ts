import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireAdmin } from "@/lib/auth";
import {
  updateImplantacao,
  deleteImplantacao,
  getImplantacao,
  canUseCarteira,
} from "@/lib/data";
import { isConfigured } from "@/lib/redis";

export const runtime = "nodejs";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isConfigured) {
    return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
  }
  const { id } = await params;
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const existing = await getImplantacao(id);
  if (!existing) {
    return NextResponse.json({ error: "Implantação não encontrada." }, { status: 404 });
  }

  // Usuário comum só mexe na própria carteira — e não pode movê-la para fora dela.
  if (!canUseCarteira(session, existing.carteira)) {
    return NextResponse.json({ error: "Você não tem acesso a esta carteira." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const novaCarteira = (body as Record<string, unknown>).carteira;
  if (novaCarteira !== undefined && !canUseCarteira(session, String(novaCarteira))) {
    return NextResponse.json(
      { error: "Você não pode mover para uma carteira sem acesso." },
      { status: 403 }
    );
  }

  try {
    const imp = await updateImplantacao(id, body, session.name);
    return NextResponse.json(imp);
  } catch (e) {
    const notFound = e instanceof Error && e.message === "NOT_FOUND";
    return NextResponse.json(
      { error: notFound ? "Implantação não encontrada." : "Não foi possível salvar." },
      { status: notFound ? 404 : 400 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isConfigured) {
    return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
  }
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Apenas administradores podem excluir." }, { status: 403 });
  }

  const { id } = await params;
  await deleteImplantacao(id);
  return NextResponse.json({ ok: true });
}
