# Arquitetura — Frontend

← [Voltar ao README](../README.md) · [Arquitetura Backend](./arquitetura-backend.md)

---

## Visão geral

SPA (Single Page Application) construída em **React 18** com **TypeScript** e **Vite**. O build gera arquivos estáticos servidos por qualquer servidor HTTP ou CDN — sem dependência de runtime de servidor no frontend.

```
apps/frontend/src/
├── api/            # Cliente HTTP centralizado
├── auth/           # Sessão JWT, hooks de proteção de rota
├── components/     # Design system compartilhado
├── pages/          # Uma pasta por rota da aplicação
├── styles/         # Tokens de design (brand.ts + theme.css)
└── utils/          # Formatação de datas, durações e horários
```

---

## Rotas e páginas

| Rota | Página | Perfil | Descrição |
|---|---|---|---|
| `/` | `HomePage` | Público | Login da equipe (porta de entrada); após autenticar, roteia por perfil — perfil de área única redireciona direto, ADMIN vê o menu de áreas |
| `/fila/:erId` | `QueueEntryPage` | RE (público) | Entrada na fila via QR Code ou link |
| `/fila/:erId/senha` | `TicketConfirmationPage` | RE | Confirmação de senha e posição na fila |
| `/checkin` | `CheckinAttendantPage` | ATTENDANT | Check-in assistido — buscar/criar RE e gerar senha |
| `/operacao` | `OperationPage` | OPERATOR | Gestão do caixa e chamada de senhas |
| `/gestao` | `ManagerPage` | MANAGER | Abertura/fechamento do dia, métricas, correções |
| `/painel/:erId` | `PanelPage` | Público (token) | Painel TV com chamadas em tempo real |
| `/admin` | `AdminPage` | ADMIN | Configuração de ERs, caixas e contas |
| `/playground` | `PlaygroundPage` | Dev | Catálogo de componentes do design system |

**Proteção de rotas:** páginas de staff validam o JWT via hook `useStaffSession(allowedRoles)` na montagem. Sessão inválida ou expirada redireciona para `/` imediatamente.

---

## Sessão e autenticação

O JWT é armazenado em `sessionStorage` (não `localStorage`) — é limpado ao fechar a aba, sem persistência entre sessões.

```typescript
// auth/session.ts — funções principais
saveStaffSession(token, profile)  // persiste JWT após login
getStaffSessionProfile()          // decodifica claims do token atual
getStaffRole()                    // retorna Role da sessão ativa
getSessionERId()                  // retorna erId do staff logado
hasStaffSession(allowedRoles)     // valida sessão + role + expiração
clearSession()                    // logout — remove token e storage
notifySessionExpired()            // dispara SESSION_EXPIRED_EVENT global
```

```typescript
// Hook de proteção (páginas de área) — retorna boolean
const valid = useStaffSession(['OPERATOR', 'MANAGER'])
// Valida assinatura JWT, role e expiração
// Escuta SESSION_EXPIRED_EVENT; redireciona ao login se falhar

// Hook de perfil (telas que roteiam/renderizam por papel, ex.: HomePage)
const [profile, setProfile] = useStaffProfile()
// Retorna o StaffProfile (name/role/erId) ou null
// Mesmo tratamento de 401: SESSION_EXPIRED_EVENT zera o perfil para null
```

**Resposta 401 do backend:** o cliente HTTP central captura e dispara `SESSION_EXPIRED_EVENT` globalmente. Qualquer tela de staff que estiver ativa redireciona para `/` sem necessidade de lógica adicional por página.

---

## Cliente HTTP

Centralizado em `api/client.ts`. Todas as chamadas ao backend passam por ele.

```typescript
api.get<T>(path)              → Promise<T>
api.post<T>(path, body?)      → Promise<T>
api.patch<T>(path, body?)     → Promise<T>
api.delete<T>(path)           → Promise<T>
```

- Base URL: variável de ambiente `VITE_API_URL` (padrão: relativo `/api`)
- Header automático: `Authorization: Bearer <token>` quando há sessão ativa
- 401 automático: chama `notifySessionExpired()` antes de rejeitar a Promise

---

## Comunicação em tempo real (WebSocket)

Gerenciada pelo hook `useSocket`.

```typescript
const socket = useSocket(erId, clientType?, authToken?)
// Conecta ao montar, desconecta ao desmontar
// Emite joinER { erId, clientType, token? } ao conectar
// Retorna: instância Socket | null
```

Eventos que o frontend escuta:

| Evento | Payload | Quem recebe |
|---|---|---|
| `ticket.called` | `{ ticketId, code, displayName, counterNumber, calledAt }` | Painel TV, operação |
| `counter.opened` | `{ counterId, number }` | Painel TV |
| `panel.updated` | `{ event, payload }` | Painel TV (broadcast genérico) |
| `joinER.denied` | `{ erId }` | Painel TV (falha de autenticação) |

O painel TV (`clientType: 'panel'`) exige o token do painel no header de conexão. Dashboards de staff (`clientType: 'dashboard'`) aceitam o JWT do operador/gestor.

---

## Design system e tokens

O design system é definido em dois arquivos sincronizados:

- `styles/brand.ts` — fonte canônica em TypeScript (importada nos componentes)
- `styles/theme.css` — espelho em CSS custom properties (`var(--gb-*)`)

**Tokens de cor:**

| Token | Uso |
|---|---|
| `background` | Fundo de página |
| `non-interactive` | Texto/ícone secundário |
| `link` | Links e ações terciárias |
| `conversion-button` | CTA principal (verde) |
| `actionable` | Ação primária neutra |
| `non-primary-button` | Botão secundário |
| `disabled` | Estado desabilitado |
| `status.success/error/alert/info` | Badges e alertas |

**Escala de espaçamento:** 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 px

**Tipografia:** `display`, `heading`, `title`, `subtitle`, `body-large`, `body-small`, `auxiliar`

**Bordas:** `small`, `medium`, `large`, `pill`

---

## Componentes disponíveis

### Layout
| Componente | Descrição |
|---|---|
| `AppHeader` | Cabeçalho com menu do usuário |
| `SectionPanel` | Seção agrupada de conteúdo |
| `BrandMark` | Logo / identidade visual |

### Formulários
| Componente | Descrição |
|---|---|
| `Input` | Campo de texto |
| `Textarea` | Texto multilinha |
| `Select` | Seleção por dropdown |
| `Choice` | Grupo de radio/checkbox |
| `StaffLoginForm` | Formulário de autenticação de equipe |

### Botões e ações
| Componente | Variantes |
|---|---|
| `Button` | `primary`, `secondary`, `tertiary`, `conversion`, `warning` |
| `ActionMenu` | Menu de ações por dropdown |

### Dados e métricas
| Componente | Descrição |
|---|---|
| `Table` | Tabela com cabeçalho e linhas |
| `BarList` | Gráfico de barras horizontal |
| `MetricCard` | Card de KPI |
| `Badge` | Chip de estado/categoria |
| `StatusDot` | Indicador de estado por cor |
| `Skeleton` | Placeholder de carregamento |

### Feedback e sobreposições
| Componente | Descrição |
|---|---|
| `Toast` + `ToastProvider` | Notificações efêmeras |
| `Alert` | Banner persistente |
| `Modal` | Diálogo centralizado |
| `BottomSheet` | Painel inferior deslizável |
| `Drawer` | Painel lateral |
| `ConfirmDialog` | Prompt de confirmação |
| `CopyField` | Campo com copiar para área de transferência |

### Navegação e organização
| Componente | Descrição |
|---|---|
| `Tabs` | Navegação em abas |
| `Stepper` | Indicador de progresso por etapas |
| `Accordion` | Seções colapsáveis |

### Utilitários
| Componente | Descrição |
|---|---|
| `Spinner` | Indicador de carregamento |
| `EmptyState` | Placeholder de estado vazio |
| `Switch` | Toggle on/off |

---

## Utilitários de formatação

Todos localizados em `utils/format.ts`. Nenhum componente formata datas/horas diretamente — sempre passam por essas funções.

| Função | Entrada | Saída de exemplo |
|---|---|---|
| `formatDate(iso)` | ISO 8601 | `12/06/2026` |
| `formatTime(iso)` | ISO 8601 | `10h45` |
| `formatTimeWithSeconds(iso)` | ISO 8601 | `10h45:30` |
| `formatDuration(seconds)` | number | `5m 30s` |

---

## Proteção de dados pessoais (PII)

CPF, telefone e data de nascimento nunca são renderizados em texto completo. A API já retorna os valores mascarados (`***.***.344-**`, `(**) *****-0000`); o frontend exibe o valor mascarado diretamente, sem reconstrução.

---

## Build e variáveis de ambiente

```bash
# Build de produção
npm run build --workspace=apps/frontend
# output em apps/frontend/dist/  (arquivos estáticos)
```

| Variável | Obrigatória | Descrição |
|---|---|---|
| `VITE_API_URL` | Não | URL base do backend. Se omitida, usa `/api` (relativo ao host do frontend) |

---

## Documentação relacionada

- [README](../README.md) — setup local, comandos e infraestrutura necessária
- [Arquitetura Backend](./arquitetura-backend.md)
- [Diretrizes de design e UX](../apps/frontend/CLAUDE.md)
- [Stack técnica do MVP](./stack-mvp.md)
