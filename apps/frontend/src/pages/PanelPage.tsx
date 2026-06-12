import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { useSocket } from '../hooks/useSocket'
import { brand } from '../styles/brand'
import { formatDate, formatDuration, formatTimeWithSeconds } from '../utils/format'

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
  'day.opened',
  'day.closed',
]


interface PanelLayout {
  columns: number
  codeSize: string
  nameSize: string
  caixaSize: string
}

// Layout responsivo do quadro "Chamando agora" em função de quantos caixas
// chamam ao mesmo tempo. Fica fora do componente para manter sua complexidade
// cognitiva baixa e evitar ternários aninhados.
function resolvePanelLayout(callCount: number): PanelLayout {
  let columns = 3
  if (callCount <= 1) columns = 1
  else if (callCount === 2 || callCount === 4) columns = 2

  // Fonte da senha diminui conforme mais caixas chamam, para o card não estourar.
  let codeSize = 'min(5vw, 9vh)'
  if (callCount <= 1) codeSize = 'min(11vw, 17vh)'
  else if (callCount <= 2) codeSize = 'min(7vw, 12vh)'

  const nameSize = callCount <= 2 ? 'min(2.6vw, 4vh)' : 'min(1.8vw, 3vh)'
  const caixaSize = callCount <= 2 ? 'min(2vw, 3.2vh)' : 'min(1.4vw, 2.4vh)'

  return { columns, codeSize, nameSize, caixaSize }
}

// "Próximas senhas": total de linhas visíveis e quantas rotacionam abaixo da
// primeira (que fica sempre fixa, indicando quem é a próxima a ser chamada).
const NEXT_VISIBLE = 7
const NEXT_WINDOW = NEXT_VISIBLE - 1
const NEXT_ROTATE_MS = 5000

export function PanelPage() {
  const { erId } = useParams<{ erId: string }>()
  const socket = useSocket(erId ?? '', 'panel')
  const [current, setCurrent] = useState<Call | null>(null)
  const [calling, setCalling] = useState<Call[]>([])
  const [inService, setInService] = useState<InService[]>([])
  const [waiting, setWaiting] = useState<WaitingTicket[]>([])
  const [avgServiceSeconds, setAvgServiceSeconds] = useState<number | null>(null)
  const [avgWaitSeconds, setAvgWaitSeconds] = useState<number | null>(null)
  const [clock, setClock] = useState(() => new Date())
  const [nextPage, setNextPage] = useState(0)
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

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const poolSize = Math.max(0, waiting.length - 1)
    const pages = Math.max(1, Math.ceil(poolSize / NEXT_WINDOW))
    if (pages <= 1) {
      setNextPage(0)
      return
    }
    const id = setInterval(() => setNextPage((p) => (p + 1) % pages), NEXT_ROTATE_MS)
    return () => clearInterval(id)
  }, [waiting.length])

  const fetchPanelState = useCallback(async () => {
    if (!erId) return
    try {
      const response = await fetch(`/api/panel/${erId}/state`)
      if (!response.ok) return
      const state = (await response.json()) as PanelState
      setCurrent(state.current)
      setCalling(state.calling ?? [])
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

  const callCount = calling.length

  // Rodízio das "próximas senhas": a 1ª fica fixa (próxima a chamar) e as demais
  // alternam em janelas, para que toda a fila apareça ao longo do tempo.
  const rotatingPool = waiting.slice(1)
  const rotatingPages = Math.max(1, Math.ceil(rotatingPool.length / NEXT_WINDOW))
  const needsRotation = waiting.length > NEXT_VISIBLE
  const activePage = needsRotation ? nextPage % rotatingPages : 0
  const displayedWaiting = needsRotation
    ? [
        waiting[0],
        ...rotatingPool.slice(activePage * NEXT_WINDOW, activePage * NEXT_WINDOW + NEXT_WINDOW),
      ]
    : waiting.slice(0, NEXT_VISIBLE)
  const { columns, codeSize, nameSize, caixaSize } = resolvePanelLayout(callCount)

  return (
    <main style={styles.page}>
      {/* Keyframes do efeito de "piscar" ao chamar (respeita prefers-reduced-motion via theme.css) */}
      <style>{CALL_PULSE_KEYFRAMES}</style>
      <AppHeader
        title="Painel de Atendimento"
        subtitle="Acompanhe a chamada da sua senha"
        actions={
          <span style={styles.clock}>
            <span style={styles.clockDate}>{formatDate(clock.toISOString())}</span>
            <span style={styles.clockTime}>{formatTimeWithSeconds(clock.toISOString())}</span>
          </span>
        }
      />

      <div style={styles.body}>
        <section style={styles.main}>
          {callCount === 0 ? (
            <div style={styles.heroEmpty}>
              <span style={styles.heroEmptyText}>Aguardando próxima chamada</span>
            </div>
          ) : (
            <div style={{ ...styles.callGrid, gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
              {calling.map((call) => {
                const isCurrent = current?.ticketId === call.ticketId
                return (
                  <article
                    key={call.ticketId}
                    style={{
                      ...styles.callCard,
                      ...(isCurrent ? styles.callCardActive : null),
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

        <aside style={styles.sidebar}>
          <div style={styles.sideBlock}>
            <div style={styles.sideHead}>
              <span style={styles.sideLabel}>PRÓXIMAS SENHAS</span>
              {waiting.length > 0 && (
                <span style={styles.sideCount}>{waiting.length} na fila</span>
              )}
            </div>
            {waiting.length === 0 ? (
              <p style={styles.sideDim}>Fila vazia</p>
            ) : (
              <div style={styles.nextList}>
                {displayedWaiting.map((ticket, index) => {
                  const isNext = index === 0
                  return (
                    <div
                      key={ticket.ticketId}
                      style={{ ...styles.nextRow, ...(isNext ? styles.nextRowFirst : null) }}
                    >
                      <span style={{ ...styles.nextCode, ...(isNext ? styles.nextCodeFirst : null) }}>
                        {ticket.code}
                      </span>
                      <span style={styles.nextMeta}>
                        {isNext && <span style={styles.nextTag}>PRÓXIMA</span>}
                        <span style={styles.nextPos}>{ticket.position}º</span>
                      </span>
                    </div>
                  )
                })}
                {needsRotation && (
                  <p style={styles.queueFooter}>
                    Rodízio das próximas · {waiting.length} na fila
                  </p>
                )}
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

const CALL_PULSE_KEYFRAMES = `
@keyframes gbPanelCall {
  0%, 100% { box-shadow: 0 0 0 0 rgba(38, 79, 236, 0); }
  50% { box-shadow: 0 0 0 10px rgba(38, 79, 236, 0.16); }
}`

const C = {
  canvas: brand.canvas,
  surface: brand.surface,
  surfaceAlt: brand.canvas,
  border: brand.border,
  borderStrong: brand.borderStrong,
  ink: brand.ink,
  inkSoft: brand.inkSoft,
  inkMuted: brand.inkMuted,
  accent: brand.actionable,
  accentSoft: brand.infoSoft,
  accentBorder: brand.infoBorder,
  shadow: brand.shadow,
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    background: C.canvas,
    color: C.ink,
    fontFamily: brand.font,
    overflow: 'hidden',
  },

  clock: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
  },
  clockDate: {
    fontSize: brand.typography.bodyLarge.fontSize,
    fontWeight: 600,
    color: brand.inkMuted,
  },
  clockTime: {
    fontSize: brand.typography.heading.fontSize,
    fontWeight: 700,
    color: brand.ink,
    letterSpacing: '0.02em',
  },

  body: {
    flex: 1,
    minHeight: 0,
    display: 'grid',
    gridTemplateColumns: '70% 1fr',
    gap: '1.2vw',
    padding: '1.4vw',
  },

  main: {
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1.2vh',
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
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: '1vw',
    boxShadow: C.shadow,
    overflow: 'hidden',
    boxSizing: 'border-box',
  },
  callCardActive: {
    border: `1px solid ${C.accent}`,
    animation: 'gbPanelCall 1.3s ease-in-out infinite',
  },
  callCode: {
    fontWeight: 900,
    lineHeight: 1,
    color: C.ink,
    letterSpacing: '0.02em',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  callName: {
    fontWeight: 600,
    color: C.inkSoft,
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'center',
  },
  callCaixa: {
    fontWeight: 800,
    color: C.accent,
    letterSpacing: '0.08em',
    whiteSpace: 'nowrap',
  },
  heroEmpty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: C.surface,
    border: `1px dashed ${C.borderStrong}`,
    borderRadius: '1vw',
  },
  heroEmptyText: {
    fontSize: '2.2vw',
    color: C.inkMuted,
    fontWeight: 600,
  },

  inServiceStrip: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '1vw',
    padding: '1.1vh 1.2vw',
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: '0.8vw',
    minHeight: 0,
    overflow: 'hidden',
  },
  stripLabel: {
    fontSize: '0.95vw',
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: C.inkMuted,
    flexShrink: 0,
  },
  stripDim: {
    color: C.inkMuted,
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
    padding: '0.6vh 0.9vw',
    background: C.surfaceAlt,
    border: `1px solid ${C.border}`,
    borderRadius: '0.5vw',
    fontSize: '1.5vw',
    fontWeight: 800,
    color: C.ink,
    flexShrink: 0,
  },
  serviceChipCaixa: {
    fontSize: '0.9vw',
    fontWeight: 600,
    color: C.inkMuted,
  },

  sidebar: {
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1.4vh',
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: '0.8vw',
    padding: '1.6vh 1.1vw',
    boxShadow: C.shadow,
    overflow: 'hidden',
  },
  sideBlock: {
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.8vh',
  },
  sideHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: `1px solid ${C.border}`,
    paddingBottom: '0.6vh',
  },
  sideLabel: {
    margin: 0,
    fontSize: '1.05vw',
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: C.inkSoft,
  },
  sideCount: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '1.7vw',
    padding: '0 0.7vw',
    borderRadius: '999px',
    background: C.accentSoft,
    color: C.accent,
    fontSize: '0.95vw',
    fontWeight: 800,
    whiteSpace: 'nowrap',
  },
  queueFooter: {
    margin: 0,
    paddingTop: '0.6vh',
    fontSize: '1.05vw',
    fontWeight: 600,
    color: C.inkSoft,
  },
  sideDim: {
    color: C.inkMuted,
    fontSize: '1.3vw',
    margin: 0,
  },
  nextList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3vh',
    overflow: 'hidden',
  },
  nextRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.6vh 0.6vw',
    borderBottom: `1px solid ${C.border}`,
  },
  nextRowFirst: {
    background: C.accentSoft,
    borderBottom: 'none',
    boxShadow: `inset 0 0 0 1px ${C.accentBorder}`,
    borderRadius: '0.5vw',
    padding: '0.9vh 0.8vw',
  },
  nextCode: {
    fontSize: '2vw',
    fontWeight: 800,
    color: C.ink,
  },
  nextCodeFirst: {
    color: C.accent,
  },
  nextMeta: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.7vw',
  },
  nextTag: {
    fontSize: '0.85vw',
    fontWeight: 800,
    letterSpacing: '0.12em',
    color: C.surface,
    background: C.accent,
    borderRadius: '999px',
    padding: '0.4vh 0.7vw',
  },
  nextPos: {
    fontSize: '1.3vw',
    fontWeight: 600,
    color: C.inkMuted,
    fontVariantNumeric: 'tabular-nums',
  },

  avgBlock: {
    marginTop: 'auto',
    paddingTop: '1vh',
    borderTop: `1px solid ${C.border}`,
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
    fontSize: '0.9vw',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: C.inkMuted,
    fontWeight: 700,
  },
  avgValue: {
    fontSize: '1.8vw',
    fontWeight: 800,
    color: C.accent,
  },
}
