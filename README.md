# Farol de Implantações

Portal para acompanhar o andamento das implantações pela consultoria (nstech · atua), com
reporte por **farol** (verde / amarelo / vermelho) e **controle de acessos por carteira**.

- **Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Upstash Redis (Vercel KV)
- **Auth:** contas de usuário com senha (scrypt), sessão por cookie assinado (JWT)
- **Acesso:** cada usuário vê e edita apenas as carteiras atribuídas a ele; admin vê e edita tudo

---

## Pré-requisitos

- Node.js 20+
- Um banco **Upstash Redis** (ou Vercel KV) para produção
  _(em desenvolvimento há um fallback automático em arquivo — veja abaixo)_

---

## Rodando localmente

```bash
npm install
```

Crie um arquivo **`.env.local`** na raiz (não é versionado):

```env
# Senha do primeiro admin (bootstrap). Use o login "admin" com esta senha.
ADMIN_PASSWORD=admin

# Segredo para assinar o cookie de sessão. Gere um valor aleatório:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
SESSION_SECRET=troque-por-um-valor-aleatorio-longo

# Banco: deixe VAZIO em dev para usar o fallback em arquivo (.data/farol.json).
# Preencha para apontar para um Upstash Redis real.
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Inicie o servidor:

```bash
npm run dev
```

Abra http://localhost:3000.

> **Banco em desenvolvimento:** sem `UPSTASH_REDIS_REST_URL/TOKEN`, o app persiste os dados num
> arquivo local `.data/farol.json` (ignorado pelo git). Em produção o Upstash é obrigatório —
> sem ele o app responde `503`.

### Primeiro acesso

1. Clique em **Entrar** e use o login **`admin`** com a senha definida em `ADMIN_PASSWORD`.
2. Em **Carteiras**, cadastre as carteiras (ou carregue os dados de exemplo).
3. Em **Usuários**, crie as contas e marque as carteiras de cada pessoa.

---

## Controle de acessos

| Papel | O que pode fazer |
|-------|------------------|
| **Admin** | Vê e edita **tudo**; gerencia usuários, carteiras e áreas; exclui implantações. |
| **Usuário** | Vê e edita apenas as implantações das **carteiras atribuídas** a ele. Não exclui. |
| **Não logado** | Não vê dados — é direcionado ao login. |

A autorização é validada **no servidor a cada requisição**, a partir do registro atual do
usuário: rebaixar, remover uma carteira ou excluir um usuário passa a valer imediatamente.

O login tem **rate limiting** (anti força-bruta): 8 tentativas/15 min por IP+usuário e
30/15 min por IP.

---

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|----------|:-----------:|-----------|
| `SESSION_SECRET` | **sim (prod)** | Segredo para assinar o cookie de sessão. Em produção o app recusa iniciar a sessão sem ela. |
| `ADMIN_PASSWORD` | **sim (prod)** | Senha do admin inicial (login `admin`). Em produção é obrigatória (não há senha padrão). |
| `UPSTASH_REDIS_REST_URL` | **sim (prod)** | URL REST do Upstash Redis. Aceita também `KV_REST_API_URL`. |
| `UPSTASH_REDIS_REST_TOKEN` | **sim (prod)** | Token REST do Upstash Redis. Aceita também `KV_REST_API_TOKEN`. |

---

## Deploy na Vercel

1. **Import Project** a partir deste repositório (a Vercel detecta Next.js automaticamente).
2. Em **Storage → Create → Upstash Redis**, crie o banco — isso injeta
   `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` no projeto automaticamente.
3. Em **Environment Variables**, adicione:
   - `SESSION_SECRET` — valor aleatório forte (comando acima).
   - `ADMIN_PASSWORD` — senha forte do primeiro admin.
4. **Deploy**. O deploy é servido via HTTPS (necessário para o cookie seguro).
5. No primeiro acesso, entre com `admin` + a `ADMIN_PASSWORD` definida e configure carteiras/usuários.

> Após o primeiro acesso, você pode trocar a senha do admin (e criar outros admins) pela
> tela **Usuários** — o `ADMIN_PASSWORD` só é usado para criar o admin inicial.

---

## Scripts

| Comando | Ação |
|---------|------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm start` | Servir o build de produção |
| `npm run lint` | Lint |
