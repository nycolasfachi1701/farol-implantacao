import { NextResponse } from "next/server";
import { getAll, getCarteiras, getConfig, getUsers, visibleFor } from "@/lib/data";
import { getSession } from "@/lib/auth";
import { isConfigured } from "@/lib/redis";
import { DEFAULT_CONFIG, type StateResponse } from "@/lib/types";

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
      config: DEFAULT_CONFIG,
    };
    return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  }

  const [{ areas, implantacoes }, carteiras, config] = await Promise.all([
    getAll(),
    getCarteiras(),
    getConfig(),
  ]);

  const body: StateResponse = {
    configured: isConfigured,
    areas,
    carteiras,
    implantacoes: visibleFor(session, implantacoes),
    session,
    config,
  };

  if (session.role === "admin") {
    body.users = await getUsers();
  }

  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
