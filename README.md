# VDMais Fila Inteligente

Sistema de fila digital presencial para Espaços de Relacionamento (ERs) de varejo de beleza. Representantes de estética entram na fila por QR Code, link alternativo ou check-in assistido; operadoras conduzem os atendimentos e gestoras acompanham a operação em tempo real.

**Funcionalidades principais:**

- Entrada na fila por QR Code, link alternativo ou check-in assistido
- Pausa voluntária da senha pela RE (volta ao fim da fila ao retomar; tempo pausado excluído das métricas)
- Saída real da fila via cancelamento próprio
- Painel TV/display com fila de espera, senhas em atendimento e tempo médio (posições relativas, sem lacunas)
- Gestão com métricas de espera, atendimento, canais de entrada, caixas e não comparecimentos
- Administração de ERs, caixas e contas de equipe, com ações para copiar e testar os acessos
- Trilha de auditoria completa de todos os eventos do ciclo de vida da senha

---

## Tecnologias

| Camada    | Stack                                              |
| --------- | -------------------------------------------------- |
| Backend   | NestJS 11, Prisma 6, Socket.IO, JWT, bcrypt        |
| Frontend  | React 19, Vite 8, React Router 7, Socket.IO Client |
| Banco     | PostgreSQL 16                                      |
| Qualidade | Jest, ESLint, Prettier, SonarQube e GitHub Actions |
| Infra     | Docker/Podman Compose, imagens Node.js 22 e Nginx  |

---

## Pré-requisitos

- **Node.js** >= 22
- **npm** >= 10
- **Docker Compose** ou **Podman Compose**

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
JWT_EXPIRES_IN="7d"
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

## Rotas da aplicação

| URL                       | Descrição                                                            | Perfil        |
| ------------------------- | -------------------------------------------------------------------- | ------------- |
| `/`                       | Menu principal para os acessos internos                              | Equipe        |
| `/fila/:erId`             | Entrada presencial por QR Code                                       | RE            |
| `/fila/:erId?source=link` | Entrada pelo link alternativo, com confirmação do ER                 | RE            |
| `/fila/:erId/senha`       | Senha ativa, posição, pausa, retomada e saída da fila                | RE            |
| `/operacao`               | Chamada, início, finalização, não comparecimento e controle do caixa | Operadora     |
| `/checkin`                | Busca/cadastro da RE e entrada assistida na fila                     | Atendente     |
| `/gestao`                 | Fila, métricas, caixas e abertura/encerramento da operação           | Gestora/Admin |
| `/painel/:erId`           | Painel público de chamadas para TV/display                           | Público       |
| `/admin`                  | Configuração de ERs, acessos, caixas e contas de equipe              | Administrador |

O menu principal em `/` apresenta somente os acessos internos. A fila da RE não aparece nele porque sua entrada deve ocorrer pelo QR Code ou link específico de um ER. Quando uma sessão de equipe já existe no navegador, o menu destaca as áreas permitidas para o perfil. O administrador pode acessar tanto **Administração** quanto **Gestão da fila**; na Gestão, deve selecionar o ER que deseja acompanhar.

Os links do portal navegam na mesma aba, preservando o comportamento esperado de um menu interno. Abertura em nova aba é usada somente em ações explícitas que favorecem contexto paralelo, como testar links ou abrir o painel de TV a partir da Administração.

---

## Preparação de um ER

Depois de criar a conta administrativa:

1. Acesse `/` e escolha **Administração** ou entre diretamente em `/admin`.
2. Clique em **Gerenciar ER**.
3. Cadastre os caixas físicos que serão usados no atendimento.
4. Crie ao menos uma conta de **Gestora** e uma de **Operadora**.
5. Crie uma conta de **Atendente** caso o ER utilize check-in assistido.
6. Copie ou teste os acessos apresentados na seção **Acessos do ER**:
   - **QR Code presencial:** endereço principal para gerar o QR Code exposto dentro do ER;
   - **Link alternativo:** contém `?source=link`, exige confirmação do ER e registra corretamente esse canal;
   - **Painel de TV:** endereço público que deve ser aberto no navegador conectado à TV.
7. A gestora acessa `/gestao` e abre a operação do dia.
8. As operadoras acessam `/operacao`, selecionam e abrem seus caixas.

O nome do ER pode ser alterado na própria tela de gerenciamento. Os estados dos caixas e da operação também aparecem nessa área.

---

## Execução com containers

Para desenvolvimento, o fluxo recomendado é executar apenas o PostgreSQL pelo Compose e iniciar a aplicação com `npm run dev`, preservando o recarregamento automático.

O ambiente de produção usa `compose.prod.yml`, executa as migrations antes do backend e publica o frontend na porta `8080` por padrão:

```bash
DATABASE_URL="postgresql://usuario:senha@host:5432/fila_inteligente?schema=public" \
JWT_SECRET="um-segredo-longo-e-aleatorio" \
FRONTEND_URL="https://fila.exemplo.com" \
OBSERVABILITY_TOKEN="outro-token-longo-e-aleatorio" \
docker compose -f compose.prod.yml up --build -d
```

Use `HTTP_PORT` para alterar a porta publicada e `IMAGE_TAG` para definir a etiqueta das imagens:

```bash
HTTP_PORT=8081 IMAGE_TAG=v1.0.0 docker compose -f compose.prod.yml up -d
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
│   │   │   ├── panel/     # WebSocket gateway (painel público)
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
│           └── styles/     # Tokens e estilos globais
├── compose.dev.yml        # Orquestração local
├── compose.prod.yml       # Orquestração de produção
├── compose.sonar.yml      # SonarQube local
├── package.json           # Workspaces (monorepo)
└── tsconfig.base.json
```

---

## Variáveis de ambiente (backend)

| Variável              | Descrição                                                  | Padrão/uso                  |
| --------------------- | ---------------------------------------------------------- | --------------------------- |
| `DATABASE_URL`        | String de conexão com PostgreSQL                           | Obrigatória                 |
| `NODE_ENV`            | Ambiente de execução (`development`, `test`, `production`) | Obrigatória em produção     |
| `JWT_SECRET`          | Segredo para assinatura dos tokens JWT (mín. 32 chars fora de dev/test) | Obrigatória    |
| `JWT_EXPIRES_IN`      | Expiração do token (`15m`, `8h`, `7d`, por exemplo)        | `8h` no Compose prod        |
| `PORT`                | Porta do servidor NestJS                                   | `3000`                      |
| `FRONTEND_URL`        | Origem permitida no CORS                                   | `http://localhost:5173`     |
| `OBSERVABILITY_TOKEN` | Token Bearer de `/observability/metrics`; sem ele o endpoint retorna 401 | Obrigatória |
| `ADMIN_EMAIL`         | E-mail usado pelo seed administrativo                      | Usado somente no seed       |
| `ADMIN_PASSWORD`      | Senha inicial do administrador, com no mínimo 8 caracteres | Usado somente no seed       |
| `ADMIN_NAME`          | Nome da conta administrativa inicial                       | `Administrador`             |

### Saúde e observabilidade

- `GET /health/live`: indica que o processo está em execução.
- `GET /health/ready`: verifica a conexão com o PostgreSQL.
- `GET /observability/metrics`: métricas no formato Prometheus; envie `Authorization: Bearer <OBSERVABILITY_TOKEN>`. O endpoint retorna 401 se o token não estiver configurado no servidor.

---

## Fluxo rápido de teste manual

1. **Administrador:** acesse `/`, escolha **Administração**, crie o ER, os caixas e as contas de equipe; copie os três acessos da unidade.
2. **Gestora:** acesse `/gestao` e abra a operação do dia.
3. **Painel de TV:** abra `/painel/<erId>` em tela cheia.
4. **Operadora:** acesse `/operacao`, selecione um caixa livre e clique em **Assumir e abrir caixa**.
5. **RE pelo QR Code:** acesse `/fila/<erId>`, faça login ou cadastro e entre na fila.
6. **RE pelo link alternativo:** use `/fila/<erId>?source=link` e confirme o ER antes de continuar.
7. **Check-in assistido:** acesse `/checkin` com uma conta de atendente, localize ou cadastre a RE e gere sua senha.
8. **Atendimento:** a operadora chama a próxima senha, inicia o atendimento e o finaliza ou registra o não comparecimento.

Na tela da senha, a RE pode pausar sua participação, retomá-la no fim da fila ou sair da fila. Se fechar a página e retornar pelo mesmo acesso, o sistema recupera a senha ativa após a autenticação.
