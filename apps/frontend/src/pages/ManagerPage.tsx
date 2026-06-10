import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import {
  getManagementERId,
  hasStaffSession,
  logoutStaffSession,
  setManagementERId,
} from '../auth/session'
import { Alert } from '../components/Alert'
import { AppHeader } from '../components/AppHeader'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MetricCard } from '../components/MetricCard'
import { Select } from '../components/Select'
import { StaffLoginForm } from '../components/StaffLoginForm'
import { useSocket } from '../hooks/useSocket'
import { brand } from '../styles/brand'
import { layout } from '../styles/layout'
import { counterStateLabel, entryChannelLabel, ticketStateLabel } from '../utils/labels'

interface Ticket {
  id: string
  code: string
  state: string
  entryChannel: string
  createdAt: string
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
}>

function pendingActionTitle(kind: PendingActionKind): string {
  if (kind === 'restore') return 'Restaurar senha'
  if (kind.startsWith('correct')) return 'Corrigir atendimento'
  return 'Cancelar senha'
}

function CancelTicketAction({
  ticket,
  onSelect,
}: Readonly<{ ticket: Ticket; onSelect: (action: PendingAction) => void }>) {
  return (
    <Button size="sm" variant="danger" onClick={() => onSelect({ kind: 'cancel', ticket })}>
      Cancelar
    </Button>
  )
}

function RestoreTicketAction({
  ticket,
  onSelect,
}: Readonly<{ ticket: Ticket; onSelect: (action: PendingAction) => void }>) {
  if (ticket.state !== 'NO_SHOW') return null
  return (
    <Button size="sm" variant="secondary" onClick={() => onSelect({ kind: 'restore', ticket })}>
      Restaurar
    </Button>
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
  'counter.opened',
  'counter.paused',
  'counter.resumed',
  'counter.closed',
  'day.opened',
  'day.closed',
]

function elapsedMinutes(from: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 60000))
}

function formatSeconds(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}

function formatRecord(
  values: Record<string, number>,
  formatter: (value: number) => string = String,
  labelFormatter: (label: string) => string = String,
): string {
  return (
    Object.entries(values)
      .map(([label, value]) => `${labelFormatter(label)}: ${formatter(value)}`)
      .join(' | ') || 'Sem dados'
  )
}

export function ManagerPage() {
  const navigate = useNavigate()
  const [authenticated, setAuthenticated] = useState(() => hasStaffSession(['MANAGER', 'ADMIN']))
  const [erId, setErId] = useState(() =>
    sessionStorage.getItem('staffRole') === 'ADMIN'
      ? getManagementERId()
      : (sessionStorage.getItem('erId') ?? ''),
  )
  const [availableERs, setAvailableERs] = useState<ERSelection[]>([])
  const [overview, setOverview] = useState<Overview | null>(null)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [er, setER] = useState<ERState | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const isAdmin = sessionStorage.getItem('staffRole') === 'ADMIN'
  const socket = useSocket(authenticated ? erId : '')

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

  async function execute(action: () => Promise<unknown>) {
    setLoading(true)
    setError(null)
    try {
      await action()
      setPendingAction(null)
      await refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro na operação')
    } finally {
      setLoading(false)
    }
  }

  if (!authenticated) {
    return (
      <StaffLoginForm
        title="Gestão da fila"
        allowedRoles={['MANAGER', 'ADMIN']}
        onAuthenticated={(profile) => {
          setErId(profile.role === 'ADMIN' ? getManagementERId() : (profile.erId ?? ''))
          setAuthenticated(true)
        }}
      />
    )
  }

  return (
    <div style={styles.shell}>
      <AppHeader
        title="Painel da Gestora"
        subtitle={er?.name ?? sessionStorage.getItem('userName') ?? 'Gestora'}
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
                  onClick={() => execute(() => api.post(`/ers/${erId}/close-day`))}
                  disabled={loading}
                >
                  Encerrar operação
                </button>
              ) : (
                <button
                  style={layout.topbarButton}
                  type="button"
                  onClick={() => execute(() => api.post(`/ers/${erId}/open-day`))}
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
              label="Espaço do Revendedor"
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
                  ['Maior espera', formatSeconds(metrics.maxCurrentWaitSeconds)],
                  ['Espera média', formatSeconds(metrics.avgWaitSeconds)],
                  ['Mediana da espera', formatSeconds(metrics.medianWaitSeconds)],
                  ['Atendimento médio', formatSeconds(metrics.avgServiceSeconds)],
                  ['Mediana atendimento', formatSeconds(metrics.medianServiceSeconds)],
                  ['Chamada até início', formatSeconds(metrics.avgCallToStartSeconds)],
                  ['Atendimentos iniciados', metrics.totalStarted],
                  ['Finalizados', metrics.totalFinished],
                  ['Em atendimento', metrics.openServices],
                  ['Não compareceu', metrics.totalNoShow],
                  ['Cancelados', metrics.totalCancelled],
                  ['Restaurados', metrics.totalRestored],
                  ['Duplicidades bloqueadas', metrics.duplicateAttempts],
                  ['Caixas ativos/pausados', `${metrics.activeCounters}/${metrics.pausedCounters}`],
                ] as [string, string | number][]
              ).map(([label, value]) => (
                <MetricCard key={label} label={label} value={value} />
              ))}
            </section>
            <section style={styles.card}>
              <h2 style={styles.cardTitle}>Distribuição do dia</h2>
              <p>Canais: {formatRecord(metrics.byChannel, String, entryChannelLabel)}</p>
              <p>
                Cancelamentos por canal:{' '}
                {formatRecord(metrics.cancelledByChannel, String, entryChannelLabel)}
              </p>
              <p>
                Não comparecimentos por canal:{' '}
                {formatRecord(metrics.noShowByChannel, String, entryChannelLabel)}
              </p>
              <p>
                Finalizados por hora:{' '}
                {Object.entries(metrics.volumeByHour)
                  .sort(([left], [right]) => Number(left) - Number(right))
                  .map(([hour, total]) => `${hour}h: ${total}`)
                  .join(' | ') || 'Nenhum atendimento finalizado'}
              </p>
              <p>Espera média por hora: {formatRecord(metrics.waitSecondsByHour, formatSeconds)}</p>
              <p>
                Horários de pico:{' '}
                {metrics.peakHours.map((hour) => `${hour}h`).join(', ') || 'Sem dados'}
              </p>
              <p>Atendimentos por caixa: {formatRecord(metrics.serviceByCounter)}</p>
              <p>Atendimentos por operadora: {formatRecord(metrics.serviceByOperator)}</p>
              <p>Chamadas por operadora: {formatRecord(metrics.callsByOperator)}</p>
              <p>Pausa por caixa: {formatRecord(metrics.pauseSecondsByCounter, formatSeconds)}</p>
            </section>
          </>
        )}

        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Caixas</h2>
          <div style={styles.counterGrid}>
            {overview?.counters.map((counter) => (
              <article key={counter.id} style={styles.counter}>
                <strong>Caixa {counter.number}</strong>
                <span style={styles.counterState}>{counterStateLabel(counter.state)}</span>
                <small style={styles.counterOperator}>
                  {counter.operator?.name ?? 'Sem operadora'}
                </small>
              </article>
            ))}
          </div>
        </section>

        {prolongedTickets.length > 0 && (
          <section style={{ ...styles.card, borderLeft: `4px solid ${brand.warning}` }}>
            <h2 style={styles.cardTitle}>Atendimentos prolongados</h2>
            {prolongedTickets.map((ticket) => (
              <div key={ticket.id} style={styles.row}>
                <span>
                  {ticket.code} - {ticket.representative?.fullName} -{' '}
                  {ticket.serviceStartedAt ? elapsedMinutes(ticket.serviceStartedAt) : 0} min
                </span>
                <div style={styles.actions}>
                  <Button
                    size="sm"
                    onClick={() => setPendingAction({ kind: 'correct-finish', ticket })}
                  >
                    Finalizar
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setPendingAction({ kind: 'correct-cancel', ticket })}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ))}
          </section>
        )}

        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Fila ativa</h2>
          <TicketTable
            tickets={activeTickets}
            ActionComponent={CancelTicketAction}
            onSelect={setPendingAction}
          />
        </section>

        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Chamadas recentes</h2>
          <TicketTable
            tickets={overview?.recent ?? []}
            ActionComponent={RestoreTicketAction}
            onSelect={setPendingAction}
          />
        </section>

        {pendingAction && (
          <ConfirmDialog
            title={pendingActionTitle(pendingAction.kind)}
            description={`Senha ${pendingAction.ticket.code}`}
            loading={loading}
            onConfirm={(reason) => {
              const { ticket } = pendingAction
              if (pendingAction.kind === 'cancel') {
                void execute(() => api.post(`/tickets/${ticket.id}/cancel`, { reason }))
              } else if (pendingAction.kind === 'restore') {
                void execute(() => api.post(`/tickets/${ticket.id}/restore`, { reason }))
              } else {
                void execute(() =>
                  api.post(`/tickets/${ticket.id}/correct`, {
                    action: pendingAction.kind === 'correct-finish' ? 'FINISH' : 'CANCEL',
                    reason,
                  }),
                )
              }
            }}
            onClose={() => {
              setPendingAction(null)
            }}
          />
        )}
      </div>
    </div>
  )
}

function TicketTable({
  tickets,
  ActionComponent,
  onSelect,
}: Readonly<{
  tickets: Ticket[]
  ActionComponent: TicketActionComponent
  onSelect: (action: PendingAction) => void
}>) {
  return (
    <div className="gb-table-wrap">
      <table className="gb-table">
        <thead>
          <tr>
            <th>Senha</th>
            <th>Estado</th>
            <th>RE</th>
            <th>Espera</th>
            <th>Canal</th>
            <th>Caixa</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket.id}>
              <td>{ticket.code}</td>
              <td>{ticketStateLabel(ticket.state)}</td>
              <td>{ticket.representative?.fullName ?? '-'}</td>
              <td>{elapsedMinutes(ticket.createdAt)} min</td>
              <td>{entryChannelLabel(ticket.entryChannel)}</td>
              <td>{ticket.counter?.number ?? '-'}</td>
              <td>
                <ActionComponent ticket={ticket} onSelect={onSelect} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  ...layout,
  content: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '1.5rem 1.5rem 3rem',
  },
  metrics: {
    marginBottom: '1rem',
  },
  cardTitle: {
    margin: '0 0 0.75rem',
    fontSize: '1.05rem',
    color: brand.green800,
  },
  adminContext: {
    margin: '-0.35rem 0 1rem',
    color: brand.inkMuted,
    fontSize: '0.88rem',
  },
  counterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '0.5rem',
  },
  counter: {
    display: 'grid',
    gap: '0.25rem',
    padding: '0.75rem',
    background: brand.green50,
    border: `1px solid ${brand.border}`,
    borderRadius: 8,
  },
  counterState: {
    fontSize: '0.8rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    color: brand.green700,
  },
  counterOperator: {
    color: brand.inkMuted,
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.5rem 0',
    borderBottom: `1px solid ${brand.warningBorder}`,
    flexWrap: 'wrap',
  },
}
