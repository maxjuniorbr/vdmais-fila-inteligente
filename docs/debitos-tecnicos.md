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
