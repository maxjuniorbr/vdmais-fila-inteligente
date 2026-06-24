# Débitos técnicos

← [Voltar ao README](../README.md) · [Arquitetura Backend](./arquitetura-backend.md) · [Deploy do MVP](./deployment-mvp.md)

> Registro vivo das pendências técnicas conhecidas — decisões adiadas, simplificações
> de MVP e pontos a endurecer antes da operação corporativa em escala. Cada item traz
> contexto, impacto (com atenção a uso nacional e em volume) e o encaminhamento.
> Atualize este arquivo quando um débito for criado, quitado ou reavaliado.

| # | Débito | Severidade | Bloqueia escala horizontal? |
|---|---|---|---|
| [DT-1](#dt-1--estado-de-rate-limit-e-trava-de-brute-force-em-memória) | Rate-limit e trava de brute-force em memória | Alta | Sim |
| [DT-2](#dt-2--websocket-socketio-sem-adaptador-compartilhado) | WebSocket sem adaptador compartilhado | Alta | Sim |
| [DT-3](#dt-3--log-de-ip-por-requisição-lgpd) | Log de IP por requisição (LGPD) | Média | Não |
| [DT-4](#dt-4--bcrypt-trunca-a-senha-em-72-bytes) | bcrypt trunca a senha em 72 bytes | Baixa | Não |
| [DT-5](#dt-5--dupla-contabilidade-de-migrations-e-deploy-manual) | Dupla contabilidade de migrations e deploy manual | Média | Não |
| [DT-6](#dt-6--major-do-prisma-adiado) | Major do Prisma adiado | Baixa | Não |
| [DT-7](#dt-7--overrides-de-dependências-para-patches-de-segurança) | Overrides de dependências para patches de segurança | Baixa | Não |
| [DT-8](#dt-8--complexidade-cognitiva-do-operationpage-acima-do-limite) | Complexidade cognitiva do OperationPage acima do limite | Baixa | Não |
| [DT-9](#dt-9--jwtauthguard-sem-spec-dedicado) | JwtAuthGuard sem spec dedicado | Baixa | Não |
| [DT-10](#dt-10--ticketid-opaco-nos-eventos-de-socket-do-painel) | ticketId opaco nos eventos de socket do painel | Baixa | Não |

---

## DT-1 — Estado de rate-limit e trava de brute-force em memória

**Contexto.** A proteção de autenticação tem duas camadas:
- limite por IP (`ThrottlerModule` + [`ContextualThrottlerGuard`](../apps/backend/src/common/guards/contextual-throttler.guard.ts)), anti-enxurrada grosseiro;
- trava por credencial ([`LoginThrottleService`](../apps/backend/src/auth/login-throttle.service.ts)), a defesa real contra brute-force, imune a NAT e a rotação de IP.

Ambas guardam o contador **em memória, por processo**.

**Impacto (escala/volume).** Com mais de uma instância do backend (escala horizontal,
esperada para uso nacional em volume), cada instância tem seu próprio contador: o
limite efetivo é multiplicado pelo número de instâncias e a trava por credencial deixa
de valer entre elas. Há poda de memória ([`PRUNE_THRESHOLD`](../apps/backend/src/auth/login-throttle.service.ts)),
então não é vazamento — é **perda de eficácia da proteção** ao escalar.

**Encaminhamento.** Migrar ambos os contadores para um store compartilhado (Redis):
storage do `@nestjs/throttler` em Redis e `LoginThrottleService` reescrito sobre o
mesmo Redis (com TTL nativo, dispensando a poda manual). Relacionado a [DT-2](#dt-2--websocket-socketio-sem-adaptador-compartilhado)
(mesma causa raiz: suposições de instância única). Ver [stack-mvp.md → Redis](./stack-mvp.md).

---

## DT-2 — WebSocket (Socket.IO) sem adaptador compartilhado

**Contexto.** O [`PanelGateway`](../apps/backend/src/panel/panel.gateway.ts) emite eventos
de fila por salas `er:<erId>` usando o adaptador in-process padrão do Socket.IO.

**Impacto (escala/volume).** Com múltiplas instâncias, um evento emitido na instância A
não chega aos sockets conectados na instância B — painéis de TV e telas de staff
ficariam dessincronizados conforme o load balancer distribui as conexões. Hoje o MVP
roda em **instância única** justamente por isso ([deployment-mvp.md](./deployment-mvp.md)).

**Encaminhamento.** Adotar o adaptador Redis do Socket.IO (pub/sub) ao escalar
horizontalmente, ou manter sticky sessions como paliativo. Decidir junto de [DT-1](#dt-1--estado-de-rate-limit-e-trava-de-brute-force-em-memória).

---

## DT-3 — Log de IP por requisição (LGPD)

**Contexto.** O [`RequestLoggingInterceptor`](../apps/backend/src/observability/request-logging.interceptor.ts)
registra `ip`, `userId`, `erId` e `role` em 100% das requisições. Corpos, senhas e
tokens **não** são logados. O IP é útil para investigação de segurança e correlação de
abuso.

**Impacto (LGPD).** Em uso nacional, isso acumula a correlação IP ↔ profissional de
saúde autenticado em toda a retenção de logs — dado pessoal sob a LGPD, sem
mascaramento, amostragem ou política de retenção explícita.

**Encaminhamento.** Decisão de produto/SI: manter como está (justificado por segurança),
**hashear/truncar** o IP no log, ou amostrar. Reavaliar na revisão de LGPD/SI da entrega
corporativa.

---

## DT-4 — bcrypt trunca a senha em 72 bytes

**Contexto.** Os DTOs aceitam senha de até 128 caracteres
([`register.dto.ts`](../apps/backend/src/auth/dto/register.dto.ts), `staff-login.dto.ts`),
mas o bcrypt ignora silenciosamente os bytes além de 72.

**Impacto.** Duas senhas que compartilham os primeiros 72 bytes são intercambiáveis.
Risco prático desprezível (ninguém usa senha > 72 caracteres).

**Encaminhamento.** A correção robusta (pré-hash SHA-256 antes do bcrypt, para suportar
o comprimento total) **invalidaria todas as senhas já cadastradas** — exige migração com
re-hash no próximo login. Adiado por baixo valor × custo. Alternativa barata: reduzir o
`@MaxLength` para 72 e comunicar o limite.

---

## DT-5 — Dupla contabilidade de migrations e deploy manual

**Contexto.** No piloto, o banco (Supabase) rastreia migrations pelo ledger
`supabase_migrations.schema_migrations` (por nome de pasta), não pelo `_prisma_migrations`
do Prisma. O Render **não** roda `prisma migrate deploy`, então as migrations são
aplicadas **manualmente** antes de cada release. Detalhe operacional em
[`apps/backend/CLAUDE.md`](../apps/backend/CLAUDE.md).

**Impacto.** Passo manual sujeito a esquecimento (API quebra ao referenciar coluna/tipo
inexistente) e duas fontes de verdade de migration enquanto durar o piloto.

**Encaminhamento.** Na entrega corporativa, padronizar o pipeline em
`prisma migrate deploy` como passo de release e reconciliar o histórico
(`prisma migrate resolve --applied <migration>` para cada migration já aplicada, depois
`migrate deploy`). Ver [`apps/backend/CLAUDE.md → At production delivery`](../apps/backend/CLAUDE.md).

---

## DT-6 — Major do Prisma adiado

**Contexto.** O Dependabot mantém `prisma`/`@prisma/client` em lockstep e **adia
deliberadamente** o próximo major ([README → CI e segurança](../README.md#integração-contínua-e-segurança)).

**Impacto.** Defasagem controlada; sem impacto funcional imediato.

**Encaminhamento.** Planejar a subida do major em janela dedicada, revisando o changelog
de breaking changes e rodando a suíte completa (unit + e2e) antes de promover.

---

## DT-7 — Overrides de dependências para patches de segurança

**Contexto.** Algumas dependências de runtime ainda fixam transitivos vulneráveis não
corrigidos upstream: `@nestjs/platform-express` fixa o `multer` (DoS) e a stack do
Socket.IO arrasta o `ws` (DoS). Como `npm audit --audit-level=high` é gate de CI
([README → CI e segurança](../README.md#integração-contínua-e-segurança)), o `package.json`
raiz usa `overrides` para forçar versões corrigidas (`multer`, `ws`, `form-data`) sem
subir o major do NestJS — que `npm audit fix --force` faria, rebaixando-o.

**Impacto.** Os overrides são uma trava manual: o Dependabot não os atualiza sozinho e
podem mascarar incompatibilidades se um pacote pai passar a exigir uma faixa diferente.
Risco baixo — patches dentro do mesmo major, validados por unit + e2e.

**Encaminhamento.** Remover cada override quando o pacote pai subir para uma versão que já
traga o transitivo corrigido; revisar na rotina do Dependabot. Relacionado a
[DT-6](#dt-6--major-do-prisma-adiado) (gestão de dependências).

---

## DT-8 — Complexidade cognitiva do OperationPage acima do limite

**Contexto.** O componente `OperationPage` (tela da operadora) tem complexidade cognitiva
16, um ponto acima do limite 15 do SonarQube (regra `typescript:S3776`). O smell é
**pré-existente** e vem da densidade de condicionais do render principal (cards de Caixa e
Senha atual), não da feature de atendimento preferencial — extrair a lista "Aguardando"
(`WaitingTicketRow`/`priorityMenuItem`) não reduziu o número. O Quality Gate segue verde
(a regra não bloqueia o gate).

**Impacto.** Apenas manutenibilidade — sem efeito em runtime, comportamento ou desempenho.
A tela funciona igual; a função é só mais difícil de ler e manter.

**Encaminhamento.** Decompor o `OperationPage` em subcomponentes (`CounterCard`,
`CurrentTicketCard`, etc.) num PR dedicado, com testes, até a complexidade ficar ≤ 15.

---

## DT-9 — JwtAuthGuard sem spec dedicado

**Contexto.** O [`JwtAuthGuard`](../apps/backend/src/common/guards/jwt-auth.guard.ts) é
apenas `extends AuthGuard('jwt')` — não tem lógica própria (nenhum override de
`canActivate`/`handleRequest`). A proteção real (validação do token, montagem do
usuário a partir do payload) vive na [`JwtStrategy`](../apps/backend/src/auth/jwt.strategy.ts),
que **é testada** em [`jwt.strategy.spec.ts`](../apps/backend/src/auth/__tests__/jwt.strategy.spec.ts).
Um spec do guard só exercitaria o `AuthGuard` do `@nestjs/passport` (código de
terceiro), não comportamento nosso.

**Impacto.** Apenas cobertura de testes formal — sem efeito em runtime ou segurança.
A lógica que importa já está coberta pela suíte da estratégia; um teste do guard vazio
seria redundante e de baixo valor.

**Encaminhamento.** Decisão consciente de **não** criar o spec enquanto o guard
permanecer sem lógica própria. Se algum dia ganhar um override (ex.: `handleRequest`
customizado para mensagens de erro ou claims extras), adicionar o teste dedicado nesse
momento.

---

## DT-10 — ticketId opaco nos eventos de socket do painel

**Contexto.** A TV (`clientType: 'panel'`) e o dashboard do staff entram na **mesma sala**
`er:${erId}` ([panel.gateway.ts](../apps/backend/src/panel/panel.gateway.ts)). Os eventos de
tempo real (`ticket.created`, `ticket.called`, `ticket.priority_changed`, etc.) levam o
`ticketId` (um cuid opaco) à sala, enquanto o payload HTTP `getState`
([panel.service.ts](../apps/backend/src/panel/panel.service.ts)) o sanitiza. Confirmado por
teste de contrato: **nenhuma PII real** (CPF, telefone, reCode, nome completo) trafega no
socket — só `ticketId`, código, nome **abreviado** e número do caixa.

**Impacto.** Baixo. `ticketId` não é PII (não reconstrói identidade) e o dashboard do staff
usa esse id para reconciliar o estado em tempo real. O acesso à sala é gated por **panel
token revogável** (hash SHA-256; (re)gerado em `POST /admin/ers/:erId/panel-token`), então a
audiência não é pública e o link pode ser rotacionado a qualquer momento — conexões novas
com o token antigo são barradas.

**Encaminhamento.** Decisão consciente de **aceitar** a assimetria por ora; um teste de
contrato fixa que nenhuma PII real vaza pelo socket. Se a TV precisar ser exposta a uma
audiência mais ampla, separar a sala pública (TV, eventos sem `ticketId`) da sala do staff
(payload completo) — mudança que também toca o frontend, a avaliar junto com o frontend.
