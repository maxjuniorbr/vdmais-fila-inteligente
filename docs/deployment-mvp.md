# Deploy do MVP 0

← [Voltar ao README](../README.md) · [Arquitetura Backend](./arquitetura-backend.md) · [Arquitetura Frontend](./arquitetura-frontend.md)

> **Escopo deste documento.** Descreve a infraestrutura usada para **validar o MVP**
> (hospedagem estática, container e PostgreSQL gerenciado). Os fornecedores citados
> aqui são a implementação concreta atual, **não a infraestrutura-alvo corporativa**.
> Os requisitos independentes de fornecedor estão no
> [README → Infraestrutura necessária](../README.md#infraestrutura-necessária). Ao
> internalizar o sistema, substitua os fornecedores por infraestrutura aprovada pela
> organização, preservando os requisitos (TLS, secrets manager, banco gerenciado,
> WebSocket com upgrade, observabilidade).

## Arquitetura

- Front-end React servido por Nginx ou static hosting/CDN.
- API NestJS em uma única instância de container.
- PostgreSQL gerenciado com backup e restauração habilitados.
- HTTPS terminado no load balancer/ingress; WebSocket deve aceitar upgrade.
- Segredos injetados pelo secrets manager da plataforma.

O backend do MVP 0 não deve escalar horizontalmente sem sticky sessions ou adaptador
Socket.IO compartilhado. Redis permanece fora deste escopo.

## Variáveis obrigatórias

- `DATABASE_URL`
- `JWT_SECRET`
- `FRONTEND_URL`
- `OBSERVABILITY_TOKEN`

Valores locais de `.env` não devem ser promovidos. Use um segredo JWT aleatório com pelo
menos 32 bytes e rotacione-o conforme a política do ambiente.

### Integração M2M (quando habilitada)

Em produção, configure apenas a validação como *resource server* — apontando para o
emissor corporativo (Apigee): `INTEGRATION_JWT_ISSUER`, `INTEGRATION_JWT_AUDIENCE` e
`INTEGRATION_JWKS_URI`. As variáveis `INTEGRATION_DEV_*` e `INTEGRATION_DOCS_ENABLED`
são **exclusivas de desenvolvimento** e não devem ser promovidas (o emissor de dev já
fica bloqueado fora de `development`/`test`). Equivalências dev × produção em
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
> [`.github/instructions/database-migrations.instructions.md`](../.github/instructions/database-migrations.instructions.md).

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
- O QR Code expira em 30 dias; o link alternativo expira em 24 horas. A validade
  aparece na administração.
- Ao expirar, abra **Gerenciar ER**, copie a URL atual e regenere o QR Code ou
  redistribua o link.
- Links antigos sem `#entry=` deixam de funcionar. Regere os QR Codes existentes
  na implantação desta versão.
- O backend limita autenticação e criação de senha por IP, ER e canal. CAPTCHA
  permanece fora do escopo do MVP.

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
