import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { Session, Role } from "./types";
import { findUserById } from "./data";

const COOKIE = "farol_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    // Fail-closed: em produção, nunca assine com um segredo conhecido (risco de forjar token).
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET não configurada.");
    }
    return new TextEncoder().encode("dev-insecure-secret-change-me");
  }
  return new TextEncoder().encode(s);
}

export interface SessionUser {
  userId: string;
  username: string;
  name: string;
  role: Role;
  carteiras: string[];
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({
    userId: user.userId,
    username: user.username,
    name: user.name,
    role: user.role,
    carteiras: user.carteiras,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).set(COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getSession(): Promise<Session> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  let userId = "";
  try {
    const { payload } = await jwtVerify(token, secret());
    userId = String(payload.userId || "");
  } catch {
    // token inválido ou expirado
    return null;
  }
  if (!userId) return null;

  // Autorização sempre a partir do registro atual no banco: rebaixar/remover
  // um usuário ou tirar uma carteira passa a valer imediatamente (não só após expirar o token).
  const user = await findUserById(userId);
  if (!user) return null;

  return {
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    carteiras: user.carteiras,
  };
}

/** Garante uma sessão autenticada (admin ou usuário); devolve-a ou lança. */
export async function requireSession(): Promise<NonNullable<Session>> {
  const s = await getSession();
  if (!s) throw new Error("UNAUTHORIZED");
  return s;
}

/** Garante que há um admin logado; devolve a sessão ou lança. */
export async function requireAdmin(): Promise<NonNullable<Session>> {
  const s = await getSession();
  if (!s || s.role !== "admin") throw new Error("UNAUTHORIZED");
  return s;
}
