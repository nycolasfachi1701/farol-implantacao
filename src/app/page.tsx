"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  Carteira,
  Implantacao,
  Farol,
  FAROIS,
  FAROL_LABEL,
  MARCOS,
  Marcos,
  MarcoKey,
  ImportTipo,
  IMPORT_TIPOS,
  IMPORT_TIPO_LABEL,
  tiposLabel,
  normalizeMarcos,
  Role,
  Session,
  StateResponse,
  UserPublic,
  Config,
  DEFAULT_CONFIG,
} from "@/lib/types";

/* ---------- helpers de API ---------- */
async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data && data.error) || "Erro inesperado.");
  return data as T;
}

/* ---------- helpers de ticket ---------- */
/** Verdadeiro quando o valor do ticket é um link http(s). */
function isTicketUrl(v: string): boolean {
  return /^https?:\/\//i.test(v.trim());
}

/** Texto curto para exibir num ticket que é link (ex.: último segmento ou host). */
function ticketLabel(v: string): string {
  const raw = v.trim();
  try {
    const u = new URL(raw);
    const seg = u.pathname.split("/").filter(Boolean).pop();
    return decodeURIComponent(seg || u.hostname);
  } catch {
    return raw;
  }
}

/** Formata um timestamp como "dd/mm/aaaa HH:MM" no fuso do navegador. */
function formatDateTime(ts?: number): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/* ---------- helpers de alertas ---------- */
/** Padrão de dias sem atualização para "parada" (ajustável pelo admin). */
const DIAS_PARADA_PADRAO = 7;

/** Converte "dd/mm/aaaa" em Date (ou null se não for data válida). */
function parseBRDate(v: string): Date | null {
  const m = (v || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return isNaN(dt.getTime()) ? null : dt;
}

/** Verdadeiro se a previsão (dd/mm/aaaa) já passou (anterior a hoje). */
function isPrevisaoVencida(previsao: string): boolean {
  const dt = parseBRDate(previsao);
  if (!dt) return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return dt.getTime() < hoje.getTime();
}

function diasSemAtualizar(ts?: number): number {
  if (!ts) return 0;
  return Math.floor((Date.now() - ts) / 86400000);
}

function isParada(imp: Implantacao, dias: number): boolean {
  return diasSemAtualizar(imp.updatedAt) >= dias;
}

/** Verdadeiro se alguma etapa não concluída tem previsão vencida. */
function temPrevisaoVencida(marcos: Marcos): boolean {
  return MARCOS.some(({ key }) => {
    const m = marcos[key];
    return !m.feito && isPrevisaoVencida(m.previsao);
  });
}

/* ---------- helpers de etapas (marcos) ---------- */
type MarcoStatus = "feito" | "atrasado" | "previsto" | "pendente";
const MARCO_ABBR: Record<MarcoKey, string> = {
  importacao: "Importação",
  emissao: "Emissão",
  acertoViagem: "Acerto viagem",
};
function marcoStatus(m: { feito: boolean; previsao: string }): MarcoStatus {
  if (m.feito) return "feito";
  if (m.previsao && isPrevisaoVencida(m.previsao)) return "atrasado";
  if ((m.previsao || "").trim()) return "previsto";
  return "pendente";
}
/** Aplica máscara de data dd/mm/aaaa enquanto o usuário digita (só dígitos). */
function maskDate(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** Converte "dd/mm/aaaa" para "aaaa-mm-dd" (vazio se não for data válida). */
function brToIso(v: string): string {
  const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** Campo de data (previsão/realização): texto com máscara + botão de calendário. */
function PrevisaoInput({
  value,
  onChange,
  placeholder = "dd/mm/aaaa",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const dateRef = useRef<HTMLInputElement>(null);

  function openCalendar() {
    const el = dateRef.current;
    if (!el) return;
    try {
      // showPicker() abre o calendário nativo nos navegadores modernos.
      (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    } catch {
      el.focus();
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const iso = e.target.value; // aaaa-mm-dd
    if (!iso) return;
    const [y, m, d] = iso.split("-");
    onChange(`${d}/${m}/${y}`);
  }

  return (
    <div className="prev-field">
      <input
        className="marco-prev-input"
        value={value}
        onChange={(e) => onChange(maskDate(e.target.value))}
        inputMode="numeric"
        maxLength={10}
        placeholder={placeholder}
      />
      <button type="button" className="prev-cal" title="Escolher data no calendário" onClick={openCalendar}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>
      <input
        ref={dateRef}
        type="date"
        className="prev-date-hidden"
        value={brToIso(value)}
        onChange={onPick}
        tabIndex={-1}
        aria-hidden
      />
    </div>
  );
}

function MarcosMini({ marcos }: { marcos: Marcos }) {
  return (
    <div className="marcos-mini">
      {MARCOS.map(({ key, short }) => {
        const m = marcos[key];
        const st = marcoStatus(m);
        const title =
          st === "feito"
            ? `${short}: concluído${m.previsao ? " em " + m.previsao : ""}`
            : st === "atrasado"
            ? `${short}: previsão vencida (${m.previsao})`
            : st === "previsto"
            ? `${short}: previsão ${m.previsao}`
            : `${short}: pendente`;
        return (
          <span key={key} className={`mm ${st}`} title={title}>
            <span className="mm-dot" />
            {MARCO_ABBR[key]}
            {m.previsao && <span className="mm-prev">· {m.previsao}</span>}
            {key === "importacao" && m.feito && m.tipos && m.tipos.length > 0 && (
              <span className="mm-prev">· {tiposLabel(m.tipos)}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

type Filter = {
  farol: Farol | "";
  areaId: string;
  resp: string;
  carteira: string;
  q: string;
  alerta: "" | "parada" | "vencida";
};
const EMPTY_FILTER: Filter = { farol: "", areaId: "", resp: "", carteira: "", q: "", alerta: "" };

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  user: "Usuário",
  viewer: "Visualizador",
};

/* ============================================================= */
export default function Page() {
  const [configured, setConfigured] = useState(true);
  const [session, setSession] = useState<Session>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [carteiras, setCarteiras] = useState<Carteira[]>([]);
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [imps, setImps] = useState<Implantacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER);
  const [toast, setToast] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const [loginOpen, setLoginOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Implantacao | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Implantacao | null>(null);
  const [extratoTarget, setExtratoTarget] = useState<Implantacao | null>(null);
  const [areasOpen, setAreasOpen] = useState(false);
  const [carteirasOpen, setCarteirasOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);

  const isLogged = !!session;
  const isAdmin = session?.role === "admin";
  const diasParada = config.diasParada || DIAS_PARADA_PADRAO;
  /** Carteiras que a sessão pode usar/atribuir (admin = todas). */
  const myCarteiras = useMemo(
    () => (isAdmin ? carteiras.map((c) => c.nome) : session?.carteiras ?? []),
    [isAdmin, carteiras, session]
  );
  const canCreate = isAdmin || (session?.role === "user" && myCarteiras.length > 0);
  const canEditImp = useCallback(
    (imp: Implantacao) =>
      isAdmin || (session?.role === "user" && session.carteiras.includes(imp.carteira)),
    [isAdmin, session]
  );
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await api<StateResponse>("/api/state");
      setConfigured(data.configured);
      setSession(data.session);
      setAreas(data.areas);
      setCarteiras(data.carteiras);
      setUsers(data.users ?? []);
      setConfig(data.config ?? DEFAULT_CONFIG);
      setImps(data.implantacoes);
    } catch {
      /* mantém estado atual */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  // Sincroniza o estado do tema com o que o script inline já aplicou no <html>.
  useEffect(() => {
    const cur = (document.documentElement.dataset.theme as "light" | "dark") || "light";
    setTheme(cur);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
    setTheme(next);
  }

  /* ---------- derivados ---------- */
  const areaById = useMemo(() => {
    const m: Record<string, Area> = {};
    areas.forEach((a) => (m[a.id] = a));
    return m;
  }, [areas]);

  const responsaveis = useMemo(() => {
    const s = new Set<string>();
    imps.forEach((i) => i.responsavel && s.add(i.responsavel));
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [imps]);

  const alertas = useMemo(() => {
    let parada = 0;
    let vencida = 0;
    imps.forEach((i) => {
      if (isParada(i, diasParada)) parada++;
      if (temPrevisaoVencida(normalizeMarcos(i.marcos))) vencida++;
    });
    return { parada, vencida };
  }, [imps, diasParada]);

  const rows = useMemo(() => {
    let r = [...imps];
    if (filter.farol) r = r.filter((x) => x.farol === filter.farol);
    if (filter.areaId) r = r.filter((x) => x.areaId === filter.areaId);
    if (filter.resp) r = r.filter((x) => x.responsavel === filter.resp);
    if (filter.carteira) r = r.filter((x) => x.carteira === filter.carteira);
    if (filter.alerta === "parada") r = r.filter((x) => isParada(x, diasParada));
    else if (filter.alerta === "vencida")
      r = r.filter((x) => temPrevisaoVencida(normalizeMarcos(x.marcos)));
    if (filter.q) {
      const q = filter.q.toLowerCase();
      r = r.filter((x) =>
        [x.cliente, x.responsavel, x.ticket, x.carteira].some((v) =>
          String(v || "").toLowerCase().includes(q)
        )
      );
    }
    // Mais recentemente atualizadas primeiro.
    r.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return r;
  }, [imps, filter, diasParada]);

  /* ---------- ações ---------- */
  async function setFarol(imp: Implantacao, f: Farol) {
    if (imp.farol === f) return;
    // atualização otimista
    setImps((prev) => prev.map((x) => (x.id === imp.id ? { ...x, farol: f } : x)));
    try {
      await api(`/api/implantacoes/${imp.id}`, {
        method: "PUT",
        body: JSON.stringify({ farol: f }),
      });
      showToast("Farol atualizado");
      load();
    } catch (e: any) {
      showToast(e.message || "Não foi possível salvar");
      load();
    }
  }

  async function logout() {
    await api("/api/logout", { method: "POST" }).catch(() => {});
    setSession(null);
    setImps([]);
    showToast("Você saiu");
  }

  const clearFilters = () => setFilter(EMPTY_FILTER);

  /* ============================================================= */
  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <img className="logo" src="/atua-logo.png" alt="atua" />
            <span className="brand-sep" />
            <div>
              <h1>Farol de Implantações</h1>
              <div className="sub">Rotina de consultoria · andamento das implantações</div>
            </div>
          </div>
          <div className="spacer" />
          <div className="whoami">
            <button
              className="iconbtn"
              title={theme === "dark" ? "Tema claro" : "Tema escuro"}
              aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
              onClick={toggleTheme}
              style={{ color: "var(--cinza)" }}
            >
              {theme === "dark" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
                </svg>
              )}
            </button>
            {isLogged ? (
              <>
                <span className="nm">{session?.name}</span>
                {session && (
                  <span className={`role ${session.role}`}>{ROLE_LABEL[session.role]}</span>
                )}
                <button
                  className="iconbtn"
                  title="Alterar minha senha"
                  aria-label="Alterar minha senha"
                  onClick={() => setPwdOpen(true)}
                  style={{ color: "var(--cinza)" }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <circle cx="12" cy="16" r="1" />
                  </svg>
                </button>
                <button className="iconbtn" title="Sair" onClick={logout} style={{ color: "var(--cinza)" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                  </svg>
                </button>
              </>
            ) : (
              <button className="btn primary" onClick={() => setLoginOpen(true)}>
                Entrar
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="wrap">
        {!configured && (
          <div className="banner">
            <strong>Banco de dados não configurado.</strong> Defina{" "}
            <code>UPSTASH_REDIS_REST_URL</code> e <code>UPSTASH_REDIS_REST_TOKEN</code> (ou as
            variáveis <code>KV_REST_API_*</code>) nas configurações do projeto. Veja o{" "}
            <code>README.md</code>.
          </div>
        )}

        {!isLogged ? (
          <LoginPrompt onLogin={() => setLoginOpen(true)} />
        ) : (
          <>
        {/* Visão geral (dashboard no topo) */}
        <Dashboard
          imps={imps}
          areas={areas}
          diasParada={diasParada}
          filter={filter}
          setFilter={setFilter}
        />

        {/* Alertas */}
        {(alertas.parada > 0 || alertas.vencida > 0) && (
          <div className="alerts">
            {alertas.parada > 0 && (
              <button
                className={`alert-pill parada ${filter.alerta === "parada" ? "active" : ""}`}
                onClick={() =>
                  setFilter((f) => ({ ...f, alerta: f.alerta === "parada" ? "" : "parada" }))
                }
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                </svg>
                {alertas.parada} {alertas.parada === 1 ? "parada" : "paradas"}
                <span className="alert-sub">sem atualização há {diasParada}+ dias</span>
              </button>
            )}
            {alertas.vencida > 0 && (
              <button
                className={`alert-pill vencida ${filter.alerta === "vencida" ? "active" : ""}`}
                onClick={() =>
                  setFilter((f) => ({ ...f, alerta: f.alerta === "vencida" ? "" : "vencida" }))
                }
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                {alertas.vencida} com previsão vencida
              </button>
            )}
          </div>
        )}

        {/* Ações */}
        {(
          <div className="actionsbar">
            {isAdmin && (
              <div className="mgmt">
                <button className="mgmt-btn" onClick={() => setUsersOpen(true)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  Usuários
                </button>
                <button className="mgmt-btn" onClick={() => setCarteirasOpen(true)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />
                  </svg>
                  Carteiras
                </button>
                <button className="mgmt-btn" onClick={() => setAreasOpen(true)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 6h16M4 12h16M4 18h10" />
                  </svg>
                  Áreas
                </button>
                <button className="mgmt-btn" onClick={() => setConfigOpen(true)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                  </svg>
                  Config
                </button>
              </div>
            )}
            <div className="spacer" />
            <button className="btn ghost" onClick={() => setReportOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" />
              </svg>
              Relatório
            </button>
            {canCreate && (
              <button className="btn primary" onClick={() => setEditTarget("new")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Nova implantação
              </button>
            )}
          </div>
        )}

        {/* Filtros */}
        <div className="toolbar">
          <span className="toolbar-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 5h16M7 12h10M10 19h4" />
            </svg>
            Filtros
          </span>
          <div className="search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="search"
              placeholder="Buscar cliente, responsável ou ticket…"
              value={filter.q}
              onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
            />
          </div>
          <select
            className="flt"
            value={filter.areaId}
            onChange={(e) => setFilter((f) => ({ ...f, areaId: e.target.value }))}
          >
            <option value="">Todas as áreas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
          <select
            className="flt"
            value={filter.resp}
            onChange={(e) => setFilter((f) => ({ ...f, resp: e.target.value }))}
          >
            <option value="">Todos responsáveis</option>
            {responsaveis.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {(isAdmin ? carteiras.length > 0 : myCarteiras.length > 1) && (
            <select
              className="flt"
              value={filter.carteira}
              onChange={(e) => setFilter((f) => ({ ...f, carteira: e.target.value }))}
            >
              <option value="">Todas as carteiras</option>
              {(isAdmin ? carteiras.map((c) => c.nome) : myCarteiras).map((nome) => (
                <option key={nome} value={nome}>
                  {nome}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Tabela */}
        <div className="tablecard">
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Carteira</th>
                  <th>Responsável</th>
                  <th>Farol</th>
                  <th>Situação / Ponto de atenção</th>
                  <th>Apoio?</th>
                  <th>Área</th>
                  <th>Ticket</th>
                  <th aria-label="ações" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9}>
                      <div className="skel">Carregando…</div>
                    </td>
                  </tr>
                ) : imps.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <EmptyFirst
                        isAdmin={isAdmin}
                        canCreate={canCreate}
                        onAdd={() => setEditTarget("new")}
                        onSeed={async () => {
                          try {
                            await api("/api/seed", { method: "POST" });
                            showToast("Exemplos carregados");
                            load();
                          } catch (e: any) {
                            showToast(e.message);
                          }
                        }}
                      />
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <div className="state">
                        <h3>Nenhum resultado</h3>
                        <p>Nenhuma implantação corresponde aos filtros atuais.</p>
                        <div className="row">
                          <button className="btn ghost" onClick={clearFilters}>
                            Limpar filtros
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <Row
                      key={r.id}
                      imp={r}
                      area={areaById[r.areaId]}
                      diasParada={diasParada}
                      canEdit={canEditImp(r)}
                      canDelete={isAdmin}
                      onFarol={(f) => setFarol(r, f)}
                      onEdit={() => setEditTarget(r)}
                      onDelete={() => setDeleteTarget(r)}
                      onExtrato={() => setExtratoTarget(r)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="legend">
          <span className="li"><span className="dot verde" /> Em dia — sem riscos</span>
          <span className="li"><span className="dot amarelo" /> Atenção — risco ou atraso leve</span>
          <span className="li"><span className="dot vermelho" /> Crítico — bloqueio ou atraso grave</span>
        </div>
          </>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}

      {loginOpen && (
        <LoginModal
          onClose={() => setLoginOpen(false)}
          onSuccess={() => {
            setLoginOpen(false);
            showToast("Bem-vindo(a)!");
            load();
          }}
        />
      )}

      {editTarget && (
        <EditModal
          target={editTarget}
          areas={areas}
          carteiras={carteiras}
          allowedCarteiras={isAdmin ? null : myCarteiras}
          onClose={() => setEditTarget(null)}
          onSaved={(msg) => {
            setEditTarget(null);
            showToast(msg);
            load();
          }}
        />
      )}

      {extratoTarget && (
        <ExtratoModal
          imp={extratoTarget}
          area={areaById[extratoTarget.areaId]}
          onClose={() => setExtratoTarget(null)}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          imp={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDone={() => {
            setDeleteTarget(null);
            showToast("Implantação excluída");
            load();
          }}
        />
      )}

      {areasOpen && (
        <AreasModal areas={areas} onClose={() => setAreasOpen(false)} onChange={load} />
      )}

      {carteirasOpen && (
        <CarteirasModal
          carteiras={carteiras}
          onClose={() => setCarteirasOpen(false)}
          onChange={load}
          showToast={showToast}
        />
      )}

      {usersOpen && (
        <UsersModal
          users={users}
          carteiras={carteiras}
          onClose={() => setUsersOpen(false)}
          onChange={load}
          showToast={showToast}
        />
      )}

      {configOpen && (
        <ConfigModal
          config={config}
          onClose={() => setConfigOpen(false)}
          onSaved={(msg) => {
            setConfigOpen(false);
            showToast(msg);
            load();
          }}
        />
      )}

      {reportOpen && (
        <ReportView
          rows={rows}
          areaById={areaById}
          filterActive={filter !== EMPTY_FILTER && JSON.stringify(filter) !== JSON.stringify(EMPTY_FILTER)}
          generatedBy={session?.name || ""}
          onClose={() => setReportOpen(false)}
        />
      )}


      {pwdOpen && (
        <ChangePasswordModal
          username={session?.username || ""}
          onClose={() => setPwdOpen(false)}
          onDone={() => {
            setPwdOpen(false);
            showToast("Senha alterada");
          }}
        />
      )}
    </>
  );
}

function ChangePasswordModal({
  username,
  onClose,
  onDone,
}: {
  username: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!current || !next) {
      setErr("Preencha a senha atual e a nova.");
      return;
    }
    if (next.length < 4) {
      setErr("A nova senha precisa ter ao menos 4 caracteres.");
      return;
    }
    if (next !== confirm) {
      setErr("A confirmação não confere com a nova senha.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api("/api/password", { method: "POST", body: JSON.stringify({ current, next }) });
      onDone();
    } catch (e: any) {
      setErr(e.message || "Não foi possível alterar a senha.");
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Alterar minha senha"
      subtitle={username ? `@${username}` : undefined}
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <circle cx="12" cy="16" r="1" />
        </svg>
      }
      width={420}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? "Salvando…" : "Alterar senha"}
          </button>
        </>
      }
    >
      <div className="field">
        <label>Senha atual</label>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label>Nova senha</label>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
      </div>
      <div className="field">
        <label>Confirmar nova senha</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
      </div>
      {err && <p className="err">{err}</p>}
    </Modal>
  );
}

function ReportView({
  rows,
  areaById,
  filterActive,
  generatedBy,
  onClose,
}: {
  rows: Implantacao[];
  areaById: Record<string, Area>;
  filterActive: boolean;
  generatedBy: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const counts = { verde: 0, amarelo: 0, vermelho: 0 };
  rows.forEach((r) => {
    if (r.farol in counts) counts[r.farol]++;
  });
  const now = new Date().toLocaleString("pt-BR");

  return (
    <div className="report-root">
      <div className="report-toolbar">
        <button className="btn ghost" onClick={onClose}>
          Fechar
        </button>
        <div className="spacer" />
        <button className="btn primary" onClick={() => window.print()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
          </svg>
          Imprimir / Salvar PDF
        </button>
      </div>

      <div className="report-sheet">
        <div className="report-head">
          <img src="/atua-logo.png" alt="atua" className="report-logo" />
          <div>
            <h1>Relatório de Implantações</h1>
            <div className="report-meta">
              Gerado em {now}
              {generatedBy ? ` por ${generatedBy}` : ""}
              {filterActive ? " · filtros aplicados" : ""}
            </div>
          </div>
        </div>

        <div className="report-summary">
          <div className="rs-item">
            <span className="rs-num">{rows.length}</span>
            <span className="rs-label">Total</span>
          </div>
          <div className="rs-item">
            <span className="rs-dot verde" /> <span className="rs-num">{counts.verde}</span>
            <span className="rs-label">Em dia</span>
          </div>
          <div className="rs-item">
            <span className="rs-dot amarelo" /> <span className="rs-num">{counts.amarelo}</span>
            <span className="rs-label">Atenção</span>
          </div>
          <div className="rs-item">
            <span className="rs-dot vermelho" /> <span className="rs-num">{counts.vermelho}</span>
            <span className="rs-label">Crítico</span>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="report-empty">Nenhuma implantação para listar.</p>
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Carteira</th>
                <th>Responsável</th>
                <th>Farol</th>
                <th>Situação / Ponto de atenção</th>
                <th>Etapas</th>
                <th>Área</th>
                <th>Ticket</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const mk = normalizeMarcos(r.marcos);
                return (
                  <tr key={r.id}>
                    <td>{r.cliente || "—"}</td>
                    <td>{r.carteira || "—"}</td>
                    <td>{r.responsavel || "—"}</td>
                    <td className="nowrap">
                      <span className={`rs-dot ${r.farol}`} /> {FAROL_LABEL[r.farol]}
                    </td>
                    <td>{r.situacao || "—"}</td>
                    <td className="report-marcos">
                      {MARCOS.map(({ key, short }) => {
                        const m = mk[key];
                        return (
                          <span key={key} className="rm-item">
                            {m.feito ? "✓" : m.previsao ? "◷" : "○"} {short}
                            {m.previsao ? ` (${m.previsao})` : ""}
                            {key === "importacao" && m.feito && m.tipos && m.tipos.length > 0
                              ? ` (${tiposLabel(m.tipos)})`
                              : ""}
                          </span>
                        );
                      })}
                    </td>
                    <td>{areaById[r.areaId]?.nome || "—"}</td>
                    <td>{r.ticket ? (isTicketUrl(r.ticket) ? ticketLabel(r.ticket) : r.ticket) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="report-footer">Farol de Implantações · atua · rotina de consultoria</div>
      </div>
    </div>
  );
}

function BarRow({
  label,
  value,
  total,
  color,
  onClick,
  active,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const content = (
    <>
      <span className="bar-label" title={label}>
        {label}
      </span>
      <span className="bar-track">
        <span className="bar-fill" style={{ width: `${pct}%`, background: color }} />
      </span>
      <span className="bar-value">
        {value} <span className="bar-pct">({pct}%)</span>
      </span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={`bar-row clickable ${active ? "active" : ""}`} onClick={onClick}>
        {content}
      </button>
    );
  }
  return <div className="bar-row">{content}</div>;
}

function Dashboard({
  imps,
  areas,
  diasParada,
  filter,
  setFilter,
}: {
  imps: Implantacao[];
  areas: Area[];
  diasParada: number;
  filter: Filter;
  setFilter: React.Dispatch<React.SetStateAction<Filter>>;
}) {
  const total = imps.length;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const farol = { verde: 0, amarelo: 0, vermelho: 0 };
  const etapa = { importacao: 0, emissao: 0, acertoViagem: 0 };
  let paradas = 0;
  let vencidas = 0;
  let concluidas = 0;
  const carteiraMap = new Map<string, number>();
  const areaMap = new Map<string, { id: string; n: number }>();
  const areaNome: Record<string, string> = {};
  areas.forEach((a) => (areaNome[a.id] = a.nome));

  imps.forEach((i) => {
    if (i.farol in farol) farol[i.farol]++;
    const m = normalizeMarcos(i.marcos);
    if (m.importacao.feito) etapa.importacao++;
    if (m.emissao.feito) etapa.emissao++;
    if (m.acertoViagem.feito) etapa.acertoViagem++;
    if (m.importacao.feito && m.emissao.feito && m.acertoViagem.feito) concluidas++;
    if (isParada(i, diasParada)) paradas++;
    if (temPrevisaoVencida(m)) vencidas++;
    const c = i.carteira || "Sem carteira";
    carteiraMap.set(c, (carteiraMap.get(c) || 0) + 1);
    const nome = i.areaId ? areaNome[i.areaId] || "Área removida" : "Sem área";
    const prev = areaMap.get(nome);
    areaMap.set(nome, { id: i.areaId || "", n: (prev?.n || 0) + 1 });
  });

  const porCarteira = [...carteiraMap.entries()].sort((a, b) => b[1] - a[1]);
  const porArea = [...areaMap.entries()].sort((a, b) => b[1].n - a[1].n);

  const gv = total ? (farol.verde / total) * 100 : 0;
  const ga = total ? (farol.amarelo / total) * 100 : 0;
  const donutBg =
    total === 0
      ? "var(--surface-3)"
      : `conic-gradient(var(--verde) 0 ${gv}%, var(--amarelo) ${gv}% ${gv + ga}%, var(--vermelho) ${gv + ga}% 100%)`;

  const setFarolFilter = (f: Farol | "") =>
    setFilter((cur) => ({ ...cur, alerta: "", farol: cur.farol === f ? "" : f }));
  const setAlerta = (a: "parada" | "vencida") =>
    setFilter((cur) => ({ ...cur, farol: "", alerta: cur.alerta === a ? "" : a }));

  const semFiltro = !filter.farol && !filter.alerta;

  return (
    <div className="dash">
      <div className="dash-kpis">
        <button
          className={`kpi ${semFiltro ? "active" : ""}`}
          onClick={() => setFilter((f) => ({ ...f, farol: "", alerta: "" }))}
        >
          <span className="kpi-num">{total}</span>
          <span className="kpi-label">Total</span>
        </button>
        <button
          className={`kpi ${filter.farol === "verde" ? "active" : ""}`}
          onClick={() => setFarolFilter("verde")}
        >
          <span className="kpi-num" style={{ color: "var(--verde)" }}>{farol.verde}</span>
          <span className="kpi-label">Em dia</span>
        </button>
        <button
          className={`kpi ${filter.farol === "amarelo" ? "active" : ""}`}
          onClick={() => setFarolFilter("amarelo")}
        >
          <span className="kpi-num" style={{ color: "var(--amarelo)" }}>{farol.amarelo}</span>
          <span className="kpi-label">Atenção</span>
        </button>
        <button
          className={`kpi ${filter.farol === "vermelho" ? "active" : ""}`}
          onClick={() => setFarolFilter("vermelho")}
        >
          <span className="kpi-num" style={{ color: "var(--vermelho)" }}>{farol.vermelho}</span>
          <span className="kpi-label">Crítico</span>
        </button>
        <button
          className={`kpi ${filter.alerta === "parada" ? "active" : ""}`}
          onClick={() => setAlerta("parada")}
        >
          <span className="kpi-num" style={{ color: "var(--amarelo)" }}>{paradas}</span>
          <span className="kpi-label">Paradas</span>
        </button>
        <button
          className={`kpi ${filter.alerta === "vencida" ? "active" : ""}`}
          onClick={() => setAlerta("vencida")}
        >
          <span className="kpi-num" style={{ color: "var(--vermelho)" }}>{vencidas}</span>
          <span className="kpi-label">Previsão vencida</span>
        </button>
      </div>

      <div className="dash-grid">
        <section className="dash-card">
          <h4 className="dash-h">Distribuição por farol</h4>
          <div className="donut-wrap">
            <div className="donut" style={{ background: donutBg }}>
              <div className="donut-hole">
                <span className="donut-num">{pct(concluidas)}%</span>
                <span className="donut-cap">concluídas</span>
              </div>
            </div>
            <div className="stack-legend">
              <span><span className="dot verde" /> Em dia — {farol.verde} ({pct(farol.verde)}%)</span>
              <span><span className="dot amarelo" /> Atenção — {farol.amarelo} ({pct(farol.amarelo)}%)</span>
              <span><span className="dot vermelho" /> Crítico — {farol.vermelho} ({pct(farol.vermelho)}%)</span>
            </div>
          </div>
        </section>

        <section className="dash-card">
          <h4 className="dash-h">Progresso das etapas</h4>
          <BarRow label="Importação" value={etapa.importacao} total={total} color="var(--accent)" />
          <BarRow label="Teste de emissão" value={etapa.emissao} total={total} color="var(--accent)" />
          <BarRow label="Acerto de viagem" value={etapa.acertoViagem} total={total} color="var(--accent)" />
        </section>

        <section className="dash-card">
          <h4 className="dash-h">Por carteira</h4>
          {porCarteira.length === 0 ? (
            <p className="muted">Sem dados.</p>
          ) : (
            porCarteira.map(([nome, n]) => (
              <BarRow
                key={nome}
                label={nome}
                value={n}
                total={total}
                color="var(--accent)"
                active={filter.carteira === nome}
                onClick={() =>
                  setFilter((f) => ({ ...f, carteira: f.carteira === nome ? "" : nome }))
                }
              />
            ))
          )}
        </section>

        <section className="dash-card">
          <h4 className="dash-h">Por área</h4>
          {porArea.length === 0 ? (
            <p className="muted">Sem dados.</p>
          ) : (
            porArea.map(([nome, { id, n }]) => (
              <BarRow
                key={nome}
                label={nome}
                value={n}
                total={total}
                color="var(--chumbo)"
                active={!!id && filter.areaId === id}
                onClick={id ? () => setFilter((f) => ({ ...f, areaId: f.areaId === id ? "" : id })) : undefined}
              />
            ))
          )}
        </section>
      </div>
    </div>
  );
}

function LoginPrompt({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="tablecard">
      <div className="state">
        <h3>Entre para ver suas implantações</h3>
        <p>
          O acesso é individual: cada pessoa vê e edita apenas as carteiras atribuídas a ela. Fale
          com um administrador se precisar de acesso.
        </p>
        <div className="row">
          <button className="btn primary" onClick={onLogin}>
            Entrar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================= */
function Row({
  imp,
  area,
  diasParada,
  canEdit,
  canDelete,
  onFarol,
  onEdit,
  onDelete,
  onExtrato,
}: {
  imp: Implantacao;
  area?: Area;
  diasParada: number;
  canEdit: boolean;
  canDelete: boolean;
  onFarol: (f: Farol) => void;
  onEdit: () => void;
  onDelete: () => void;
  onExtrato: () => void;
}) {
  return (
    <tr>
      <td><span className="c-cliente">{imp.cliente || "—"}</span></td>
      <td>{imp.carteira ? <span className="chip">{imp.carteira}</span> : <span className="muted">—</span>}</td>
      <td>{imp.responsavel || <span className="muted">—</span>}</td>
      <td>
        {canEdit ? (
          <div className="segf">
            {FAROIS.map((f) => (
              <button
                key={f}
                data-f={f}
                aria-pressed={imp.farol === f}
                title={FAROL_LABEL[f]}
                onClick={() => onFarol(f)}
              >
                <span className="inner" />
              </button>
            ))}
            <span className="seglabel">{FAROL_LABEL[imp.farol]}</span>
          </div>
        ) : (
          <span className="farol">
            <span className={`fdot ${imp.farol}`} />
            <span className="flabel">{FAROL_LABEL[imp.farol]}</span>
          </span>
        )}
      </td>
      <td>
        <MarcosMini marcos={normalizeMarcos(imp.marcos)} />
        <div className={`situacao ${imp.situacao ? "" : "muted"}`}>{imp.situacao || "—"}</div>
        {(imp.updatedAt || imp.updatedBy) && (
          <div
            className={`upd ${isParada(imp, diasParada) ? "parada" : ""}`}
            title={`Atualizado em ${formatDateTime(imp.updatedAt)}${imp.updatedBy ? " por " + imp.updatedBy : ""}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            <span className="upd-when">{formatDateTime(imp.updatedAt)}</span>
            {imp.updatedBy && <span className="upd-by">· por {imp.updatedBy}</span>}
            {isParada(imp, diasParada) && (
              <span className="upd-parada">· parada há {diasSemAtualizar(imp.updatedAt)}d</span>
            )}
          </div>
        )}
      </td>
      <td>
        {imp.apoio === "sim" ? (
          <span className="apoio-sim">Sim</span>
        ) : (
          <span className="apoio-nao">Não</span>
        )}
      </td>
      <td>{area ? <span className="chip">{area.nome}</span> : <span className="muted">—</span>}</td>
      <td>
        {!imp.ticket ? (
          <span className="muted">—</span>
        ) : isTicketUrl(imp.ticket) ? (
          <a
            className="ticket ticket-link"
            href={imp.ticket}
            target="_blank"
            rel="noopener noreferrer"
            title={imp.ticket}
          >
            {ticketLabel(imp.ticket)}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M14 3h7v7M21 3l-9 9M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" />
            </svg>
          </a>
        ) : (
          <span className="ticket">{imp.ticket}</span>
        )}
      </td>
      <td>
        <div className="rowactions">
          <button className="iconbtn" title="Ver extrato" onClick={onExtrato}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6M8 13h8M8 17h5" />
            </svg>
          </button>
          {canEdit && (
            <button className="iconbtn" title="Editar" onClick={onEdit}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          )}
          {canDelete && (
            <button className="iconbtn" title="Excluir" onClick={onDelete}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
              </svg>
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function EmptyFirst({
  isAdmin,
  canCreate,
  onAdd,
  onSeed,
}: {
  isAdmin: boolean;
  canCreate: boolean;
  onAdd: () => void;
  onSeed: () => void;
}) {
  return (
    <div className="state">
      <h3>{canCreate ? "Comece seu primeiro acompanhamento" : "Ainda não há implantações na sua carteira"}</h3>
      <p>
        {canCreate
          ? "Cadastre uma implantação para começar a reportar o andamento pelo farol."
          : "Quando houver implantações nas suas carteiras, elas aparecem aqui."}
        {isAdmin && " Você também pode carregar dados de exemplo para ver a ferramenta em uso."}
      </p>
      {canCreate && (
        <div className="row">
          <button className="btn primary" onClick={onAdd}>
            Nova implantação
          </button>
          {isAdmin && (
            <button className="btn ghost" onClick={onSeed}>
              Carregar dados de exemplo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Modais ---------- */
function Modal({
  title,
  subtitle,
  icon,
  children,
  footer,
  onClose,
  width,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer: React.ReactNode;
  onClose: () => void;
  width?: number;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { maxWidth: width } : undefined}>
        <header>
          {icon && <span className="modal-icon">{icon}</span>}
          <div className="modal-htext">
            <h2>{title}</h2>
            {subtitle && <p className="modal-sub">{subtitle}</p>}
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Fechar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div className="body">{children}</div>
        <footer>{footer}</footer>
      </div>
    </div>
  );
}

function LoginModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      onSuccess();
    } catch (e: any) {
      setErr(e.message || "Não foi possível entrar.");
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Entrar"
      width={420}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={submit} disabled={busy}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </>
      }
    >
      <p className="hint">
        Use o login e a senha fornecidos pelo administrador. Você verá apenas as carteiras às quais
        tem acesso.
      </p>
      <div className="field">
        <label>Usuário</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="seu login"
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>
      <div className="field">
        <label>Senha</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>
      {err && <p className="err">{err}</p>}
    </Modal>
  );
}

function EditModal({
  target,
  areas,
  carteiras,
  allowedCarteiras,
  onClose,
  onSaved,
}: {
  target: Implantacao | "new";
  areas: Area[];
  carteiras: Carteira[];
  /** null = pode usar qualquer carteira (admin); array = restrito a essas. */
  allowedCarteiras: string[] | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const isNew = target === "new";
  const base = isNew ? null : (target as Implantacao);
  // Opções de carteira: todas (admin) ou só as permitidas (usuário).
  const carteiraOptions = (
    allowedCarteiras === null ? carteiras.map((c) => c.nome) : allowedCarteiras
  ).slice();
  // Mantém a carteira atual da implantação como opção mesmo que não esteja mais na lista.
  if (base?.carteira && !carteiraOptions.includes(base.carteira)) {
    carteiraOptions.unshift(base.carteira);
  }
  const [cliente, setCliente] = useState(base?.cliente || "");
  const [carteira, setCarteira] = useState(
    base?.carteira || (allowedCarteiras && allowedCarteiras.length === 1 ? allowedCarteiras[0] : "")
  );
  const [responsavel, setResponsavel] = useState(base?.responsavel || "");
  const [ticket, setTicket] = useState(base?.ticket || "");
  const [situacao, setSituacao] = useState(base?.situacao || "");
  const [apoio, setApoio] = useState<"sim" | "nao">(base?.apoio || "nao");
  const [areaId, setAreaId] = useState(base?.areaId || "");
  const [farol, setFarol] = useState<Farol>(base?.farol || "amarelo");
  const [marcos, setMarcos] = useState<Marcos>(() => normalizeMarcos(base?.marcos));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function setMarco(key: MarcoKey, patch: Partial<Marcos[MarcoKey]>) {
    setMarcos((m) => ({ ...m, [key]: { ...m[key], ...patch } }));
  }

  function toggleTipo(key: MarcoKey, t: ImportTipo) {
    setMarcos((m) => {
      const cur = m[key].tipos || [];
      const tipos = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t];
      return { ...m, [key]: { ...m[key], tipos } };
    });
  }

  async function save() {
    if (!cliente.trim()) {
      setErr("Informe o cliente.");
      return;
    }
    if (!carteira) {
      setErr("Selecione a carteira.");
      return;
    }
    setBusy(true);
    setErr(null);
    const payload = { cliente, carteira, responsavel, ticket, situacao, apoio, areaId, farol, marcos };
    try {
      if (isNew) {
        await api("/api/implantacoes", { method: "POST", body: JSON.stringify(payload) });
        onSaved("Implantação adicionada");
      } else {
        await api(`/api/implantacoes/${(target as Implantacao).id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        onSaved("Alterações salvas");
      }
    } catch (e: any) {
      setErr(e.message || "Não foi possível salvar.");
      setBusy(false);
    }
  }

  return (
    <Modal
      title={isNew ? "Nova implantação" : "Editar implantação"}
      subtitle={isNew ? "Cadastre um acompanhamento" : base?.cliente}
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      }
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? "Salvando…" : isNew ? "Adicionar" : "Salvar"}
          </button>
        </>
      }
    >
      <p className="req-legend"><span className="req">*</span> Campos obrigatórios</p>
      <div className="grid2">
        <div className="field">
          <label>Cliente <span className="req">*</span></label>
          <input value={cliente} onChange={(e) => setCliente(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Carteira <span className="req">*</span></label>
          <select value={carteira} onChange={(e) => setCarteira(e.target.value)}>
            <option value="">Selecione…</option>
            {carteiraOptions.map((nome) => (
              <option key={nome} value={nome}>
                {nome}
              </option>
            ))}
          </select>
          {carteiraOptions.length === 0 && (
            <span className="hint">Nenhuma carteira disponível. Peça a um admin para criar/atribuir.</span>
          )}
        </div>
      </div>
      <div className="grid2">
        <div className="field">
          <label>Responsável</label>
          <input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
        </div>
        <div className="field">
          <label>Ticket</label>
          <input
            value={ticket}
            onChange={(e) => setTicket(e.target.value)}
            placeholder="ex.: IMP-1042 ou https://…"
          />
          <span className="hint">
            {isTicketUrl(ticket)
              ? "Vira um link clicável na tabela."
              : "Cole um link (https://…) para virar um botão clicável."}
          </span>
        </div>
      </div>
      <div className="field">
        <label>Farol</label>
        <div className="farolpick">
          {FAROIS.map((f) => (
            <button key={f} aria-pressed={farol === f} onClick={() => setFarol(f)}>
              <span className={`fdot ${f}`} />
              {FAROL_LABEL[f]}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Situação / Ponto de atenção</label>
        <textarea
          value={situacao}
          onChange={(e) => setSituacao(e.target.value)}
          placeholder="O que está acontecendo, próximos passos, bloqueios…"
        />
      </div>
      <div className="field">
        <label>Etapas da implantação</label>
        <div className="marcos-edit">
          {MARCOS.map(({ key, label }) => {
            const m = marcos[key];
            return (
              <div className="marco-edit-row" key={key}>
                <label className="marco-toggle">
                  <input
                    type="checkbox"
                    checked={m.feito}
                    onChange={(e) => setMarco(key, { feito: e.target.checked })}
                  />
                  <span>{label}</span>
                </label>
                {key === "importacao" && m.feito && (
                  <div className="marco-tipos">
                    <span className="marco-tipos-label">Tipo:</span>
                    {IMPORT_TIPOS.map((t) => (
                      <label key={t} className="tipo-check">
                        <input
                          type="checkbox"
                          checked={(m.tipos || []).includes(t)}
                          onChange={() => toggleTipo(key, t)}
                        />
                        <span>{IMPORT_TIPO_LABEL[t]}</span>
                      </label>
                    ))}
                  </div>
                )}
                <PrevisaoInput
                  value={m.previsao}
                  onChange={(v) => setMarco(key, { previsao: v })}
                  placeholder={m.feito ? "Realizado dd/mm/aaaa" : "Previsão dd/mm/aaaa"}
                />
              </div>
            );
          })}
        </div>
        <span className="hint">
          As etapas são independentes. A data é a previsão (pendente) ou a data de realização (concluída).
        </span>
      </div>
      <div className="grid2">
        <div className="field">
          <label>Apoio de outra área?</label>
          <select value={apoio} onChange={(e) => setApoio(e.target.value as "sim" | "nao")}>
            <option value="nao">Não</option>
            <option value="sim">Sim</option>
          </select>
        </div>
        <div className="field">
          <label>Área</label>
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            <option value="">—</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </div>
      </div>
      {err && <p className="err">{err}</p>}
    </Modal>
  );
}

function ConfigModal({
  config,
  onClose,
  onSaved,
}: {
  config: Config;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [dias, setDias] = useState(String(config.diasParada));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const n = Number(dias);
    if (!Number.isFinite(n) || n < 1 || n > 365) {
      setErr("Informe um número de dias entre 1 e 365.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api("/api/config", { method: "POST", body: JSON.stringify({ diasParada: Math.round(n) }) });
      onSaved("Configurações salvas");
    } catch (e: any) {
      setErr(e.message || "Não foi possível salvar.");
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Configurações"
      subtitle="Ajustes gerais do acompanhamento"
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
      }
      width={440}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </>
      }
    >
      <div className="field">
        <label>Considerar “parada” após (dias sem atualização)</label>
        <input
          type="number"
          min={1}
          max={365}
          value={dias}
          onChange={(e) => setDias(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <span className="hint">
          Implantações sem atualização por esse período aparecem como “paradas” nos alertas e no painel.
        </span>
      </div>
      {err && <p className="err">{err}</p>}
    </Modal>
  );
}

function ExtItem({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="ext-item">
      <span className="ext-item-label">{label}</span>
      <span className="ext-item-value">{value || <span className="muted">—</span>}</span>
    </div>
  );
}

function ExtratoModal({
  imp,
  area,
  onClose,
}: {
  imp: Implantacao;
  area?: Area;
  onClose: () => void;
}) {
  const marcos = normalizeMarcos(imp.marcos);
  const timeline = [
    ...(Array.isArray(imp.historico) ? imp.historico : []).map((h) => ({
      at: h.at,
      by: h.by,
      kind: "farol" as const,
      farol: h.farol,
    })),
    ...(Array.isArray(imp.situacaoHistorico) ? imp.situacaoHistorico : []).map((s) => ({
      at: s.at,
      by: s.by,
      kind: "situacao" as const,
      texto: s.texto,
    })),
  ].sort((a, b) => b.at - a.at);

  return (
    <Modal
      title="Extrato da implantação"
      subtitle={imp.cliente}
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M8 13h8M8 17h5" />
        </svg>
      }
      width={640}
      onClose={onClose}
      footer={
        <button className="btn ghost" onClick={onClose}>
          Fechar
        </button>
      }
    >
      <div className="ext-top">
        <span className="farol">
          <span className={`fdot ${imp.farol}`} />
          <span className="flabel">{FAROL_LABEL[imp.farol]}</span>
        </span>
        {imp.carteira && <span className="chip">{imp.carteira}</span>}
      </div>

      <div className="ext-grid">
        <ExtItem label="Cliente" value={imp.cliente} />
        <ExtItem label="Carteira" value={imp.carteira} />
        <ExtItem label="Responsável" value={imp.responsavel} />
        <ExtItem label="Área" value={area?.nome} />
        <ExtItem label="Apoio de outra área" value={imp.apoio === "sim" ? "Sim" : "Não"} />
        <ExtItem
          label="Ticket"
          value={
            imp.ticket ? (
              isTicketUrl(imp.ticket) ? (
                <a className="ticket ticket-link" href={imp.ticket} target="_blank" rel="noopener noreferrer">
                  {ticketLabel(imp.ticket)}
                </a>
              ) : (
                imp.ticket
              )
            ) : undefined
          }
        />
      </div>

      <h4 className="ext-h">Etapas</h4>
      <div className="ext-marcos">
        {MARCOS.map(({ key, label }) => {
          const m = marcos[key];
          const st = marcoStatus(m);
          return (
            <div className="ext-marco" key={key}>
              <span className={`mm ${st}`}>
                <span className="mm-dot" />
              </span>
              <span className="ext-marco-label">{label}</span>
              <span className="ext-marco-status">
                {st === "feito" ? "Concluído" : st === "previsto" ? "Previsto" : "Pendente"}
                {m.previsao ? ` · ${m.previsao}` : ""}
                {key === "importacao" && m.feito && m.tipos && m.tipos.length > 0
                  ? ` · ${tiposLabel(m.tipos)}`
                  : ""}
              </span>
            </div>
          );
        })}
      </div>

      <h4 className="ext-h">Situação / Ponto de atenção (atual)</h4>
      <p className="ext-situacao">{imp.situacao || <span className="muted">—</span>}</p>

      <h4 className="ext-h">Histórico</h4>
      {timeline.length === 0 ? (
        <p className="muted">Sem histórico registrado ainda.</p>
      ) : (
        <ul className="ext-timeline">
          {timeline.map((t, i) => (
            <li className="ext-tl-item" key={i}>
              <span className={`ext-tl-dot ${t.kind === "farol" ? t.farol : "sit"}`} />
              <div className="ext-tl-body">
                <div className="ext-tl-when">
                  {formatDateTime(t.at)}
                  {t.by ? ` · ${t.by}` : ""}
                </div>
                {t.kind === "farol" ? (
                  <div className="ext-tl-text">
                    Farol alterado para <strong>{FAROL_LABEL[t.farol]}</strong>
                  </div>
                ) : (
                  <div className="ext-tl-text">{t.texto}</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="ext-meta">
        Criado em {formatDateTime(imp.createdAt)} · Última atualização {formatDateTime(imp.updatedAt)}
        {imp.updatedBy ? ` por ${imp.updatedBy}` : ""}
      </div>
    </Modal>
  );
}

function DeleteModal({
  imp,
  onClose,
  onDone,
}: {
  imp: Implantacao;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function del() {
    setBusy(true);
    try {
      await api(`/api/implantacoes/${imp.id}`, { method: "DELETE" });
      onDone();
    } catch {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Excluir implantação"
      width={420}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn primary"
            style={{ background: "var(--vermelho)", borderColor: "var(--vermelho)" }}
            onClick={del}
            disabled={busy}
          >
            {busy ? "Excluindo…" : "Excluir"}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, color: "var(--ink-2)" }}>
        Remover <strong>{imp.cliente || "esta implantação"}</strong> do quadro? Esta ação não pode
        ser desfeita.
      </p>
    </Modal>
  );
}

function AreasModal({
  areas,
  onClose,
  onChange,
}: {
  areas: Area[];
  onClose: () => void;
  onChange: () => void;
}) {
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!nome.trim()) return;
    setBusy(true);
    try {
      await api("/api/areas", { method: "POST", body: JSON.stringify({ nome }) });
      setNome("");
      onChange();
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    await api(`/api/areas/${id}`, { method: "DELETE" }).catch(() => {});
    onChange();
  }

  return (
    <Modal
      title="Áreas"
      subtitle="Áreas de apoio usadas nas implantações"
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      }
      width={460}
      onClose={onClose}
      footer={
        <button className="btn ghost" onClick={onClose}>
          Concluir
        </button>
      }
    >
      <div className="manage-add">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Nova área (ex.: Produto)"
        />
        <button className="btn primary" onClick={add} disabled={busy || !nome.trim()}>
          Adicionar
        </button>
      </div>
      <div className="manage-count">
        {areas.length} {areas.length === 1 ? "área" : "áreas"}
      </div>
      {areas.length === 0 ? (
        <div className="manage-empty">Nenhuma área ainda — adicione a primeira acima.</div>
      ) : (
        <div className="manage-list">
          {areas.map((a) => (
            <div className="manage-row" key={a.id}>
              <span className="manage-row-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 6h16M4 12h16M4 18h10" />
                </svg>
              </span>
              <span className="manage-row-name">{a.nome}</span>
              <button
                className="manage-del"
                title="Remover área"
                onClick={() => window.confirm(`Remover a área "${a.nome}"?`) && remove(a.id)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function CarteirasModal({
  carteiras,
  onClose,
  onChange,
  showToast,
}: {
  carteiras: Carteira[];
  onClose: () => void;
  onChange: () => void;
  showToast: (m: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!nome.trim()) return;
    setBusy(true);
    try {
      await api("/api/carteiras", { method: "POST", body: JSON.stringify({ nome }) });
      setNome("");
      onChange();
    } catch (e: any) {
      showToast(e.message || "Não foi possível adicionar.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    await api(`/api/carteiras/${id}`, { method: "DELETE" }).catch(() => {});
    onChange();
  }

  return (
    <Modal
      title="Carteiras"
      subtitle="Classificam as implantações e definem o acesso dos usuários"
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />
        </svg>
      }
      width={460}
      onClose={onClose}
      footer={
        <button className="btn ghost" onClick={onClose}>
          Concluir
        </button>
      }
    >
      <div className="manage-add">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Nova carteira (ex.: Sul 1)"
        />
        <button className="btn primary" onClick={add} disabled={busy || !nome.trim()}>
          Adicionar
        </button>
      </div>
      <div className="manage-count">
        {carteiras.length} {carteiras.length === 1 ? "carteira" : "carteiras"}
      </div>
      {carteiras.length === 0 ? (
        <div className="manage-empty">Nenhuma carteira ainda — adicione a primeira acima.</div>
      ) : (
        <div className="manage-list">
          {carteiras.map((c) => (
            <div className="manage-row" key={c.id}>
              <span className="manage-row-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 7h18v13H3zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </span>
              <span className="manage-row-name">{c.nome}</span>
              <button
                className="manage-del"
                title="Remover carteira"
                onClick={() => window.confirm(`Remover a carteira "${c.nome}"?`) && remove(c.id)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function UsersModal({
  users,
  carteiras,
  onClose,
  onChange,
  showToast,
}: {
  users: UserPublic[];
  carteiras: Carteira[];
  onClose: () => void;
  onChange: () => void;
  showToast: (m: string) => void;
}) {
  const [formTarget, setFormTarget] = useState<UserPublic | "new" | null>(null);
  const [q, setQ] = useState("");

  const filtered = users.filter((u) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      u.name.toLowerCase().includes(s) ||
      u.username.toLowerCase().includes(s) ||
      u.carteiras.some((c) => c.toLowerCase().includes(s))
    );
  });

  async function remove(u: UserPublic) {
    if (!window.confirm(`Remover o usuário "${u.name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api(`/api/users/${u.id}`, { method: "DELETE" });
      showToast("Usuário removido");
      onChange();
    } catch (e: any) {
      showToast(e.message || "Não foi possível remover.");
    }
  }

  return (
    <>
      <Modal
        title="Usuários e acessos"
        subtitle="Contas, papéis e carteiras de cada pessoa"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        }
        width={580}
        onClose={onClose}
        footer={
          <>
            <button className="btn ghost" onClick={onClose}>
              Concluir
            </button>
            <button className="btn primary" onClick={() => setFormTarget("new")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Novo usuário
            </button>
          </>
        }
      >
        {users.length > 4 && (
          <div className="search modal-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="search"
              placeholder="Buscar por nome, login ou carteira…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        )}
        <div className="manage-count">
          {users.length} {users.length === 1 ? "usuário" : "usuários"}
        </div>
        <div className="userlist">
          {users.length === 0 ? (
            <div className="manage-empty">Nenhum usuário ainda — crie o primeiro em “Novo usuário”.</div>
          ) : filtered.length === 0 ? (
            <div className="manage-empty">Nenhum usuário encontrado.</div>
          ) : (
            filtered.map((u) => (
              <div className="userrow" key={u.id}>
                <span className={`uavatar role ${u.role}`}>
                  {(u.name || u.username).trim().charAt(0).toUpperCase()}
                </span>
                <div className="uinfo">
                  <div className="uname">
                    {u.name} <span className="umuted">@{u.username}</span>
                  </div>
                  <div className="utags">
                    <span className={`role ${u.role}`}>{ROLE_LABEL[u.role]}</span>
                    {u.role !== "admin" &&
                      (u.carteiras.length ? (
                        u.carteiras.map((c) => (
                          <span className="chip" key={c}>
                            {c}
                          </span>
                        ))
                      ) : (
                        <span className="muted">sem carteira</span>
                      ))}
                  </div>
                </div>
                <div className="uactions">
                  <button className="iconbtn2" title="Editar" onClick={() => setFormTarget(u)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                  <button className="iconbtn2 danger" title="Remover" onClick={() => remove(u)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>

      {formTarget && (
        <UserFormModal
          target={formTarget}
          carteiras={carteiras}
          onClose={() => setFormTarget(null)}
          onSaved={(msg) => {
            setFormTarget(null);
            showToast(msg);
            onChange();
          }}
        />
      )}
    </>
  );
}

function UserFormModal({
  target,
  carteiras,
  onClose,
  onSaved,
}: {
  target: UserPublic | "new";
  carteiras: Carteira[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const isNew = target === "new";
  const base = isNew ? null : (target as UserPublic);
  const [username, setUsername] = useState(base?.username || "");
  const [name, setName] = useState(base?.name || "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(base?.role || "user");
  const [sel, setSel] = useState<string[]>(base?.carteiras || []);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(nome: string) {
    setSel((s) => (s.includes(nome) ? s.filter((x) => x !== nome) : [...s, nome]));
  }

  async function save() {
    if (!username.trim()) {
      setErr("Informe o login.");
      return;
    }
    if (isNew && password.length < 4) {
      setErr("Defina uma senha com ao menos 4 caracteres.");
      return;
    }
    setBusy(true);
    setErr(null);
    const payload: Record<string, unknown> = {
      username,
      name,
      role,
      carteiras: role === "admin" ? [] : sel,
    };
    if (password) payload.password = password;
    try {
      if (isNew) {
        await api("/api/users", { method: "POST", body: JSON.stringify(payload) });
        onSaved("Usuário criado");
      } else {
        await api(`/api/users/${base!.id}`, { method: "PUT", body: JSON.stringify(payload) });
        onSaved("Usuário atualizado");
      }
    } catch (e: any) {
      setErr(e.message || "Não foi possível salvar.");
      setBusy(false);
    }
  }

  return (
    <Modal
      title={isNew ? "Novo usuário" : "Editar usuário"}
      subtitle={isNew ? "Defina papel e carteiras" : `@${base?.username}`}
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
        </svg>
      }
      width={480}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? "Salvando…" : isNew ? "Criar" : "Salvar"}
          </button>
        </>
      }
    >
      <div className="grid2">
        <div className="field">
          <label>Login</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus placeholder="ex.: marina" />
        </div>
        <div className="field">
          <label>Nome</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome exibido" />
        </div>
      </div>
      <div className="grid2">
        <div className="field">
          <label>Papel</label>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="user">Usuário (vê e edita)</option>
            <option value="viewer">Visualizador (só vê)</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="field">
          <label>Senha</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isNew ? "defina a senha" : "deixe em branco p/ manter"}
          />
        </div>
      </div>
      {role === "admin" ? (
        <p className="hint">Administradores enxergam e editam todas as carteiras.</p>
      ) : (
        <div className="field">
          <label>
            Carteiras {role === "viewer" ? "visíveis (somente leitura)" : "com acesso"}
          </label>
          {carteiras.length === 0 ? (
            <span className="hint">Crie carteiras primeiro (botão “Carteiras”).</span>
          ) : (
            <>
              <div className="checkgroup-head">
                <span>{sel.length} de {carteiras.length} selecionada(s)</span>
                <div className="checkgroup-actions">
                  <button
                    type="button"
                    className="linkbtn"
                    onClick={() => setSel(carteiras.map((c) => c.nome))}
                    disabled={sel.length === carteiras.length}
                  >
                    Selecionar todas
                  </button>
                  <button
                    type="button"
                    className="linkbtn"
                    onClick={() => setSel([])}
                    disabled={sel.length === 0}
                  >
                    Limpar
                  </button>
                </div>
              </div>
              <div className="checkgroup">
                {carteiras.map((c) => (
                  <label key={c.id} className="checkitem">
                    <input type="checkbox" checked={sel.includes(c.nome)} onChange={() => toggle(c.nome)} />
                    <span>{c.nome}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {err && <p className="err">{err}</p>}
    </Modal>
  );
}
