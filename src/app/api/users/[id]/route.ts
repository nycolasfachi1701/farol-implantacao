import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { updateUser, deleteUser } from "@/lib/data";
import { isConfigured } from "@/lib/redis";

export const runtime = "nodejs";

const USER_ERRORS: Record<string, string> = {
  NOT_FOUND: "Usuário não encontrado.",
  USERNAME_REQUIRED: "Informe o login do usuário.",
  USERNAME_TAKEN: "Já existe um usuário com esse login.",
  PASSWORD_WEAK: "A senha precisa ter ao menos 4 caracteres.",
  LAST_ADMIN: "Não é possível remover o último administrador.",
};

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isConfigured) {
    return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
  }
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const user = await updateUser(id, {
      username: body.username,
      name: body.name,
      password: body.password,
      role: body.role,
      carteiras: body.carteiras,
    });
    return NextResponse.json(user);
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    const status = code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json(
      { error: USER_ERRORS[code] || "Não foi possível salvar o usuário." },
      { status }
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
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { id } = await params;
  try {
    await deleteUser(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    return NextResponse.json(
      { error: USER_ERRORS[code] || "Não foi possível remover o usuário." },
      { status: 400 }
    );
  }
}
