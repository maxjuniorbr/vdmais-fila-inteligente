import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useSocket } from '../hooks/useSocket'

interface Call {
  ticketId: string
  code: string
  displayName: string
  counterNumber: number
  calledAt?: string
}

interface InService {
  ticketId: string
  code: string
  counterNumber: number
}

interface WaitingTicket {
  ticketId: string
  code: string
  position: number
  createdAt: string
}

interface PanelState {
  current: Call | null
  calling: Call[]
  recent: Call[]
  inService: InService[]
  waiting: WaitingTicket[]
  avgServiceSeconds: number | null
  avgWaitSeconds: number | null
}

const REFRESH_EVENTS = [
  'ticket.called',
  'ticket.created',
  'ticket.service_started',
  'ticket.service_finished',
  'ticket.no_show',
  'ticket.cancelled',
  'ticket.paused',
  'ticket.restored',
]

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

export function PanelPage() {
  const { erId } = useParams<{ erId: string }>()
  const socket = useSocket(erId ?? '', 'panel')
  const [current, setCurrent] = useState<Call | null>(null)
  const [calling, setCalling] = useState<Call[]>([])
  const [recent, setRecent] = useState<Call[]>([])
  const [inService, setInService] = useState<InService[]>([])
  const [waiting, setWaiting] = useState<WaitingTicket[]>([])
  const [avgServiceSeconds, setAvgServiceSeconds] = useState<number | null>(null)
  const [avgWaitSeconds, setAvgWaitSeconds] = useState<number | null>(null)
  const [clock, setClock] = useState(() => new Date())
  const displayedCalls = useRef(new Set<string>())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Lock body scroll while panel is mounted (TV mode)
  useEffect(() => {
    const prev = {
      overflow: document.documentElement.style.overflow,
      height: document.documentElement.style.height,
    }
    document.documentElement.style.overflow = 'hidden'
    document.documentElement.style.height = '100%'
    document.body.style.overflow = 'hidden'
    document.body.style.height = '100%'
    document.body.style.margin = '0'
    return () => {
      document.documentElement.style.overflow = prev.overflow
      document.documentElement.style.height = prev.height
      document.body.style.overflow = ''
      document.body.style.height = ''
      document.body.style.margin = ''
    }
  }, [])

  // Wall clock for the header
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 30000)
    return () => clearInterval(id)
  }, [])

  const fetchPanelState = useCallback(async () => {
    if (!erId) return
    try {
      const response = await fetch(`/api/panel/${erId}/state`)
      if (!response.ok) return
      const state = (await response.json()) as PanelState
      setCurrent(state.current)
      setCalling(state.calling ?? [])
      setRecent(state.recent)
      setInService(state.inService)
      setWaiting(state.waiting ?? [])
      setAvgServiceSeconds(state.avgServiceSeconds ?? null)
      setAvgWaitSeconds(state.avgWaitSeconds ?? null)
    } catch {
      // Polling retries automatically; the TV must remain on screen.
    }
  }, [erId])

  useEffect(() => {
    fetchPanelState()
    const interval = setInterval(fetchPanelState, 15000)
    return () => clearInterval(interval)
  }, [fetchPanelState])

  // Any queue event triggers an authoritative refetch (debounced). This keeps
  // the multi-counter "calling" board correct without fragile local merges.
  useEffect(() => {
    if (!socket) return
    const refresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => void fetchPanelState(), 250)
    }
    REFRESH_EVENTS.forEach((event) => socket.on(event, refresh))
    return () => {
      REFRESH_EVENTS.forEach((event) => socket.off(event, refresh))
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [fetchPanelState, socket])

  // Telemetry: record when a freshly called ticket is shown on the panel.
  useEffect(() => {
    if (!erId) return
    calling.forEach((call) => {
      if (displayedCalls.current.has(call.ticketId)) return
      displayedCalls.current.add(call.ticketId)
      void fetch(`/api/telemetry/panel/${erId}/tickets/${call.ticketId}/displayed`, {
        method: 'POST',
      })
    })
  }, [calling, erId])

  const callCount = calling.length
  // TV-friendly column counts: 1→1, 2→2, 3→3, 4→2x2, 5/6→3 cols.
  const columns = callCount <= 1 ? 1 : callCount === 2 || callCount === 4 ? 2 : 3
  // Font scales down as more counters call at once so cards never overflow.
  const codeSize = callCount <= 1 ? 'min(11vw, 17vh)' : callCount <= 2 ? 'min(7vw, 12vh)' : 'min(5vw, 9vh)'
  const nameSize = callCount <= 2 ? 'min(2.6vw, 4vh)' : 'min(1.8vw, 3vh)'
  const caixaSize = callCount <= 2 ? 'min(2vw, 3.2vh)' : 'min(1.4vw, 2.4vh)'

  return (
    <main style={styles.page}>
      {/* ── Cabeçalho ─────────────────────────────────────────── */}
      <header style={styles.header}>
        <span style={styles.brand}>FILA INTELIGENTE</span>
        <span style={styles.clock}>
          {clock.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </header>

      <div style={styles.body}>
        {/* ── Área principal ──────────────────────────────────── */}
        <section style={styles.main}>
          <p style={styles.sectionLabel}>CHAMANDO AGORA</p>

          {callCount === 0 ? (
            <div style={styles.heroEmpty}>
              <span style={styles.heroEmptyText}>Aguardando próxima chamada</span>
            </div>
          ) : (
            <div style={{ ...styles.callGrid, gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
              {calling.map((call) => {
                const isLatest = current?.ticketId === call.ticketId && callCount > 1
                return (
                  <article
                    key={call.ticketId}
                    style={{
                      ...styles.callCard,
                      ...(isLatest ? styles.callCardLatest : null),
                    }}
                  >
                    <span style={{ ...styles.callCode, fontSize: codeSize }}>{call.code}</span>
                    <span style={{ ...styles.callName, fontSize: nameSize }}>
                      {call.displayName}
                    </span>
                    <span style={{ ...styles.callCaixa, fontSize: caixaSize }}>
                      CAIXA {call.counterNumber}
                    </span>
                  </article>
                )
              })}
            </div>
          )}

          {/* Em atendimento — faixa discreta */}
          <div style={styles.inServiceStrip}>
            <span style={styles.stripLabel}>EM ATENDIMENTO</span>
            {inService.length === 0 ? (
              <span style={styles.stripDim}>—</span>
            ) : (
              <div style={styles.stripChips}>
                {inService.slice(0, 8).map((ticket) => (
                  <span key={ticket.ticketId} style={styles.serviceChip}>
                    <strong>{ticket.code}</strong>
                    <span style={styles.serviceChipCaixa}>CX {ticket.counterNumber}</span>
                  </span>
                ))}
                {inService.length > 8 && (
                  <span style={styles.serviceChip}>+{inService.length - 8}</span>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── Sidebar ─────────────────────────────────────────── */}
        <aside style={styles.sidebar}>
          <div style={styles.sideBlock}>
            <p style={styles.sideLabel}>PRÓXIMAS SENHAS</p>
            {waiting.length === 0 ? (
              <p style={styles.sideDim}>Fila vazia</p>
            ) : (
              <div style={styles.nextList}>
                {waiting.slice(0, 5).map((ticket) => (
                  <div key={ticket.ticketId} style={styles.nextRow}>
                    <span style={styles.nextCode}>{ticket.code}</span>
                    <span style={styles.nextPos}>#{ticket.position}</span>
                  </div>
                ))}
                {waiting.length > 5 && (
                  <p style={styles.sideDim}>+{waiting.length - 5} aguardando</p>
                )}
              </div>
            )}
          </div>

          <div style={styles.sideBlock}>
            <p style={styles.sideLabel}>CHAMADAS RECENTES</p>
            {recent.length === 0 ? (
              <p style={styles.sideDim}>Nenhuma chamada</p>
            ) : (
              <div style={styles.recentChips}>
                {recent.slice(0, 6).map((call) => (
                  <span key={call.ticketId} style={styles.recentChip}>
                    <strong>{call.code}</strong>
                    <span style={styles.recentChipCaixa}>CX {call.counterNumber}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {(avgWaitSeconds !== null || avgServiceSeconds !== null) && (
            <div style={styles.avgBlock}>
              {avgWaitSeconds !== null && (
                <div style={styles.avgItem}>
                  <span style={styles.avgLabel}>ESPERA MÉDIA</span>
                  <span style={styles.avgValue}>{formatDuration(avgWaitSeconds)}</span>
                </div>
              )}
              {avgServiceSeconds !== null && (
                <div style={styles.avgItem}>
                  <span style={styles.avgLabel}>ATENDIMENTO MÉDIO</span>
                  <span style={styles.avgValue}>{formatDuration(avgServiceSeconds)}</span>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </main>
  )
}

const GB = {
  bgDeep: '#00301f', // verde profundo marca (canvas da TV)
  bgHero: '#00422c', // cartão de chamada
  bgCol: '#013a27', // blocos secundários
  border: '#056b4c', // borda verde média
  accent: '#d4a843', // dourado (acento)
  textMain: '#ffffff',
  textSub: '#d3ecdf', // verde 100
  textDim: '#7fa593', // verde acinzentado para apoio
  rowDiv: '#0a4d34', // divisor
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    padding: '1.2vw',
    gap: '1vh',
    boxSizing: 'border-box',
    background: GB.bgDeep,
    color: GB.textMain,
    fontFamily: "'Segoe UI', Arial, sans-serif",
    overflow: 'hidden',
  },

  /* Header */
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
    padding: '0 0.5vw',
  },
  brand: {
    fontSize: '1.4vw',
    fontWeight: 800,
    letterSpacing: '0.3em',
    color: GB.accent,
  },
  clock: {
    fontSize: '1.6vw',
    fontWeight: 700,
    color: GB.textSub,
  },

  /* Body split */
  body: {
    flex: 1,
    minHeight: 0,
    display: 'grid',
    gridTemplateColumns: '70% 1fr',
    gap: '1.2vw',
  },

  /* Main column */
  main: {
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1vh',
  },
  sectionLabel: {
    margin: 0,
    fontSize: '1.3vw',
    fontWeight: 700,
    letterSpacing: '0.25em',
    color: GB.accent,
    flexShrink: 0,
  },
  callGrid: {
    flex: 1,
    minHeight: 0,
    display: 'grid',
    gap: '1.2vw',
  },
  callCard: {
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1vh',
    padding: '1.5vh 1.5vw',
    background: GB.bgHero,
    border: `3px solid ${GB.border}`,
    borderRadius: '1vw',
    overflow: 'hidden',
    boxSizing: 'border-box',
  },
  callCardLatest: {
    borderColor: GB.accent,
    boxShadow: `0 0 0 2px ${GB.accent}, 0 0 24px rgba(212,168,67,0.35)`,
  },
  callCode: {
    fontWeight: 900,
    lineHeight: 1,
    color: GB.textMain,
    letterSpacing: '0.04em',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  callName: {
    fontWeight: 600,
    color: GB.textSub,
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'center',
  },
  callCaixa: {
    fontWeight: 800,
    color: GB.accent,
    letterSpacing: '0.1em',
    whiteSpace: 'nowrap',
  },
  heroEmpty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: GB.bgHero,
    border: `3px solid ${GB.rowDiv}`,
    borderRadius: '1vw',
  },
  heroEmptyText: {
    fontSize: '2.4vw',
    color: GB.textDim,
    fontWeight: 600,
  },

  /* In-service strip */
  inServiceStrip: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '1vw',
    padding: '1vh 1.2vw',
    background: GB.bgCol,
    border: `1px solid ${GB.rowDiv}`,
    borderRadius: '0.8vw',
    minHeight: 0,
    overflow: 'hidden',
  },
  stripLabel: {
    fontSize: '0.95vw',
    fontWeight: 700,
    letterSpacing: '0.18em',
    color: GB.textDim,
    flexShrink: 0,
  },
  stripDim: {
    color: GB.textDim,
    fontSize: '1.4vw',
  },
  stripChips: {
    display: 'flex',
    gap: '0.6vw',
    overflow: 'hidden',
    flexWrap: 'nowrap',
  },
  serviceChip: {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: '0.4vw',
    padding: '0.5vh 0.8vw',
    background: GB.bgHero,
    borderRadius: '0.5vw',
    fontSize: '1.4vw',
    fontWeight: 800,
    color: GB.textMain,
    flexShrink: 0,
  },
  serviceChipCaixa: {
    fontSize: '0.85vw',
    fontWeight: 600,
    color: GB.textDim,
  },

  /* Sidebar */
  sidebar: {
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1vh',
    background: GB.bgCol,
    border: `1px solid ${GB.rowDiv}`,
    borderRadius: '0.8vw',
    padding: '1.5vh 1vw',
    overflow: 'hidden',
  },
  sideBlock: {
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6vh',
  },
  sideLabel: {
    margin: 0,
    fontSize: '1.25vw',
    fontWeight: 700,
    letterSpacing: '0.18em',
    color: GB.accent,
    borderBottom: `1px solid ${GB.rowDiv}`,
    paddingBottom: '0.6vh',
  },
  sideDim: {
    color: GB.textDim,
    fontSize: '1.3vw',
    margin: 0,
  },
  nextList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4vh',
    overflow: 'hidden',
  },
  nextRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    padding: '0.5vh 0',
    borderBottom: `1px solid ${GB.rowDiv}`,
  },
  nextCode: {
    fontSize: '2vw',
    fontWeight: 800,
    color: GB.textMain,
  },
  nextPos: {
    fontSize: '1.3vw',
    color: GB.textDim,
  },
  recentChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.6vw',
    overflow: 'hidden',
    maxHeight: '18vh',
  },
  recentChip: {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: '0.5vw',
    padding: '0.8vh 1vw',
    background: GB.bgHero,
    border: `1px solid ${GB.rowDiv}`,
    borderRadius: '999px',
    fontSize: '1.9vw',
    fontWeight: 800,
    color: GB.textSub,
  },
  recentChipCaixa: {
    fontSize: '1.05vw',
    fontWeight: 600,
    color: GB.textDim,
  },

  /* Averages */
  avgBlock: {
    marginTop: 'auto',
    paddingTop: '1vh',
    borderTop: `1px solid ${GB.rowDiv}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.8vh',
    flexShrink: 0,
  },
  avgItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2vh',
  },
  avgLabel: {
    fontSize: '0.85vw',
    letterSpacing: '0.12em',
    color: GB.textDim,
    fontWeight: 700,
  },
  avgValue: {
    fontSize: '1.8vw',
    fontWeight: 800,
    color: GB.accent,
  },
}
