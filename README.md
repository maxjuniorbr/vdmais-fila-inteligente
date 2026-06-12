# VDMais Fila Inteligente

Sistema de fila digital presencial para Espaços de Relacionamento (ERs) de varejo de beleza. Representantes de estética entram na fila por QR Code, link alternativo ou check-in assistido; operadoras conduzem os atendimentos e gestoras acompanham a operação em tempo real.

**Funcionalidades principais:**

- Entrada na fila por QR Code, link alternativo ou check-in assistido
- QR Code e link público protegidos por token assinado, vinculado ao ER e ao canal, sem CAPTCHA
- Pausa voluntária da senha pela RE (volta ao fim da fila ao retomar; tempo pausado excluído das métricas)
- Saída real da fila via cancelamento próprio
- Operação por caixa logado com chamada atômica do próximo (sem conflito entre operadoras)
- Segunda chamada (rechamada) da senha em chamada, antes de marcar não comparecimento
- Abertura do dia com saneamento automático: sobras de um dia não encerrado são fechadas e os caixas liberados, evitando travar a operação do novo dia
- Restauração de senha não comparecida ou cancelada antes do atendimento, preservando a regra de uma senha ativa por RE
- Tempo limite de chamada: senhas paradas em chamada além da tolerância são marcadas como não comparecimento automaticamente, liberando o caixa
- Encerramento do dia auto-finaliza atendimentos em aberto; gestora pode liberar caixas órfãos deixados por operadoras que saíram sem fechar
- Painel TV/display com quadro "Chamando agora" multicaixa (cartão piscante na chamada mais recente), próximas senhas com rodízio automático, atendimentos em andamento e tempos médios. O acesso é protegido por um token de exibição por ER (URL com `?token=...`), sem exigir perfil de usuário
- Sessão da equipe baseada em JWT: a identidade/perfil/ER são derivados das claims assinadas do token; o cliente não usa chaves mutáveis separadas para autorização
- Gestão com métricas de espera, atendimento, canais de entrada, caixas e não comparecimentos
- Administração de ERs, caixas e contas de equipe, com ações para copiar e testar os acessos e para gerar/revogar o token do painel da TV
- Trilha de auditoria completa de todos os eventos do ciclo de vida da senha

> 📖 Para entender o passo a passo de cada perfil de usuário (RE, operadora, atendente, gestora, admin), veja o **[Guia de uso por persona](./docs/guia-personas.md)**.

## Documentação complementar

- [Guia de uso por persona](./docs/guia-personas.md)
- [MVP — escopo e validação](./docs/mvp.md)
- [Stack técnica do MVP](./docs/stack-mvp.md)
- [Deploy do MVP](./docs/deployment-mvp.md)
- [Diretrizes de design e UX](./.github/instructions/frontend-design.instructions.md)

---

## Escopo deste README

Este README cobre apenas setup local, execução e comandos de desenvolvimento.
Decisões de produto, stack, deploy e jornada de uso ficam centralizadas nos
documentos da seção **Documentação complementar**.

---

## Pré-requisitos

- **Node.js** >= 22
- **npm** >= 10
- **Docker Compose** ou **Podman Compose**
- **nvm** (recomendado para padronizar versão do Node)

Padronização de versão local com nvm:

```bash
nvm use
```

> O repositório possui arquivo `.nvmrc` com a versão alvo. Se a versão ainda não estiver instalada na máquina:

```bash
nvm install
nvm use
```

Verificar:

```bash
node -v
npm -v
docker compose version
# ou
podman-compose --version
```

---

## Subindo localmente (passo a passo)

### 1. Clonar e instalar dependências

```bash
git clone <url-do-repositorio>
cd vdmais-fila-inteligente
npm install
```

### 2. Configurar variáveis de ambiente do backend

```bash
cp apps/backend/.env.example apps/backend/.env
```

Edite `apps/backend/.env`. Para usar o PostgreSQL do `compose.dev.yml`:

```env
DATABASE_URL="postgresql://fila:fila_dev_pass@localhost:5432/fila_inteligente?schema=public"
NODE_ENV=development
JWT_SECRET="change-me-in-production"
JWT_EXPIRES_IN="8h"
PORT=3000
FRONTEND_URL="http://localhost:5173"
OBSERVABILITY_TOKEN="replace-with-a-random-monitoring-token"
```

> **Importante:** fora de `development` e `test`, o backend rejeita a inicialização se `JWT_SECRET` for um valor fraco ou tiver menos de 32 caracteres. Em produção, use um segredo aleatório forte — por exemplo `openssl rand -base64 48`.
> O `OBSERVABILITY_TOKEN` é obrigatório para expor `/observability/metrics`; sem ele o endpoint retorna 401.

### 3. Subir o banco de dados

```bash
docker compose -f compose.dev.yml up -d postgres
# ou
podman-compose -f compose.dev.yml up -d postgres
```

Aguarde o healthcheck passar (alguns segundos). Para verificar:

```bash
docker compose -f compose.dev.yml ps
```

### 4. Rodar as migrations do Prisma

```bash
npm exec --workspace=apps/backend -- prisma migrate deploy
```

Para criar uma migration durante o desenvolvimento:

```bash
npm exec --workspace=apps/backend -- prisma migrate dev --name nome_da_migration
```

### 4.1 Criar a conta administrativa inicial

A configuração de ERs é feita em `/admin`, que exige uma conta com perfil `ADMIN`:

```bash
ADMIN_EMAIL="admin@example.com" \
ADMIN_PASSWORD="troque-esta-senha" \
npm run db:seed --workspace=apps/backend
```

> O seed é idempotente: se já existir um `ADMIN`, nada é alterado.
> As variáveis também podem ser definidas em `apps/backend/.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`).

### 5. Iniciar backend e frontend simultaneamente

Na raiz do projeto:

```bash
npm run dev
```

Isso sobe em paralelo:

- **Backend** → `http://localhost:3000`
- **Frontend** → `http://localhost:5173`

Ou separadamente:

```bash
# Terminal 1: backend
npm run dev:backend

# Terminal 2: frontend
npm run dev:frontend
```

---


## Comandos úteis

```bash
# Testes unitários
npm test

# Testes com cobertura
npm run test:cov --workspace=apps/backend

# Testes e2e (requer banco rodando)
npm run test:e2e --workspace=apps/backend

# Lint
npm run lint

# Build de produção e verificação de tipos
npm run build

# Formatação
npm run format

# Abrir Prisma Studio (visualizador do banco)
npm exec --workspace=apps/backend -- prisma studio

# Resetar banco e rodar migrations do zero
npm exec --workspace=apps/backend -- prisma migrate reset

# SonarQube local (requer Docker/Podman)
npm run sonar:up                  # sobe o servidor em localhost:9000 (admin/admin)
# acesse http://localhost:9000, gere um token em Security → Generate Token e exporte:
export SONAR_TOKEN=<seu-token>
npm run sonar                     # gera coverage + envia análise (atalho para sonar:coverage + sonar:scan)
npm run sonar:down                # para o servidor
```

---


## Integração contínua e segurança

O CI (GitHub Actions) roda a cada push e pull request para `master`:

- **CI** (`ci.yml`): lint, build, testes unitários com cobertura (backend e frontend), pisos globais de 80% para linhas/statements/functions e 75% para branches, gate de 80% sobre o código alterado, e2e do backend (Postgres de serviço), e2e de browser do frontend (Playwright) e `npm audit` (nível high).
- **CodeQL** (`codeql.yml`): análise estática de segurança (SAST) para JavaScript/TypeScript; também roda semanalmente.
- **Secret scan** (`secret-scan.yml`): gitleaks varre commits em busca de segredos. Placeholders de exemplo e segredos de teste ficam na allowlist do `.gitleaks.toml`.
- **Dependabot** (`dependabot.yml`): atualizações semanais de dependências npm e GitHub Actions. Atualizações de rotina (minor/patch) vêm agrupadas; majors vêm isolados para revisão. `prisma` e `@prisma/client` sobem em lockstep, e o major do Prisma é deliberadamente adiado (migração planejada).

Na borda, o frontend serve cabeçalhos de segurança (CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` e HSTS) tanto no nginx do contêiner quanto na entrega via Vercel. QR Codes e links da fila carregam tokens assinados no fragmento da URL; o backend valida ER, canal e expiração antes de autenticar a RE, com quotas por IP/ER/canal. Dados pessoais sensíveis (CPF e telefone) são mascarados nas respostas de cadastro assistido. Chamadas autenticadas das telas de staff passam pelo client central, que encerra a sessão e retorna ao login quando o backend responde `401`. Detalhes em [`docs/deployment-mvp.md`](docs/deployment-mvp.md) e [`docs/stack-mvp.md`](docs/stack-mvp.md).

---

## Estrutura do projeto

```
vdmais-fila-inteligente/
├── apps/
│   ├── backend/           # API NestJS
│   │   ├── src/
│   │   │   ├── auth/      # Autenticação JWT + cadastro
│   │   │   ├── admin/     # Configuração de ERs, caixas e equipe
│   │   │   ├── er/        # Espaços de Relacionamento
│   │   │   ├── ticket/    # Geração e ciclo de vida da senha
│   │   │   ├── queue/     # Lógica de fila (call-next atômico)
│   │   │   ├── counter/   # Caixas de atendimento
│   │   │   ├── panel/     # WebSocket gateway + estado do painel (token de exibição por ER)
│   │   │   ├── metrics/   # Métricas de atendimento
│   │   │   ├── telemetry/ # Eventos de uso e jornada
│   │   │   ├── observability/ # Healthchecks e métricas Prometheus
│   │   │   └── audit-log/ # Trilha de auditoria
│   │   ├── prisma/        # Schema e migrations
│   │   └── test/          # Testes e2e
│   └── frontend/          # SPA React + Vite
│       └── src/
│           ├── components/ # Design system compartilhado
│           ├── pages/      # Páginas por rota
│           ├── styles/     # Tokens e estilos globais
│           │   ├── brand.ts    # Fonte canônica dos tokens de design (TypeScript)
│           │   └── theme.css   # Espelho dos tokens como CSS custom properties (var(--gb-*))
│           └── utils/
│               └── format.ts   # Formatação central de datas/horas/durações (formatDate, formatTime, formatDuration)
├── compose.dev.yml        # Orquestração local
├── compose.prod.yml       # Orquestração de produção
├── compose.sonar.yml      # SonarQube local
├── package.json           # Workspaces (monorepo)
└── tsconfig.base.json
```

---

## Referências operacionais

- Rotas, papéis e fluxo manual de uso: [Guia de uso por persona](./docs/guia-personas.md)
- Escopo funcional e limites do produto: [MVP — escopo e validação](./docs/mvp.md)
- Stack e decisões técnicas: [Stack técnica do MVP](./docs/stack-mvp.md)
- Deploy, variáveis de produção, observabilidade e rollback: [Deploy do MVP](./docs/deployment-mvp.md)
