import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getUsers, createUser } from "@/lib/data";
import { isConfigured } from "@/lib/redis";

export const runtime = "nodejs";

const USER_ERRORS: Record<string, string> = {
  USERNAME_REQUIRED: "Informe o login do usuário.",
  USERNAME_TAKEN: "Já existe um usuário com esse login.",
  PASSWORD_WEAK: "A senha precisa ter ao menos 4 caracteres.",
};

export async function GET() {
  if (!isConfigured) {
    return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
  }
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  return NextResponse.json({ users: await getUsers() });
}

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
  try {
    const user = await createUser({
      username: body.username,
      name: body.name,
      password: body.password,
      role: body.role,
      carteiras: body.carteiras,
    });
    return NextResponse.json(user, { status: 201 });
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    return NextResponse.json(
      { error: USER_ERRORS[code] || "Não foi possível criar o usuário." },
      { status: 400 }
    );
  }
}
