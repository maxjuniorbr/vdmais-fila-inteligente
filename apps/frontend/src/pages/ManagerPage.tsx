import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import {
  getManagementERId,
  getSessionERId,
  getStaffName,
  getStaffRole,
  logoutStaffSession,
  setManagementERId,
} from '../auth/session'
import { useStaffSession } from '../auth/useStaffSession'
import { ActionMenu } from '../components/ActionMenu'
import { Alert } from '../components/Alert'
import { AppHeader } from '../components/AppHeader'
import { Badge } from '../components/Badge'
import { BarList } from '../components/BarList'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MetricCard } from '../components/MetricCard'
import { Modal } from '../components/Modal'
import { Select } from '../components/Select'
import { Table, type Column } from '../components/Table'
import { Tabs, type TabItem } from '../components/Tabs'
import { useToast } from '../components/Toast'
import { useSocket } from '../hooks/useSocket'
import { brand } from '../styles/brand'
import { layout } from '../styles/layout'
import { formatDuration } from '../utils/format'
import {
  counterStateLabel,
  counterStateTone,
  entryChannelLabel,
  PRIORITY_LABEL,
  PRIORITY_TONE,
  ticketStateLabel,
} from '../utils/labels'

const COUNTER_TONE_COLOR: Record<string, string> = {
  success: brand.success,
  info: brand.info,
  warning: brand.warning,
  danger: brand.danger,
  neutral: brand.borderStrong,
}

interface Ticket {
  id: string
  code: string
  state: string
  isPriority?: boolean
  entryChannel: string
  createdAt: string
  calledAt?: string
  cancelledAt?: string
  pausedSeconds?: number
  serviceStartedAt?: string
  representative?: { fullName: string }
  counter?: { number: number }
}

interface Counter {
  id: string
  number: number
  state: string
  operator?: { name: string } | null
}

interface Overview {
  waiting: Ticket[]
  calling: Ticket[]
  inService: Ticket[]
  paused: Ticket[]
  recent: Ticket[]
  counters: Counter[]
}

interface Metrics {
  totalCreated: number
  totalWaiting: number
  totalPaused: number
  totalStarted: number
  totalFinished: number
  totalCancelled: number
  totalNoShow: number
  totalRestored: number
  totalForceClosed: number
  duplicateAttempts: number
  openServices: number
  avgWaitSeconds: number
  medianWaitSeconds: number
  avgServiceSeconds: number
  medianServiceSeconds: number
  avgCallToStartSeconds: number
  maxCurrentWaitSeconds: number
  waitSecondsByHour: Record<string, number>
  byChannel: Record<string, number>
  cancelledByChannel: Record<string, number>
  noShowByChannel: Record<string, number>
  volumeByHour: Record<string, number>
  peakHours: number[]
  serviceByCounter: Record<string, number>
  serviceByOperator: Record<string, number>
  callsByOperator: Record<string, number>
  pauseSecondsByCounter: Record<string, number>
  activeCounters: number
  pausedCounters: number
}

interface ERState {
  id: string
  name: string
  isDayOpen: boolean
}

interface ERSelection {
  id: string
  name: string
  isDayOpen: boolean
}

type PendingAction =
  | { kind: 'cancel'; ticket: Ticket }
  | { kind: 'restore'; ticket: Ticket }
  | { kind: 'correct-finish'; ticket: Ticket }
  | { kind: 'correct-cancel'; ticket: Ticket }
  | null

type PendingActionKind = Exclude<PendingAction, null>['kind']

type TicketActionComponent = React.ComponentType<{
  ticket: Ticket
  onSelect: (action: PendingAction) => void
  onTogglePriority?: (ticket: Ticket) => void
}>

function pendingActionTitle(kind: PendingActionKind): string {
  if (kind === 'restore') return 'Restaurar senha'
  if (kind.startsWith('correct')) return 'Corrigir atendimento'
  return 'Cancelar senha'
}


function CancelTicketAction({
  ticket,
  onSelect,
  onTogglePriority,
}: Readonly<{
  ticket: Ticket
  onSelect: (action: PendingAction) => void
  onTogglePriority?: (ticket: Ticket) => void
}>) {
  // Prioridade só faz sentido enquanto a senha aguarda; em chamada/atendimento o
  // toggle não aparece (o backend também recusa).
  const priorityItems =
    ticket.state === 'WAITING' && onTogglePriority
      ? [
          {
            label: ticket.isPriority ? 'Remover preferencial' : 'Marcar preferencial',
            onClick: () => onTogglePriority(ticket),
          },
        ]
      : []
  return (
    <ActionMenu
      label={`Ações da senha ${ticket.code}`}
      items={[
        ...priorityItems,
        {
          label: 'Cancelar senha',
          tone: 'danger',
          onClick: () => onSelect({ kind: 'cancel', ticket }),
        },
      ]}
    />
  )
}

// Com a operação encerrada o backend rejeita o restore; sem ações possíveis,
// a coluna não exibe menu (ActionMenu retorna null com lista vazia).
const NoTicketActions: TicketActionComponent = () => null

function RestoreTicketAction({
  ticket,
  onSelect,
}: Readonly<{ ticket: Ticket; onSelect: (action: PendingAction) => void }>) {
  // Não comparecidas sempre podem ser restauradas; canceladas, apenas se nunca
  // entraram em atendimento (alinhado à regra do backend).
  const canRestore =
    ticket.state === 'NO_SHOW' ||
    (ticket.state === 'CANCELLED' && !ticket.serviceStartedAt)
  return (
    <ActionMenu
      label={`Ações da senha ${ticket.code}`}
      items={
        canRestore
          ? [{ label: 'Restaurar senha', onClick: () => onSelect({ kind: 'restore', ticket }) }]
          : []
      }
    />
  )
}

const LONG_SERVICE_THRESHOLD_MIN = 30
const REFRESH_EVENTS = [
  'ticket.created',
  'ticket.called',
  'ticket.service_started',
  'ticket.service_finished',
  'ticket.no_show',
  'ticket.cancelled',
  'ticket.paused',
  'ticket.restored',
  'ticket.priority_changed',
  'counter.opened',
  'counter.paused',
  'counter.resumed',
  'counter.closed',
  'counter.created',
  'counter.deleted',
  'day.opened',
  'day.closed',
]

function elapsedMinutes(from: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 60000))
}

function elapsedSeconds(from: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 1000))
}

// Tempo que a senha esperou na fila. Congela quando ela sai da fila (foi chamada,
// ou cancelada antes da chamada); enquanto ainda aguarda, conta ao vivo. Desconta o
// tempo pausado, igual à métrica de espera do backend.
function waitSeconds(ticket: Ticket): number {
  const leftQueueAt = ticket.calledAt ?? ticket.cancelledAt
  const ref = leftQueueAt ? new Date(leftQueueAt).getTime() : Date.now()
  const raw = (ref - new Date(ticket.createdAt).getTime()) / 1000 - (ticket.pausedSeconds ?? 0)
  return Math.max(0, Math.round(raw))
}

export function ManagerPage() {
  const navigate = useNavigate()
  const [authenticated, setAuthenticated] = useStaffSession(['MANAGER', 'ADMIN'])
  const [erId, setErId] = useState(() =>
    getStaffRole() === 'ADMIN' ? getManagementERId() : getSessionERId(),
  )
  const [availableERs, setAvailableERs] = useState<ERSelection[]>([])
  const [overview, setOverview] = useState<Overview | null>(null)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [er, setER] = useState<ERState | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [pendingCounter, setPendingCounter] = useState<Counter | null>(null)
  const [pendingDayToggle, setPendingDayToggle] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const isAdmin = getStaffRole() === 'ADMIN'
  const socket = useSocket(authenticated ? erId : '')
  const { showToast } = useToast()

  useEffect(() => {
    if (!authenticated || !isAdmin) {
      setAvailableERs([])
      return
    }

    let active = true
    api
      .get<ERSelection[]>('/admin/ers')
      .then((ers) => {
        if (!active) return
        setAvailableERs(ers)
        const storedERId = getManagementERId()
        if (storedERId && !ers.some((item) => item.id === storedERId)) {
          setErId('')
          setManagementERId('')
        }
      })
      .catch((err: unknown) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Erro ao carregar ERs')
      })

    return () => {
      active = false
    }
  }, [authenticated, isAdmin])

  const refresh = useCallback(async () => {
    if (!authenticated || !erId) return
    try {
      const [queueOverview, dailyMetrics, erState] = await Promise.all([
        api.get<Overview>(`/queues/${erId}/overview`),
        api.get<Metrics>(`/metrics/${erId}/daily`),
        api.get<ERState>(`/ers/${erId}`),
      ])
      setOverview(queueOverview)
      setMetrics(dailyMetrics)
      setER(erState)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar gestão')
    }
  }, [authenticated, erId])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 15000)
    return () => clearInterval(interval)
  }, [refresh])

  useEffect(() => {
    if (!socket) return
    REFRESH_EVENTS.forEach((event) => socket.on(event, refresh))
    return () => {
      REFRESH_EVENTS.forEach((event) => socket.off(event, refresh))
    }
  }, [refresh, socket])

  // Tick once per second so elapsed durations and the prolonged-service threshold
  // (both derived from Date.now() at render time) stay live between the 15s
  // refreshes — otherwise times look frozen and the 30-min alert lags up to 15s.
  const [, bumpClock] = useReducer((tick: number) => tick + 1, 0)
  useEffect(() => {
    if (!authenticated || !erId) return
    const id = setInterval(bumpClock, 1000)
    return () => clearInterval(id)
  }, [authenticated, erId])

  const activeTickets = useMemo(
    () => [
      ...(overview?.waiting ?? []),
      ...(overview?.calling ?? []),
      ...(overview?.inService ?? []),
    ],
    [overview],
  )

  const prolongedTickets = activeTickets.filter(
    (ticket) =>
      ticket.state === 'IN_SERVICE' &&
      ticket.serviceStartedAt &&
      elapsedMinutes(ticket.serviceStartedAt) >= LONG_SERVICE_THRESHOLD_MIN,
  )

  const prolongedColumns: Column<Ticket>[] = [
    { key: 'code', header: 'Senha', render: (ticket) => ticket.code },
    { key: 're', header: 'RE', render: (ticket) => ticket.representative?.fullName ?? '-' },
    {
      key: 'elapsed',
      header: 'Em atendimento',
      render: (ticket) => (
        <Badge tone="warning">
          {ticket.serviceStartedAt ? formatDuration(elapsedSeconds(ticket.serviceStartedAt)) : '—'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Ações',
      align: 'right',
      render: (ticket) => (
        <ActionMenu
          label={`Ações da senha ${ticket.code}`}
          items={[
            {
              label: 'Finalizar atendimento',
              onClick: () => openTicketAction({ kind: 'correct-finish', ticket }),
            },
            {
              label: 'Cancelar atendimento',
              tone: 'danger',
              onClick: () => openTicketAction({ kind: 'correct-cancel', ticket }),
            },
          ]}
        />
      ),
    },
  ]

  async function execute(action: () => Promise<unknown>, successMessage?: string) {
    setLoading(true)
    setError(null)
    try {
      await action()
      setPendingAction(null)
      setPendingCounter(null)
      setPendingDayToggle(false)
      await refresh()
      if (successMessage) showToast(successMessage, 'success')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro na operação')
    } finally {
      setLoading(false)
    }
  }

  function openTicketAction(action: PendingAction) {
    setError(null)
    setPendingAction(action)
  }

  function togglePriority(ticket: Ticket) {
    const next = !ticket.isPriority
    void execute(
      () => api.post(`/tickets/${ticket.id}/${next ? 'mark-priority' : 'unmark-priority'}`),
      next ? 'Senha marcada como preferencial.' : 'Prioridade removida.',
    )
  }

  function openCounterRelease(counter: Counter) {
    setError(null)
    setPendingCounter(counter)
  }

  // Logout, an expired session, or a direct visit without a session all funnel
  // back to the central login (HomePage), the single entry point that routes
  // each role to its area. No per-page login form.
  if (!authenticated) {
    return <Navigate to="/" replace />
  }

  return (
    <div style={styles.shell}>
      <AppHeader
        title="Painel da Gestora"
        subtitle={er?.name ?? (getStaffName() || 'Gestora')}
        onLogout={() => {
          void logoutStaffSession().then(() => {
            setAuthenticated(false)
          })
        }}
        actions={
          <>
            <button style={layout.topbarButton} type="button" onClick={() => navigate('/')}>
              Voltar ao início
            </button>
            {isAdmin && (
              <button style={layout.topbarButton} type="button" onClick={() => navigate('/admin')}>
                Administração
              </button>
            )}
            {er &&
              (er.isDayOpen ? (
                <button
                  style={layout.topbarButton}
                  type="button"
                  onClick={() => {
                    setError(null)
                    setPendingDayToggle(true)
                  }}
                  disabled={loading}
                >
                  Encerrar operação
                </button>
              ) : (
                <button
                  style={layout.topbarButton}
                  type="button"
                  onClick={() => {
                    setError(null)
                    setPendingDayToggle(true)
                  }}
                  disabled={loading}
                >
                  Abrir operação
                </button>
              ))}
          </>
        }
      />

      <div className="gb-page-content" style={styles.content}>
        {error && <Alert tone="error">{error}</Alert>}

        {isAdmin && (
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>ER acompanhado</h2>
            <p style={styles.adminContext}>
              Como administrador, selecione o ER que deseja acompanhar ou operar nesta tela.
            </p>
            <Select
              label="Espaço de Revendedora"
              value={erId}
              onChange={(event) => {
                const selectedERId = event.target.value
                setErId(selectedERId)
                setOverview(null)
                setMetrics(null)
                setER(null)
                setPendingAction(null)
                setError(null)
                setManagementERId(selectedERId)
              }}
            >
              <option value="">Selecione um ER</option>
              {availableERs.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </section>
        )}

        {!erId && (
          <Alert tone="info">
            {isAdmin
              ? 'Selecione um ER para visualizar sua fila e seus indicadores.'
              : 'Sua conta não está vinculada a um ER.'}
          </Alert>
        )}

        {er && !er.isDayOpen && (
          <Alert tone="warning">
            Operação encerrada. Os indicadores abaixo são do último dia operado.
            Para chamar senhas, restaurar e movimentar a fila, abra a operação.
          </Alert>
        )}

        {metrics && (
          <>
            <section
              className="gb-metrics-grid"
              style={styles.metrics}
              aria-label="Indicadores do dia"
            >
              {(
                [
                  ['Aguardando', metrics.totalWaiting],
                  ['Pausados', metrics.totalPaused],
                  ['Maior espera', formatDuration(metrics.maxCurrentWaitSeconds)],
                  ['Espera média', formatDuration(metrics.avgWaitSeconds)],
                  ['Mediana da espera', formatDuration(metrics.medianWaitSeconds)],
                  ['Atendimento médio', formatDuration(metrics.avgServiceSeconds)],
                  ['Mediana atendimento', formatDuration(metrics.medianServiceSeconds)],
                  ['Chamada até início', formatDuration(metrics.avgCallToStartSeconds)],
                  ['Atendimentos iniciados', metrics.totalStarted],
                  ['Finalizados', metrics.totalFinished],
                  ['Em atendimento', metrics.openServices],
                  ['Não compareceu', metrics.totalNoShow],
                  ['Cancelados', metrics.totalCancelled],
                  ['Restaurados', metrics.totalRestored],
                  ['Encerradas na virada', metrics.totalForceClosed],
                  ['Duplicidades bloqueadas', metrics.duplicateAttempts],
                  // Indicador ao vivo: só faz sentido com a operação aberta. Com
                  // o dia encerrado os caixas já foram liberados (closeDay), então
                  // exibir "0/0" no painel retrospectivo seria enganoso — mostramos
                  // "—". As demais tiles vêm da auditoria e seguem retroativas.
                  [
                    'Caixas ativos/pausados',
                    er?.isDayOpen ? `${metrics.activeCounters}/${metrics.pausedCounters}` : '—',
                  ],
                ] as [string, string | number][]
              ).map(([label, value]) => (
                <MetricCard key={label} label={label} value={value} />
              ))}
            </section>
            <DayDistribution metrics={metrics} />
          </>
        )}

        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Caixas</h2>
          <div style={styles.counterGrid}>
            {overview?.counters.map((counter) => (
              <article
                key={counter.id}
                style={{
                  ...styles.counter,
                  borderLeft: `4px solid ${COUNTER_TONE_COLOR[counterStateTone(counter.state)]}`,
                }}
              >
                <div style={styles.counterTop}>
                  <div>
                    <span style={styles.counterEyebrow}>Caixa</span>
                    <strong style={styles.counterNumber}>{counter.number}</strong>
                  </div>
                  {counter.state !== 'UNAVAILABLE' && (
                    <span style={styles.counterMenu}>
                      <ActionMenu
                        label={`Ações do caixa ${counter.number}`}
                        items={[
                          { label: 'Liberar caixa', onClick: () => openCounterRelease(counter) },
                        ]}
                      />
                    </span>
                  )}
                </div>
                <Badge tone={counterStateTone(counter.state)} style={styles.counterBadge}>
                  {counterStateLabel(counter.state)}
                </Badge>
                <div style={styles.counterOperatorRow}>
                  <span style={styles.counterOperatorLabel}>Operadora</span>
                  <span style={styles.counterOperatorName}>
                    {counter.operator?.name ?? 'Sem operadora'}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>

        {prolongedTickets.length > 0 && (
          <section style={styles.card}>
            <div style={styles.sectionHead}>
              <h2 style={{ ...styles.cardTitle, margin: 0 }}>Atendimentos prolongados</h2>
              <Badge tone="warning">{prolongedTickets.length}</Badge>
            </div>
            <Table
              columns={prolongedColumns}
              rows={prolongedTickets}
              getRowKey={(ticket) => ticket.id}
              emptyMessage="Nenhum atendimento prolongado."
            />
          </section>
        )}

        <section style={styles.card}>
          <div style={styles.sectionHead}>
            <h2 style={{ ...styles.cardTitle, margin: 0 }}>Fila ativa</h2>
            <Badge>{activeTickets.length}</Badge>
          </div>
          <TicketTable
            tickets={activeTickets}
            ActionComponent={CancelTicketAction}
            onSelect={openTicketAction}
            onTogglePriority={togglePriority}
          />
        </section>

        <section style={styles.card}>
          <div style={styles.sectionHead}>
            <h2 style={{ ...styles.cardTitle, margin: 0 }}>Chamadas recentes</h2>
            <Badge>{overview?.recent.length ?? 0}</Badge>
          </div>
          <TicketTable
            tickets={overview?.recent ?? []}
            ActionComponent={er?.isDayOpen ? RestoreTicketAction : NoTicketActions}
            onSelect={openTicketAction}
          />
        </section>

        {pendingAction && (
          <ConfirmDialog
            title={pendingActionTitle(pendingAction.kind)}
            confirmLabel={pendingActionTitle(pendingAction.kind)}
            description={`Senha ${pendingAction.ticket.code}`}
            loading={loading}
            error={error}
            onConfirm={(reason) => {
              const { ticket } = pendingAction
              if (pendingAction.kind === 'cancel') {
                void execute(
                  () => api.post(`/tickets/${ticket.id}/cancel`, { reason }),
                  'Senha cancelada.',
                )
              } else if (pendingAction.kind === 'restore') {
                void execute(
                  () => api.post(`/tickets/${ticket.id}/restore`, { reason }),
                  'Senha restaurada.',
                )
              } else {
                const isFinish = pendingAction.kind === 'correct-finish'
                void execute(
                  () =>
                    api.post(`/tickets/${ticket.id}/correct`, {
                      action: isFinish ? 'FINISH' : 'CANCEL',
                      reason,
                    }),
                  isFinish ? 'Atendimento finalizado.' : 'Atendimento cancelado.',
                )
              }
            }}
            onClose={() => {
              setPendingAction(null)
            }}
          />
        )}

        {pendingCounter && (
          <ConfirmDialog
            title="Liberar caixa"
            description={`Caixa ${pendingCounter.number}${
              pendingCounter.operator ? ` — ${pendingCounter.operator.name}` : ''
            }. A senha em aberto será resolvida (finalizada ou marcada como não compareceu) e o caixa ficará disponível.`}
            reasonRequired={false}
            confirmLabel="Liberar caixa"
            loading={loading}
            error={error}
            onConfirm={() => {
              const { id } = pendingCounter
              void execute(() => api.post(`/counters/${id}/force-release`), 'Caixa liberado.')
            }}
            onClose={() => {
              setPendingCounter(null)
            }}
          />
        )}

        {pendingDayToggle && er && (
          <Modal
            title={er.isDayOpen ? 'Encerrar operação?' : 'Abrir operação?'}
            onClose={() => setPendingDayToggle(false)}
            footer={
              <>
                <Button variant="secondary" onClick={() => setPendingDayToggle(false)} disabled={loading}>
                  Voltar
                </Button>
                {er.isDayOpen ? (
                  <Button
                    variant="danger"
                    disabled={loading}
                    onClick={() => execute(() => api.post(`/ers/${erId}/close-day`), 'Operação encerrada.')}
                  >
                    {loading ? 'Encerrando...' : 'Encerrar operação'}
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    disabled={loading}
                    onClick={() => execute(() => api.post(`/ers/${erId}/open-day`), 'Operação aberta.')}
                  >
                    {loading ? 'Abrindo...' : 'Abrir operação'}
                  </Button>
                )}
              </>
            }
          >
            {error && (
              <Alert tone="error" style={{ marginBottom: `${brand.spacing[12]}px` }}>
                {error}
              </Alert>
            )}
            {er.isDayOpen
              ? 'Atendimentos em andamento serão finalizados automaticamente. Esta ação não pode ser desfeita.'
              : 'A fila ficará disponível para entrada de senhas neste ER.'}
          </Modal>
        )}
      </div>
    </div>
  )
}

function TicketTable({
  tickets,
  ActionComponent,
  onSelect,
  onTogglePriority,
}: Readonly<{
  tickets: Ticket[]
  ActionComponent: TicketActionComponent
  onSelect: (action: PendingAction) => void
  onTogglePriority?: (ticket: Ticket) => void
}>) {
  const columns: Column<Ticket>[] = [
    {
      key: 'code',
      header: 'Senha',
      render: (ticket) => (
        <span style={styles.ticketCodeCell}>
          {ticket.code}
          {ticket.isPriority && <Badge tone={PRIORITY_TONE}>{PRIORITY_LABEL}</Badge>}
        </span>
      ),
    },
    { key: 'state', header: 'Estado', render: (ticket) => ticketStateLabel(ticket.state) },
    { key: 're', header: 'RE', render: (ticket) => ticket.representative?.fullName ?? '-' },
    { key: 'wait', header: 'Espera', render: (ticket) => formatDuration(waitSeconds(ticket)) },
    { key: 'channel', header: 'Canal', render: (ticket) => entryChannelLabel(ticket.entryChannel) },
    { key: 'counter', header: 'Caixa', render: (ticket) => ticket.counter?.number ?? '-' },
    {
      key: 'actions',
      header: 'Ações',
      align: 'right',
      render: (ticket) => (
        <ActionComponent ticket={ticket} onSelect={onSelect} onTogglePriority={onTogglePriority} />
      ),
    },
  ]
  return (
    <Table
      columns={columns}
      rows={tickets}
      getRowKey={(ticket) => ticket.id}
      emptyMessage="Nenhuma senha nesta lista."
    />
  )
}

function unionKeys(...records: Record<string, number>[]): string[] {
  const keys = new Set<string>()
  for (const record of records) {
    for (const key of Object.keys(record)) keys.add(key)
  }
  return [...keys]
}

function DayDistribution({ metrics }: Readonly<{ metrics: Metrics }>) {
  const hourItems = Object.entries(metrics.volumeByHour)
    .map(([hour, total]) => ({ hour: Number(hour), total }))
    .sort((left, right) => left.hour - right.hour)
    .map(({ hour, total }) => ({
      label: `${hour}h`,
      value: total,
      highlight: metrics.peakHours.includes(hour),
    }))

  const waitItems = Object.entries(metrics.waitSecondsByHour)
    .map(([hour, seconds]) => ({ hour: Number(hour), seconds }))
    .sort((left, right) => left.hour - right.hour)
    .map(({ hour, seconds }) => ({
      label: `${hour}h`,
      value: seconds,
      display: formatDuration(seconds),
    }))

  const channelRows = unionKeys(
    metrics.byChannel,
    metrics.cancelledByChannel,
    metrics.noShowByChannel,
  ).map((key) => ({
    id: key,
    channel: entryChannelLabel(key),
    entries: metrics.byChannel[key] ?? 0,
    cancelled: metrics.cancelledByChannel[key] ?? 0,
    noShow: metrics.noShowByChannel[key] ?? 0,
  }))
  const channelColumns: Column<(typeof channelRows)[number]>[] = [
    { key: 'channel', header: 'Canal', render: (row) => row.channel },
    { key: 'entries', header: 'Entradas', align: 'right', render: (row) => row.entries },
    { key: 'cancelled', header: 'Cancelados', align: 'right', render: (row) => row.cancelled },
    { key: 'noShow', header: 'Não compareceu', align: 'right', render: (row) => row.noShow },
  ]

  const counterRows = unionKeys(metrics.serviceByCounter, metrics.pauseSecondsByCounter).map(
    // The metrics keys are already display labels ("Caixa 1", "Caixa 2"); the
    // backend owns the naming, so render the key as-is (no second "Caixa" prefix).
    (key) => ({
      id: key,
      counter: key,
      services: metrics.serviceByCounter[key] ?? 0,
      paused: formatDuration(metrics.pauseSecondsByCounter[key] ?? 0),
    }),
  )
  const counterColumns: Column<(typeof counterRows)[number]>[] = [
    { key: 'counter', header: 'Caixa', render: (row) => row.counter },
    { key: 'services', header: 'Atendimentos', align: 'right', render: (row) => row.services },
    { key: 'paused', header: 'Pausa', align: 'right', render: (row) => row.paused },
  ]

  const operatorRows = unionKeys(metrics.serviceByOperator, metrics.callsByOperator).map((key) => ({
    id: key,
    operator: key,
    services: metrics.serviceByOperator[key] ?? 0,
    calls: metrics.callsByOperator[key] ?? 0,
  }))
  const operatorColumns: Column<(typeof operatorRows)[number]>[] = [
    { key: 'operator', header: 'Operadora', render: (row) => row.operator },
    { key: 'services', header: 'Atendimentos', align: 'right', render: (row) => row.services },
    { key: 'calls', header: 'Chamadas', align: 'right', render: (row) => row.calls },
  ]

  const tabs: TabItem[] = [
    {
      id: 'hora',
      label: 'Por hora',
      content: (
        <div style={styles.distGrid}>
          <div>
            <div style={styles.distHourHead}>
              <h3 style={styles.distTitle}>Finalizados por hora</h3>
              {metrics.peakHours.length > 0 && (
                <span style={styles.peakLegend}>
                  <span style={styles.peakDot} aria-hidden="true" />
                  Pico: {metrics.peakHours.map((hour) => `${hour}h`).join(', ')}
                </span>
              )}
            </div>
            <BarList items={hourItems} emptyMessage="Nenhum atendimento finalizado" />
          </div>
          <div>
            <h3 style={{ ...styles.distTitle, marginBottom: brand.spacing[12] }}>
              Espera média por hora
            </h3>
            <BarList items={waitItems} emptyMessage="Sem registros de espera" />
          </div>
        </div>
      ),
    },
    {
      id: 'canal',
      label: 'Por canal',
      content: (
        <Table
          columns={channelColumns}
          rows={channelRows}
          getRowKey={(row) => row.id}
          emptyMessage="Sem entradas registradas."
        />
      ),
    },
    {
      id: 'caixa',
      label: 'Por caixa',
      content: (
        <Table
          columns={counterColumns}
          rows={counterRows}
          getRowKey={(row) => row.id}
          emptyMessage="Sem atendimentos por caixa."
        />
      ),
    },
    {
      id: 'operadora',
      label: 'Por operadora',
      content: (
        <Table
          columns={operatorColumns}
          rows={operatorRows}
          getRowKey={(row) => row.id}
          emptyMessage="Sem atendimentos por operadora."
        />
      ),
    },
  ]

  return (
    <section style={styles.card} aria-label="Distribuição do dia">
      <h2 style={styles.cardTitle}>Distribuição do dia</h2>
      <Tabs tabs={tabs} ariaLabel="Distribuição do dia" />
    </section>
  )
}

const styles: Record<string, React.CSSProperties> = {
  ...layout,
  content: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: `${brand.spacing[24]}px ${brand.spacing[24]}px ${brand.spacing[48]}px`,
  },
  metrics: {
    marginBottom: `${brand.spacing[16]}px`,
  },
  cardTitle: {
    margin: `0 0 ${brand.spacing[12]}px`,
    fontSize: brand.typography.subtitle.fontSize,
    color: brand.ink,
  },
  sectionHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: `${brand.spacing[12]}px`,
    marginBottom: `${brand.spacing[12]}px`,
  },
  adminContext: {
    margin: '-0.35rem 0 1rem',
    color: brand.inkMuted,
    fontSize: brand.typography.bodySmall.fontSize,
  },
  counterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
    gap: `${brand.spacing[12]}px`,
  },
  counter: {
    display: 'grid',
    gap: `${brand.spacing[12]}px`,
    padding: `${brand.spacing[16]}px`,
    background: brand.canvas,
    border: `1px solid ${brand.border}`,
    borderRadius: brand.radius.medium,
  },
  counterTop: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: `${brand.spacing[8]}px`,
  },
  counterMenu: {
    marginTop: -brand.spacing[8],
    marginRight: -brand.spacing[8],
  },
  counterEyebrow: {
    display: 'block',
    fontSize: brand.typography.auxiliar.fontSize,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: brand.inkMuted,
  },
  counterNumber: {
    fontSize: brand.typography.title.fontSize,
    fontWeight: 700,
    color: brand.ink,
    lineHeight: 1.05,
  },
  counterBadge: {
    justifySelf: 'start',
  },
  ticketCodeCell: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: `${brand.spacing[8]}px`,
  },
  counterOperatorRow: {
    display: 'grid',
    gap: '2px',
  },
  counterOperatorLabel: {
    fontSize: brand.typography.auxiliar.fontSize,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: brand.inkMuted,
  },
  counterOperatorName: {
    fontSize: brand.typography.bodySmall.fontSize,
    color: brand.ink,
  },
  distGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: `${brand.spacing[24]}px`,
    alignItems: 'start',
  },
  distTitle: {
    margin: 0,
    fontSize: brand.typography.bodyLarge.fontSize,
    fontWeight: 600,
    color: brand.ink,
  },
  distHourHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: `${brand.spacing[8]}px`,
    flexWrap: 'wrap',
    marginBottom: `${brand.spacing[12]}px`,
  },
  peakLegend: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: `${brand.spacing[4]}px`,
    padding: `${brand.spacing[4]}px ${brand.spacing[8]}px`,
    borderRadius: brand.radius.pill,
    background: brand.canvas,
    fontSize: brand.typography.auxiliar.fontSize,
    color: brand.inkMuted,
    whiteSpace: 'nowrap',
  },
  peakDot: {
    display: 'inline-block',
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: brand.conversion,
  },
}
