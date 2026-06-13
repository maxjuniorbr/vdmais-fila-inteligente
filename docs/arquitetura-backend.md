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
│   ├── er/             # Espaço de Relacionamento — abertura/fechamento do dia
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
Representative          Operador (equipe)
─────────────           ──────────────────
id                      id
fullName                name
cpf (unique)            email (unique)
phone (unique)          passwordHash
birthDate               role: OPERATOR|ATTENDANT|MANAGER|ADMIN
reCode (unique)         sessionVersion
passwordHash            erId? (null para ADMIN)
                        counter? (1:1)

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
                        Constraint: UNIQUE(queueId, queuePosition)

AuditEvent
──────────
id / eventType / erId
ticketId? / representativeId? / operatorId?
metadata (JSON) / createdAt
```

---

## Perfis de acesso (Roles)

| Role | Escopo | Capacidades principais |
|---|---|---|
| `REPRESENTATIVE` | Auto | Entrar na fila, pausar/retomar/cancelar própria senha |
| `OPERATOR` | ER | Abrir caixa, chamar próximo, iniciar/finalizar atendimento |
| `ATTENDANT` | ER | Check-in assistido, criar representantes, cancelar senhas |
| `MANAGER` | ER | Abrir/fechar dia, métricas, correções, liberar caixas órfãos |
| `ADMIN` | Global | Criar ERs, caixas, contas de equipe, rotacionar token do painel |

---

## Autenticação

Todas as chamadas autenticadas enviam o JWT no header:

```
Authorization: Bearer <token>
```

O payload do token carrega as claims necessárias para autorização — role, erId e sessionVersion — eliminando consultas adicionais ao banco por chamada.

```json
{
  "sub": "<id do usuário>",
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
> Throttle global: 300 requisições / 60 s por IP. Endpoints críticos têm limites adicionais (indicados abaixo).

### Autenticação — `auth/`

| Método | Caminho | Auth | Throttle | Descrição |
|---|---|---|---|---|
| `POST` | `/auth/register` | Público | 5/min | Cadastro de RE |
| `POST` | `/auth/login` | Público | 10/min | Login de RE |
| `POST` | `/auth/staff-login` | Público | 10/min | Login da equipe |
| `POST` | `/representatives` | ATTENDANT, MANAGER | — | Criar RE manualmente |
| `GET` | `/representatives/search?q=` | ATTENDANT, MANAGER | — | Buscar REs por nome/CPF/código |

---

### Entrada pública na fila — `er/public`

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| `GET` | `/public/ers/:erId` | `x-entry-token` | Metadados do ER para entrada na fila (nome, canal) |

---

### Fila — `queue/`

Endpoints centrais para operação e integração.

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| `POST` | `/queues/:erId/call-next` | OPERATOR | Chama o próximo da fila (transação atômica com lock de linha) |
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
| `POST` | `/tickets` | REPRESENTATIVE, ATTENDANT | 20/min | Criar senha na fila |
| `GET` | `/tickets/my-active?erId=` | REPRESENTATIVE | — | Senha ativa da RE |
| `POST` | `/tickets/:id/start-service` | OPERATOR | — | Iniciar atendimento (CALLING → IN_SERVICE) |
| `POST` | `/tickets/:id/finish-service` | OPERATOR | — | Finalizar atendimento (IN_SERVICE → FINISHED) |
| `POST` | `/tickets/:id/no-show` | OPERATOR | — | Marcar não comparecimento |
| `POST` | `/tickets/:id/recall` | OPERATOR | — | Segunda chamada (rechamada) |
| `POST` | `/tickets/:id/pause` | REPRESENTATIVE | — | Pausar senha (volta ao fim da fila ao retomar) |
| `POST` | `/tickets/:id/resume` | REPRESENTATIVE | — | Retomar senha pausada |
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
| `POST` | `/counters/:id/pause` | OPERATOR | Pausa caixa |
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
  clientType: 'panel'      → requer panelToken no header
  clientType: 'dashboard'  → aceita JWT de staff

// Servidor → Cliente
ticket.called  { ticketId, code, displayName, counterNumber, calledAt }
counter.opened { counterId, number }
panel.updated  { event, payload }   // broadcast genérico de atualização de estado
joinER.denied  { erId }             // falha de autenticação
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
| `POST` | `/admin/ers/:erId/staff` | ADMIN | Criar conta de equipe |
| `POST` | `/admin/ers/:erId/panel-token` | ADMIN | Gerar token do painel (exibido uma vez, armazenado como hash) |
| `DELETE` | `/admin/ers/:erId/panel-token` | ADMIN | Revogar token do painel |

---

### Observabilidade — `observability/`

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| `GET` | `/health/live` | Público | Liveness probe: status e uptime |
| `GET` | `/health/ready` | Público | Readiness probe: verifica conexão com banco |
| `GET` | `/observability/metrics` | Bearer `OBSERVABILITY_TOKEN` | Métricas Prometheus |

---

## Segurança

- **Rate limiting:** ThrottlerModule — 300 req/60s globais; limites por endpoint nos endpoints críticos
- **JWT forte:** rejeita inicialização se `JWT_SECRET` < 32 caracteres fora de `development`/`test`
- **Session versioning:** `sessionVersion` no token; rotacionado em logout ou revogação; validado pelo `JwtStrategy` a cada chamada
- **PII:** CPF e telefone mascarados nas respostas (`***.***.344-**`)
- **Tokens de entrada:** assinados com chave separada, carregam `erId`, `entryChannel` e expiração
- **Throttle de entrada na fila:** quotas por IP/ER/canal em criação de senha
- **CORS:** apenas a origem declarada em `FRONTEND_URL` é aceita

---

## Integração com sistemas corporativos (planejado)

> **Esta seção descreve uma integração ainda não implementada.** O objetivo é registrar o modelo de integração previsto para que seja considerado nas etapas de aprovação de SI, LGPD e arquitetura corporativa.

### Contexto

Atualmente, os operadores gerenciam o ciclo de vida das senhas manualmente pelo aplicativo. O objetivo da integração é eliminar essa gestão manual conectando o sistema de fila aos sistemas corporativos existentes (atendimento e pedidos).

### Gatilhos previstos

| Evento no sistema corporativo | Ação no sistema de fila |
|---|---|
| Início do atendimento de uma RE no sistema de atendimento | Marcar senha como **IN_SERVICE** (`POST /tickets/:id/start-service`) |
| Faturamento ou encerramento do pedido da RE | Marcar senha como **FINISHED** (`POST /tickets/:id/finish-service`) |

### Fluxo de integração esperado

```
Sistema corporativo detecta início de atendimento da RE (identificada por CPF ou código RE)
  → Consulta ticket ativo da RE no sistema de fila
  → Chama POST /tickets/:id/start-service
  → Senha avança para IN_SERVICE; painel TV e telas de operação refletem imediatamente

Sistema corporativo detecta faturamento/encerramento do pedido
  → Identifica o ticket IN_SERVICE da RE
  → Chama POST /tickets/:id/finish-service
  → Senha avança para FINISHED; RE sai da fila automaticamente
```

### Dependências para implementação

Para viabilizar essa integração, será necessário:

1. **Mecanismo de autenticação para sistemas externos** — os endpoints atuais exigem JWT de um operador autenticado. A integração corporativa precisará de uma das abordagens abaixo (a definir conforme políticas de SI):
   - Conta de serviço com perfil `OPERATOR` dedicada por ER
   - Novos endpoints de integração protegidos por API key ou token de serviço
   - Autenticação via OAuth2/OIDC corporativo

2. **Endpoint de lookup de ticket por RE** — localizar o ticket ativo de uma RE a partir do CPF ou `reCode`, sem expor dados desnecessários.

3. **Tratamento de estados inconsistentes** — definir comportamento quando o ticket não está no estado esperado no momento do gatilho (ex.: RE já cancelou a própria senha antes do faturamento).

4. **Adequação à LGPD e SI** — revisão dos dados trafegados entre sistemas, controle de acesso e registro de auditoria das chamadas da integração.

---

## Documentação relacionada

- [README](../README.md) — setup local, comandos e infraestrutura necessária
- [Arquitetura Frontend](./arquitetura-frontend.md)
- [Stack técnica do MVP](./stack-mvp.md)
- [Deploy do MVP](./deployment-mvp.md)
