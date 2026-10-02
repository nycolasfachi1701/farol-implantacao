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

export type Role = "admin" | "user";

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
] as const;
