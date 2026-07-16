# Deploy do MVP

← [Voltar ao README](../README.md) · [Arquitetura Backend](./arquitetura-backend.md) · [Arquitetura Frontend](./arquitetura-frontend.md)

> **Escopo deste documento.** Descreve a infraestrutura usada para **validar o MVP**
> (hospedagem estática, container e PostgreSQL gerenciado). Os fornecedores citados
> aqui são a implementação concreta atual, **não a infraestrutura-alvo corporativa**.
> Os requisitos independentes de fornecedor estão no
> [README → Infraestrutura necessária](../README.md#infraestrutura-necessária). Ao
> migrar para a infraestrutura definitiva, substitua os fornecedores por infraestrutura aprovada pela
> organização, preservando os requisitos (TLS, secrets manager, banco gerenciado,
> WebSocket com upgrade, observabilidade).

## Arquitetura

- Front-end React servido por Nginx ou static hosting/CDN.
- API NestJS em uma única instância de container.
- PostgreSQL gerenciado com backup e restauração habilitados.
- HTTPS terminado no load balancer/ingress; WebSocket deve aceitar upgrade.
- Segredos injetados pelo secrets manager da plataforma.

O backend do MVP roda em **instância única** e não deve escalar horizontalmente sem
sticky sessions ou adaptador Socket.IO compartilhado. Além do WebSocket, o rate-limit
e a trava de brute-force também guardam estado em memória por processo. Esses dois
pontos estão registrados em [Débitos técnicos → DT-1 e DT-2](./debitos-tecnicos.md);
Redis permanece fora do escopo do MVP e é o caminho para ambos ao escalar.

## Perfil de carga e capacidade (entrega corporativa)

> Base de dimensionamento para o **go-live corporativo** (não para a validação do MVP).
> Os números do alvo valem **desde o go-live**, não como horizonte futuro: o
> provisionamento inicial na nuvem corporativa já deve sustentá-los — e o **alvo é um
> piso de planejamento, não um teto** (ver "Por que 300 mil não é teto" abaixo).

| Dimensão | Linha de base (hoje) | Alvo mínimo (go-live) |
|---|---|---|
| ERs | 1.800+ | 5.000 |
| Pedidos/dia | ~180 mil | ~300 mil (piso, não teto) |
| Distribuição | Nacional (Brasil) | Nacional (Brasil) |

> "Pedido" é a transação de negócio; "atendimento" é a senha na fila deste sistema. Para
> capacidade são da mesma ordem de grandeza — atendimentos podem ser um pouco maiores (há
> não comparecimento/cancelamento sem pedido). Refine com a medição de campo do piloto.

**Perfil derivado do alvo (~300 mil/dia)** — estimativas, com os pressupostos: ~10h de
operação/dia, fator de pico ~3× e ~5–7 eventos de auditoria por atendimento.

- **Throughput HTTP:** ~250–500 req/s no pico do ciclo de atendimento (média ~8/s de
  atendimentos, pico ~25/s). Compute **não** é o gargalo — alguns Node sustentam isso com
  folga; o nº de instâncias é guiado por WebSocket e disponibilidade, não por CPU.
- **Conexões WebSocket simultâneas:** ordem de **15–25 mil no pico nacional** (≈1 TV por ER
  mais as telas de operadora e gestora). É guiado pela quantidade de **ERs/telas**, não pelo
  volume de pedidos, e é o **dimensionamento dominante**.
- **Crescimento de dados:** ~110M de tickets/ano e **~550–770M de eventos de `AuditEvent`/ano**
  (ver [Débitos técnicos → DT-15](./debitos-tecnicos.md#dt-15--volume-do-auditevent-em-escala-particionamento-e-retenção)).
  É a maior pressão de escala.
- **Pool de conexões:** com múltiplas instâncias × pool do Prisma, o `max_connections` do
  Postgres vira limite; coloque **RDS Proxy/PgBouncer** (ou equivalente) à frente do banco.

**Consequências de arquitetura já no go-live:**

- Multi-instância com **store compartilhado (Redis)** é pré-requisito de **capacidade**, não
  só de disponibilidade: nesse volume de WebSockets uma instância única não basta, e
  [DT-1/DT-2](./debitos-tecnicos.md) quebram sem o adaptador. _Sticky sessions não resolve_
  — clientes do mesmo ER caem em instâncias diferentes e o fan-out da sala dessincroniza.
- **Particionar e definir retenção** do `AuditEvent` deixa de ser opcional nesse volume —
  ver [DT-15](./debitos-tecnicos.md#dt-15--volume-do-auditevent-em-escala-particionamento-e-retenção)
  e a política de retenção/LGPD.

**Por que 300 mil não é teto.** A aplicação é **stateless** (identidade no JWT) e o estado
volátil (WebSocket, rate-limit, trava de brute-force) migra para um **store compartilhado
(Redis)** — então a camada de aplicação **escala horizontalmente**: mais carga = mais
instâncias, de forma ~linear, sem reescrita. O banco escala por **vertical + réplicas de
leitura** (a fila é por ER e por dia, então as consultas particionam naturalmente) e o
`AuditEvent` por **particionamento + arquivamento**. Logo, 300 mil é o piso que o
provisionamento inicial deve cobrir; ultrapassá-lo é adicionar instâncias e capacidade de
banco, não rearquitetar. Para o alvo **não virar teto na prática**, recomenda-se:
**autoscaling** da camada de aplicação (sem nº fixo de instâncias), **ElastiCache**
dimensionado para o pico de WebSockets, e **headroom de ~2×** em storage/IO do RDS e na
retenção do `AuditEvent`. Os pré-requisitos são [DT-1/DT-2](./debitos-tecnicos.md) (Redis)
e [DT-15](./debitos-tecnicos.md#dt-15--volume-do-auditevent-em-escala-particionamento-e-retenção)
(particionamento) — sem eles, instância única + tabela única tornam até volumes menores um teto.

**Variáveis a confirmar em campo** (dominam o sizing e já são observáveis no piloto):

- número de telas WebSocket simultâneas por ER (TV + operadoras + gestora);
- cadência de polling das telas (`overview`, `my-status`), que define a baseline HTTP e a
  pressão sobre o pool do banco.

## Variáveis obrigatórias

- `DATABASE_URL`
- `JWT_SECRET`
- `FRONTEND_URL` — origem do frontend para o CORS; aceita lista separada por vírgula
  quando houver mais de um domínio (ex.: hml e prod corporativos)
- `OBSERVABILITY_TOKEN`

Valores locais de `.env` não devem ser promovidos. Use um segredo JWT aleatório com pelo
menos 32 bytes e rotacione-o conforme a política do ambiente.

### Variáveis opcionais

- `TRUST_PROXY_HOPS` (default `1`) — número de proxies confiáveis à frente do backend.
  Define de qual posição do `X-Forwarded-For` o `req.ip` (base do rate-limit) é extraído.
  Render = `1`; CDN + load balancer = `2`. Um valor maior que o real torna o IP
  **falsificável** (burla o rate-limit); menor agrupa clientes distintos no mesmo balde.
- `QUEUE_ENTRY_QR_CODE_TTL_SECONDS` e `QUEUE_ENTRY_LINK_TTL_SECONDS` (default `86400` = 24h
  cada) — validade dos tokens de entrada por canal (QR Code / link). A sessão da
  representante expira sempre no fim do dia útil, independente desses valores; o QR da TV
  recebe tokens novos automaticamente, enquanto QR impresso/estático precisa ser renovado.
- `THROTTLE_GLOBAL_PER_MINUTE` (default `300`), `THROTTLE_REGISTER_PER_MINUTE` (default
  `20`), `THROTTLE_LOGIN_PER_MINUTE` (default `40`), `THROTTLE_GUEST_ENTRY_PER_MINUTE`
  (default `20`) e `THROTTLE_TICKET_CREATE_PER_MINUTE` (default `40`) — limites de
  rate-limit por minuto. Requisição autenticada conta por usuário (JWT verificado);
  anônima conta por IP. Eleve os limites anônimos (register/login/guest-entry) para
  eventos com muita gente no mesmo Wi-Fi/NAT e reverta depois.

### Integração M2M (quando habilitada)

Em produção, configure apenas a validação como *resource server* — apontando para o
emissor corporativo (Apigee): `INTEGRATION_JWT_ISSUER`, `INTEGRATION_JWT_AUDIENCE` e
`INTEGRATION_JWKS_URI`. Quando `INTEGRATION_JWKS_URI` está definido, `INTEGRATION_JWT_ISSUER`
e `INTEGRATION_JWT_AUDIENCE` são **obrigatórios**: o backend falha no boot (fail-closed) se
faltarem, garantindo que nunca aceite um token RS256 emitido para outra audience daquele JWKS.
As variáveis `INTEGRATION_DEV_*`, `INTEGRATION_DOCS_ENABLED` e `APP_DOCS_ENABLED`
são **exclusivas de desenvolvimento** e não devem ser promovidas (o emissor de dev já
fica bloqueado fora de `development`/`test`; as UIs de documentação só devem subir em
produção por decisão explícita). Equivalências dev × produção em
[`arquitetura-backend.md`](arquitetura-backend.md#local-dev--produção-corporativo).

## Publicação

1. Execute lint, builds, testes unitários, e2e e `npm audit`.
2. Construa as imagens com os Dockerfiles de produção.
3. Aplique `prisma migrate deploy` como etapa one-shot antes de liberar a nova versão.
4. Publique o backend e aguarde `GET /health/ready`.
5. Publique o front-end e valide `/healthz`, `/api/health/live` e o WebSocket.
6. Em `/admin`, copie o acesso assinado do ER e gere o QR Code com a URL completa.

Tags Git `v*` publicam imagens versionadas de backend, migration e frontend no registry
de imagens (GHCR no MVP). O deploy no ambiente corporativo deve promover essas mesmas
imagens a partir do registry da organização, sem reconstrução.

`compose.prod.yml` executa a migration em um serviço one-shot e é uma referência para
ambiente de container único. Em produção corporativa, prefira banco gerenciado e ingress
HTTPS.

> Regras operacionais de migrations (paridade, pipeline e segurança) vivem em
> [`apps/backend/CLAUDE.md`](../apps/backend/CLAUDE.md).

## Ambientes (Preview e Produção)

> No MVP, esses ambientes são providos por GitHub/Vercel. Em ambiente corporativo,
> mapeie-os para o pipeline e os ambientes equivalentes da organização.

- Pull requests e branches geram o ambiente **Preview**.
- `master` gera o ambiente **Production**.
- Antes de promover uma mudança de contrato entre frontend e backend, valide o
  frontend compatível em Preview e publique-o em Production primeiro.
- Depois do deploy, valide a raiz do frontend e `/api/health/live`.

## Acessos assinados da fila

- O admin entrega duas URLs por ER: QR Code presencial e link alternativo.
- O token fica em `#entry=...`, não na query string, para não ser enviado em
  referrers ou logs HTTP comuns.
- QR Code e link expiram em 24h por padrão (configurável por env, ver acima). A
  validade aparece na administração. O QR exibido na TV é atualizado automaticamente.
- Para QR impresso/estático, ao expirar, abra **Gerenciar ER**, copie a URL atual e
  regenere o QR Code. Links distribuídos também precisam ser renovados.
- Links antigos sem `#entry=` deixam de funcionar. Regere os QR Codes existentes
  na implantação desta versão.
- O backend limita autenticação e criação de senha por IP, com uma trava adicional
  por credencial no login (imune a NAT/rotação de IP). CAPTCHA permanece fora do
  escopo do MVP.

Quando uma entrega não altera schema nem migrations, não há migration a aplicar no banco.

## Segurança de borda

O frontend é servido com cabeçalhos de hardening aplicados na borda. A referência
canônica é `apps/frontend/nginx.conf` (container). No MVP, há também
`apps/frontend/vercel.json` espelhando os mesmos cabeçalhos para a Vercel; ao trocar de
borda (CDN/proxy reverso corporativo), replique a configuração do nginx mantendo os
cabeçalhos equivalentes:

- `Content-Security-Policy` restritiva: `default-src 'self'`, `object-src 'none'`,
  `frame-ancestors 'none'`, scripts só de origem própria. Fontes do Google liberadas em
  `style-src`/`font-src`. O `connect-src` libera o backend (REST + WebSocket): mesma
  origem quando o backend é exposto via proxy interno do nginx; quando a borda apenas
  serve estáticos e não faz proxy do backend (caso da Vercel no MVP), o `connect-src`
  precisa listar o domínio do backend, pois o WebSocket não passa por rewrite.
- `X-Frame-Options: DENY` e `frame-ancestors 'none'` contra clickjacking.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` desativando câmera/microfone/geolocalização.
- `Strict-Transport-Security` (HSTS) com um ano e `includeSubDomains`.

> Ao adicionar um novo destino de rede (ex.: domínio de backend ou CDN), atualize o
> `connect-src` em toda configuração de borda em uso (no MVP, `nginx.conf` e
> `vercel.json`), senão o navegador bloqueia a chamada em produção.

## Observabilidade

- Logs HTTP são emitidos em JSON para stdout, sem corpo, credenciais ou dados da RE.
- Liveness: `GET /health/live`.
- Readiness com banco: `GET /health/ready`.
- Métricas Prometheus: `GET /observability/metrics`, protegida por bearer token quando
  `OBSERVABILITY_TOKEN` está configurado.
- Centralize stdout e alerte para taxa de 5xx, indisponibilidade, latência e falha de
  readiness.

## Backup e rollback

- Habilite backup diário e point-in-time recovery no PostgreSQL gerenciado.
- Teste restauração antes do piloto.
- Para rollback de aplicação, volte à imagem anterior. Não reverta migrations destrutivas
  automaticamente.
- Preserve `AuditEvent`; ele é a evidência operacional e a fonte das métricas históricas.

## Piloto

O critério 12 do Spec 0 exige medição em campo. Antes do go-live, registre por turno:

- tempo e quantidade de ações da operadora por atendimento;
- duração média do fluxo antes e depois da solução;
- incidentes, necessidade de ajuda e correções manuais;
- percepção das operadoras em escala simples de 1 a 5.

Considere aprovado apenas com amostra acordada pela operação e sem aumento significativo
frente à linha de base definida pelo responsável do piloto.

---

## Documentação relacionada

- [README](../README.md) — setup local, comandos e infraestrutura necessária (agnóstica de fornecedor)
- [Arquitetura Backend](./arquitetura-backend.md) · [Arquitetura Frontend](./arquitetura-frontend.md)
- [Stack técnica do MVP](./stack-mvp.md) · [MVP — escopo e validação](./mvp.md)
