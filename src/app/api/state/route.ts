import { NextResponse } from "next/server";
import { getAll, getCarteiras, getUsers, visibleFor } from "@/lib/data";
import { getSession } from "@/lib/auth";
import { isConfigured } from "@/lib/redis";
import type { StateResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();

  // Visitante não autenticado não enxerga dados — precisa entrar.
  if (!session) {
    const body: StateResponse = {
      configured: isConfigured,
      areas: [],
      carteiras: [],
      implantacoes: [],
      session: null,
    };
    return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  }

  const [{ areas, implantacoes }, carteiras] = await Promise.all([getAll(), getCarteiras()]);

  const body: StateResponse = {
    configured: isConfigured,
    areas,
    carteiras,
    implantacoes: visibleFor(session, implantacoes),
    session,
  };

  if (session.role === "admin") {
    body.users = await getUsers();
  }

  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
