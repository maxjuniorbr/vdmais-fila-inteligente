import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api } from '../api/client'
import {
  getSessionERId,
  getStaffName,
  getStaffSessionProfile,
  logoutStaffSession,
} from '../auth/session'
import { useStaffSession } from '../auth/useStaffSession'
import { Alert } from '../components/Alert'
import { AppHeader } from '../components/AppHeader'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'
import { SectionPanel } from '../components/SectionPanel'
import { Select } from '../components/Select'
import { StatusDot } from '../components/StatusDot'
import { useToast } from '../components/Toast'
import { useSocket } from '../hooks/useSocket'
import { brand } from '../styles/brand'
import { layout } from '../styles/layout'
import { formatDuration } from '../utils/format'
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
  isDayOpen: boolean
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
  'counter.created',
  'counter.deleted',
  'day.opened',
  'day.closed',
]

export function OperationPage() {
  const [authenticated, setAuthenticated] = useStaffSession(['OPERATOR'])
  const [erId] = useState(() => getSessionERId())
  const [operatorId] = useState(() => getStaffSessionProfile()?.id ?? '')
  const [counterId, setCounterId] = useState(() => sessionStorage.getItem('counterId') ?? '')
  const [overview, setOverview] = useState<QueueOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pauseReason, setPauseReason] = useState('')
  const [confirmingClose, setConfirmingClose] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const socket = useSocket(authenticated ? erId : '')
  const { showToast } = useToast()

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
    if (!reference) {
      setElapsed(0)
      return
    }

    const start = new Date(reference).getTime()
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)))
    // Update immediately so a ticket that has been running for a while doesn't
    // flash "0m 0s" for the first second before the interval ticks.
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [currentTicket])

  async function act(action: () => Promise<unknown>, successMessage?: string): Promise<boolean> {
    setError(null)
    setLoading(true)
    try {
      await action()
      await refreshOverview()
      if (successMessage) showToast(successMessage, 'success')
      return true
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro na operação')
      return false
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

  // Logout, an expired session, or a direct visit without a session all funnel
  // back to the central login (HomePage), which is the single entry point that
  // routes each role to its area. No per-page login form.
  if (!authenticated) {
    return <Navigate to="/" replace />
  }

  const hasOpenService = currentTicket?.state === 'IN_SERVICE'
  const isCalling = currentTicket?.state === 'CALLING'
  const counterIsActive = currentCounter?.state === 'ACTIVE'
  const isOwnCounter = currentCounter?.operator?.id === operatorId

  return (
    <div style={styles.shell}>
      <AppHeader
        title="Painel da Operadora"
        subtitle={getStaffName() || 'Operador'}
        onLogout={() => void logout()}
      />

      <main className="gb-page-content" style={styles.content}>
        {error && <Alert tone="error">{error}</Alert>}

        {overview && !overview.isDayOpen && (
          <Alert tone="warning">
            Operação encerrada. Aguarde a gestora abrir a operação do dia para assumir um caixa e
            chamar senhas.
          </Alert>
        )}

        <div className="gb-grid-operation" style={styles.grid}>
          <div style={styles.mainColumn}>
            <section style={styles.panel}>
              <p style={styles.sectionLabel}>
                <StatusDot color={counterIsActive ? brand.success : brand.borderStrong} />
                Caixa
              </p>

              <Select
                label="Caixa de atendimento"
                style={{ borderRadius: brand.radius.medium }}
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
                  style={{ marginTop: brand.spacing[12] }}
                  onClick={() => act(() => api.post(`/counters/${counterId}/open`), 'Caixa assumido.')}
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
                        label="Motivo da pausa"
                        containerStyle={{ flex: 1, minWidth: 160, marginBottom: 0 }}
                        style={{ flex: 1, minWidth: 160, borderRadius: brand.radius.medium }}
                        placeholder="Motivo da pausa"
                        value={pauseReason}
                        onChange={(event) => setPauseReason(event.target.value)}
                      />
                      <Button
                        variant="secondary"
                        onClick={() =>
                          act(
                            () => api.post(`/counters/${counterId}/pause`, { reason: pauseReason }),
                            'Caixa pausado.',
                          ).then((ok) => {
                            if (ok) setPauseReason('')
                          })
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
                      onClick={() => act(() => api.post(`/counters/${counterId}/resume`), 'Caixa retomado.')}
                      disabled={loading}
                    >
                      Retomar
                    </Button>
                  )}
                  {['ACTIVE', 'PAUSED'].includes(currentCounter.state) && !currentTicket && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setError(null)
                        setConfirmingClose(true)
                      }}
                      disabled={loading}
                    >
                      Fechar caixa
                    </Button>
                  )}
                </div>
              )}
            </section>

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
                        {formatDuration(elapsed)}
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
                        onClick={() => act(() => api.post(`/tickets/${currentTicket.id}/recall`))}
                        disabled={loading}
                      >
                        Chamar novamente
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => act(() => api.post(`/tickets/${currentTicket.id}/no-show`), 'Marcada como não compareceu.')}
                        disabled={loading}
                      >
                        Não compareceu
                      </Button>
                    </>
                  )}
                  {hasOpenService && (
                    <Button
                      onClick={() =>
                        act(() => api.post(`/tickets/${currentTicket.id}/finish-service`), 'Atendimento finalizado.')
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

          <aside style={styles.sideColumn}>
            <SectionPanel
              label="Aguardando"
              dotColor={brand.warning}
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
              dotColor={brand.info}
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
                  <StatusDot
                    color={ticket.state === 'NO_SHOW' ? brand.warning : brand.success}
                  />
                  <strong>{ticket.code}</strong>
                  <span style={styles.chipState}>{ticketStateLabel(ticket.state)}</span>
                </span>
              ))}
            </div>
          )}
        </section>
      </main>

      {confirmingClose && (
        <Modal
          title="Fechar caixa?"
          onClose={() => setConfirmingClose(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmingClose(false)} disabled={loading}>
                Voltar
              </Button>
              <Button
                variant="danger"
                disabled={loading}
                onClick={() =>
                  act(() => api.post(`/counters/${counterId}/close`), 'Caixa fechado.').then((ok) => {
                    if (ok) {
                      selectCounter('')
                      setConfirmingClose(false)
                    }
                  })
                }
              >
                {loading ? 'Fechando...' : 'Fechar caixa'}
              </Button>
            </>
          }
        >
          {error && (
            <Alert tone="error" style={{ marginBottom: `${brand.spacing[12]}px` }}>
              {error}
            </Alert>
          )}
          O caixa será encerrado e você deixará de receber novas senhas. É possível assumir um
          caixa novamente depois.
        </Modal>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  ...layout,
  content: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: `${brand.spacing[24]}px ${brand.spacing[24]}px ${brand.spacing[48]}px`,
  },
  grid: {
    marginBottom: `${brand.spacing[20]}px`,
  },
  mainColumn: {
    display: 'grid',
    gap: `${brand.spacing[20]}px`,
  },
  sideColumn: {
    display: 'grid',
    gap: `${brand.spacing[20]}px`,
  },
  counterActions: {
    display: 'flex',
    gap: `${brand.spacing[8]}px`,
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    marginTop: `${brand.spacing[16]}px`,
  },
  ticketActions: {
    display: 'flex',
    gap: `${brand.spacing[8]}px`,
    flexWrap: 'wrap',
    marginTop: `${brand.spacing[16]}px`,
  },
  currentRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: `${brand.spacing[16]}px`,
    flexWrap: 'wrap',
  },
  currentCode: {
    fontSize: brand.typography.display.fontSize,
    fontWeight: brand.typography.display.fontWeight,
    color: brand.emphasis,
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
    fontSize: brand.typography.bodySmall.fontSize,
  },
  elapsed: {
    color: brand.inkMuted,
  },
  warning: {
    margin: '1rem 0 0',
    padding: `${brand.spacing[12]}px ${brand.spacing[16]}px`,
    borderRadius: brand.radius.medium,
    background: brand.warningSoft,
    border: `1px solid ${brand.warningBorder}`,
    color: brand.warning,
    fontWeight: 600,
    fontSize: brand.typography.bodySmall.fontSize,
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
    gap: `${brand.spacing[8]}px`,
  },
  dim: {
    color: brand.inkMuted,
    fontSize: brand.typography.bodySmall.fontSize,
    margin: 0,
  },
}
