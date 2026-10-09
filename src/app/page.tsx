"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  Carteira,
  Implantacao,
  Farol,
  FAROIS,
  FAROL_LABEL,
  Role,
  Session,
  StateResponse,
  UserPublic,
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

type Filter = { farol: Farol | ""; areaId: string; resp: string; carteira: string; q: string };
const EMPTY_FILTER: Filter = { farol: "", areaId: "", resp: "", carteira: "", q: "" };

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
  const [imps, setImps] = useState<Implantacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER);
  const [toast, setToast] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const [loginOpen, setLoginOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Implantacao | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Implantacao | null>(null);
  const [areasOpen, setAreasOpen] = useState(false);
  const [carteirasOpen, setCarteirasOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const isLogged = !!session;
  const isAdmin = session?.role === "admin";
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

  const counts = useMemo(() => {
    const c = { verde: 0, amarelo: 0, vermelho: 0 };
    imps.forEach((i) => {
      if (i.farol in c) c[i.farol]++;
    });
    return c;
  }, [imps]);

  const rows = useMemo(() => {
    const order: Record<string, number> = { vermelho: 0, amarelo: 1, verde: 2 };
    let r = [...imps];
    if (filter.farol) r = r.filter((x) => x.farol === filter.farol);
    if (filter.areaId) r = r.filter((x) => x.areaId === filter.areaId);
    if (filter.resp) r = r.filter((x) => x.responsavel === filter.resp);
    if (filter.carteira) r = r.filter((x) => x.carteira === filter.carteira);
    if (filter.q) {
      const q = filter.q.toLowerCase();
      r = r.filter((x) =>
        [x.cliente, x.responsavel, x.ticket, x.carteira].some((v) =>
          String(v || "").toLowerCase().includes(q)
        )
      );
    }
    r.sort(
      (a, b) =>
        (order[a.farol] ?? 3) - (order[b.farol] ?? 3) ||
        (b.updatedAt || 0) - (a.updatedAt || 0)
    );
    return r;
  }, [imps, filter]);

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
        {/* Summary */}
        <div className="summary">
          <StatCard
            label="Total"
            value={imps.length}
            active={false}
            onClick={() => setFilter((f) => ({ ...f, farol: "" }))}
          />
          {(["verde", "amarelo", "vermelho"] as Farol[]).map((f) => (
            <StatCard
              key={f}
              label={FAROL_LABEL[f]}
              dot={f}
              value={counts[f]}
              active={filter.farol === f}
              onClick={() => setFilter((cur) => ({ ...cur, farol: cur.farol === f ? "" : f }))}
            />
          ))}
        </div>

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
                      canEdit={canEditImp(r)}
                      canDelete={isAdmin}
                      onFarol={(f) => setFarol(r, f)}
                      onEdit={() => setEditTarget(r)}
                      onDelete={() => setDeleteTarget(r)}
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

      {reportOpen && (
        <ReportView
          rows={rows}
          areaById={areaById}
          filterActive={filter !== EMPTY_FILTER && JSON.stringify(filter) !== JSON.stringify(EMPTY_FILTER)}
          generatedBy={session?.name || ""}
          onClose={() => setReportOpen(false)}
        />
      )}
    </>
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
                <th>Área</th>
                <th>Ticket</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.cliente || "—"}</td>
                  <td>{r.carteira || "—"}</td>
                  <td>{r.responsavel || "—"}</td>
                  <td className="nowrap">
                    <span className={`rs-dot ${r.farol}`} /> {FAROL_LABEL[r.farol]}
                  </td>
                  <td>{r.situacao || "—"}</td>
                  <td>{areaById[r.areaId]?.nome || "—"}</td>
                  <td>{r.ticket ? (isTicketUrl(r.ticket) ? ticketLabel(r.ticket) : r.ticket) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="report-footer">Farol de Implantações · atua · rotina de consultoria</div>
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
function StatCard({
  label,
  value,
  dot,
  active,
  onClick,
}: {
  label: string;
  value: number;
  dot?: Farol;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className="stat" aria-pressed={active} onClick={onClick}>
      <span className="top">
        {dot && <span className={`dot ${dot}`} />}
        {label}
      </span>
      <span className="num">{value}</span>
    </button>
  );
}

function Row({
  imp,
  area,
  canEdit,
  canDelete,
  onFarol,
  onEdit,
  onDelete,
}: {
  imp: Implantacao;
  area?: Area;
  canEdit: boolean;
  canDelete: boolean;
  onFarol: (f: Farol) => void;
  onEdit: () => void;
  onDelete: () => void;
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
        <div className={`situacao ${imp.situacao ? "" : "muted"}`}>{imp.situacao || "—"}</div>
        {imp.updatedBy && (
          <div className="meta">atualizado por {imp.updatedBy}</div>
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
        {(canEdit || canDelete) && (
          <div className="rowactions">
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
        )}
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
  children,
  footer,
  onClose,
  width,
}: {
  title: string;
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
          <h2>{title}</h2>
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
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    const payload = { cliente, carteira, responsavel, ticket, situacao, apoio, areaId, farol };
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
      <div className="grid2">
        <div className="field">
          <label>Cliente</label>
          <input value={cliente} onChange={(e) => setCliente(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Carteira</label>
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
      width={440}
      onClose={onClose}
      footer={
        <button className="btn ghost" onClick={onClose}>
          Concluir
        </button>
      }
    >
      <p className="hint">Áreas de apoio dentro da NSTECH. Crie conforme a necessidade.</p>
      <div className="arealist">
        {areas.length === 0 && <div className="muted">Nenhuma área ainda.</div>}
        {areas.map((a) => (
          <div className="arearow" key={a.id}>
            <span>{a.nome}</span>
            <button className="btn danger" onClick={() => remove(a.id)}>
              Remover
            </button>
          </div>
        ))}
      </div>
      <div className="addarea">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Nova área (ex.: Produto)"
        />
        <button className="btn primary" onClick={add} disabled={busy}>
          Adicionar
        </button>
      </div>
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
      width={440}
      onClose={onClose}
      footer={
        <button className="btn ghost" onClick={onClose}>
          Concluir
        </button>
      }
    >
      <p className="hint">
        Carteiras padronizadas. Use-as para classificar implantações e definir o acesso de cada
        usuário.
      </p>
      <div className="arealist">
        {carteiras.length === 0 && <div className="muted">Nenhuma carteira ainda.</div>}
        {carteiras.map((c) => (
          <div className="arearow" key={c.id}>
            <span>{c.nome}</span>
            <button className="btn danger" onClick={() => remove(c.id)}>
              Remover
            </button>
          </div>
        ))}
      </div>
      <div className="addarea">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Nova carteira (ex.: Sul 1)"
        />
        <button className="btn primary" onClick={add} disabled={busy}>
          Adicionar
        </button>
      </div>
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
        width={580}
        onClose={onClose}
        footer={
          <>
            <button className="btn ghost" onClick={onClose}>
              Concluir
            </button>
            <button className="btn primary" onClick={() => setFormTarget("new")}>
              Novo usuário
            </button>
          </>
        }
      >
        <p className="hint">
          Crie contas e defina quais carteiras cada pessoa enxerga e edita. Administradores veem e
          editam tudo.
        </p>
        <div className="userlist">
          {users.length === 0 && <div className="muted">Nenhum usuário cadastrado.</div>}
          {users.map((u) => (
            <div className="userrow" key={u.id}>
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
                <button className="btn ghost" onClick={() => setFormTarget(u)}>
                  Editar
                </button>
                <button className="btn danger" onClick={() => remove(u)}>
                  Remover
                </button>
              </div>
            </div>
          ))}
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
