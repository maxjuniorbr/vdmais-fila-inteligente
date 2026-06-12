# Deploy do MVP 0

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

## Publicação

1. Execute lint, builds, testes unitários, e2e e `npm audit`.
2. Construa as imagens com os Dockerfiles de produção.
3. Aplique `prisma migrate deploy` como etapa one-shot antes de liberar a nova versão.
4. Publique o backend e aguarde `GET /health/ready`.
5. Publique o front-end e valide `/healthz`, `/api/health/live` e o WebSocket.
6. Gere o QR Code do ER apontando para `/fila/:erId`.

Tags Git `v*` publicam imagens versionadas de backend, migration e frontend no GHCR. O
deploy no ambiente corporativo deve promover essas mesmas imagens, sem reconstrução.

`compose.prod.yml` executa a migration em um serviço one-shot e é uma referência para
ambiente de container único. Em produção corporativa, prefira banco gerenciado e ingress
HTTPS.

> Regras operacionais de migrations (paridade, pipeline e segurança) vivem no AI
> steering `.kiro/steering/database-migrations.md`.

## Segurança de borda

O frontend é servido com cabeçalhos de hardening aplicados na borda (definidos em
`apps/frontend/nginx.conf` para o container e em `apps/frontend/vercel.json` para a
Vercel; os dois devem permanecer equivalentes):

- `Content-Security-Policy` restritiva: `default-src 'self'`, `object-src 'none'`,
  `frame-ancestors 'none'`, scripts só de origem própria. Fontes do Google liberadas em
  `style-src`/`font-src`. O `connect-src` libera o backend (REST + WebSocket): mesma
  origem no Nginx (proxy interno) e o domínio do backend na Vercel (o WebSocket não passa
  pelo rewrite).
- `X-Frame-Options: DENY` e `frame-ancestors 'none'` contra clickjacking.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` desativando câmera/microfone/geolocalização.
- `Strict-Transport-Security` (HSTS) com um ano e `includeSubDomains`.

> Ao adicionar um novo destino de rede (ex.: domínio de backend ou CDN), atualize o
> `connect-src` nos dois arquivos, senão o navegador bloqueia a chamada em produção.

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
