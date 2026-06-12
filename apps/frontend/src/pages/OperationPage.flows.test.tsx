import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { seedStaffSession } from '../test/staffToken'
import { OperationPage } from './OperationPage'

vi.mock('../api/client', () => ({ api: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../hooks/useSocket', () => ({ useSocket: () => null }))

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

function authenticate() {
  seedStaffSession({ id: 'op-1', name: 'Operadora', role: 'OPERATOR', erId: 'er-1' })
}

const base = { waiting: [], calling: [], inService: [], paused: [], recent: [] }

function setOverview(overview: Record<string, unknown>) {
  vi.mocked(api.get).mockResolvedValue({ ...base, ...overview })
}

function renderPage() {
  return render(<OperationPage />)
}

describe('OperationPage flows', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
    vi.mocked(api.post).mockResolvedValue({})
    authenticate()
  })

  it('handles a ticket being called: start, no-show and pausing the counter', async () => {
    setOverview({
      counters: [{ id: 'c1', number: 1, state: 'ACTIVE', operator: { id: 'op-1', name: 'Eu' } }],
      calling: [
        { id: 't1', code: 'A001', state: 'CALLING', calledAt: minutesAgo(1), counter: { id: 'c1', number: 1 } },
      ],
    })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar atendimento' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/tickets/t1/start-service'))

    fireEvent.click(screen.getByRole('button', { name: 'Não compareceu' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/tickets/t1/no-show'))

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Motivo da pausa'), 'almoço')
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/counters/c1/pause', { reason: 'almoço' }),
    )
  })

  it('calls the next ticket and closes the counter through the modal', async () => {
    setOverview({
      counters: [{ id: 'c1', number: 1, state: 'ACTIVE', operator: { id: 'op-1', name: 'Eu' } }],
    })
    renderPage()

    const callNext = await screen.findByRole('button', { name: 'Chamar próximo' })
    expect(callNext).toBeEnabled()
    fireEvent.click(callNext)
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/queues/er-1/call-next', { counterId: 'c1' }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Fechar caixa' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar caixa' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/counters/c1/close'))
  })

  it('lets an operator assume an available counter', async () => {
    setOverview({
      counters: [{ id: 'c1', number: 1, state: 'UNAVAILABLE', operator: null }],
    })
    renderPage()

    const select = await screen.findByLabelText('Caixa de atendimento')
    fireEvent.change(select, { target: { value: 'c1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Assumir e abrir caixa' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/counters/c1/open'))
  })

  it('finishes an in-service attendance', async () => {
    setOverview({
      counters: [{ id: 'c1', number: 1, state: 'ACTIVE', operator: { id: 'op-1', name: 'Eu' } }],
      inService: [
        {
          id: 't2',
          code: 'A002',
          state: 'IN_SERVICE',
          serviceStartedAt: minutesAgo(2),
          counter: { id: 'c1', number: 1 },
        },
      ],
    })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Finalizar atendimento' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/tickets/t2/finish-service'))
  })

  it('recalls a ticket that was already called', async () => {
    setOverview({
      counters: [{ id: 'c1', number: 1, state: 'ACTIVE', operator: { id: 'op-1', name: 'Eu' } }],
      calling: [
        { id: 't1', code: 'A001', state: 'CALLING', calledAt: minutesAgo(1), counter: { id: 'c1', number: 1 } },
      ],
    })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Rechamar' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/tickets/t1/recall'))
  })

  it('resumes a paused counter', async () => {
    setOverview({
      counters: [{ id: 'c1', number: 1, state: 'PAUSED', operator: { id: 'op-1', name: 'Eu' } }],
    })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Retomar' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/counters/c1/resume'))
  })

  it('lists the side panels and recent calls', async () => {
    setOverview({
      counters: [{ id: 'c1', number: 1, state: 'ACTIVE', operator: { id: 'op-1', name: 'Eu' } }],
      waiting: [{ id: 'w1', code: 'A010', state: 'WAITING', representative: { fullName: 'Ana' } }],
      paused: [{ id: 'p1', code: 'A011', state: 'PAUSED', representative: { fullName: 'Bia' } }],
      inService: [
        { id: 's1', code: 'A012', state: 'IN_SERVICE', counter: { id: 'c2', number: 2 }, representative: { fullName: 'Carla' } },
      ],
      recent: [
        { id: 'r1', code: 'A013', state: 'FINISHED' },
        { id: 'r2', code: 'A014', state: 'NO_SHOW' },
      ],
    })
    renderPage()
    expect(await screen.findByText('A010')).toBeInTheDocument()
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('A011')).toBeInTheDocument()
    expect(screen.getByText('A013')).toBeInTheDocument()
  })

  it('shows an error when loading the overview fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Falha ao carregar'))
    renderPage()
    expect(await screen.findByText('Falha ao carregar')).toBeInTheDocument()
  })
})
