# Arquitetura — Backend

← [Voltar ao README](../README.md) · [Arquitetura Frontend](./arquitetura-frontend.md)

---

## Visão geral

API HTTP/WebSocket construída em **NestJS** com **TypeScript**, persistência via **Prisma ORM** sobre **PostgreSQL** e comunicação em tempo real via **Socket.IO**.

```
apps/backend/
├── src/
│   ├── admin/          # Administração de ERs, caixas e equipe (ADMIN)
│   ├── auth/           # Autenticação JWT — REs e equipe; tokens de entrada na fila
│   ├── audit-log/      # Trilha de auditoria de todos os eventos de ciclo de vida
│   ├── common/         # Guards, decorators, utilitários compartilhados
│   ├── counter/        # Ciclo de vida do caixa (abrir, pausar, fechar)
│   ├── er/             # Espaço de Revendedora — abertura/fechamento do dia
│   ├── integration/    # Integração M2M (legado): início/fim de atendimento (OAuth2)
│   ├── metrics/        # Métricas diárias de atendimento por ER
│   ├── observability/  # Healthchecks e métricas Prometheus
│   ├── operator/       # Perfil do operador logado
│   ├── panel/          # WebSocket gateway + estado do painel TV por ER
│   ├── queue/          # Chamada atômica do próximo e visão geral da fila
│   ├── telemetry/      # Eventos de jornada do cliente
│   └── ticket/         # Geração e ciclo de vida da senha
├── prisma/
│   ├── schema.prisma   # Fonte canônica do modelo de dados
│   └── migrations/     # Histórico de migrations (Prisma Migrate)
└── test/               # Testes e2e (supertest + Postgres de serviço)
```

---

## Modelo de dados

```
Representative           Operador (equipe)
─────────────            ──────────────────
id                       id
kind: REGISTERED|GUEST   name
fullName                 email (unique)
cpf? (unique)            passwordHash
phone (unique)           role: OPERATOR|ATTENDANT|MANAGER|ADMIN
birthDate?               sessionVersion
reCode? (unique)         erId? (null para ADMIN)
passwordHash?            counter? (1:1)

ER                      Queue
──                      ─────
id                      id
name                    erId
isDayOpen               businessDate (date)
dayOpenedAt             nextSequence
dayClosedAt             openedAt / closedAt
qrCodeUrl?              tickets[]
panelTokenHash?         Constraint: UNIQUE(erId, businessDate)
callTimeoutSeconds
pauseTimeoutSeconds
guestEntryEnabled

Counter                 Ticket
───────                 ──────
id                      id
number                  code
state: UNAVAILABLE      state: WAITING|CALLING|IN_SERVICE
       ACTIVE                  FINISHED|NO_SHOW|CANCELLED|PAUSED
       CALLING          entryChannel: QR_CODE|LINK|CHECKIN_ASSISTED
       IN_SERVICE        queueId / erId
       PAUSED            representativeId
erId                    counterId? / operatorId?
operatorId? (unique)    calledAt? / serviceStartedAt?
                        serviceFinishedAt? / noShowAt?
                        cancelledAt? / pausedAt?
                        pausedSeconds
                        cancelReason? / restoreReason?
                        queuePosition / isPriority (atendimento preferencial)
                        Constraint: UNIQUE(queueId, queuePosition)
                        Index: (erId, state, isPriority, queuePosition)

AuditEvent
──────────
id / eventType / erId
ticketId? / representativeId? / operatorId?
metadata (JSON) / createdAt
```

> Convidada (`kind: GUEST`): entra na fila só com nome + telefone (via
> `POST /auth/guest-entry`, habilitado por ER em `guestEntryEnabled`). O telefone —
> único e obrigatório — é a identidade dela: reler o QR com o mesmo número devolve a
> mesma senha ativa. CPF, nascimento, código de RE e senha ficam nulos; convidada não
> faz login por senha.

---

## Perfis de acesso (Roles)

| Role | Escopo | Capacidades principais |
|---|---|---|
| `REPRESENTATIVE` | Auto | Entrar na fila, pausar/retomar/cancelar própria senha |
| `OPERATOR` | ER | Abrir caixa, chamar próximo, iniciar/finalizar atendimento, marcar preferencial |
| `ATTENDANT` | ER | Check-in assistido (pode já entrar preferencial), criar representantes, cancelar senhas, marcar preferencial |
| `MANAGER` | ER | Abrir/fechar dia, métricas, correções, liberar caixas órfãos, pausar/retomar senha (inclusive cross-caixa), marcar preferencial |
| `ADMIN` | Global | Criar ERs, caixas, contas de equipe, rotacionar token do painel |

---

## Autenticação

Todas as chamadas autenticadas enviam o JWT no header:

```
Authorization: Bearer <token>
```

O payload do token carrega as claims necessárias para autorização — `userId`, `role`,
`erId` e `sv` (sessionVersion) — eliminando consultas adicionais ao banco por chamada.
As sessões de representante também carregam `entryChannel` e expiram no fim do dia útil
(ver Segurança), em vez do `JWT_EXPIRES_IN` global da equipe.

```json
{
  "sub": "<id do usuário>",
  "userId": "<id do usuário>",
  "role": "OPERATOR",
  "erId": "<id do ER>",
  "sv": 3
}
```

Tokens de entrada na fila (QR Code / link) trafegam no header `x-entry-token` e carregam `erId`, `entryChannel` e expiração assinados com chave separada.

---

## Referência de API

> Base URL: `http://<host>:3000`
>
> Throttle global: 300 requisições / 60 s (default; `THROTTLE_GLOBAL_PER_MINUTE`). Endpoints críticos têm limites adicionais (indicados abaixo; os limites por endpoint também aceitam override por env — ver [Segurança](#segurança)). A chave do throttle é **por usuário** quando a requisição traz JWT válido (`user:<id>`), e **o IP** resolvido via `trust proxy` (`TRUST_PROXY_HOPS`) nas rotas anônimas; o login adiciona uma trava por credencial (ver [Segurança](#segurança)).

### Autenticação — `auth/`

| Método | Caminho | Auth | Throttle | Descrição |
|---|---|---|---|---|
| `POST` | `/auth/register` | Público | 20/min por IP (`THROTTLE_REGISTER_PER_MINUTE`) | Cadastro de RE |
| `POST` | `/auth/login` | Público | 40/min por IP (`THROTTLE_LOGIN_PER_MINUTE`) + trava por credencial | Login de RE |
| `POST` | `/auth/guest-entry` | Público | 20/min por IP (`THROTTLE_GUEST_ENTRY_PER_MINUTE`) | Entrada de convidada (nome + sobrenome + telefone; exige token de entrada e `guestEntryEnabled` no ER) |
| `POST` | `/auth/staff-login` | Público | 20/min por IP + trava por credencial | Login da equipe |
| `POST` | `/representatives` | ATTENDANT, MANAGER | — | Criar RE manualmente |
| `GET` | `/representatives/search?q=` | ATTENDANT, MANAGER | — | Buscar REs por nome/CPF/código |

---

### Entrada pública na fila — `er/public`

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| `GET` | `/public/ers/:erId` | `x-entry-token` | Metadados do ER para entrada na fila (nome, canal, `guestEntryEnabled`) |

---

### Fila — `queue/`

Endpoints centrais para operação e integração.

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| `POST` | `/queues/:erId/call-next` | OPERATOR | Chama o próximo da fila — preferenciais primeiro, depois por ordem de chegada (transação atômica com lock de linha) |
| `GET` | `/queues/:erId/overview` | OPERATOR, ATTENDANT, MANAGER | Visão geral: isDayOpen, filas, caixas, últimos atendimentos |

**`POST /queues/:erId/call-next`**

```json
// Request body
{ "counterId": "<id do caixa>" }

// Response
{
  "id": "<ticketId>",
  "code": "001",
  "representative": { "id": "...", "fullName": "...", "reCode": "..." },
  "counter": { "id": "...", "number": 1 },
  "calledAt": "2026-06-12T10:30:00.000Z"
}
```

**`GET /queues/:erId/overview`**

```json
{
  "isDayOpen": true,
  "waiting":   [ /* Ticket[] */ ],
  "calling":   [ /* Ticket[] */ ],
  "inService": [ /* Ticket[] */ ],
  "paused":    [ /* Ticket[] */ ],
  "recent":    [ /* últimos 20 finalizados/não-comparecidos/cancelados */ ],
  "counters":  [ /* Counter[] com info do operador */ ]
}
```

---

### Senha — `ticket/`

| Método | Caminho | Auth | Throttle | Descrição |
|---|---|---|---|---|
| `POST` | `/tickets` | REPRESENTATIVE, ATTENDANT | 40/min por usuário (`THROTTLE_TICKET_CREATE_PER_MINUTE`) | Criar senha na fila (aceita `isPriority` opcional — só honrado quando criada por staff/check-in; ignorado para a própria RE) |
| `GET` | `/tickets/my-active?erId=` | REPRESENTATIVE | — | Senha ativa da RE |
| `GET` | `/tickets/my-status?erId=` | REPRESENTATIVE | — | Senha mais recente da RE em qualquer estado (polling da tela da RE: reflete não-comparecimento, cancelamento e restauração) |
| `POST` | `/tickets/:id/start-service` | OPERATOR | — | Iniciar atendimento (CALLING → IN_SERVICE) |
| `POST` | `/tickets/:id/finish-service` | OPERATOR | — | Finalizar atendimento (IN_SERVICE → FINISHED) |
| `POST` | `/tickets/:id/no-show` | OPERATOR | — | Marcar não comparecimento |
| `POST` | `/tickets/:id/recall` | OPERATOR | — | Segunda chamada (rechamada) |
| `POST` | `/tickets/:id/pause` | REPRESENTATIVE | — | Pausar senha (a retomada mantém a posição original; só o timeout vai ao fim) |
| `POST` | `/tickets/:id/resume` | REPRESENTATIVE | — | Retomar senha pausada na posição original (atrás de preferenciais que entraram na pausa) |
| `POST` | `/tickets/:id/staff-pause` | OPERATOR, ATTENDANT, MANAGER, ADMIN | — | Pausar senha de um RE pela operação (aceita WAITING/CALLING/IN_SERVICE; libera o caixa se estava em uso). A gestora pode pausar cross-caixa (§9.5.1) |
| `POST` | `/tickets/:id/staff-resume` | OPERATOR, ATTENDANT, MANAGER, ADMIN | — | Retomar senha pausada pela operação |
| `POST` | `/tickets/:id/mark-priority` | OPERATOR, ATTENDANT, MANAGER | — | Marcar atendimento preferencial (Lei 10.048); só senha WAITING/PAUSED |
| `POST` | `/tickets/:id/unmark-priority` | OPERATOR, ATTENDANT, MANAGER | — | Remover atendimento preferencial; só senha WAITING/PAUSED |
| `POST` | `/tickets/:id/self-cancel` | REPRESENTATIVE | — | Cancelamento próprio da RE |
| `POST` | `/tickets/:id/cancel` | ATTENDANT, MANAGER | — | Cancelar senha |
| `POST` | `/tickets/:id/restore` | MANAGER | — | Restaurar senha cancelada/não-comparecida |
| `POST` | `/tickets/:id/correct` | MANAGER | — | Correção manual: finalizar ou cancelar |

**Máquina de estados da senha:**

```
WAITING → (call-next) → CALLING → (start-service) → IN_SERVICE → (finish-service) → FINISHED
                                 ↘ (no-show)         ↘ (no-show após timeout)       ↗ (correct)
                    CALLING → NO_SHOW             IN_SERVICE → NO_SHOW
         WAITING/CALLING → (pause) → PAUSED → (resume) → WAITING
         Qualquer estado → CANCELLED
```

---

### Caixa — `counter/`

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| `GET` | `/counters` | OPERATOR, MANAGER, ATTENDANT | Lista caixas do ER do operador |
| `POST` | `/counters/:id/open` | OPERATOR | Abre caixa e atribui operador |
| `POST` | `/counters/:id/pause` | OPERATOR | Pausa caixa; `reason` de uma lista fixa (§9.4) + `detail` livre obrigatório quando `reason='outro'` |
| `POST` | `/counters/:id/resume` | OPERATOR | Retoma caixa pausado |
| `POST` | `/counters/:id/close` | OPERATOR | Fecha caixa e libera operador |
| `POST` | `/counters/:id/force-release` | MANAGER | Libera caixa órfão |

---

### ER — `er/`

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| `GET` | `/ers/:id` | MANAGER | Detalhes do ER |
| `POST` | `/ers/:id/open-day` | MANAGER | Abre o dia (cria Queue para a data) |
| `POST` | `/ers/:id/close-day` | MANAGER | Encerra o dia |

---

### Painel TV — `panel/`

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| `GET` | `/panel/:erId/state` | Token do painel (header) | Estado completo para renderização do painel |

**WebSocket — eventos:**

Conexão via Socket.IO ao endpoint do backend.

```
// Cliente → Servidor (ao conectar)
joinER { erId, clientType, token? }
  clientType: 'panel'      → token de exibição do ER no campo `token` do joinER
  clientType: 'dashboard'  → JWT de staff no handshake (auth.token)

// Servidor → Cliente — cada mudança de estado é emitida sob um nome específico e
// também encapsulada em panel.updated { event, payload } (broadcast genérico).
ticket.created           { ticketId, code, queuePosition }
ticket.called            { ticketId, code, displayName, counterNumber, calledAt }
ticket.priority_changed  { ticketId, isPriority }
ticket.paused | ticket.no_show | ticket.cancelled | ticket.restored
ticket.service_started | ticket.service_finished
counter.opened | counter.paused | counter.resumed | counter.closed | counter.created | counter.deleted
day.opened | day.closed
panel.updated            { event, payload }   // wrapper genérico de toda atualização
joinER.denied            { erId }             // falha de autenticação
```

---

### Métricas — `metrics/`

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| `GET` | `/metrics/:erId/daily` | MANAGER | Métricas do dia: totais, médias de espera e atendimento por canal e caixa |

---

### Administração — `admin/`

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| `GET` | `/admin/ers` | ADMIN | Lista todos os ERs |
| `POST` | `/admin/ers` | ADMIN | Criar ER |
| `GET` | `/admin/ers/:erId` | ADMIN | Detalhes do ER |
| `PATCH` | `/admin/ers/:erId` | ADMIN | Atualizar configurações do ER |
| `POST` | `/admin/ers/:erId/counters` | ADMIN | Criar caixa |
| `DELETE` | `/admin/ers/:erId/counters/:counterId` | ADMIN | Remover caixa (exclusão física; só sem histórico de atendimento e fora de uso) |
| `POST` | `/admin/ers/:erId/staff` | ADMIN | Criar conta de equipe |
| `POST` | `/admin/ers/:erId/panel-token` | ADMIN | Gerar token do painel (exibido uma vez, armazenado como hash) |
| `DELETE` | `/admin/ers/:erId/panel-token` | ADMIN | Revogar token do painel |

---

### Simulador operacional — `simulation/`

Console interno de simulação para desenvolvimento e demonstração. **Bloqueado fora de `NODE_ENV=development|test`** pelo `SimulationGuard` (fail-closed) e por banco remoto sem `SIMULATION_ALLOW_REMOTE=true`. Requer JWT de ADMIN.

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| `GET` | `/simulation/ers` | ADMIN | Lista todos os ERs |
| `GET` | `/simulation/state?erId=` | ADMIN | Snapshot da fila (overview) |
| `GET` | `/simulation/operators?erId=` | ADMIN | Lista operadoras do ER |
| `GET` | `/simulation/counters?erId=` | ADMIN | Lista caixas do ER |
| `GET` | `/simulation/representatives?erId=` | ADMIN | Lista REs disponíveis/ativas no ER |
| `POST` | `/simulation/counters/open` | ADMIN | Abre caixas em lote, auto-pareando com operadoras livres |
| `POST` | `/simulation/counters/close` | ADMIN | Fecha um caixa |
| `POST` | `/simulation/counters/call-next` | ADMIN | Chama próxima senha em um caixa ativo |
| `POST` | `/simulation/queue/add-existing` | ADMIN | Coloca REs existentes na fila |
| `POST` | `/simulation/queue/pause` | ADMIN | Pausa uma senha (WAITING → PAUSED) |
| `POST` | `/simulation/queue/resume` | ADMIN | Retoma uma senha pausada (PAUSED → WAITING) |
| `POST` | `/simulation/queue/cancel` | ADMIN | Cancela uma senha (desistência da RE) |
| `POST` | `/simulation/attendance/start` | ADMIN | Inicia atendimento (CALLING → IN_SERVICE) |
| `POST` | `/simulation/attendance/finish` | ADMIN | Encerra atendimento (IN_SERVICE → FINISHED) |
| `POST` | `/simulation/attendance/no-show` | ADMIN | Registra não comparecimento (CALLING → NO_SHOW) |

---

### Observabilidade — `observability/`

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| `GET` | `/health/live` | Público | Liveness probe: status e uptime |
| `GET` | `/health/ready` | Público | Readiness probe: verifica conexão com banco |
| `GET` | `/observability/metrics` | Bearer `OBSERVABILITY_TOKEN` | Métricas Prometheus |

---

## Segurança

- **Rate limiting (por usuário/IP):** ThrottlerModule — 300 req/60s globais; limites por endpoint nos críticos. Requisição com JWT **verificado** usa o usuário como chave (`user:<id>`), então um ER cheio de REs no mesmo Wi-Fi/NAT não esgota um balde único por IP; a identidade é segura como chave porque exige assinatura válida (criar identidades passa pelo `/auth/register`, que é limitado por IP). Rotas anônimas usam **apenas o IP**, nunca campos do corpo (que o cliente controla) — caso contrário variar `erId`/`entryChannel` criaria baldes novos e burlaria o limite. Limites ajustáveis por env sem redeploy (`THROTTLE_GLOBAL_PER_MINUTE`, `THROTTLE_REGISTER_PER_MINUTE`, `THROTTLE_LOGIN_PER_MINUTE`, `THROTTLE_GUEST_ENTRY_PER_MINUTE`, `THROTTLE_TICKET_CREATE_PER_MINUTE`) — ex.: evento com muita gente na mesma rede. Camada grosseira de anti-enxurrada.
- **`trust proxy` fixo:** `TRUST_PROXY_HOPS` (default 1) define quantos proxies confiáveis ficam à frente; o `req.ip` (base do throttle) vem da posição correta do `X-Forwarded-For`, não do valor falsificável que o cliente envia.
- **Trava de brute-force por credencial:** [`LoginThrottleService`](../apps/backend/src/auth/login-throttle.service.ts) conta falhas por conta alvo (CPF/RE code no login; e-mail no staff-login), janela de 15 min, máx. 10 → `429`. Imune a NAT e a rotação de IP; normaliza o identificador (sem driblar por formatação) e bloqueia antes de tocar o banco. _Em memória, por instância — ver [DT-1](./debitos-tecnicos.md#dt-1--estado-de-rate-limit-e-trava-de-brute-force-em-memória)._
- **Anti-enumeração por timing:** o caminho "conta inexistente" roda uma comparação bcrypt dummy, igualando o tempo de resposta ao da senha errada.
- **JWT forte:** rejeita inicialização se `JWT_SECRET` < 32 caracteres fora de `development`/`test`
- **Session versioning:** `sessionVersion` no token; rotacionado em logout ou revogação; validado pelo `JwtStrategy` a cada chamada
- **PII:** CPF e telefone mascarados nas respostas (`***.***.344-**`), com fallback total para valores malformados; o `panelTokenHash` nunca sai em respostas de staff (`GET /ers/:id` expõe só `hasPanelToken`)
- **Tokens de entrada:** assinados com chave separada, carregam `erId`, `entryChannel` e expiração. O TTL por canal é configurável via env (default 24h): `QUEUE_ENTRY_QR_CODE_TTL_SECONDS` e `QUEUE_ENTRY_LINK_TTL_SECONDS`
- **Sessão da RE por dia:** o JWT da representante expira no **fim do dia útil** (meia-noite, fuso de São Paulo), nunca além do token de entrada — a fila é diária (senhas pendentes viram `day_rollover` na virada), então a sessão não sobrevive ao dia. Tokens de staff seguem o `JWT_EXPIRES_IN` global + `sessionVersion`
- **CORS:** apenas as origens declaradas em `FRONTEND_URL` são aceitas — valor único ou lista separada por vírgula (hml/prod corporativos têm domínios distintos); vale para HTTP e para o handshake do Socket.IO
- **OpenAPI do aplicativo:** o contrato completo da API consumida pelo frontend é publicado em `/docs/api` (habilitado em dev ou via `APP_DOCS_ENABLED`) — é o contrato formal da fronteira frontend ↔ backend; o documento M2M de `/docs/integration` permanece separado

---

## Integração com sistemas corporativos (`integration/`)

Permite que um sistema legado corporativo (atendimento/pedido) marque o início e o fim do atendimento da revendedora, eliminando a gestão manual da fila pela operadora.

**Modelo A (adotado):** a operadora **continua chamando** pelo app (`call-next` segue amarrando caixa+operadora); o legado apenas dispara início e fim.

A senha é localizada por `reCode`/`cpf` (ambos `@unique`) e **pela senha onde a RE foi chamada** — estados `CALLING`/`IN_SERVICE`, em que ela está fisicamente num caixa. Uma senha `WAITING`/`PAUSED` em outro ER é ignorada (a RE pode visitar outro ER em outro dia, mas só é atendida num caixa por vez). O ER vem da própria senha; o legado não envia código de loja.

### Endpoints — `/integration/v1`

> Base separada da API de staff. Autenticação por **Bearer JWT (OAuth2 client_credentials)** validado como *resource server*; scope por endpoint. Documentação OpenAPI em `/docs/integration` (habilitada em dev ou via `INTEGRATION_DOCS_ENABLED`).
>
> O spec de publicação no **Apigee** é um rascunho local **não versionado** (`docs/local-template-apigee.yaml`, coberto pelo padrão `docs/local-*` do `.gitignore`): do `paths` para baixo ele deriva do `GET /docs/integration-json` gerado por este módulo e deve ser ressincronizado a cada mudança na API de integração (o gate de docs do `/commit` cobra isso); o cabeçalho (`info`/`servers`/`x-*`) segue o padrão corporativo e é preenchido à parte.

| Método | Caminho | Scope | Descrição |
|---|---|---|---|
| `POST` | `/integration/v1/atendimentos/iniciar` | `tickets:start` | Localiza a senha chamada da RE e avança CALLING → IN_SERVICE |
| `POST` | `/integration/v1/atendimentos/encerrar` | `tickets:finish` | Avança IN_SERVICE → FINISHED (RE sai da fila) |

Corpo: `{ reCode? , cpf?, erId?, idempotencyKey? }` (exatamente um entre `reCode`/`cpf`; `erId` é opcional e restringe a ação a esse ER). **Idempotente:** repetir a ação sobre senha já no estado-alvo retorna `200 { idempotent: true }` — `encerrar` reconhece a senha `FINISHED` do dia para o reenvio do gatilho de faturamento.

**Erros (código no corpo):** `INVALID_IDENTIFIER` (400); `REPRESENTATIVE_NOT_FOUND`/`NO_ACTIVE_TICKET` (404); `INSUFFICIENT_SCOPE` (403); `TICKET_NOT_IN_SERVICE` (encerrar com senha apenas chamada) e `MULTIPLE_ACTIVE_TICKETS` (409, defensivo — RE em atendimento em mais de um ER, ou mais de uma senha ativa no mesmo ER: ação ambígua resolvida de forma determinística, sem escolher uma senha arbitrária).

### Autenticação — pronta para Apigee

O backend valida o token como resource server (**algoritmo fixado em RS256** via JWKS, com `issuer`/`audience` verificados — **obrigatórios quando há JWKS configurado**: o boot falha se faltarem, para nunca aceitar token de outra audience), por uma Passport strategy **isolada** (`integration-jwt`, distinta da de staff). A migração para o **Apigee** é só configuração — apontar `INTEGRATION_JWKS_URI`/`ISSUER`/`AUDIENCE` para o Apigee. Em desenvolvimento, um **emissor de token local** (`POST /integration/oauth/token`, `client_credentials`) substitui o Apigee; ele é desligado fora de `development`/`test` e compara o segredo do cliente em tempo constante. A chave pública de dev **só é aceita** em `development`/`test` — em produção, sem JWKS configurado, a validação falha fechada (nenhum token é aceito).

As ações são auditadas reutilizando os eventos `service_started`/`service_finished` com `metadata.source = 'integration'` (cliente e scopes), preservando o caixa/operadora que o `call-next` amarrou. **Sem migração de banco.**

### Local (dev) × Produção (corporativo)

O código é o mesmo nos dois ambientes; **a transição para produção é só configuração**.

| Aspecto | Local (dev) | Produção (corporativo) |
|---|---|---|
| Emissor do token | endpoint `POST /integration/oauth/token` (emissor de dev) | **Apigee** (OAuth2 client_credentials) |
| Validação no backend | chave pública local (`INTEGRATION_DEV_PUBLIC_KEY`) | JWKS do Apigee (`INTEGRATION_JWKS_URI`) |
| Emissor de dev | `INTEGRATION_DEV_TOKEN_ENABLED=true` | desligado e **bloqueado** fora de `development`/`test` |
| Chave pública de dev | aceita | **ignorada**; sem JWKS, validação falha fechada |
| Documentação Swagger | UI em `/docs/integration` | publicada no portal do Apigee (UI não exposta) |
| Rate limit / quotas | throttler do backend (backstop) | Apigee na borda |
| Rede | backend acessível localmente | backend **privado**; só o Apigee alcança (GCP↔AWS privado) |

> **Pendências para o ambiente corporativo:** provisionar o Apigee (emissor + JWKS), conectividade privada GCP↔AWS, e a revisão de LGPD/SI dos dados trafegados.

---

## Documentação relacionada

- [README](../README.md) — setup local, comandos e infraestrutura necessária
- [Arquitetura Frontend](./arquitetura-frontend.md)
- [Stack técnica do MVP](./stack-mvp.md)
- [Deploy do MVP](./deployment-mvp.md)
