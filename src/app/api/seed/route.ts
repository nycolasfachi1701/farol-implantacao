import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { seedIfEmpty } from "@/lib/data";
import { isConfigured } from "@/lib/redis";

export const runtime = "nodejs";

export async function POST() {
  if (!isConfigured) {
    return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
  }
  let session;
  try {
    session = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const seeded = await seedIfEmpty(session.name);
  return NextResponse.json({ ok: true, seeded });
}
