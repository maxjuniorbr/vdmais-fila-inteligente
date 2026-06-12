import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { makeStaffToken, seedStaffSession } from '../test/staffToken'
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

  it('renders the staff login form when unauthenticated and authenticates', async () => {
    sessionStorage.clear()
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          access_token: makeStaffToken({ id: 'op-9', role: 'OPERATOR', erId: 'er-9' }),
          user: { id: 'op-9', name: 'Nova Operadora', role: 'OPERATOR', erId: 'er-9' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    setOverview({ counters: [] })

    render(
      <MemoryRouter>
        <OperationPage />
      </MemoryRouter>,
    )

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('E-mail'), 'op@example.com')
    await user.type(screen.getByLabelText('Senha'), 'senha123')
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('Painel da Operadora')).toBeInTheDocument()
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

    await screen.findByText('Painel da Operadora')
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
    expect(screen.getByText(/0s/)).toBeInTheDocument()
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
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3)
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
