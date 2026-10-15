export type Farol = "verde" | "amarelo" | "vermelho";

export const FAROIS: Farol[] = ["verde", "amarelo", "vermelho"];

export const FAROL_LABEL: Record<Farol, string> = {
  verde: "Em dia",
  amarelo: "Atenção",
  vermelho: "Crítico",
};

export interface HistoricoEntry {
  farol: Farol;
  at: number;
  by: string | null;
}

/** Tipo de importação realizada (só se aplica à etapa de importação). */
export type ImportTipo = "" | "cadastros" | "xml";

export const IMPORT_TIPO_LABEL: Record<Exclude<ImportTipo, "">, string> = {
  cadastros: "Cadastros",
  xml: "XML",
};

/** Etapa (marco) da implantação: feito (sim/não) + previsão quando pendente. */
export interface Marco {
  feito: boolean;
  previsao: string;
  /** Tipo de importação — usado apenas na etapa "importacao". */
  tipo?: ImportTipo;
}

export type MarcoKey = "importacao" | "emissao" | "acertoViagem";

/** Definição das etapas, na ordem em que são reveladas. */
export const MARCOS: { key: MarcoKey; label: string; short: string }[] = [
  { key: "importacao", label: "Importaram dados?", short: "Importação" },
  { key: "emissao", label: "Fizeram teste de emissão?", short: "Emissão" },
  { key: "acertoViagem", label: "Fizeram teste de acerto de viagem?", short: "Acerto de viagem" },
];

export type Marcos = Record<MarcoKey, Marco>;

export function emptyMarcos(): Marcos {
  return {
    importacao: { feito: false, previsao: "", tipo: "" },
    emissao: { feito: false, previsao: "" },
    acertoViagem: { feito: false, previsao: "" },
  };
}

/** Garante o formato das etapas (preenche defaults; aceita registros antigos sem o campo). */
export function normalizeMarcos(v: unknown): Marcos {
  const out = emptyMarcos();
  if (v && typeof v === "object") {
    for (const { key } of MARCOS) {
      const m = (v as Record<string, unknown>)[key];
      if (m && typeof m === "object") {
        const mm = m as Record<string, unknown>;
        out[key] = { feito: mm.feito === true, previsao: String(mm.previsao ?? "").trim() };
      }
    }
    // Tipo de importação (somente na etapa de importação).
    const t = ((v as Record<string, unknown>).importacao as Record<string, unknown> | undefined)?.tipo;
    out.importacao.tipo = t === "cadastros" || t === "xml" ? t : "";
  }
  return out;
}

export interface Implantacao {
  id: string;
  cliente: string;
  carteira: string;
  responsavel: string;
  farol: Farol;
  situacao: string;
  apoio: "sim" | "nao";
  areaId: string;
  ticket: string;
  marcos: Marcos;
  createdAt: number;
  updatedAt: number;
  updatedBy: string | null;
  historico: HistoricoEntry[];
}

export interface Area {
  id: string;
  nome: string;
  ordem: number;
  createdAt: number;
}

/** Carteira padronizada (vocabulário controlado usado em implantações e acessos). */
export interface Carteira {
  id: string;
  nome: string;
  ordem: number;
  createdAt: number;
}

export type Role = "admin" | "user" | "viewer";

/** Usuário como armazenado no banco (inclui hash da senha — nunca enviar ao cliente). */
export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  /** Nomes das carteiras que o usuário enxerga/edita. Ignorado para admin (vê tudo). */
  carteiras: string[];
  passwordHash: string;
  createdAt: number;
}

/** Usuário seguro para enviar ao cliente (sem o hash da senha). */
export type UserPublic = Omit<User, "passwordHash">;

export type Session = {
  userId: string;
  username: string;
  name: string;
  role: Role;
  carteiras: string[];
} | null;

export interface StateResponse {
  configured: boolean;
  areas: Area[];
  carteiras: Carteira[];
  implantacoes: Implantacao[];
  session: Session;
  /** Presente apenas quando o solicitante é admin. */
  users?: UserPublic[];
}

/** Campos que o cliente pode enviar ao criar/editar (o resto é derivado no servidor). */
export const EDITABLE_FIELDS = [
  "cliente",
  "carteira",
  "responsavel",
  "farol",
  "situacao",
  "apoio",
  "areaId",
  "ticket",
  "marcos",
] as const;
