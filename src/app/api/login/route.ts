import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { ensureBootstrapAdmin, findUserByUsername } from "@/lib/data";
import { verifyPassword } from "@/lib/password";
import { rateLimit } from "@/lib/rate-limit";
import { isConfigured } from "@/lib/redis";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  if (!isConfigured) {
    return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
  }

  // Garante que exista ao menos o admin inicial (a partir de ADMIN_PASSWORD).
  try {
    await ensureBootstrapAdmin();
  } catch {
    return NextResponse.json(
      { error: "Configuração do servidor incompleta (defina ADMIN_PASSWORD)." },
      { status: 503 }
    );
  }

  const { username, password } = await req.json().catch(() => ({}));
  const uname = String(username || "").trim();
  const pwd = String(password || "");

  if (!uname || !pwd) {
    return NextResponse.json({ error: "Informe usuário e senha." }, { status: 400 });
  }

  // Anti força-bruta: por (IP + usuário) e por IP, em janela de 15 min.
  const ip = clientIp(req);
  const okUser = await rateLimit(`login:${ip}:${uname.toLowerCase()}`, 8, 900);
  const okIp = await rateLimit(`login:ip:${ip}`, 30, 900);
  if (!okUser || !okIp) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429 }
    );
  }

  const user = await findUserByUsername(uname);
  if (!user || !(await verifyPassword(pwd, user.passwordHash))) {
    return NextResponse.json({ error: "Usuário ou senha incorretos." }, { status: 401 });
  }

  await createSession({
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    carteiras: user.carteiras,
  });

  return NextResponse.json({
    ok: true,
    user: { name: user.name, role: user.role, carteiras: user.carteiras },
  });
}
