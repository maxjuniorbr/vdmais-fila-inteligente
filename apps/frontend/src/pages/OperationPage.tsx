import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'
import { hasStaffSession, logoutStaffSession } from '../auth/session'
import { Alert } from '../components/Alert'
import { AppHeader } from '../components/AppHeader'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { SectionPanel } from '../components/SectionPanel'
import { Select } from '../components/Select'
import { StatusDot } from '../components/StatusDot'
import { StaffLoginForm } from '../components/StaffLoginForm'
import { useSocket } from '../hooks/useSocket'
import { brand } from '../styles/brand'
import { layout } from '../styles/layout'
import { counterStateLabel, ticketStateLabel } from '../utils/labels'

interface Ticket {
  id: string
  code: string
  state: string
  calledAt?: string
  serviceStartedAt?: string
  representative?: { fullName: string }
  counter?: { id: string; number: number }
}

interface Counter {
  id: string
  number: number
  state: string
  operator?: { id: string; name: string } | null
}

interface QueueOverview {
  waiting: Ticket[]
  calling: Ticket[]
  inService: Ticket[]
  paused: Ticket[]
  recent: Ticket[]
  counters: Counter[]
}

const QUEUE_EVENTS = [
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
]

export function OperationPage() {
  const [authenticated, setAuthenticated] = useState(() => hasStaffSession(['OPERATOR']))
  const [erId, setErId] = useState(() => sessionStorage.getItem('erId') ?? '')
  const [operatorId, setOperatorId] = useState(() => sessionStorage.getItem('staffUserId') ?? '')
  const [counterId, setCounterId] = useState(() => sessionStorage.getItem('counterId') ?? '')
  const [overview, setOverview] = useState<QueueOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pauseReason, setPauseReason] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const socket = useSocket(authenticated ? erId : '')

  const refreshOverview = useCallback(async () => {
    if (!authenticated || !erId) return
    try {
      const data = await api.get<QueueOverview>(`/queues/${erId}/overview`)
      setOverview(data)

      const assigned = data.counters.find((counter) => counter.operator?.id === operatorId)
      if (assigned && assigned.id !== counterId) {
        setCounterId(assigned.id)
        sessionStorage.setItem('counterId', assigned.id)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar operação')
    }
  }, [authenticated, counterId, erId, operatorId])

  useEffect(() => {
    refreshOverview()
    timerRef.current = setInterval(refreshOverview, 15000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [refreshOverview])

  useEffect(() => {
    if (!socket) return
    QUEUE_EVENTS.forEach((event) => socket.on(event, refreshOverview))
    return () => {
      QUEUE_EVENTS.forEach((event) => socket.off(event, refreshOverview))
    }
  }, [refreshOverview, socket])

  const currentCounter = overview?.counters.find((counter) => counter.id === counterId)
  const currentTicket = useMemo(
    () =>
      [...(overview?.calling ?? []), ...(overview?.inService ?? [])].find(
        (ticket) => ticket.counter?.id === counterId,
      ) ?? null,
    [counterId, overview],
  )

  useEffect(() => {
    if (!currentTicket) {
      setElapsed(0)
      return
    }
    const reference = currentTicket.serviceStartedAt ?? currentTicket.calledAt
    if (!reference) return

    const start = new Date(reference).getTime()
    const interval = setInterval(
      () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000))),
      1000,
    )
    return () => clearInterval(interval)
  }, [currentTicket])

  async function act(action: () => Promise<unknown>) {
    setError(null)
    setLoading(true)
    try {
      await action()
      await refreshOverview()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro na operação')
    } finally {
      setLoading(false)
    }
  }

  function selectCounter(id: string) {
    setCounterId(id)
    sessionStorage.setItem('counterId', id)
  }

  async function logout() {
    await logoutStaffSession()
    setAuthenticated(false)
    setOverview(null)
    setCounterId('')
  }

  if (!authenticated) {
    return (
      <StaffLoginForm
        title="Operação da fila"
        allowedRoles={['OPERATOR']}
        onAuthenticated={(profile) => {
          sessionStorage.setItem('staffUserId', profile.id)
          setOperatorId(profile.id)
          setErId(profile.erId ?? '')
          setAuthenticated(true)
        }}
      />
    )
  }

  const hasOpenService = currentTicket?.state === 'IN_SERVICE'
  const isCalling = currentTicket?.state === 'CALLING'
  const counterIsActive = currentCounter?.state === 'ACTIVE'
  const isOwnCounter = currentCounter?.operator?.id === operatorId

  return (
    <div style={styles.shell}>
      <AppHeader
        title="Painel da Operadora"
        subtitle={sessionStorage.getItem('userName') ?? 'Operador'}
        onLogout={() => void logout()}
      />

      <main className="gb-page-content" style={styles.content}>
        {error && <Alert tone="error">{error}</Alert>}

        <div className="gb-grid-operation" style={styles.grid}>
          {/* ── Coluna principal ─────────────────────────────── */}
          <div style={styles.mainColumn}>
            {/* Caixa */}
            <section style={styles.panel}>
              <p style={styles.sectionLabel}>
                <StatusDot color={counterIsActive ? brand.green500 : brand.borderStrong} />
                Caixa
              </p>

              <Select
                style={{ borderRadius: 10 }}
                value={counterId}
                onChange={(event) => selectCounter(event.target.value)}
                disabled={Boolean(currentTicket)}
              >
                <option value="">Selecione um caixa</option>
                {overview?.counters.map((counter) => (
                  <option
                    key={counter.id}
                    value={counter.id}
                    disabled={Boolean(counter.operator && counter.operator.id !== operatorId)}
                  >
                    Caixa {counter.number} - {counterStateLabel(counter.state)}
                    {counter.operator ? ` (${counter.operator.name})` : ''}
                  </option>
                ))}
              </Select>

              {counterId && !currentCounter?.operator && (
                <Button
                  style={{ marginTop: '0.9rem' }}
                  onClick={() => act(() => api.post(`/counters/${counterId}/open`))}
                  disabled={loading}
                >
                  Assumir e abrir caixa
                </Button>
              )}

              {isOwnCounter && (
                <div style={styles.counterActions}>
                  {currentCounter.state === 'ACTIVE' && (
                    <>
                      <Input
                        style={{ flex: 1, minWidth: 160, borderRadius: 10 }}
                        placeholder="Motivo da pausa"
                        value={pauseReason}
                        onChange={(event) => setPauseReason(event.target.value)}
                      />
                      <Button
                        variant="secondary"
                        onClick={() =>
                          act(() =>
                            api.post(`/counters/${counterId}/pause`, { reason: pauseReason }),
                          ).then(() => setPauseReason(''))
                        }
                        disabled={loading || !pauseReason.trim()}
                      >
                        Pausar
                      </Button>
                    </>
                  )}
                  {currentCounter.state === 'PAUSED' && (
                    <Button
                      variant="secondary"
                      onClick={() => act(() => api.post(`/counters/${counterId}/resume`))}
                      disabled={loading}
                    >
                      Retomar
                    </Button>
                  )}
                  {['ACTIVE', 'PAUSED'].includes(currentCounter.state) && !currentTicket && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        act(() => api.post(`/counters/${counterId}/close`)).then(() =>
                          selectCounter(''),
                        )
                      }
                      disabled={loading}
                    >
                      Fechar caixa
                    </Button>
                  )}
                </div>
              )}
            </section>

            {/* Senha atual */}
            <section style={styles.panel}>
              <p style={styles.sectionLabel}>
                <StatusDot />
                Senha atual
              </p>

              <div style={styles.currentRow}>
                <div>
                  {currentTicket ? (
                    <span style={styles.currentCode}>{currentTicket.code}</span>
                  ) : (
                    <span style={styles.currentEmpty} />
                  )}
                  <p style={styles.currentState}>
                    Estado: {currentTicket ? ticketStateLabel(currentTicket.state) : 'Nenhuma'}
                    {currentTicket && (
                      <span style={styles.elapsed}>
                        {' · '}
                        {Math.floor(elapsed / 60)}m {elapsed % 60}s
                      </span>
                    )}
                  </p>
                </div>

                <Button
                  onClick={() => act(() => api.post(`/queues/${erId}/call-next`, { counterId }))}
                  disabled={loading || !counterId || !counterIsActive || Boolean(currentTicket)}
                >
                  Chamar próximo
                </Button>
              </div>

              {(isCalling || hasOpenService) && (
                <div style={styles.ticketActions}>
                  {isCalling && (
                    <>
                      <Button
                        onClick={() =>
                          act(() => api.post(`/tickets/${currentTicket.id}/start-service`))
                        }
                        disabled={loading}
                      >
                        Iniciar atendimento
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => act(() => api.post(`/tickets/${currentTicket.id}/no-show`))}
                        disabled={loading}
                      >
                        Não compareceu
                      </Button>
                    </>
                  )}
                  {hasOpenService && (
                    <Button
                      onClick={() =>
                        act(() => api.post(`/tickets/${currentTicket.id}/finish-service`))
                      }
                      disabled={loading}
                    >
                      Finalizar atendimento
                    </Button>
                  )}
                </div>
              )}

              {hasOpenService && (
                <p style={styles.warning}>
                  Atendimento em aberto. Finalize antes de chamar o próximo.
                </p>
              )}
            </section>
          </div>

          {/* ── Coluna lateral — status da fila ──────────────── */}
          <aside style={styles.sideColumn}>
            <SectionPanel
              label="Aguardando"
              dotColor={brand.gold400}
              count={overview?.waiting.length ?? 0}
            >
              {(overview?.waiting.length ?? 0) === 0 ? (
                <p style={styles.dim}>Nenhum</p>
              ) : (
                <div style={styles.panelList}>
                  {overview?.waiting.slice(0, 8).map((ticket) => (
                    <div key={ticket.id} style={styles.panelRow}>
                      <strong>{ticket.code}</strong>
                      <span style={styles.rowName}>{ticket.representative?.fullName ?? '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </SectionPanel>
            <SectionPanel
              label="Pausados"
              dotColor={brand.warning}
              count={overview?.paused.length ?? 0}
            >
              {(overview?.paused.length ?? 0) === 0 ? (
                <p style={styles.dim}>Nenhum</p>
              ) : (
                <div style={styles.panelList}>
                  {overview?.paused.slice(0, 8).map((ticket) => (
                    <div key={ticket.id} style={styles.panelRow}>
                      <strong>{ticket.code}</strong>
                      <span style={styles.rowName}>{ticket.representative?.fullName ?? '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </SectionPanel>
            <SectionPanel
              label="Em atendimento"
              dotColor={brand.green500}
              count={overview?.inService.length ?? 0}
            >
              {(overview?.inService.length ?? 0) === 0 ? (
                <p style={styles.dim}>Nenhum</p>
              ) : (
                <div style={styles.panelList}>
                  {overview?.inService.slice(0, 8).map((ticket) => (
                    <div key={ticket.id} style={styles.panelRow}>
                      <strong>{ticket.code}</strong>
                      <span style={styles.rowName}>
                        {ticket.counter ? `Caixa ${ticket.counter.number} · ` : ''}
                        {ticket.representative?.fullName ?? '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionPanel>
          </aside>
        </div>

        {/* ── Chamadas recentes ──────────────────────────────── */}
        <section style={styles.panel}>
          <p style={styles.sectionLabel}>
            <StatusDot />
            Chamadas recentes
          </p>
          {(overview?.recent.length ?? 0) === 0 ? (
            <p style={styles.dim}>Nenhuma chamada recente</p>
          ) : (
            <div style={styles.chipRow}>
              {overview?.recent.slice(0, 8).map((ticket) => (
                <span key={ticket.id} style={styles.chip}>
                  <StatusDot color={brand.green400} />
                  <strong>{ticket.code}</strong>
                  <span style={styles.chipState}>{ticketStateLabel(ticket.state)}</span>
                </span>
              ))}
            </div>
          )}
        </section>
      </main>
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
  grid: {
    // Colunas definidas pela classe .gb-grid-operation (responsiva)
    marginBottom: '1.25rem',
  },
  mainColumn: {
    display: 'grid',
    gap: '1.25rem',
  },
  sideColumn: {
    display: 'grid',
    gap: '1.25rem',
  },
  counterActions: {
    display: 'flex',
    gap: '0.6rem',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: '0.9rem',
  },
  ticketActions: {
    display: 'flex',
    gap: '0.6rem',
    flexWrap: 'wrap',
    marginTop: '1rem',
  },
  currentRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    flexWrap: 'wrap',
  },
  currentCode: {
    fontSize: '2.4rem',
    fontWeight: 800,
    color: brand.green800,
    letterSpacing: '0.04em',
    lineHeight: 1,
  },
  currentEmpty: {
    display: 'inline-block',
    width: 44,
    height: 6,
    borderRadius: 3,
    background: brand.borderStrong,
    verticalAlign: 'middle',
  },
  currentState: {
    margin: '0.6rem 0 0',
    color: brand.inkMuted,
    fontSize: '0.9rem',
  },
  elapsed: {
    color: brand.inkMuted,
  },
  warning: {
    margin: '1rem 0 0',
    padding: '0.65rem 0.85rem',
    borderRadius: 10,
    background: brand.warningSoft,
    border: `1px solid ${brand.warningBorder}`,
    color: brand.warning,
    fontWeight: 600,
    fontSize: '0.9rem',
  },
  panelList: {
    display: 'grid',
    gap: '0.5rem',
  },
  rowName: {
    color: brand.inkSoft,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.6rem',
  },
  dim: {
    color: brand.inkMuted,
    fontSize: '0.9rem',
    margin: 0,
  },
}
