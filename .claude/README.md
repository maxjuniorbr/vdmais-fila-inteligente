# `.claude/` — comandos invocáveis pelo usuário

Itens deste diretório que **você chama** no chat do Claude Code. Detalhes mínimos de
como invocar cada um. (Itens de bastidores — agentes orquestrados — listados ao final.)

## Comandos / skills (você digita `/<nome>`)

### `/commit`
Assistente de commit do projeto: valida (`lint`, `build`, cobertura 90%), analisa o
working tree, cria commits bem-escopados no padrão `<type>: <descrição>` (linha única,
inglês, ≤72 chars) e roda gates pós-commit.

- Como chamar: `/commit`
- Sem argumentos. Commita o que estiver no working tree, agrupado por unidade lógica.

### `/security-audit`
Orquestra a auditoria de segurança: particiona o repo em superfícies pequenas, dispara
um auditor por superfície (fan-out), faz a triagem e — **sob sua aprovação** — corrige
código (via `security-fixer`) ou atualiza dependência (via `dependency-updater`),
commitando pelo `/commit`. Nada é commitado sem seu OK.

- `/security-audit` → sweep completo (audita todas as superfícies, uma a uma).
- `/security-audit <superfície>` → uma superfície nomeada. Valores: `authn`, `authz`,
  `integration`, `panel`, `validation`, `pii`, `devsurfaces`, `observability`,
  `bootstrap`, `frontend-auth`, `frontend-xss`, `dependencies`, `ci`.
- `/security-audit <caminho>` → um caminho específico, ex.: `/security-audit apps/backend/src/auth`.
- **Recomendado:** por causa do tamanho do repo, rode **uma superfície por vez** em vez
  de depender só do sweep completo. Ordem sugerida por risco: `authn` → `authz` → `pii`
  → `frontend-auth` → `dependencies` → `bootstrap` → `ci`.

## Bastidores — agentes (não chamados diretamente; o `/security-audit` os orquestra)

Você normalmente não invoca estes na mão; o `/security-audit` cuida disso. Listados só
para referência:

- `security-auditor` — read-only; audita um escopo e devolve achados priorizados.
- `security-fixer` — aplica a correção mínima de um achado e **só commita após sua aprovação**.
- `dependency-updater` — aplica um bump aprovado na `master`, valida, commita via
  `/commit` e fecha o PR do Dependabot (nunca trabalha na branch do PR).
