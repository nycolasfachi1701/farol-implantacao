import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { changePassword } from "@/lib/data";
import { isConfigured } from "@/lib/redis";

export const runtime = "nodejs";

const ERRORS: Record<string, string> = {
  WRONG_PASSWORD: "Senha atual incorreta.",
  PASSWORD_WEAK: "A nova senha precisa ter ao menos 4 caracteres.",
  NOT_FOUND: "Usuário não encontrado.",
};

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
  const current = String(body.current || "");
  const next = String(body.next || "");

  try {
    await changePassword(session.userId, current, next);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    const status = code === "NOT_FOUND" ? 404 : code === "WRONG_PASSWORD" ? 401 : 400;
    return NextResponse.json({ error: ERRORS[code] || "Não foi possível alterar a senha." }, { status });
  }
}
