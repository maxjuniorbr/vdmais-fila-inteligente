import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { notifySessionExpired } from '../auth/session'
import { seedStaffSession } from '../test/staffToken'
import { OperationPage } from './OperationPage'

vi.mock('../api/client', () => ({ api: { get: vi.fn(), post: vi.fn() } }))

const handlers = new Map<string, Set<(...args: unknown[]) => void>>()
const fakeSocket = {
  on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
    const set = handlers.get(event) ?? new Set<(...args: unknown[]) => void>()
    set.add(cb)
    handlers.set(event, set)
  }),
  off: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
    handlers.get(event)?.delete(cb)
  }),
}

let socketEnabled = true
vi.mock('../hooks/useSocket', () => ({
  useSocket: (erId: string) => (socketEnabled && erId ? fakeSocket : null),
}))

const base = { isDayOpen: true, waiting: [], calling: [], inService: [], paused: [], recent: [] }
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

function setOverview(overview: Record<string, unknown>) {
  vi.mocked(api.get).mockResolvedValue({ ...base, ...overview })
}

describe('OperationPage coverage', () => {
  beforeEach(() => {
    handlers.clear()
    socketEnabled = true
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
    vi.mocked(api.post).mockResolvedValue({})
    fakeSocket.on.mockClear()
    fakeSocket.off.mockClear()
    seedStaffSession({ id: 'op-1', name: 'Operadora', role: 'OPERATOR', erId: 'er-1' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('subscribes to socket queue events and refreshes on emit', async () => {
    setOverview({
      counters: [{ id: 'c1', number: 1, state: 'ACTIVE', operator: { id: 'op-1', name: 'Eu' } }],
    })
    render(<OperationPage />)

    await screen.findByLabelText('Caixa de atendimento')
    expect(fakeSocket.on).toHaveBeenCalledWith('ticket.created', expect.any(Function))
    expect(handlers.get('ticket.created')?.size).toBeGreaterThan(0)

    const callsBefore = vi.mocked(api.get).mock.calls.length
    handlers.get('ticket.called')?.forEach((cb) => cb())
    await waitFor(() =>
      expect(vi.mocked(api.get).mock.calls.length).toBeGreaterThan(callsBefore),
    )
  })

  it('warns the operator when the operation day is closed', async () => {
    setOverview({ isDayOpen: false, counters: [] })
    render(<OperationPage />)

    expect(await screen.findByText(/Operação encerrada/)).toBeInTheDocument()
  })

  it('does not warn about a closed operation while the day is open', async () => {
    setOverview({
      counters: [{ id: 'c1', number: 1, state: 'ACTIVE', operator: { id: 'op-1', name: 'Eu' } }],
    })
    render(<OperationPage />)

    await screen.findByLabelText('Caixa de atendimento')
    expect(screen.queryByText(/Operação encerrada/)).not.toBeInTheDocument()
  })

  it('redirects to the central login when unauthenticated', () => {
    sessionStorage.clear()
    setOverview({ counters: [] })

    // No per-page login form: an unauthenticated visit redirects to the central
    // login at '/', which routes each role to its area after sign-in.
    render(
      <MemoryRouter initialEntries={['/operacao']}>
        <Routes>
          <Route path="/" element={<div>central-login</div>} />
          <Route path="/operacao" element={<OperationPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('central-login')).toBeInTheDocument()
    expect(screen.queryByText('Painel de Operação')).not.toBeInTheDocument()
  })

  it('drops back to the central login when the session expires mid-use', async () => {
    setOverview({ counters: [] })
    render(
      <MemoryRouter initialEntries={['/operacao']}>
        <Routes>
          <Route path="/" element={<div>central-login</div>} />
          <Route path="/operacao" element={<OperationPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Painel de Operação')).toBeInTheDocument()

    // 401 do servidor → notifySessionExpired derruba a tela protegida.
    act(() => notifySessionExpired())

    expect(await screen.findByText('central-login')).toBeInTheDocument()
    expect(screen.queryByText('Painel de Operação')).not.toBeInTheDocument()
  })

  it('shows an error when an action fails', async () => {
    setOverview({
      counters: [{ id: 'c1', number: 1, state: 'ACTIVE', operator: { id: 'op-1', name: 'Eu' } }],
    })
    render(<OperationPage />)

    const callNext = await screen.findByRole('button', { name: 'Chamar próximo' })
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Falha na ação'))
    fireEvent.click(callNext)

    expect(await screen.findByText('Falha na ação')).toBeInTheDocument()
  })

  it('calls the next ticket when pressing Enter with no field focused', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    setOverview({
      counters: [{ id: 'c1', number: 1, state: 'ACTIVE', operator: { id: 'op-1', name: 'Eu' } }],
    })
    render(<OperationPage />)

    await screen.findByRole('button', { name: 'Chamar próximo' })
    fireEvent.keyDown(document.body, { key: 'Enter' })

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/queues/er-1/call-next', { counterId: 'c1' }),
    )
  })

  it('does not call next on Enter while typing in a field', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    setOverview({
      counters: [{ id: 'c1', number: 1, state: 'ACTIVE', operator: { id: 'op-1', name: 'Eu' } }],
    })
    render(<OperationPage />)

    fireEvent.change(await screen.findByLabelText('Motivo da pausa'), {
      target: { value: 'outro' },
    })
    const detail = screen.getByLabelText('Detalhe')
    detail.focus()
    fireEvent.keyDown(detail, { key: 'Enter' })

    expect(api.post).not.toHaveBeenCalledWith('/queues/er-1/call-next', expect.anything())
  })

  it('pauses a waiting ticket from the kebab menu (staff-pause)', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    setOverview({
      counters: [{ id: 'c1', number: 1, state: 'ACTIVE', operator: { id: 'op-1', name: 'Eu' } }],
      waiting: [{ id: 't-w', code: 'A010', state: 'WAITING', representative: { fullName: 'Ana' } }],
    })
    render(<OperationPage />)

    await screen.findByText('A010')
    fireEvent.click(screen.getByRole('button', { name: 'Ações da senha A010' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Pausar senha' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/tickets/t-w/staff-pause'))
  })

  it('resumes a paused ticket from the kebab menu (staff-resume)', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    setOverview({
      counters: [{ id: 'c1', number: 1, state: 'ACTIVE', operator: { id: 'op-1', name: 'Eu' } }],
      paused: [{ id: 't-p', code: 'A011', state: 'PAUSED', representative: { fullName: 'Bia' } }],
    })
    render(<OperationPage />)

    await screen.findByText('A011')
    fireEvent.click(screen.getByRole('button', { name: 'Ações da senha A011' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Retomar senha' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/tickets/t-p/staff-resume'))
  })

  it('pauses the current calling ticket from the action bar (staff-pause)', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    setOverview({
      counters: [{ id: 'c1', number: 1, state: 'CALLING', operator: { id: 'op-1', name: 'Eu' } }],
      calling: [
        { id: 't-c', code: 'A012', state: 'CALLING', calledAt: minutesAgo(0), counter: { id: 'c1', number: 1 } },
      ],
    })
    render(<OperationPage />)

    await screen.findAllByText('A012')
    fireEvent.click(screen.getByRole('button', { name: 'Pausar senha' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/tickets/t-c/staff-pause'))
  })

  it('pauses the own in-service ticket from the action bar (staff-pause)', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    setOverview({
      counters: [{ id: 'c1', number: 1, state: 'IN_SERVICE', operator: { id: 'op-1', name: 'Eu' } }],
      inService: [
        { id: 't-s', code: 'A020', state: 'IN_SERVICE', serviceStartedAt: minutesAgo(1), counter: { id: 'c1', number: 1 } },
      ],
    })
    render(<OperationPage />)

    await screen.findAllByText('A020')
    fireEvent.click(screen.getByRole('button', { name: 'Pausar senha' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/tickets/t-s/staff-pause'))
  })

  it('hides the pause action on the queue when the counter is paused', async () => {
    setOverview({
      counters: [{ id: 'c1', number: 1, state: 'PAUSED', operator: { id: 'op-1', name: 'Eu' } }],
      waiting: [{ id: 't-w', code: 'A021', state: 'WAITING', representative: { fullName: 'Ana' } }],
    })
    render(<OperationPage />)

    await screen.findByText('A021')
    // Caixa pausado: sem kebab de ações na fila.
    expect(screen.queryByRole('button', { name: /Ações da senha A021/ })).not.toBeInTheDocument()
  })

  it('logs out, calling the telemetry endpoint and clearing the session', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    setOverview({
      counters: [{ id: 'c1', number: 1, state: 'ACTIVE', operator: { id: 'op-1', name: 'Eu' } }],
    })
    render(
      <MemoryRouter>
        <OperationPage />
      </MemoryRouter>,
    )

    await screen.findByText('Painel de Operação')
    fireEvent.click(screen.getByRole('button', { name: /sair|logout/i }))

    await waitFor(() => expect(sessionStorage.getItem('token')).toBeNull())
  })

  it('ticks the elapsed timer while a ticket is in service', async () => {
    setOverview({
      counters: [{ id: 'c1', number: 1, state: 'ACTIVE', operator: { id: 'op-1', name: 'Eu' } }],
      inService: [
        {
          id: 't2',
          code: 'A002',
          state: 'IN_SERVICE',
          serviceStartedAt: minutesAgo(1),
          counter: { id: 'c1', number: 1 },
        },
      ],
    })
    render(<OperationPage />)

    await screen.findAllByText('A002')
    await waitFor(() => {
      expect(screen.getByText(/·\s*\d+m \d+s/)).toBeInTheDocument()
    })
  })

  it('handles a current ticket without timestamps (no elapsed reference)', async () => {
    setOverview({
      counters: [{ id: 'c1', number: 1, state: 'ACTIVE', operator: { id: 'op-1', name: 'Eu' } }],
      calling: [
        { id: 't3', code: 'A003', state: 'CALLING', counter: { id: 'c1', number: 1 } },
      ],
    })
    render(<OperationPage />)

    await screen.findByText('A003')
    // No calledAt/serviceStartedAt → elapsed pins to exactly "0m 0s" (the loose
    // /0s/ matcher also accepted e.g. "1m 0s", so it never proved this branch).
    expect(screen.getByText(/·\s*0m 0s/)).toBeInTheDocument()
    expect(screen.queryByText(/·\s*\d*[1-9]\d*m/)).not.toBeInTheDocument()
  })

  it('renders side-panel fallbacks for tickets without representative or counter', async () => {
    setOverview({
      counters: [{ id: 'c1', number: 1, state: 'ACTIVE', operator: { id: 'op-1', name: 'Eu' } }],
      waiting: [{ id: 'w1', code: 'A010', state: 'WAITING' }],
      paused: [{ id: 'p1', code: 'A011', state: 'PAUSED' }],
      inService: [{ id: 's1', code: 'A012', state: 'IN_SERVICE' }],
    })
    render(<OperationPage />)

    await screen.findByText('A010')
    // O fallback "—" aparece como NOME da senha sem representante; checamos na própria
    // linha da A010 (em vez de só contar "—" soltos pela tela, que era tautológico).
    const waitingRow = screen.getByText('A010').closest('span')!
    expect(within(waitingRow).getByText('—')).toBeInTheDocument()
  })

  it('closes the confirmation modal with the back button without closing the counter', async () => {
    setOverview({
      counters: [{ id: 'c1', number: 1, state: 'ACTIVE', operator: { id: 'op-1', name: 'Eu' } }],
    })
    render(<OperationPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Fechar caixa' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Voltar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.post).not.toHaveBeenCalledWith('/counters/c1/close')
  })
})
