## Contexto

Este registro define a stack mínima recomendada para o **MVP 0 — Fila Digital Presencial Operável**, considerando que o Grupo Boticário já utiliza **React** no front-end e **Node.js com NestJS** no BFF.

Premissa central:

> Não abrir uma stack nova para o MVP 0. Usar a stack já dominada e adicionar apenas os componentes mínimos para fila em tempo real, persistência, autenticação simples e observabilidade básica.
> 

Este recorte considera explicitamente que **não haverá integração com o PDV** neste momento.

---

## 1. Stack mínima recomendada

```
Front-end:
React + TypeScript

Backend/BFF:
Node.js + NestJS + TypeScript

Tempo real:
NestJS WebSocket Gateway + Socket.IO

Banco de dados:
PostgreSQL

ORM / acesso a dados:
Prisma ou TypeORM, preferencialmente seguindo padrão interno do Grupo

Autenticação:
Login próprio do MVP
RE: telefone/OTP ou telefone/senha
Operação: login com perfil

Infraestrutura:
React em static hosting/CDN
NestJS em container
PostgreSQL gerenciado
Logs e métricas básicas
```

Redis não é obrigatório no MVP 0. Deve entrar apenas se houver múltiplas instâncias do backend, WebSocket distribuído, escala horizontal ou necessidade de pub/sub.

---

## 2. Front-end

Tecnologia recomendada:

> React + TypeScript
> 

O front-end pode ser uma única aplicação React com rotas separadas por perfil de uso.

Rotas mínimas:

```
/fila/:erId
/operacao
/gestao
/painel/:erId
```

### 2.1 Tela da RE

Uso:

- entrada na fila por QR Code;
- entrada por link;
- login/cadastro mínimo;
- exibição da senha gerada;
- orientação para acompanhar chamada pela TV;
- mensagem de erro quando já existir senha ativa.

Não incluir neste MVP:

- ETA;
- geolocalização;
- push notification;
- Pedido Expresso;
- seleção de tipo de atendimento.

### 2.2 Tela da operação

Uso:

- login da operadora;
- assumir caixa;
- chamar próximo;
- iniciar atendimento;
- finalizar atendimento;
- marcar não compareceu;
- pausar/retomar caixa.

### 2.3 Tela da gestora

Uso:

- visualizar fila completa;
- visualizar caixas ativos e pausados;
- visualizar atendimentos em andamento;
- cancelar senha;
- restaurar senha;
- consultar métricas básicas.

### 2.4 TV / painel

Uso:

- exibir senha chamada;
- exibir primeiro nome + inicial;
- exibir caixa destino;
- exibir chamadas recentes;
- exibir atendimentos em andamento.

A TV pode ser uma rota React em tela cheia:

```
/painel/:erId
```

---

## 3. Backend / BFF

Tecnologia recomendada:

> Node.js + NestJS + TypeScript
> 

Para o MVP 0, o NestJS pode atuar como BFF e backend principal do domínio de fila, sem necessidade de separar microsserviços.

Responsabilidades mínimas:

- cadastro mínimo da RE;
- autenticação/login;
- criação de senha;
- controle de fila FIFO;
- bloqueio de senha ativa duplicada;
- controle transacional da chamada do próximo;
- estados da senha;
- operação por caixa;
- eventos;
- métricas básicas;
- APIs para painel;
- WebSocket para atualização em tempo real.

Módulos NestJS sugeridos:

```
AuthModule
RepresentativesModule
ERModule
QueueModule
TicketModule
CounterModule
OperatorModule
PanelModule
MetricsModule
AuditLogModule
```

---

## 4. Comunicação em tempo real

Tecnologia recomendada:

> NestJS WebSocket Gateway + Socket.IO
> 

Uso:

- atualizar TV/painel quando uma senha for chamada;
- atualizar tela da operadora;
- atualizar visão da gestora;
- refletir mudanças de estado da fila;
- mostrar atendimentos em andamento.

Eventos em tempo real mínimos:

```
ticket.created
ticket.called
ticket.no_show
ticket.service_started
ticket.service_finished
ticket.cancelled
ticket.restored
counter.opened
counter.paused
counter.resumed
panel.updated
```

Alternativa possível:

> Server-Sent Events — SSE.
> 

SSE é suficiente para fluxos servidor → cliente, como painel e dashboards. Porém, como a operação da fila envolve ações bidirecionais e atualização simultânea de telas, WebSocket com Socket.IO é a opção mais prática para o MVP.

---

## 5. Banco de dados

Tecnologia recomendada:

> PostgreSQL
> 

Motivos:

- transações fortes;
- lock de linha;
- consistência para evitar chamada simultânea;
- facilidade de auditoria;
- boa aderência a relatórios básicos;
- modelo relacional adequado para RE, senha, fila, caixa, operadora e eventos.

Decisão crítica:

> A operação “chamar próximo” precisa ser transacional.
> 

O PostgreSQL permite implementar essa regra com transação e lock de linha, por exemplo usando `SELECT ... FOR UPDATE SKIP LOCKED` ou mecanismo equivalente.

---

## 6. ORM / acesso a dados

Opções recomendadas:

- Prisma;
- TypeORM.

Recomendação:

> Seguir o padrão interno do Grupo Boticário. Se não houver padrão obrigatório, Prisma tende a ser a opção mais produtiva para o MVP pela tipagem forte e simplicidade.
> 

---

## 7. Autenticação

Como o MVP 0 não terá integração com base oficial de REs nem com PDV, a autenticação pode ser própria do SaaS.

### 7.1 Representante

Opções:

- telefone + OTP;
- telefone + senha;
- CPF/código de RE + senha.

Recomendação:

> Telefone celular + OTP, com CPF e código de RE no cadastro.
> 

Se OTP/SMS for caro ou complexo para o piloto, usar telefone + senha.

### 7.2 Operação

Opções:

- SSO corporativo, se for simples;
- login próprio do MVP.

Perfis mínimos:

```
representative
operator
checkin_attendant
manager
admin
```

---

## 8. Infraestrutura mínima

Arquitetura mínima:

```
React RE / Operação / TV
        |
        | HTTPS + WebSocket
        v
NestJS BFF/API
        |
        v
PostgreSQL
```

Arquitetura um pouco mais robusta:

```
React RE / Operação / TV
        |
        | HTTPS + WebSocket
        v
NestJS BFF/API
        |
        +---- PostgreSQL
        |
        +---- Redis
        |
        +---- Observabilidade
```

Infraestrutura recomendada:

- React em static hosting/CDN;
- NestJS em container;
- PostgreSQL gerenciado;
- secrets manager;
- logs centralizados;
- monitoramento básico;
- pipeline CI/CD.

Se o Grupo já usa Kubernetes, o backend pode rodar em Kubernetes. Se isso for pesado para o MVP, container em ambiente gerenciado é suficiente.

---

## 9. APIs mínimas

Endpoints mínimos:

```
POST /auth/register
POST /auth/login
POST /queues/:erId/tickets
GET  /queues/:erId/status
POST /operators/counters/open
POST /operators/counters/pause
POST /operators/counters/resume
POST /queues/:erId/call-next
POST /tickets/:ticketId/start-service
POST /tickets/:ticketId/finish-service
POST /tickets/:ticketId/no-show
POST /tickets/:ticketId/cancel
POST /tickets/:ticketId/restore
GET  /manager/:erId/dashboard
GET  /panel/:erId
```

WebSocket:

```
/ws/queues/:erId
```

---

## 10. Modelo mínimo de dados

### representatives

```
id
full_name
cpf
birth_date
phone
email
re_code
created_at
updated_at
```

### ers

```
id
name
code
status
created_at
```

### operators

```
id
name
email
role
status
```

### counters

```
id
er_id
name
number
status
```

### operator_counter_sessions

```
id
operator_id
counter_id
opened_at
closed_at
status
```

### queue_tickets

```
id
er_id
representative_id
ticket_number
status
entry_channel
counter_id
operator_id
created_at
called_at
service_started_at
service_finished_at
cancelled_at
no_show_at
restored_at
```

### ticket_events

```
id
ticket_id
event_type
actor_type
actor_id
metadata
created_at
```

### audit_logs

```
id
actor_type
actor_id
action
entity_type
entity_id
metadata
created_at
```

---

## 11. Decisão crítica — chamada do próximo

A parte mais importante da stack é garantir consistência na chamada.

Regra:

> `call-next` precisa ser uma operação transacional.
> 

Fluxo técnico:

1. Operadora solicita **Chamar próximo**.
2. Backend abre transação.
3. Busca próxima senha `Aguardando` do ER.
4. Aplica lock.
5. Atualiza status para `Chamando`.
6. Vincula `operator_id` e `counter_id`.
7. Registra evento.
8. Commit.
9. Publica evento no WebSocket.
10. Painel atualiza.

Sem essa regra, duas operadoras podem chamar a mesma senha ou gerar inconsistência de ordem.

---

## 12. O que não colocar no MVP 0

Não incluir agora:

- Kafka;
- microsserviços separados;
- arquitetura event-driven completa;
- MongoDB;
- Elasticsearch;
- feature flag complexa;
- motor de regras;
- machine learning;
- serviço separado de ETA;
- integração com PDV;
- integração com cadastro oficial;
- app nativo;
- push notification;
- WhatsApp;
- filas assíncronas complexas.

Motivo:

> Esses componentes adicionam custo, dependência e complexidade antes de validar a hipótese operacional central.
> 

---

## 13. Recomendação final

Para o MVP 0, a stack mínima correta é:

> React + TypeScript no front, NestJS no backend/BFF, PostgreSQL como fonte transacional, WebSocket/Socket.IO para atualização em tempo real e autenticação própria simples para o MVP.
> 

Essa stack é suficiente para:

- validar o SaaS;
- operar a fila no ER;
- atualizar TV em tempo real;
- impedir chamada simultânea;
- registrar eventos mínimos;
- gerar métricas básicas;
- evoluir posteriormente para o MVP Full.

Confiança: alta.