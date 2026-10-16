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

/** Entrada do histórico de "Situação / Ponto de atenção". */
export interface HistoricoSituacao {
  texto: string;
  at: number;
  by: string | null;
}

/** Tipo de importação realizada (só se aplica à etapa de importação). */
export type ImportTipo = "cadastros" | "xml";

export const IMPORT_TIPOS: ImportTipo[] = ["cadastros", "xml"];

export const IMPORT_TIPO_LABEL: Record<ImportTipo, string> = {
  cadastros: "Cadastros",
  xml: "XML",
};

/** Rótulo resumido para uma lista de tipos ("Ambos" quando os dois estão marcados). */
export function tiposLabel(tipos?: ImportTipo[]): string {
  if (!tipos || tipos.length === 0) return "";
  if (tipos.length >= IMPORT_TIPOS.length) return "Ambos";
  return tipos.map((t) => IMPORT_TIPO_LABEL[t]).join(", ");
}

/** Etapa (marco) da implantação: feito (sim/não) + previsão quando pendente. */
export interface Marco {
  feito: boolean;
  previsao: string;
  /** Tipos de importação (um ou mais) — usado apenas na etapa "importacao". */
  tipos?: ImportTipo[];
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
    importacao: { feito: false, previsao: "", tipos: [] },
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
    // Tipos de importação (somente na etapa de importação). Aceita o formato
    // novo (lista) e o antigo (valor único, incluindo "ambos").
    const impObj = (v as Record<string, unknown>).importacao as Record<string, unknown> | undefined;
    const valid = (x: unknown): x is ImportTipo => x === "cadastros" || x === "xml";
    let tipos: ImportTipo[] = [];
    if (Array.isArray(impObj?.tipos)) {
      tipos = (impObj!.tipos as unknown[]).filter(valid);
    } else if (typeof impObj?.tipo === "string") {
      if (impObj.tipo === "ambos") tipos = ["cadastros", "xml"];
      else if (valid(impObj.tipo)) tipos = [impObj.tipo];
    }
    out.importacao.tipos = [...new Set(tipos)];
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
  situacaoHistorico: HistoricoSituacao[];
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
