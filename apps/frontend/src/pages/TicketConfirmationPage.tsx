import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { consumeQueueEntryPending, getQueueEntryChannel, getQueueEntryPath } from '../auth/session'
import { BrandMark } from '../components/BrandMark'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { brand } from '../styles/brand'
import { playCallAlert, unlockCallAlert } from '../utils/callAlert'
import { PRIORITY_SERVICE_LABEL } from '../utils/labels'

interface TicketInfo {
  id: string
  code: string
  queuePosition: number
  currentPosition: number
  isPriority?: boolean
  state: string
  erId: string
  representative?: { fullName: string }
  pausedAt?: string | null
  pauseTimeoutSeconds?: number
  calledAt?: string | null
  callTimeoutSeconds?: number
}

function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function Countdown({
  startAt,
  timeoutSeconds,
  label,
  hint,
  onExpire,
}: Readonly<{
  startAt: string
  timeoutSeconds: number
  label: string
  hint: string
  onExpire: () => void
}>) {
  const [now, setNow] = useState(() => Date.now())
  const firedRef = useRef(false)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Re-arm the one-shot expiry latch whenever the deadline changes (e.g. a ticket
  // re-called or re-paused while this instance stays mounted); otherwise onExpire
  // would fire only for the very first deadline.
  useEffect(() => {
    firedRef.current = false
  }, [startAt, timeoutSeconds])

  const deadline = new Date(startAt).getTime() + timeoutSeconds * 1000
  const totalMs = timeoutSeconds * 1000
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
      <p style={countdownStyles.label}>{label}</p>
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
      <p style={countdownStyles.hint}>{hint}</p>
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
  isPriority,
}: Readonly<{ state: string; isPaused: boolean; currentPosition: number; isPriority?: boolean }>) {
  if (state === 'IN_SERVICE') {
    return (
      <>
        <p style={styles.positionLabel}>Situação</p>
        <p style={{ ...styles.position, color: brand.success }}>Em atendimento</p>
        <p style={styles.hint}>Você está em atendimento. Bom atendimento!</p>
      </>
    )
  }
  if (state === 'CALLING') {
    return (
      <>
        <p style={styles.positionLabel}>Situação</p>
        <p className="gb-call-alert" style={{ ...styles.position, color: brand.warning }}>
          Chamada! Dirija-se ao caixa
        </p>
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
          Quando estiver pronta, retome sua senha. Você volta à sua posição, atrás de
          eventuais senhas preferenciais que entraram durante a pausa.
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
      {isPriority && <p style={{ ...styles.hint, color: brand.info }}>{PRIORITY_SERVICE_LABEL}</p>}
      <p style={styles.hint}>
        Fique de olho no painel. Sua senha será chamada pelo número acima.
      </p>
    </>
  )
}

export function TicketConfirmationPage() {
  const { erId } = useParams<{ erId: string }>()
  const navigate = useNavigate()
  const [ticket, setTicket] = useState<TicketInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const entryStartedRef = useRef(false)
  const prevStateRef = useRef<string | null>(null)

  const fetchMyStatus = useCallback(
    (token: string) =>
      fetch(`/api/tickets/my-status?erId=${erId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    [erId],
  )

  // Alert the RE the moment her ticket is called. We only fire on the transition
  // into CALLING (not on initial load) so a page reload while already called
  // does not blast the sound. Audio is unlocked at queue entry; this is a
  // fallback unlock for any direct interaction with this screen.
  useEffect(() => {
    const unlock = () => unlockCallAlert()
    globalThis.addEventListener('pointerdown', unlock, { once: true })
    globalThis.addEventListener('keydown', unlock, { once: true })
    return () => {
      globalThis.removeEventListener('pointerdown', unlock)
      globalThis.removeEventListener('keydown', unlock)
    }
  }, [])

  useEffect(() => {
    const state = ticket?.state ?? null
    if (state === 'CALLING' && prevStateRef.current && prevStateRef.current !== 'CALLING') {
      playCallAlert()
    }
    prevStateRef.current = state
  }, [ticket?.state])

  useEffect(() => {
    if (!ticket) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    // Keep polling until the engagement is truly over. NO_SHOW and CANCELLED are
    // restorable by a manager, so we keep polling to surface a restore (→ WAITING);
    // only FINISHED is final. Polling my-status (not my-active) returns the real
    // state, so a no-show shows as "não comparecimento" instead of "concluído".
    if (ticket.state === 'FINISHED') {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    const token = sessionStorage.getItem('token')
    if (!token) return
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetchMyStatus(token)
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
  }, [ticket?.state, ticket?.id, erId, fetchMyStatus])

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
      navigate(getQueueEntryPath(erId), { replace: true })
      return
    }

    // StrictMode double-invokes effects on mount (and remounts re-run this);
    // guard so the entry/read happens once.
    if (entryStartedRef.current) return
    entryStartedRef.current = true

    // A deliberate entry creates exactly one ticket. A refresh/reopen has no
    // pending intent, so we only READ the current status — a reload must never
    // re-enqueue the RE (e.g. recreating a ticket after a no-show).
    const entering = consumeQueueEntryPending(erId)

    if (entering) {
      const entryChannel = getQueueEntryChannel(erId)
      if (!entryChannel) {
        navigate(getQueueEntryPath(erId), { replace: true })
        return
      }
      fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ erId, entryChannel }),
      })
        .then(async (res) => {
          const data = await res.json()
          if (!res.ok) {
            if (res.status === 409) return fetchCurrentTicket(token)
            throw new Error(data.message ?? 'Erro ao entrar na fila')
          }
          return data as TicketInfo
        })
        .then((data) => setTicket(data))
        .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Erro inesperado'))
        .finally(() => setLoading(false))
      return
    }

    // Read-only path (refresh/reopen): show the real current status. With no
    // ticket at all the RE shouldn't be here, so send her to the entry screen.
    fetchMyStatus(token)
      .then(async (res) => {
        if (res.status === 404) {
          navigate(getQueueEntryPath(erId), { replace: true })
          return null
        }
        if (!res.ok) throw new Error('Não foi possível carregar sua senha')
        return (await res.json()) as TicketInfo
      })
      .then((data) => {
        if (data) setTicket(data)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Erro inesperado'))
      .finally(() => setLoading(false))
  }, [erId, navigate, fetchMyStatus])

  const refetchMyStatus = useCallback((): Promise<void> => {
    const token = sessionStorage.getItem('token')
    if (!token) return Promise.resolve()
    return fetchMyStatus(token)
      .then((res) => (res.ok ? (res.json() as Promise<TicketInfo>) : Promise.reject(new Error('status'))))
      .then((data) => setTicket(data))
  }, [fetchMyStatus])

  const handlePauseExpired = useCallback(() => {
    // A pausa expirada agora RETOMA a senha (volta ao fim da fila), não cancela.
    // Re-busca o status para refletir o novo estado (AGUARDANDO). Se falhar, tenta
    // de novo em 3s para o contador não ficar travado em 00:00 (o polling de 10s
    // também reconcilia, como rede de segurança).
    void refetchMyStatus().catch(() => {
      setTimeout(() => void refetchMyStatus(), 3000)
    })
  }, [refetchMyStatus])

  const handleCallExpired = useCallback(() => {
    setTicket((prev) => (prev?.state === 'CALLING' ? { ...prev, state: 'NO_SHOW' } : prev))
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
          <Button style={{ width: '100%' }} onClick={() => navigate(getQueueEntryPath(erId))}>
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
    const entryPath = getQueueEntryPath(erId)
    sessionStorage.removeItem('token')
    navigate(entryPath)
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
              const entryPath = getQueueEntryPath(erId)
              sessionStorage.removeItem('token')
              navigate(entryPath)
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

        <div aria-live={ticket.state === 'CALLING' ? 'assertive' : 'polite'}>
          <TicketStatus
            state={ticket.state}
            isPaused={isPaused}
            currentPosition={ticket.currentPosition}
            isPriority={ticket.isPriority}
          />
        </div>

        {isPaused && ticket.pausedAt && (ticket.pauseTimeoutSeconds ?? 0) > 0 && (
          <Countdown
            startAt={ticket.pausedAt}
            timeoutSeconds={ticket.pauseTimeoutSeconds as number}
            label="Tempo restante para retomar"
            hint="Se o tempo acabar, sua senha voltará ao fim da fila."
            onExpire={handlePauseExpired}
          />
        )}

        {ticket.state === 'CALLING' && ticket.calledAt && (ticket.callTimeoutSeconds ?? 0) > 0 && (
          <Countdown
            startAt={ticket.calledAt}
            timeoutSeconds={ticket.callTimeoutSeconds as number}
            label="Tempo para chegar ao caixa"
            hint="Se o tempo acabar, sua senha será marcada como não comparecimento."
            onExpire={handleCallExpired}
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
