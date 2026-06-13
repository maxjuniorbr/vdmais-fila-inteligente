# Stack técnica do MVP

← [Voltar ao README](../README.md) · [Arquitetura Backend](./arquitetura-backend.md) · [Arquitetura Frontend](./arquitetura-frontend.md)

> **Natureza deste documento.** É um **registro de decisão técnica anterior à
> implementação** — explica *por que* a stack foi escolhida. Para o estado **como
> construído** (API, modelo de dados, eventos e módulos atuais), use os documentos de
> arquitetura. Onde este registro divergir da arquitetura, **a arquitetura prevalece**.

## Contexto

Este registro define a stack mínima recomendada para o **MVP — Fila Digital Presencial Operável**, considerando que a organização já utiliza **React** no front-end e **Node.js com NestJS** no BFF.

Premissa central:

> Não abrir uma stack nova para o MVP. Usar a stack já dominada e adicionar apenas os componentes mínimos para fila em tempo real, persistência, autenticação simples e observabilidade básica.
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

Redis não é obrigatório no MVP. Deve entrar apenas se houver múltiplas instâncias do backend, WebSocket distribuído, escala horizontal ou necessidade de pub/sub.

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

- exibir as senhas chamadas, uma por caixa em chamada (a mais recente piscando);
- exibir primeiro nome + inicial;
- exibir caixa destino;
- exibir próximas senhas (com rodízio automático quando excedem a tela);
- exibir atendimentos em andamento;
- exibir tempos médios de espera e atendimento.

A TV pode ser uma rota React em tela cheia:

```
/painel/:erId?token=...
```

O acesso é protegido por um **token de exibição por ER**, gerado na administração.
Não exige perfil de usuário; a URL da TV carrega o token. Sem token válido, tanto
`GET /panel/:erId/state` quanto o handshake do WebSocket são recusados.

---

## 3. Backend / BFF

Tecnologia recomendada:

> Node.js + NestJS + TypeScript
> 

Para o MVP, o NestJS pode atuar como BFF e backend principal do domínio de fila, sem necessidade de separar microsserviços.

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

> Esta foi a divisão **proposta**. Os módulos efetivamente implementados (incluindo
> `admin`, `telemetry` e `observability`) estão descritos em
> [Arquitetura Backend](./arquitetura-backend.md).

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

> Esta é a lista de eventos **proposta**. O conjunto efetivamente emitido pelo gateway
> WebSocket (`ticket.called`, `counter.opened`, `panel.updated`, `joinER.denied`) está em
> [Arquitetura Backend](./arquitetura-backend.md), seção *Painel TV*.

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

> Seguir o padrão interno da organização. Se não houver padrão obrigatório, Prisma tende a ser a opção mais produtiva para o MVP pela tipagem forte e simplicidade.
> 

---

## 7. Autenticação

Como o MVP não terá integração com base oficial de REs nem com PDV, a autenticação pode ser própria do SaaS.

### 7.1 Representante

Opções:

- telefone + OTP;
- telefone + senha;
- CPF/código de RE + senha.

Recomendação:

> Telefone celular + OTP, com CPF e código de RE no cadastro.
> 

Se OTP/SMS for caro ou complexo para o piloto, usar telefone + senha.

O acesso público começa por uma URL assinada emitida na administração:

- QR Code: token JWT derivado do segredo da aplicação, vinculado ao ER e ao canal
  `QR_CODE`, com validade de 30 dias;
- link alternativo: mesmo vínculo, canal `LINK` e validade de 24 horas;
- o token viaja no fragmento `#entry=...`, é enviado ao backend no header
  `x-entry-token` e nos DTOs de login/cadastro;
- o JWT da representante replica `erId` e `entryChannel`; a criação da senha
  rejeita troca de ER ou canal;
- autenticação e criação de senha usam quotas contextuais por IP, ER e canal.

Não há CAPTCHA no MVP. O token assinado, a expiração e as quotas são as barreiras
de automação adotadas nesta fase.

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

### 7.3 Sessão da equipe no cliente

- O backend assina um JWT com as claims `userId`, `role`, `erId`, `sv` (sessionVersion) e `exp`.
- No frontend, **o JWT é a única fonte de verdade** de identidade/perfil/ER: a SPA decodifica o token e nunca confia em chaves separadas e graváveis (`staffRole`/`erId`). Manipular o storage não escala privilégio, pois exigiria um token validamente assinado.
- `sessionStorage` guarda o JWT da sessão, o nome de exibição e, no fluxo público,
  o token/canal já validados para o ER atual. O acesso a essas chaves é
  centralizado em `auth/session.ts`.
- Todas as chamadas autenticadas das telas de staff, inclusive telemetria em segundo plano, usam o client central. Qualquer `401` limpa a sessão, emite `SESSION_EXPIRED_EVENT` e devolve a tela ao formulário de login.
- Revogação imediata: o logout, a troca de senha e a desativação de conta incrementam `sessionVersion` no backend; o token anterior deixa de validar.

> Endurecimento futuro (backend): mover o token para cookie `HttpOnly`+`Secure`+`SameSite` e adotar refresh token rotativo, eliminando o token do alcance de scripts no navegador.

### 7.4 Minimização de PII no check-in assistido

- A busca de representantes (`GET /representatives/search`) e o cadastro assistido
  (`POST /representatives`) devolvem **CPF e telefone sempre mascarados** (ex.:
  `***.***.344-**`, `(**) *****-0000`). O valor completo nunca chega ao navegador do
  atendente; os últimos dígitos bastam para conferência visual.
- O mascaramento é centralizado no backend (`common/pii-mask.ts`), garantindo formato
  único entre busca e cadastro. A busca continua escopada ao ER do solicitante.

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

> A lista de endpoints **implementada e atual** — com métodos, perfis, parâmetros e
> exemplos de payload — vive em [Arquitetura Backend](./arquitetura-backend.md), seção
> *Referência de API*. O esboço original previa um WebSocket em `/ws/queues/:erId`; a
> implementação adotou **Socket.IO** com o evento `joinER` e salas por ER. Consulte a
> arquitetura como fonte da verdade.

---

## 10. Modelo mínimo de dados

> O modelo de dados **implementado** (entidades, nomes e relacionamentos reais) está em
> [Arquitetura Backend](./arquitetura-backend.md), seção *Modelo de dados*, e tem como
> fonte canônica `apps/backend/prisma/schema.prisma`. O esboço inicial (tabelas em
> `snake_case`) foi superado pelo schema Prisma atual e foi removido daqui para evitar
> divergência.

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

## 12. O que não colocar no MVP

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

Para o MVP, a stack mínima correta é:

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

---

## Documentação relacionada

- [README](../README.md) — setup local e infraestrutura necessária
- [Arquitetura Backend](./arquitetura-backend.md) — estado como construído (fonte da verdade)
- [Arquitetura Frontend](./arquitetura-frontend.md)
- [MVP — escopo e validação](./mvp.md) · [Deploy do MVP](./deployment-mvp.md)
