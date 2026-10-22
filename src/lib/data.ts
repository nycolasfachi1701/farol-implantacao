import { randomUUID } from "crypto";
import { redis, KEYS, isConfigured } from "./redis";
import { hashPassword, verifyPassword } from "./password";
import {
  Area,
  Carteira,
  Implantacao,
  Farol,
  EDITABLE_FIELDS,
  HistoricoEntry,
  HistoricoSituacao,
  User,
  UserPublic,
  Role,
  Session,
  emptyMarcos,
  normalizeMarcos,
  MARCOS,
  Config,
  DEFAULT_CONFIG,
  normalizeConfig,
} from "./types";

export async function getAll(): Promise<{ areas: Area[]; implantacoes: Implantacao[] }> {
  if (!isConfigured) return { areas: [], implantacoes: [] };

  const [areasMap, impsMap] = await Promise.all([
    redis.hgetall<Record<string, Area>>(KEYS.areas),
    redis.hgetall<Record<string, Implantacao>>(KEYS.implantacoes),
  ]);

  const areas = Object.values(areasMap || {}).sort(
    (a, b) => (a.ordem || 0) - (b.ordem || 0) || a.nome.localeCompare(b.nome)
  );
  const implantacoes = Object.values(impsMap || {});
  return { areas, implantacoes };
}

/** Mantém apenas os campos editáveis vindos do cliente. */
function pickEditable(body: Record<string, unknown>) {
  const out: Partial<Record<(typeof EDITABLE_FIELDS)[number], unknown>> = {};
  for (const k of EDITABLE_FIELDS) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

function sanitizeFarol(v: unknown): Farol {
  return v === "verde" || v === "amarelo" || v === "vermelho" ? v : "amarelo";
}

export async function createImplantacao(
  body: Record<string, unknown>,
  authorName: string
): Promise<Implantacao> {
  const input = pickEditable(body);
  const cliente = String(input.cliente || "").trim();
  if (!cliente) throw new Error("CLIENTE_REQUIRED");

  const now = Date.now();
  const farol = sanitizeFarol(input.farol);
  const situacao = String(input.situacao || "").trim();
  const marcos = normalizeMarcos(input.marcos);
  for (const { key } of MARCOS) {
    if (marcos[key].feito && !marcos[key].concluidoEm) marcos[key].concluidoEm = now;
  }
  const imp: Implantacao = {
    id: randomUUID(),
    cliente,
    carteira: String(input.carteira || "").trim(),
    responsavel: String(input.responsavel || "").trim(),
    farol,
    situacao,
    apoio: input.apoio === "sim" ? "sim" : "nao",
    areaId: String(input.areaId || ""),
    ticket: String(input.ticket || "").trim(),
    goLive: String(input.goLive || "").trim(),
    marcos,
    createdAt: now,
    updatedAt: now,
    updatedBy: authorName,
    historico: [{ farol, at: now, by: authorName }],
    situacaoHistorico: situacao ? [{ texto: situacao, at: now, by: authorName }] : [],
  };

  await redis.hset(KEYS.implantacoes, { [imp.id]: imp });
  return imp;
}

export async function updateImplantacao(
  id: string,
  body: Record<string, unknown>,
  authorName: string
): Promise<Implantacao> {
  const existing = await redis.hget<Implantacao>(KEYS.implantacoes, id);
  if (!existing) throw new Error("NOT_FOUND");

  const input = pickEditable(body);
  const now = Date.now();
  const next: Implantacao = { ...existing };

  if (input.cliente !== undefined) next.cliente = String(input.cliente).trim();
  if (input.carteira !== undefined) next.carteira = String(input.carteira).trim();
  if (input.responsavel !== undefined) next.responsavel = String(input.responsavel).trim();
  if (input.apoio !== undefined) next.apoio = input.apoio === "sim" ? "sim" : "nao";
  if (input.areaId !== undefined) next.areaId = String(input.areaId);
  if (input.ticket !== undefined) next.ticket = String(input.ticket).trim();
  if (input.goLive !== undefined) next.goLive = String(input.goLive).trim();
  const novoMarcos = normalizeMarcos(input.marcos !== undefined ? input.marcos : existing.marcos);
  const marcosAnt = normalizeMarcos(existing.marcos);
  for (const { key } of MARCOS) {
    if (novoMarcos[key].feito) {
      // Mantém o carimbo anterior se já estava concluída; senão marca agora.
      novoMarcos[key].concluidoEm =
        marcosAnt[key].feito && marcosAnt[key].concluidoEm ? marcosAnt[key].concluidoEm : now;
    } else {
      delete novoMarcos[key].concluidoEm;
    }
  }
  next.marcos = novoMarcos;

  const historico: HistoricoEntry[] = Array.isArray(existing.historico)
    ? existing.historico.slice(-14)
    : [];

  if (input.farol !== undefined) {
    const f = sanitizeFarol(input.farol);
    if (f !== existing.farol) historico.push({ farol: f, at: now, by: authorName });
    next.farol = f;
  }

  // Histórico de Situação / Ponto de atenção: registra quando o texto muda.
  const situacaoHistorico: HistoricoSituacao[] = Array.isArray(existing.situacaoHistorico)
    ? existing.situacaoHistorico.slice(-19)
    : [];
  if (input.situacao !== undefined) {
    const s = String(input.situacao).trim();
    if (s !== (existing.situacao || "") && s) {
      situacaoHistorico.push({ texto: s, at: now, by: authorName });
    }
    next.situacao = s;
  }

  next.historico = historico;
  next.situacaoHistorico = situacaoHistorico;
  next.updatedAt = now;
  next.updatedBy = authorName;

  await redis.hset(KEYS.implantacoes, { [id]: next });
  return next;
}

export async function deleteImplantacao(id: string): Promise<void> {
  await redis.hdel(KEYS.implantacoes, id);
}

export async function getImplantacao(id: string): Promise<Implantacao | null> {
  if (!isConfigured) return null;
  return (await redis.hget<Implantacao>(KEYS.implantacoes, id)) ?? null;
}

/* ============================================================= */
/* Carteiras (vocabulário padronizado)                           */
/* ============================================================= */

export async function getCarteiras(): Promise<Carteira[]> {
  if (!isConfigured) return [];
  const map = await redis.hgetall<Record<string, Carteira>>(KEYS.carteiras);
  return Object.values(map || {}).sort(
    (a, b) => (a.ordem || 0) - (b.ordem || 0) || a.nome.localeCompare(b.nome)
  );
}

export async function createCarteira(nome: string): Promise<Carteira> {
  const clean = nome.trim();
  if (!clean) throw new Error("NOME_REQUIRED");

  const existing = await getCarteiras();
  if (existing.some((c) => c.nome.toLowerCase() === clean.toLowerCase())) {
    throw new Error("DUPLICATE");
  }
  const ordem = existing.reduce((mx, c) => Math.max(mx, c.ordem || 0), 0) + 1;
  const carteira: Carteira = { id: randomUUID(), nome: clean, ordem, createdAt: Date.now() };
  await redis.hset(KEYS.carteiras, { [carteira.id]: carteira });
  return carteira;
}

export async function deleteCarteira(id: string): Promise<void> {
  await redis.hdel(KEYS.carteiras, id);
}

/* ============================================================= */
/* Configurações                                                 */
/* ============================================================= */

export async function getConfig(): Promise<Config> {
  if (!isConfigured) return { ...DEFAULT_CONFIG };
  const c = await redis.hget<Config>(KEYS.config, "app");
  return normalizeConfig(c);
}

export async function setConfig(input: { diasParada?: unknown }): Promise<Config> {
  const cur = await getConfig();
  const next = normalizeConfig({ ...cur, ...input });
  await redis.hset(KEYS.config, { app: next });
  return next;
}

/* ============================================================= */
/* Usuários e acesso                                             */
/* ============================================================= */

function toPublic(u: User): UserPublic {
  const { passwordHash, ...rest } = u;
  return rest;
}

async function getUsersRaw(): Promise<Record<string, User>> {
  if (!isConfigured) return {};
  return (await redis.hgetall<Record<string, User>>(KEYS.users)) || {};
}

export async function getUsers(): Promise<UserPublic[]> {
  const map = await getUsersRaw();
  return Object.values(map)
    .map(toPublic)
    .sort(
      (a, b) =>
        (a.role === b.role ? 0 : a.role === "admin" ? -1 : 1) ||
        a.name.localeCompare(b.name)
    );
}

export async function findUserByUsername(username: string): Promise<User | null> {
  const uname = username.trim().toLowerCase();
  const map = await getUsersRaw();
  return Object.values(map).find((u) => u.username.toLowerCase() === uname) || null;
}

export async function findUserById(id: string): Promise<User | null> {
  if (!isConfigured || !id) return null;
  const map = await getUsersRaw();
  return map[id] || null;
}

/** Cria o admin inicial a partir de ADMIN_PASSWORD caso não exista nenhum usuário. */
export async function ensureBootstrapAdmin(): Promise<void> {
  if (!isConfigured) return;
  const map = await getUsersRaw();
  if (Object.keys(map).length > 0) return;

  const pwd = process.env.ADMIN_PASSWORD;
  if (!pwd) {
    // Em produção nunca crie um admin com senha padrão conhecida.
    if (process.env.NODE_ENV === "production") {
      throw new Error("ADMIN_PASSWORD_REQUIRED");
    }
  }

  const id = randomUUID();
  const user: User = {
    id,
    username: "admin",
    name: "Administrador",
    role: "admin",
    carteiras: [],
    passwordHash: await hashPassword(pwd || "admin"),
    createdAt: Date.now(),
  };
  await redis.hset(KEYS.users, { [id]: user });
}

function sanitizeCarteiras(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map((x) => String(x).trim()).filter(Boolean))];
}

function sanitizeRole(v: unknown): Role {
  return v === "admin" ? "admin" : v === "viewer" ? "viewer" : "user";
}

export async function createUser(input: {
  username: unknown;
  name: unknown;
  password: unknown;
  role: unknown;
  carteiras: unknown;
}): Promise<UserPublic> {
  const username = String(input.username || "").trim();
  const name = String(input.name || "").trim() || username;
  const password = String(input.password || "");
  if (!username) throw new Error("USERNAME_REQUIRED");
  if (password.length < 4) throw new Error("PASSWORD_WEAK");
  if (await findUserByUsername(username)) throw new Error("USERNAME_TAKEN");

  const role = sanitizeRole(input.role);
  const user: User = {
    id: randomUUID(),
    username,
    name,
    role,
    carteiras: role === "admin" ? [] : sanitizeCarteiras(input.carteiras),
    passwordHash: await hashPassword(password),
    createdAt: Date.now(),
  };
  await redis.hset(KEYS.users, { [user.id]: user });
  return toPublic(user);
}

export async function updateUser(
  id: string,
  input: { username?: unknown; name?: unknown; password?: unknown; role?: unknown; carteiras?: unknown }
): Promise<UserPublic> {
  const map = await getUsersRaw();
  const existing = map[id];
  if (!existing) throw new Error("NOT_FOUND");

  const next: User = { ...existing };

  if (input.username !== undefined) {
    const username = String(input.username).trim();
    if (!username) throw new Error("USERNAME_REQUIRED");
    const clash = Object.values(map).find(
      (u) => u.id !== id && u.username.toLowerCase() === username.toLowerCase()
    );
    if (clash) throw new Error("USERNAME_TAKEN");
    next.username = username;
  }
  if (input.name !== undefined) next.name = String(input.name).trim() || next.username;
  if (input.role !== undefined) next.role = sanitizeRole(input.role);
  if (input.carteiras !== undefined) next.carteiras = sanitizeCarteiras(input.carteiras);
  if (next.role === "admin") next.carteiras = [];

  if (input.password !== undefined && String(input.password) !== "") {
    const password = String(input.password);
    if (password.length < 4) throw new Error("PASSWORD_WEAK");
    next.passwordHash = await hashPassword(password);
  }

  // Nunca deixar o sistema sem nenhum admin.
  if (existing.role === "admin" && next.role !== "admin") {
    const admins = Object.values(map).filter((u) => u.role === "admin");
    if (admins.length <= 1) throw new Error("LAST_ADMIN");
  }

  await redis.hset(KEYS.users, { [id]: next });
  return toPublic(next);
}

/** Troca a própria senha: valida a senha atual antes de gravar a nova. */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const map = await getUsersRaw();
  const user = map[userId];
  if (!user) throw new Error("NOT_FOUND");
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new Error("WRONG_PASSWORD");
  }
  if (newPassword.length < 4) throw new Error("PASSWORD_WEAK");
  user.passwordHash = await hashPassword(newPassword);
  await redis.hset(KEYS.users, { [userId]: user });
}

export async function deleteUser(id: string): Promise<void> {
  const map = await getUsersRaw();
  const existing = map[id];
  if (!existing) return;
  if (existing.role === "admin") {
    const admins = Object.values(map).filter((u) => u.role === "admin");
    if (admins.length <= 1) throw new Error("LAST_ADMIN");
  }
  await redis.hdel(KEYS.users, id);
}

/** Implantações visíveis para a sessão: admin vê tudo; usuário vê só suas carteiras. */
export function visibleFor(session: Session, imps: Implantacao[]): Implantacao[] {
  if (!session) return [];
  if (session.role === "admin") return imps;
  const set = new Set(session.carteiras);
  return imps.filter((i) => set.has(i.carteira));
}

/** Verdadeiro se a sessão pode editar/criar nesta carteira (viewer nunca pode). */
export function canUseCarteira(session: Session, carteira: string): boolean {
  if (!session) return false;
  if (session.role === "admin") return true;
  if (session.role === "user") return session.carteiras.includes(carteira);
  return false; // viewer: somente leitura
}

export async function createArea(nome: string): Promise<Area> {
  const clean = nome.trim();
  if (!clean) throw new Error("NOME_REQUIRED");

  const existing = await redis.hgetall<Record<string, Area>>(KEYS.areas);
  const ordem =
    Object.values(existing || {}).reduce((mx, a) => Math.max(mx, a.ordem || 0), 0) + 1;

  const area: Area = { id: randomUUID(), nome: clean, ordem, createdAt: Date.now() };
  await redis.hset(KEYS.areas, { [area.id]: area });
  return area;
}

export async function deleteArea(id: string): Promise<void> {
  await redis.hdel(KEYS.areas, id);
}

/** Popula exemplos somente se o banco estiver vazio. Retorna true se semeou. */
export async function seedIfEmpty(authorName: string): Promise<boolean> {
  const { areas, implantacoes } = await getAll();
  if (areas.length || implantacoes.length) return false;

  const now = Date.now();
  const mk = (nome: string, ordem: number): Area => ({
    id: randomUUID(),
    nome,
    ordem,
    createdAt: now,
  });
  const aCS = mk("CS", 1);
  const aCom = mk("Comercial", 2);
  const aProd = mk("Produto", 3);
  const aFin = mk("Financeiro", 4);

  await redis.hset(KEYS.areas, {
    [aCS.id]: aCS,
    [aCom.id]: aCom,
    [aProd.id]: aProd,
    [aFin.id]: aFin,
  });

  // Carteiras padronizadas usadas pelas implantações de exemplo.
  const carteiraNomes = ["Sul 1", "Sul 2", "Sudeste 2", "Norte 1"];
  const carteirasPayload: Record<string, Carteira> = {};
  carteiraNomes.forEach((nome, i) => {
    const c: Carteira = { id: randomUUID(), nome, ordem: i + 1, createdAt: now };
    carteirasPayload[c.id] = c;
  });
  await redis.hset(KEYS.carteiras, carteirasPayload);

  const imp = (
    cliente: string,
    carteira: string,
    responsavel: string,
    farol: Farol,
    situacao: string,
    apoio: "sim" | "nao",
    areaId: string,
    ticket: string,
    marcos: Implantacao["marcos"] = emptyMarcos(),
    goLive = ""
  ): Implantacao => ({
    id: randomUUID(),
    cliente,
    carteira,
    responsavel,
    farol,
    situacao,
    apoio,
    areaId,
    ticket,
    goLive,
    marcos,
    createdAt: now,
    updatedAt: now,
    updatedBy: authorName,
    historico: [{ farol, at: now, by: authorName }],
    situacaoHistorico: situacao ? [{ texto: situacao, at: now, by: authorName }] : [],
  });

  // Formata uma data relativa a hoje como dd/mm/aaaa (para exemplos realistas).
  const fmtBR = (offsetDays: number): string => {
    const d = new Date(now + offsetDays * 86400000);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  };

  const rows = [
    imp(
      "Transportadora Alfa",
      "Sul 1",
      "Marina Alves",
      "vermelho",
      "Integração do TMS parada: cliente não liberou acesso ao ERP. Reunião de desbloqueio agendada p/ sexta.",
      "sim",
      aProd.id,
      "IMP-1042",
      {
        importacao: { feito: false, previsao: fmtBR(6) },
        emissao: { feito: false, previsao: "" },
        acertoViagem: { feito: false, previsao: "" },
      },
      fmtBR(-3)
    ),
    imp(
      "Log Beta Cargas",
      "Sudeste 2",
      "Rafael Dias",
      "amarelo",
      "Treinamento de emissão em andamento; pendência de 2 usuários sem perfil cadastrado.",
      "sim",
      aCS.id,
      "IMP-1050",
      {
        importacao: { feito: true, previsao: "", tipos: ["xml"], concluidoEm: now - 10 * 86400000 },
        emissao: { feito: false, previsao: fmtBR(-4) },
        acertoViagem: { feito: false, previsao: "" },
      },
      fmtBR(6)
    ),
    imp(
      "Carga Sul Express",
      "Sul 1",
      "Marina Alves",
      "verde",
      "Go-live concluído. Acompanhamento pós-implantação na 2ª semana, sem incidentes.",
      "nao",
      "",
      "IMP-0998",
      {
        importacao: { feito: true, previsao: "", tipos: ["cadastros"], concluidoEm: now - 20 * 86400000 },
        emissao: { feito: true, previsao: "", concluidoEm: now - 12 * 86400000 },
        acertoViagem: { feito: true, previsao: "", concluidoEm: now - 5 * 86400000 },
      },
      fmtBR(-10)
    ),
    imp(
      "Rodoviário Norte",
      "Norte 1",
      "Camila Souza",
      "amarelo",
      "Aguardando definição comercial sobre escopo de frota antes de iniciar parametrização.",
      "sim",
      aCom.id,
      "IMP-1061"
    ),
    imp(
      "Expresso Pampa",
      "Sul 2",
      "Rafael Dias",
      "verde",
      "Parametrização fiscal validada; cliente em uso assistido.",
      "nao",
      "",
      "IMP-1033"
    ),
  ];

  // Exemplo de implantação "parada" (sem atualização há alguns dias).
  const parada = rows.find((r) => r.cliente === "Rodoviário Norte");
  if (parada) parada.updatedAt = now - 9 * 86400000;

  // Datas de criação recuadas para exemplos de tempo por etapa.
  const cargaSul = rows.find((r) => r.cliente === "Carga Sul Express");
  if (cargaSul) cargaSul.createdAt = now - 25 * 86400000;
  const logBeta = rows.find((r) => r.cliente === "Log Beta Cargas");
  if (logBeta) logBeta.createdAt = now - 14 * 86400000;

  const payload: Record<string, Implantacao> = {};
  for (const r of rows) payload[r.id] = r;
  await redis.hset(KEYS.implantacoes, payload);

  return true;
}
