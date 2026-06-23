import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Navigate } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { Alert } from '../components/Alert'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Select } from '../components/Select'
import { Spinner } from '../components/Spinner'
import { Table, type Column } from '../components/Table'
import { ToastProvider, useToast } from '../components/Toast'
import { useStaffSession } from '../auth/useStaffSession'
import { logoutStaffSession } from '../auth/session'
import { api } from '../api/client'
import { brand } from '../styles/brand'
import { layout } from '../styles/layout'
import {
  counterStateLabel,
  counterStateTone,
  PRIORITY_LABEL,
  PRIORITY_TONE,
  ticketStateLabel,
  ticketStateTone,
} from '../utils/labels'

interface Er {
  id: string
  name: string
  isDayOpen: boolean
}

interface OperatorRow {
  id: string
  name: string
  email: string
  hasOpenCounter: boolean
  counterNumber: number | null
}

interface CounterRow {
  id: string
  number: number
  state: string
  operator: { id: string; name: string } | null
  isFree: boolean
}

interface RepresentativeRow {
  id: string
  fullName: string
  reCode: string
  ticket: { id: string; code: string; state: string } | null
}

interface TicketLite {
  id: string
  code: string
  queuePosition?: number
  isPriority?: boolean
  counter?: { number: number } | null
  representative?: { fullName: string } | null
}

interface Overview {
  isDayOpen: boolean
  waiting: TicketLite[]
  calling: TicketLite[]
  inService: TicketLite[]
  paused: TicketLite[]
}

interface BatchResult<T> {
  results: T[]
}

interface OpenCountersResponse extends BatchResult<{ counterId: string; opened: boolean; counterNumber?: number; operator?: { name: string }; reason?: string }> {
  opened: number
  skipped: number
}

interface AddQueueResponse extends BatchResult<{ representativeId: string; included: boolean; code?: string; reason?: string }> {
  included: number
  ignored: number
}

function Section({ title, action, children }: Readonly<{ title: string; action?: React.ReactNode; children: React.ReactNode }>) {
  return (
    <section style={layout.card}>
      <div style={styles.sectionHead}>
        <h2 style={styles.sectionTitle}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

type StateRow = TicketLite & { state: string }

// Retorno de uma ação: string = sucesso; objeto = mensagem + tom (ex.: info para
// um "não deu, mas tudo bem"); void = sem toast. Lançar = erro.
type ActionOutcome = string | { message: string; tone: 'success' | 'info' } | void

const STATE_COLUMNS: Column<StateRow>[] = [
  {
    key: 'code',
    header: 'Senha',
    render: (row) => (
      <span style={styles.codeCell}>
        <span style={styles.code}>{row.code}</span>
        {row.isPriority && <Badge tone={PRIORITY_TONE}>{PRIORITY_LABEL}</Badge>}
      </span>
    ),
  },
  {
    key: 'state',
    header: 'Estado',
    render: (row) => (
      <Badge tone={ticketStateTone(row.state)}>{ticketStateLabel(row.state)}</Badge>
    ),
  },
  { key: 'counter', header: 'Caixa', render: (row) => (row.counter ? `Caixa ${row.counter.number}` : '—') },
  { key: 'representative', header: 'Representante', render: (row) => row.representative?.fullName ?? '—' },
]

function SimuladorInner({ onLogout }: Readonly<{ onLogout: () => void }>) {
  const { showToast } = useToast()
  const [ers, setErs] = useState<Er[]>([])
  const [erId, setErId] = useState('')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [operators, setOperators] = useState<OperatorRow[]>([])
  const [counters, setCounters] = useState<CounterRow[]>([])
  const [representatives, setRepresentatives] = useState<RepresentativeRow[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const selectedEr = useMemo(() => ers.find((er) => er.id === erId), [ers, erId])
  const freeOperators = useMemo(() => operators.filter((operator) => !operator.hasOpenCounter), [operators])
  const calling = overview?.calling ?? []
  const inService = overview?.inService ?? []
  const stateRows: StateRow[] = overview
    ? [
        ...overview.waiting.map((ticket) => ({ ...ticket, state: 'WAITING' })),
        ...overview.calling.map((ticket) => ({ ...ticket, state: 'CALLING' })),
        ...overview.inService.map((ticket) => ({ ...ticket, state: 'IN_SERVICE' })),
        ...overview.paused.map((ticket) => ({ ...ticket, state: 'PAUSED' })),
      ]
    : []
  // O estado do dia vem do overview (recarregado a cada "Atualizar estado"); a
  // lista de ERs só é buscada no mount, então selectedEr.isDayOpen fica defasado.
  const dayOpen = overview?.isDayOpen ?? selectedEr?.isDayOpen ?? false

  const fail = useCallback((error: unknown) => {
    showToast(error instanceof Error ? error.message : 'Falha na operação', 'error')
  }, [showToast])

  // Sempre aponta para o ER atualmente selecionado. As respostas assíncronas só
  // são aplicadas se ainda corresponderem a este ER — evita que a resposta de um
  // ER anterior sobrescreva os dados do ER recém-selecionado (mistura de dados).
  const currentErRef = useRef('')

  const refresh = useCallback(async (targetEr: string) => {
    if (!targetEr) return
    setLoading(true)
    try {
      const [state, ops, cnts, reps] = await Promise.all([
        api.get<Overview>(`/simulation/state?erId=${targetEr}`),
        api.get<OperatorRow[]>(`/simulation/operators?erId=${targetEr}`),
        api.get<CounterRow[]>(`/simulation/counters?erId=${targetEr}`),
        api.get<RepresentativeRow[]>(`/simulation/representatives?erId=${targetEr}`),
      ])
      if (currentErRef.current !== targetEr) return
      setOverview(state)
      setOperators(ops)
      setCounters(cnts)
      setRepresentatives(reps)
    } catch (error) {
      if (currentErRef.current === targetEr) fail(error)
    } finally {
      if (currentErRef.current === targetEr) setLoading(false)
    }
  }, [fail])

  useEffect(() => {
    api.get<Er[]>('/simulation/ers')
      .then((list) => {
        setErs(list)
        if (list.length > 0) setErId((current) => current || list[0].id)
      })
      .catch(fail)
  }, [fail])

  useEffect(() => {
    currentErRef.current = erId
    // Limpa imediatamente os dados do ER anterior para a tela nunca exibir caixas,
    // fila ou REs de um ER diferente do selecionado enquanto o novo carrega.
    setOverview(null)
    setOperators([])
    setCounters([])
    setRepresentatives([])
    if (erId) void refresh(erId)
  }, [erId, refresh])

  // Esqueleto único de toda ação por linha: trava a linha (busy), executa, mostra
  // o toast retornado (sucesso por padrão, ou info para um "não deu, mas tudo
  // bem"), ou o erro lançado, e recarrega o estado.
  async function runAction(busyKey: string, run: () => Promise<ActionOutcome>) {
    setBusy(busyKey)
    try {
      const outcome = await run()
      if (outcome) {
        const { message, tone } = typeof outcome === 'string' ? { message: outcome, tone: 'success' as const } : outcome
        showToast(message, tone)
      }
      await refresh(erId)
    } catch (error) {
      fail(error)
    } finally {
      setBusy(null)
    }
  }

  function openOne(counterId: string) {
    void runAction(`counter-${counterId}`, async () => {
      const res = await api.post<OpenCountersResponse>('/simulation/counters/open', { erId, counterIds: [counterId] })
      const result = res.results[0]
      // Não conseguir abrir (sem operadora livre, dia fechado...) é um estado
      // operacional esperado, não um erro — informa em tom neutro.
      if (!result?.opened) return { message: result?.reason ?? 'Não foi possível abrir o caixa.', tone: 'info' as const }
      const operatorSuffix = result.operator ? ` · ${result.operator.name}` : ''
      return `Caixa ${result.counterNumber} aberto${operatorSuffix}.`
    })
  }

  function closeOne(counterId: string) {
    void runAction(`counter-${counterId}`, async () => {
      const res = await api.post<{ number: number }>('/simulation/counters/close', { erId, counterId })
      return `Caixa ${res.number} fechado.`
    })
  }

  function callNextOne(counterId: string) {
    void runAction(`counter-${counterId}`, async () => {
      const ticket = await api.post<{ code: string }>('/simulation/counters/call-next', { counterId })
      return `Senha ${ticket.code} chamada.`
    })
  }

  function addToQueue(rep: RepresentativeRow) {
    void runAction(`re-${rep.id}`, async () => {
      const res = await api.post<AddQueueResponse>('/simulation/queue/add-existing', { erId, representativeIds: [rep.id] })
      const result = res.results[0]
      // Ignorada (ex.: já possui senha ativa) é um estado esperado, não um erro.
      if (!result?.included) return { message: result?.reason ?? 'Não foi possível colocar na fila.', tone: 'info' as const }
      return `${rep.reCode} colocada na fila.`
    })
  }

  function pauseRe(rep: RepresentativeRow, ticketId: string) {
    void runAction(`re-${rep.id}`, async () => {
      await api.post('/simulation/queue/pause', { ticketId })
      return `${rep.reCode} marcada como "não estou pronta".`
    })
  }

  function resumeRe(rep: RepresentativeRow, ticketId: string) {
    void runAction(`re-${rep.id}`, async () => {
      await api.post('/simulation/queue/resume', { ticketId })
      return `${rep.reCode} pronta — de volta à fila.`
    })
  }

  function cancelRe(rep: RepresentativeRow, ticketId: string) {
    void runAction(`re-${rep.id}`, async () => {
      await api.post('/simulation/queue/cancel', { ticketId })
      return `${rep.reCode} saiu da fila.`
    })
  }

  function startOne(ticketId: string) {
    void runAction(`attend-${ticketId}`, async () => {
      await api.post('/simulation/attendance/start', { ticketId })
      return 'Atendimento iniciado.'
    })
  }

  function finishOne(ticketId: string) {
    void runAction(`attend-${ticketId}`, async () => {
      await api.post('/simulation/attendance/finish', { ticketId })
      return 'Atendimento encerrado.'
    })
  }

  function noShowOne(ticketId: string) {
    void runAction(`attend-${ticketId}`, async () => {
      await api.post('/simulation/attendance/no-show', { ticketId })
      return 'Não comparecimento registrado.'
    })
  }

  function reActionButtons(rep: RepresentativeRow) {
    const disabled = busy !== null
    const ticket = rep.ticket
    if (!ticket) {
      return (
        <Button size="sm" variant="primary" onClick={() => addToQueue(rep)} disabled={disabled || !dayOpen}>
          Colocar na fila
        </Button>
      )
    }
    if (ticket.state === 'WAITING') {
      return (
        <>
          <Button size="sm" variant="secondary" onClick={() => pauseRe(rep, ticket.id)} disabled={disabled}>
            Não estou pronta
          </Button>
          <Button size="sm" variant="danger" onClick={() => cancelRe(rep, ticket.id)} disabled={disabled}>
            Sair da fila
          </Button>
        </>
      )
    }
    if (ticket.state === 'PAUSED') {
      return (
        <>
          <Button size="sm" variant="primary" onClick={() => resumeRe(rep, ticket.id)} disabled={disabled}>
            Estou pronta
          </Button>
          <Button size="sm" variant="danger" onClick={() => cancelRe(rep, ticket.id)} disabled={disabled}>
            Sair da fila
          </Button>
        </>
      )
    }
    // CALLING / IN_SERVICE são conduzidos pela operadora — a RE não tem ação
    // própria; o estado já é comunicado pelo selo ao lado do nome.
    return null
  }

  function attendanceRow(ticket: TicketLite, state: string) {
    const disabled = busy !== null
    return (
      <div key={ticket.id} style={styles.itemRow}>
        <span style={styles.rowMain}>
          <span style={styles.code}>{ticket.code}</span>
          <span style={styles.itemMeta}>
            Caixa {ticket.counter?.number ?? '-'} · {ticket.representative?.fullName ?? ''}
          </span>
          <Badge tone={ticketStateTone(state)}>{ticketStateLabel(state)}</Badge>
        </span>
        <div style={styles.rowActions}>
          {state === 'CALLING' ? (
            <>
              <Button size="sm" variant="primary" onClick={() => startOne(ticket.id)} disabled={disabled}>
                Iniciar atendimento
              </Button>
              <Button size="sm" variant="danger" onClick={() => noShowOne(ticket.id)} disabled={disabled}>
                Não compareceu
              </Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => finishOne(ticket.id)} disabled={disabled}>
              Encerrar atendimento
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={layout.shell}>
      <AppHeader
        title="Simulador operacional"
        subtitle="Ferramenta interna — não usar em produção"
        actions={
          <Button variant="secondary" onClick={() => refresh(erId)} disabled={loading || !erId}>
            Atualizar estado
          </Button>
        }
        onLogout={onLogout}
      />

      <main style={layout.page}>
        <Alert tone="warning">
          Console interno de simulação. Cria estados reais no banco — use apenas em ambiente de desenvolvimento.
        </Alert>

        <Section title="Contexto operacional">
          <Select label="ER ativo" value={erId} onChange={(event) => setErId(event.target.value)} disabled={busy !== null}>
            {ers.length === 0 && <option value="">Nenhum ER</option>}
            {ers.map((er) => (
              <option key={er.id} value={er.id}>{er.name}</option>
            ))}
          </Select>
          <div style={styles.chips}>
            <Badge tone={dayOpen ? 'success' : 'danger'}>{dayOpen ? 'Dia aberto' : 'Dia fechado'}</Badge>
            {overview && (
              <>
                <Badge tone="warning">{overview.waiting.length} aguardando</Badge>
                <Badge tone="info">{overview.calling.length} chamando</Badge>
                <Badge tone="success">{overview.inService.length} em atendimento</Badge>
                <Badge tone="neutral">{overview.paused.length} pausadas</Badge>
              </>
            )}
          </div>
          {!dayOpen && (
            <p style={{ ...styles.hint, marginTop: `${brand.spacing[8]}px` }}>
              Abra a operação do dia no app real antes de simular.
            </p>
          )}
        </Section>

        <Section
          title="Abrir caixas"
          action={<span style={styles.hint}>{freeOperators.length} operadora(s) livre(s)</span>}
        >
          {counters.length === 0 ? (
            <p style={styles.empty}>Nenhum caixa cadastrado neste ER.</p>
          ) : (
            <div style={styles.list}>
              {counters.map((counter) => (
                <div key={counter.id} style={styles.itemRow}>
                  <span style={styles.rowMain}>
                    <span style={styles.code}>Caixa {counter.number}</span>
                    <Badge tone={counterStateTone(counter.state)}>
                      {counterStateLabel(counter.state)}
                    </Badge>
                    {counter.operator && <span style={styles.itemMeta}>{counter.operator.name}</span>}
                  </span>
                  <div style={styles.rowActions}>
                    {counter.isFree && (
                      <Button size="sm" variant="primary" onClick={() => openOne(counter.id)} disabled={busy !== null || !dayOpen}>
                        Abrir
                      </Button>
                    )}
                    {counter.state === 'ACTIVE' && (
                      <Button size="sm" variant="primary" onClick={() => callNextOne(counter.id)} disabled={busy !== null || !dayOpen}>
                        Chamar próxima
                      </Button>
                    )}
                    {(counter.state === 'ACTIVE' || counter.state === 'PAUSED') && (
                      <Button size="sm" variant="secondary" onClick={() => closeOne(counter.id)} disabled={busy !== null}>
                        Fechar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="REs (fila e ações da persona)">
          {representatives.length === 0 ? (
            <p style={styles.empty}>Nenhuma RE disponível para este ER.</p>
          ) : (
            <div style={styles.list}>
              {representatives.map((rep) => (
                <div key={rep.id} style={styles.itemRow}>
                  <span style={styles.rowMain}>
                    <span style={styles.code}>{rep.reCode}</span>
                    <span style={styles.itemMeta}>{rep.fullName}</span>
                    {rep.ticket && (
                      <Badge tone={ticketStateTone(rep.ticket.state)}>
                        {ticketStateLabel(rep.ticket.state)}
                      </Badge>
                    )}
                  </span>
                  <div style={styles.rowActions}>{reActionButtons(rep)}</div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Atendimento"
          action={<span style={styles.hint}>{calling.length} a iniciar · {inService.length} em atendimento</span>}
        >
          {calling.length + inService.length === 0 ? (
            <p style={styles.empty}>Nenhuma senha chamada ou em atendimento. Use "Chamar próxima" em um caixa ativo antes.</p>
          ) : (
            <div style={styles.list}>
              {calling.map((ticket) => attendanceRow(ticket, 'CALLING'))}
              {inService.map((ticket) => attendanceRow(ticket, 'IN_SERVICE'))}
            </div>
          )}
        </Section>

        <Section title="Estado atual" action={loading ? <Spinner /> : undefined}>
          <Table
            columns={STATE_COLUMNS}
            rows={stateRows}
            getRowKey={(row) => row.id}
            caption="Estado atual da fila e dos atendimentos"
            emptyMessage="Nenhuma senha ativa no momento."
          />
        </Section>
      </main>
    </div>
  )
}

function SimuladorGate() {
  const [authenticated, setAuthenticated] = useStaffSession(['ADMIN'])

  // Logout, an expired session, or a direct visit without a session all funnel
  // back to the central login (HomePage), the single entry point that routes
  // each role to its area. No per-page login form.
  if (!authenticated) {
    return <Navigate to="/" replace />
  }

  async function handleLogout() {
    await logoutStaffSession()
    setAuthenticated(false)
  }

  return <SimuladorInner onLogout={handleLogout} />
}

export function SimuladorPage() {
  return (
    <ToastProvider>
      <SimuladorGate />
    </ToastProvider>
  )
}

const styles: Record<string, CSSProperties> = {
  sectionHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: `${brand.spacing[12]}px`,
    marginBottom: `${brand.spacing[16]}px`,
  },
  sectionTitle: {
    margin: 0,
    ...brand.typography.subtitle,
    color: brand.ink,
  },
  chips: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: `${brand.spacing[8]}px`,
    marginTop: `${brand.spacing[16]}px`,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: `${brand.spacing[8]}px`,
    maxHeight: 280,
    overflowY: 'auto',
  },
  itemRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: `${brand.spacing[12]}px`,
    padding: `${brand.spacing[8]}px ${brand.spacing[12]}px`,
    background: brand.canvas,
    border: `1px solid ${brand.border}`,
    borderRadius: brand.radius.medium,
  },
  rowMain: {
    display: 'flex',
    alignItems: 'center',
    gap: `${brand.spacing[8]}px`,
    flexWrap: 'wrap',
    minWidth: 0,
  },
  code: {
    ...brand.typography.bodyLarge,
    color: brand.emphasis,
    fontVariantNumeric: 'tabular-nums',
  },
  codeCell: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: `${brand.spacing[8]}px`,
  },
  itemMeta: {
    ...brand.typography.bodySmall,
    color: brand.inkMuted,
  },
  rowActions: {
    display: 'flex',
    gap: `${brand.spacing[8]}px`,
    flexWrap: 'wrap',
    flexShrink: 0,
  },
  hint: {
    margin: 0,
    ...brand.typography.auxiliar,
    color: brand.inkMuted,
  },
  empty: {
    margin: 0,
    ...brand.typography.bodySmall,
    color: brand.inkMuted,
  },
}
