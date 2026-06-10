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
  recent: Call[]
  inService: InService[]
  waiting: WaitingTicket[]
  avgServiceSeconds: number | null
  avgWaitSeconds: number | null
}

/** Remove um ticket de uma lista pelo seu ticketId (helper puro reutilizável). */
function withoutTicket<T extends { ticketId: string }>(list: T[], ticketId: string): T[] {
  return list.filter((item) => item.ticketId !== ticketId)
}

export function PanelPage() {
  const { erId } = useParams<{ erId: string }>()
  const socket = useSocket(erId ?? '', 'panel')
  const [current, setCurrent] = useState<Call | null>(null)
  const [recent, setRecent] = useState<Call[]>([])
  const [inService, setInService] = useState<InService[]>([])
  const [waiting, setWaiting] = useState<WaitingTicket[]>([])
  const [avgServiceSeconds, setAvgServiceSeconds] = useState<number | null>(null)
  const [avgWaitSeconds, setAvgWaitSeconds] = useState<number | null>(null)
  const displayedCalls = useRef(new Set<string>())

  // Lock body scroll while panel is mounted (TV mode)
  useEffect(() => {
    const prev = { overflow: document.documentElement.style.overflow, height: document.documentElement.style.height }
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

  const fetchPanelState = useCallback(async () => {
    if (!erId) return
    try {
      const response = await fetch(`/api/panel/${erId}/state`)
      if (!response.ok) return
      const state = (await response.json()) as PanelState
      setCurrent(state.current)
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

  useEffect(() => {
    if (!socket) return

    socket.on('ticket.called', (call: Call) => {
      setCurrent(call)
      setRecent((previous) => [call, ...withoutTicket(previous, call.ticketId)].slice(0, 5))
      setWaiting((previous) => withoutTicket(previous, call.ticketId))
    })
    socket.on('ticket.created', fetchPanelState)
    socket.on('ticket.service_started', (ticket: InService) => {
      setCurrent((active) => (active?.ticketId === ticket.ticketId ? null : active))
      setInService((previous) => [...withoutTicket(previous, ticket.ticketId), ticket])
    })
    socket.on('ticket.service_finished', ({ ticketId }: { ticketId: string }) => {
      setInService((previous) => withoutTicket(previous, ticketId))
      // Refresh to pick up updated avgServiceSeconds
      void fetchPanelState()
    })
    socket.on('ticket.no_show', ({ ticketId }: { ticketId: string }) => {
      setCurrent((active) => (active?.ticketId === ticketId ? null : active))
    })
    socket.on('ticket.cancelled', ({ ticketId }: { ticketId: string }) => {
      setCurrent((active) => (active?.ticketId === ticketId ? null : active))
      setInService((previous) => withoutTicket(previous, ticketId))
      setWaiting((previous) => withoutTicket(previous, ticketId))
    })
    socket.on('ticket.paused', ({ ticketId }: { ticketId: string }) => {
      setWaiting((previous) => withoutTicket(previous, ticketId))
    })
    socket.on('ticket.restored', fetchPanelState)

    return () => {
      socket.off('ticket.called')
      socket.off('ticket.created')
      socket.off('ticket.service_started')
      socket.off('ticket.service_finished')
      socket.off('ticket.no_show')
      socket.off('ticket.cancelled')
      socket.off('ticket.paused')
      socket.off('ticket.restored', fetchPanelState)
    }
  }, [fetchPanelState, socket])

  useEffect(() => {
    if (!erId || !current || displayedCalls.current.has(current.ticketId)) return
    displayedCalls.current.add(current.ticketId)
    void fetch(`/api/telemetry/panel/${erId}/tickets/${current.ticketId}/displayed`, {
      method: 'POST',
    })
  }, [current, erId])

  return (
    <main style={styles.page}>

      {/* ── CHAMANDO AGORA ─────────────────────────────────────────────── */}
      <section
        style={{ ...styles.heroBox, ...(current ? styles.heroActive : {}) }}
        aria-live="assertive"
        aria-label={current ? 'Chamando agora' : 'Painel de chamadas'}
      >
        <span style={styles.heroLabel}>
          {current ? 'CHAMANDO AGORA' : 'PAINEL DE CHAMADAS'}
        </span>
        {current ? (
          <>
            <div style={styles.heroPair}>
              <span style={styles.heroCode}>{current.code}</span>
              <span style={styles.heroDivider} />
              <span style={styles.heroCaixa}>CAIXA {current.counterNumber}</span>
            </div>
            <span style={styles.heroName}>{current.displayName}</span>
          </>
        ) : (
          <div style={styles.heroIdle}>
            <span style={styles.heroEmpty}>Aguardando próxima chamada</span>
            <span style={styles.heroIdleHint}>Acompanhe sua senha neste painel</span>
          </div>
        )}
      </section>

      {/* ── TRÊS COLUNAS ───────────────────────────────────────────────── */}
      <section style={styles.columns}>

        {/* Fila de espera */}
        <div style={styles.col}>
          <p style={styles.colHeader}>
            AGUARDANDO{waiting.length > 0 ? ` · ${waiting.length}` : ''}
          </p>
          {waiting.length === 0
            ? <p style={styles.dim}>Nenhuma senha</p>
            : waiting.slice(0, 8).map((ticket) => (
              <div key={ticket.ticketId} style={styles.row}>
                <span style={styles.rowCode}>{ticket.code}</span>
                <span style={styles.rowPos}>#{ticket.position}</span>
              </div>
            ))}
        </div>

        {/* Em atendimento */}
        <div style={styles.col}>
          <p style={styles.colHeader}>EM ATENDIMENTO</p>
          {inService.length === 0
            ? <p style={styles.dim}>Nenhum</p>
            : inService.slice(0, 8).map((ticket) => (
              <div key={ticket.ticketId} style={styles.row}>
                <span style={styles.rowCode}>{ticket.code}</span>
                <span style={styles.rowPos}>CX {ticket.counterNumber}</span>
              </div>
            ))}
        </div>

        {/* Chamadas recentes + tempo médio */}
        <div style={styles.col}>
          <p style={styles.colHeader}>CHAMADAS RECENTES</p>
          {recent.length === 0
            ? <p style={styles.dim}>Nenhuma chamada</p>
            : recent.slice(0, 5).map((call) => (
              <div key={call.ticketId} style={styles.row}>
                <span style={styles.rowCode}>{call.code}</span>
                <span style={styles.rowName}>{call.displayName}</span>
                <span style={styles.rowPos}>CX {call.counterNumber}</span>
              </div>
            ))}

          {avgServiceSeconds !== null && (
            <div style={styles.avgBox}>
              <span style={styles.avgLabel}>TEMPO MÉDIO DE ESPERA</span>
              <span style={styles.avgValue}>
                {avgWaitSeconds === null
                  ? '—'
                  : `${Math.floor(avgWaitSeconds / 60)}m ${avgWaitSeconds % 60}s`}
              </span>
              <span style={{ ...styles.avgLabel, marginTop: '0.8vh' }}>TEMPO MÉDIO DE ATENDIMENTO</span>
              <span style={styles.avgValue}>
                {Math.floor(avgServiceSeconds / 60)}m {avgServiceSeconds % 60}s
              </span>
            </div>
          )}
          {avgWaitSeconds !== null && avgServiceSeconds === null && (
            <div style={styles.avgBox}>
              <span style={styles.avgLabel}>TEMPO MÉDIO DE ESPERA</span>
              <span style={styles.avgValue}>
                {Math.floor(avgWaitSeconds / 60)}m {avgWaitSeconds % 60}s
              </span>
            </div>
          )}
        </div>

      </section>
    </main>
  )
}

const TV = {
  canvas: '#f3f6f4',
  surface: '#ffffff',
  ink: '#17231e',
  inkSoft: '#405149',
  inkMuted: '#718078',
  greenDark: '#214d3d',
  greenSoft: '#e8f1ed',
  border: '#d8e0dc',
  divider: '#e6ebe8',
}

const styles: Record<string, React.CSSProperties> = {
  /* ── Root ── */
  page: {
    position: 'fixed',
    inset: 0,
    display: 'grid',
    gridTemplateRows: '40% 1fr',
    padding: '1.2vw',
    gap: '1.2vw',
    boxSizing: 'border-box',
    background: TV.canvas,
    color: TV.ink,
    fontFamily: "'Segoe UI', Arial, sans-serif",
    overflow: 'hidden',
  },

  /* ── Hero — chamando agora ── */
  heroBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: TV.surface,
    border: `1px solid ${TV.border}`,
    borderRadius: '1vw',
    overflow: 'hidden',
    gap: '1.3vh',
    padding: '1.5vh 2vw',
    boxSizing: 'border-box',
    boxShadow: '0 0.4vh 1.8vh rgba(23, 35, 30, 0.04)',
  },
  heroActive: {
    borderColor: '#a9c7bb',
    boxShadow: '0 0.6vh 2.2vh rgba(50, 107, 87, 0.1)',
  },
  heroLabel: {
    fontSize: 'min(1.25vw, 1.9vh)',
    letterSpacing: '0.24em',
    color: TV.inkMuted,
    fontWeight: 700,
    flexShrink: 0,
  },
  heroPair: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '3vw',
    maxWidth: '100%',
  },
  heroCode: {
    fontSize: 'min(10vw, 16vh)',
    fontWeight: 900,
    lineHeight: 1,
    color: TV.greenDark,
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
  },
  heroDivider: {
    width: '2px',
    alignSelf: 'stretch',
    background: TV.border,
    borderRadius: '2px',
    flexShrink: 0,
  },
  heroCaixa: {
    padding: '0.16em 0.35em',
    borderRadius: '0.22em',
    background: TV.greenSoft,
    fontSize: 'min(5.5vw, 9vh)',
    color: TV.greenDark,
    fontWeight: 800,
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
  },
  heroName: {
    fontSize: 'min(2.8vw, 4vh)',
    fontWeight: 700,
    color: TV.inkSoft,
    letterSpacing: '0.04em',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'center',
  },
  heroIdle: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.2vh',
    textAlign: 'center',
  },
  heroEmpty: {
    fontSize: 'min(3vw, 4.8vh)',
    color: TV.inkSoft,
    fontWeight: 650,
  },
  heroIdleHint: {
    fontSize: 'min(1.55vw, 2.4vh)',
    color: TV.inkMuted,
    fontWeight: 600,
  },

  /* ── Três colunas ── */
  columns: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '1.2vw',
    overflow: 'hidden',
    minHeight: 0,
  },
  col: {
    background: TV.surface,
    border: `1px solid ${TV.border}`,
    borderRadius: '0.8vw',
    padding: '1vw 1.2vw',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.55vh',
    minHeight: 0,
    boxShadow: '0 0.25vh 1vh rgba(23, 35, 30, 0.025)',
  },
  colHeader: {
    margin: '0 0 0.55vh',
    padding: '0 0 0.85vh',
    borderBottom: `1px solid ${TV.divider}`,
    fontSize: '1.12vw',
    letterSpacing: '0.13em',
    color: TV.inkMuted,
    fontWeight: 700,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.7vw',
    minHeight: '4.5vh',
    padding: '0.45vh 0.15vw',
    borderBottom: `1px solid ${TV.divider}`,
    background: TV.surface,
    flexShrink: 0,
    overflow: 'hidden',
    maxWidth: '100%',
    boxSizing: 'border-box',
  },
  rowCode: {
    fontSize: '1.8vw',
    fontWeight: 750,
    color: TV.greenDark,
    minWidth: '5vw',
    flexShrink: 0,
  },
  rowName: {
    fontSize: '1.35vw',
    color: TV.inkSoft,
    fontWeight: 500,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowPos: {
    fontSize: '1.2vw',
    color: TV.inkMuted,
    fontWeight: 650,
    marginLeft: 'auto',
    whiteSpace: 'nowrap',
  },

  /* ── Tempo médio ── */
  avgBox: {
    marginTop: 'auto',
    paddingTop: '1vh',
    borderTop: `1px solid ${TV.divider}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3vh',
  },
  avgLabel: {
    fontSize: '0.9vw',
    letterSpacing: '0.1em',
    color: TV.inkMuted,
    fontWeight: 650,
  },
  avgValue: {
    fontSize: '1.65vw',
    fontWeight: 700,
    color: TV.inkSoft,
  },

  dim: {
    color: TV.inkMuted,
    fontSize: '1.25vw',
    fontWeight: 500,
    margin: '0.6vh 0',
  },
}
