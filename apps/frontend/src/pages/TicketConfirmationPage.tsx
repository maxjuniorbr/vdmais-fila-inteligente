import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { BrandMark } from '../components/BrandMark'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { brand } from '../styles/brand'

interface TicketInfo {
  id: string
  code: string
  queuePosition: number
  currentPosition: number
  state: string
  erId: string
  representative?: { fullName: string }
  pausedAt?: string | null
  pauseTimeoutSeconds?: number
}

function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/**
 * Countdown + progress bar shown while a ticket is paused. When the configured
 * pause timeout elapses the password is auto-cancelled by the backend; this
 * component fires `onExpire` so the card reflects it immediately.
 */
function PauseCountdown({
  pausedAt,
  pauseTimeoutSeconds,
  onExpire,
}: Readonly<{ pausedAt: string; pauseTimeoutSeconds: number; onExpire: () => void }>) {
  const [now, setNow] = useState(() => Date.now())
  const firedRef = useRef(false)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const deadline = new Date(pausedAt).getTime() + pauseTimeoutSeconds * 1000
  const totalMs = pauseTimeoutSeconds * 1000
  const remainingMs = Math.max(0, deadline - now)
  const remainingSeconds = remainingMs / 1000
  const ratio = totalMs > 0 ? remainingMs / totalMs : 0
  const low = remainingSeconds <= 30

  useEffect(() => {
    if (remainingMs <= 0 && !firedRef.current) {
      firedRef.current = true
      onExpire()
    }
  }, [remainingMs, onExpire])

  const barColor = low ? brand.danger : brand.warning

  return (
    <div style={countdownStyles.wrapper} aria-live="polite">
      <p style={countdownStyles.label}>Tempo restante para retomar</p>
      <p style={{ ...countdownStyles.time, color: barColor }}>{formatMmSs(remainingSeconds)}</p>
      <div style={countdownStyles.track}>
        <div
          style={{
            ...countdownStyles.fill,
            width: `${Math.max(0, Math.min(100, ratio * 100))}%`,
            backgroundColor: barColor,
          }}
        />
      </div>
      <p style={countdownStyles.hint}>
        Se o tempo acabar, sua senha será cancelada automaticamente.
      </p>
    </div>
  )
}

const countdownStyles: Record<string, React.CSSProperties> = {
  wrapper: { marginTop: '0.75rem', textAlign: 'center' },
  label: { margin: 0, fontSize: '0.8rem', color: brand.inkMuted },
  time: {
    margin: '0.15rem 0 0.5rem',
    fontSize: '1.6rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  track: {
    width: '100%',
    height: '8px',
    borderRadius: '999px',
    backgroundColor: brand.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: '999px',
    transition: 'width 1s linear, background-color 0.3s ease',
  },
  hint: { margin: '0.5rem 0 1.25rem', fontSize: '0.75rem', color: brand.inkMuted },
}

function TicketStatus({
  state,
  isPaused,
  currentPosition,
}: Readonly<{ state: string; isPaused: boolean; currentPosition: number }>) {
  if (state === 'IN_SERVICE') {
    return (
      <>
        <p style={styles.positionLabel}>Situação</p>
        <p style={{ ...styles.position, color: brand.success }}>Em atendimento</p>
        <p style={styles.hint}>Você está sendo atendida. Bom atendimento!</p>
      </>
    )
  }
  if (state === 'CALLING') {
    return (
      <>
        <p style={styles.positionLabel}>Situação</p>
        <p style={{ ...styles.position, color: brand.warning }}>Chamada! Dirija-se ao caixa</p>
        <p style={styles.hint}>Sua senha foi chamada. Dirija-se ao caixa indicado no painel.</p>
      </>
    )
  }
  if (isPaused) {
    return (
      <>
        <p style={styles.positionLabel}>Situação</p>
        <p style={{ ...styles.position, color: brand.warning }}>Pausada</p>
        <p style={styles.hint}>
          Quando estiver pronta, retome sua senha. Ela voltará ao fim da fila.
        </p>
      </>
    )
  }
  return (
    <>
      <p style={styles.positionLabel}>Posição na fila</p>
      <p style={{ ...styles.position, color: brand.emphasis }}>
        {currentPosition > 0 ? `#${currentPosition}` : 'Em chamada'}
      </p>
      <p style={styles.hint}>
        Fique atento ao painel. Você será chamado pelo número da senha acima.
      </p>
    </>
  )
}

export function TicketConfirmationPage() {
  const { erId } = useParams<{ erId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [ticket, setTicket] = useState<TicketInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!ticket) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    const activeStates = ['WAITING', 'PAUSED', 'CALLING', 'IN_SERVICE']
    if (!activeStates.includes(ticket.state)) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    const token = sessionStorage.getItem('token')
    if (!token) return
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/tickets/my-active?erId=${erId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.status === 404) {
          // Ticket is no longer active. A paused ticket that vanishes was
          // auto-cancelled (pause timeout); otherwise service completed.
          setTicket((prev) =>
            prev ? { ...prev, state: prev.state === 'PAUSED' ? 'CANCELLED' : 'FINISHED' } : prev,
          )
          return
        }
        if (!res.ok) return
        const data = (await res.json()) as TicketInfo
        setTicket(data)
      } catch {
        /* silently ignore; UI stays with last known state */
      }
    }, 10000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [ticket?.state, ticket?.id, erId])

  useEffect(() => {
    if (!ticket) return
    const token = sessionStorage.getItem('token')
    if (!token || sessionStorage.getItem(`ticket-displayed:${ticket.id}`)) return
    sessionStorage.setItem(`ticket-displayed:${ticket.id}`, '1')
    void fetch(`/api/telemetry/tickets/${ticket.id}/displayed`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
  }, [ticket])

  useEffect(() => {
    const token = sessionStorage.getItem('token')
    if (!token) {
      navigate(`/fila/${erId}`, { replace: true })
      return
    }
    const isLink = searchParams.get('source') === 'link'
    if (isLink && sessionStorage.getItem(`queue-entry:${erId}`) !== 'LINK') {
      navigate(`/fila/${erId}?source=link`, { replace: true })
      return
    }

    fetch('/api/tickets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        erId,
        entryChannel: searchParams.get('source') === 'link' ? 'LINK' : 'QR_CODE',
      }),
    })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) {
          if (res.status === 409) {
            return fetchCurrentTicket(token)
          }
          throw new Error(data.message ?? 'Erro ao entrar na fila')
        }
        return data as TicketInfo
      })
      .then((data) => setTicket(data))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Erro inesperado'))
      .finally(() => setLoading(false))
  }, [erId, navigate, searchParams])

  const handlePauseExpired = useCallback(() => {
    setTicket((prev) => (prev?.state === 'PAUSED' ? { ...prev, state: 'CANCELLED' } : prev))
  }, [])

  async function fetchCurrentTicket(token: string): Promise<TicketInfo> {
    const res = await fetch(`/api/tickets/my-active?erId=${erId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error('Você já está na fila, mas não foi possível obter a senha.')
    return res.json()
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <output style={styles.loadingText}>Entrando na fila...</output>
      </div>
    )
  }

  if (error && !ticket) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={styles.errorTitle}>Ops!</h2>
          <p style={styles.hint}>{error}</p>
          <Button style={{ width: '100%' }} onClick={() => navigate(`/fila/${erId}`)}>
            Voltar
          </Button>
        </div>
      </div>
    )
  }

  if (!ticket) return null

  const token = sessionStorage.getItem('token') ?? ''
  const isPaused = ticket.state === 'PAUSED'

  async function togglePause() {
    if (!ticket) return
    setActionLoading(true)
    setError(null)
    try {
      const endpoint = isPaused ? 'resume' : 'pause'
      const res = await fetch(`/api/tickets/${ticket.id}/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = (await res.json()) as TicketInfo
      if (!res.ok) throw new Error((data as unknown as { message: string }).message ?? 'Erro')
      setTicket(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar senha')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleLeaveQueue() {
    if (!ticket) return
    setConfirmingLeave(false)
    setActionLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/self-cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(data.message ?? 'Erro ao cancelar senha')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao cancelar senha')
      setActionLoading(false)
      return
    }
    sessionStorage.removeItem('token')
    sessionStorage.removeItem(`queue-entry:${erId}`)
    navigate(`/fila/${erId}`)
  }

  const isTerminal = ['FINISHED', 'CANCELLED', 'NO_SHOW'].includes(ticket.state)

  if (isTerminal) {
    const messages: Record<string, { title: string; text: string }> = {
      FINISHED: {
        title: 'Atendimento concluído',
        text: 'Obrigada pela visita! Seu atendimento foi finalizado.',
      },
      CANCELLED: {
        title: 'Senha cancelada',
        text: 'Sua senha foi cancelada. Se precisar, entre na fila novamente.',
      },
      NO_SHOW: {
        title: 'Não comparecimento',
        text: 'Você foi chamada mas não compareceu. Se precisar, entre na fila novamente.',
      },
    }
    const msg = messages[ticket.state] ?? messages.FINISHED

    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.brandRow}>
            <BrandMark size={36} />
          </div>
          <p style={styles.label}>{msg.title}</p>
          <p style={styles.code}>{ticket.code}</p>
          <p style={styles.hint}>{msg.text}</p>
          <Button
            style={{ width: '100%' }}
            onClick={() => {
              sessionStorage.removeItem('token')
              sessionStorage.removeItem(`queue-entry:${erId}`)
              navigate(`/fila/${erId}`)
            }}
          >
            Voltar ao início
          </Button>
        </div>
      </div>
    )
  }

  let pauseLabel = 'Não estou pronta — pausar'
  if (actionLoading) pauseLabel = '...'
  else if (isPaused) pauseLabel = 'Estou pronta — retomar senha'

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.brandRow}>
          <BrandMark size={36} />
        </div>
        {ticket.representative?.fullName && (
          <p style={styles.repName}>{ticket.representative.fullName}</p>
        )}

        <p style={styles.label}>Sua senha</p>
        <p style={styles.code} aria-label={`Sua senha é ${ticket.code}`}>
          {ticket.code}
        </p>

        <div aria-live="polite">
          <TicketStatus
            state={ticket.state}
            isPaused={isPaused}
            currentPosition={ticket.currentPosition}
          />
        </div>

        {isPaused && ticket.pausedAt && (ticket.pauseTimeoutSeconds ?? 0) > 0 && (
          <PauseCountdown
            pausedAt={ticket.pausedAt}
            pauseTimeoutSeconds={ticket.pauseTimeoutSeconds as number}
            onExpire={handlePauseExpired}
          />
        )}

        {(ticket.state === 'WAITING' || isPaused) && (
          <Button
            variant="secondary"
            onClick={togglePause}
            disabled={actionLoading}
            style={styles.pauseBtn}
          >
            {pauseLabel}
          </Button>
        )}

        {error && (
          <Alert tone="error" style={{ marginTop: '0.5rem' }}>
            {error}
          </Alert>
        )}

        {(ticket.state === 'WAITING' || isPaused) && (
          <Button
            variant="danger"
            style={{ width: '100%', marginTop: '0.75rem' }}
            disabled={actionLoading}
            onClick={() => setConfirmingLeave(true)}
          >
            Sair da fila
          </Button>
        )}
      </div>

      {confirmingLeave && (
        <Modal
          title="Sair da fila?"
          onClose={() => setConfirmingLeave(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmingLeave(false)} disabled={actionLoading}>
                Voltar
              </Button>
              <Button variant="danger" disabled={actionLoading} onClick={() => void handleLeaveQueue()}>
                {actionLoading ? 'Saindo...' : 'Sair da fila'}
              </Button>
            </>
          }
        >
          Sua senha será cancelada e você precisará entrar na fila novamente.
        </Modal>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: brand.font,
    padding: '1rem',
    background: brand.canvas,
  },
  card: {
    background: brand.surface,
    border: `1px solid ${brand.border}`,
    borderRadius: brand.radius.large,
    padding: '2rem 1.5rem',
    textAlign: 'center',
    maxWidth: 380,
    width: '100%',
    boxShadow: brand.shadow,
  },
  brandRow: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '1rem',
  },
  label: {
    fontSize: '0.85rem',
    color: brand.inkMuted,
    margin: '0 0 0.25rem',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    fontWeight: 700,
  },
  code: {
    fontSize: 'clamp(3rem, 18vw, 4.5rem)',
    fontWeight: 800,
    color: brand.emphasis,
    margin: '0 0 1.5rem',
    letterSpacing: '0.06em',
    lineHeight: 1.1,
  },
  positionLabel: {
    fontSize: '0.85rem',
    color: brand.inkMuted,
    margin: '0 0 0.25rem',
  },
  position: {
    fontSize: '2rem',
    fontWeight: 700,
    margin: '0 0 1.25rem',
  },
  hint: {
    fontSize: '0.9rem',
    color: brand.inkSoft,
    marginBottom: '1.5rem',
    lineHeight: 1.55,
  },
  repName: {
    fontSize: '1rem',
    fontWeight: 600,
    color: brand.ink,
    margin: '0 0 1.25rem',
  },
  pauseBtn: {
    width: '100%',
    marginBottom: '0.25rem',
  },
  loadingText: {
    color: brand.inkSoft,
    fontSize: '1.05rem',
  },
  errorTitle: {
    margin: '0 0 0.5rem',
    color: brand.ink,
  },
}
