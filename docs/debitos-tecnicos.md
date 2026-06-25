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
| [DT-11](#dt-11--pausaretoma-de-senha-pela-gestora-sem-ui) | Pausa/retoma de senha pela gestora sem UI — ✅ resolvido | Baixa | Não |
| [DT-12](#dt-12--qr-code-digital-sem-rotação-automática) | QR Code digital sem rotação automática | Baixa | Não |
| [DT-13](#dt-13--mensagem-de-sessão-expirada-genérica-para-a-re) | Mensagem de sessão expirada genérica para a RE | Baixa | Não |
| [DT-14](#dt-14--cadastro-mínimo-da-re-será-descontinuado) | Cadastro mínimo da RE será descontinuado | Baixa | Não |
| [DT-15](#dt-15--volume-do-auditevent-em-escala-particionamento-e-retenção) | Volume do AuditEvent em escala (particionamento/retenção) | Média | Não |

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

No [alvo corporativo](./deployment-mvp.md#perfil-de-carga-e-capacidade-entrega-corporativa)
(5.000 ERs / ~300k pedidos/dia), isso deixa de ser endurecimento adiável e vira
**pré-requisito de capacidade no go-live**: o volume já exige múltiplas instâncias.

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

No [alvo corporativo](./deployment-mvp.md#perfil-de-carga-e-capacidade-entrega-corporativa)
(~15–25 mil WebSockets simultâneos no pico nacional), o adaptador Redis é **pré-requisito
de capacidade no go-live**, não opcional. Sticky sessions **não serve** aqui: clientes do
mesmo ER caem em instâncias diferentes e o fan-out da sala `er:<erId>` dessincroniza.

---

## DT-3 — Log de IP por requisição (LGPD)

**Contexto.** O [`RequestLoggingInterceptor`](../apps/backend/src/observability/request-logging.interceptor.ts)
registra `ip`, `userId`, `erId` e `role` em 100% das requisições. Corpos, senhas e
tokens **não** são logados. O IP é útil para investigação de segurança e correlação de
abuso.

**Impacto (LGPD).** Em uso nacional, isso acumula a correlação IP ↔ pessoa autenticada
(revendedora ou equipe) em toda a retenção de logs — dado pessoal sob a LGPD, sem
mascaramento, amostragem ou política de retenção explícita.

**Encaminhamento.** Decisão de produto/SI: manter como está (justificado por segurança),
**hashear/truncar** o IP no log, ou amostrar. Reavaliar na revisão de LGPD/SI da entrega
corporativa. A retenção do `AuditEvent` em escala — tema próximo, pelo ângulo do banco —
está em [DT-15](#dt-15--volume-do-auditevent-em-escala-particionamento-e-retenção).

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
corrigidos upstream: `@nestjs/platform-express` fixa o `multer` (DoS), a stack do
Socket.IO arrasta o `ws` (DoS), e `cosmiconfig` (via `@nestjs/cli`) + `@nestjs/swagger`
arrastam o `js-yaml` < 4.2.0 (DoS quadrático em merge keys — GHSA-h67p-54hq-rp68). Como
`npm audit --audit-level=high` é gate de CI
([README → CI e segurança](../README.md#integração-contínua-e-segurança)), o `package.json`
raiz usa `overrides` para forçar versões corrigidas (`multer`, `ws`, `form-data`,
`js-yaml ^4.2.0`) sem subir o major do NestJS — que `npm audit fix --force` faria,
rebaixando-o.

**Impacto.** Os overrides são uma trava manual: o Dependabot não os atualiza sozinho e
podem mascarar incompatibilidades se um pacote pai passar a exigir uma faixa diferente.
Risco baixo — patches dentro do mesmo major, validados por unit + e2e.

**Resíduo conhecido (js-yaml 3.x).** O `@istanbuljs/load-nyc-config` (transitivo de
**dev**, via babel-plugin-istanbul/jest) fixa `js-yaml` **3.x**, que não tem patch para
a GHSA-h67p-54hq-rp68 (a correção é a linha 4.x) e quebraria se forçado a 4.x (`safeLoad`
removido). Por isso há um override aninhado mantendo-o em `^3.14.2`. É **dev-only**, sem
superfície real (só parseia configs de cobertura nossas, não entrada não confiável) e
abaixo do gate `high`; aceito até o `load-nyc-config` (sem manutenção) sair da árvore.

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

---

## DT-11 — Pausa/retoma de senha pela gestora sem UI

> **✅ Resolvido.** A `ManagerPage` passou a expor a ação.

**Contexto.** O backend aceita `MANAGER` em `POST /tickets/:id/staff-pause` e
`/staff-resume` ([ticket.controller.ts](../apps/backend/src/ticket/ticket.controller.ts)),
cobrindo o caso cross-caixa que a [§9.5.1 do mvp.md](./mvp.md) reserva à gestora. A UI da
gestora ([`ManagerPage`](../apps/frontend/src/pages/ManagerPage.tsx)) não expunha a ação —
os botões viviam só na tela da operadora (`OperationPage`, perfil `OPERATOR`).

**Resolução.** A `ManagerPage` agora oferece **Pausar senha** nas senhas ativas da "Fila
ativa" — inclusive uma em atendimento em **outro caixa** (cross-caixa), que libera aquele
caixa — e **Retomar senha** na seção "Senhas pausadas", ambas cobertas por testes.

---

## DT-12 — QR Code digital sem rotação automática

**Contexto.** O QR Code de entrada será exibido em **mídia digital** (a própria TV/painel),
não impresso. O token do QR já vale só **24h** (`QUEUE_ENTRY_QR_CODE_TTL_SECONDS`), e a
sessão da representante expira no dia corrente
([auth.service.ts](../apps/backend/src/auth/auth.service.ts)). Porém **nada regenera o QR
exibido automaticamente**: ao expirar, alguém precisa abrir **Gerenciar ER** e regenerar a
URL **manualmente** a cada dia.

**Impacto.** Operacional: depende de uma ação manual diária; se esquecida, o QR exibido para
de funcionar até ser regenerado. Sem brecha de segurança — o token é assinado/vinculado ao
ER/canal, a sessão dura só o dia, e há limite por IP + trava por credencial.

**Encaminhamento.** Automatizar a rotação diária do QR digital (a TV/admin regenera/serve um
token novo a cada dia útil), eliminando o passo manual. Toca frontend (TV/admin) — avaliar
junto com o frontend.

---

## DT-13 — Mensagem de sessão expirada genérica para a RE

**Contexto.** A sessão da representante agora expira no fim do dia útil
([auth.service.ts](../apps/backend/src/auth/auth.service.ts)). Quando isso acontece (ou o
token de entrada expira), a próxima chamada recebe `401` e o frontend cai no fluxo genérico
de sessão expirada — limpa a sessão e volta ao formulário de entrada/login, sem uma
mensagem contextual ("sua sessão do dia expirou, entre novamente").

**Impacto.** Apenas UX: a RE vê a tela de entrada padrão em vez de um aviso amigável. Sem
efeito funcional ou de segurança — o fluxo `notifySessionExpired()`/`SESSION_EXPIRED_EVENT`
já trata o `401` corretamente.

**Encaminhamento.** Adicionar, na tela da RE, uma mensagem amigável quando a sessão do dia
expira (ex.: aviso contextual antes de reabrir o login). Toca frontend — avaliar junto com
o frontend. Relacionado a [DT-12](#dt-12--qr-code-digital-sem-rotação-automática).

---

## DT-14 — Cadastro mínimo da RE será descontinuado

**Contexto.** Hoje há um cadastro mínimo da representante
([auth.service.ts](../apps/backend/src/auth/auth.service.ts) `createRepresentative`), conforme
§5 do [mvp.md](./mvp.md). A direção de produto é **eliminar essa fricção** num momento
futuro: usar a autenticação do próprio app via API, ou — no cenário de ER com **QR Code
rotativo** — operar **sem cadastro**.

**Impacto.** Decisão de produto, sem efeito atual. A consequência prática agora é **não
investir** no cadastro que será descontinuado: os campos opcionais do §5 (e-mail, aceite de
termos/uso de dados, observação de check-in) **não serão adicionados**.

**Encaminhamento.** Em momento futuro, substituir o cadastro mínimo pela autenticação via
API do app / fluxo sem cadastro com QR rotativo, e então reavaliar §5 (cadastro) e §6
(jornadas) do [mvp.md](./mvp.md). Toca backend (auth) e frontend.

---

## DT-15 — Volume do AuditEvent em escala (particionamento e retenção)

**Contexto.** Cada atendimento gera ~5–7 eventos de ciclo de vida em `AuditEvent`
(criação, chamada, início, fim/não comparecimento/cancelamento), além dos eventos de caixa
e de abertura/fechamento de dia. A tabela é **append-only** e é a fonte das métricas
históricas — não pode ser truncada sem perder evidência operacional
([deployment-mvp.md → Backup e rollback](./deployment-mvp.md)).

**Impacto (escala/volume).** No [alvo corporativo](./deployment-mvp.md#perfil-de-carga-e-capacidade-entrega-corporativa)
(~300k pedidos/dia), a tabela cresce **~550–770M de linhas/ano** (estimativa; já hoje, com
~180k/dia, são ~390M/ano). Em tabela única sem particionamento, isso degrada escrita, índices,
vacuum e o custo de storage do banco gerenciado ao longo do tempo. Soma-se a ausência de **política de retenção** explícita
— também levantada, pelo ângulo dos logs, na [DT-3](#dt-3--log-de-ip-por-requisição-lgpd).

**Encaminhamento.** Na entrega corporativa, **particionar `AuditEvent` por data**
(mensal/diária) e definir uma **política de retenção/arquivamento** (ex.: dados quentes no
Postgres, frios em storage de objeto/data lake), alinhada à revisão de LGPD/SI. Decidir os
alvos de retenção junto com RPO/RTO ([deployment-mvp.md → Backup e rollback](./deployment-mvp.md)).
Sem impacto em runtime hoje; é dimensionamento e governança de dados para o volume-alvo.
