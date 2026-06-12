import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { ManagerPage } from './ManagerPage'

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))
vi.mock('../hooks/useSocket', () => ({ useSocket: () => null }))

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

const overview = {
  waiting: [
    { id: 'w1', code: 'A001', state: 'WAITING', entryChannel: 'QR_CODE', createdAt: minutesAgo(5) },
  ],
  calling: [],
  inService: [
    {
      id: 's1',
      code: 'A002',
      state: 'IN_SERVICE',
      entryChannel: 'LINK',
      createdAt: minutesAgo(50),
      serviceStartedAt: minutesAgo(40),
      representative: { fullName: 'Bia Lima' },
      counter: { number: 1 },
    },
  ],
  paused: [],
  recent: [
    { id: 'r1', code: 'A003', state: 'NO_SHOW', entryChannel: 'QR_CODE', createdAt: minutesAgo(60) },
  ],
  counters: [
    { id: 'c1', number: 1, state: 'ACTIVE', operator: { name: 'Operadora 1' } },
    { id: 'c2', number: 2, state: 'UNAVAILABLE', operator: null },
  ],
}

const metrics = {
  totalCreated: 10,
  totalWaiting: 1,
  totalPaused: 0,
  totalStarted: 8,
  totalFinished: 7,
  totalCancelled: 1,
  totalNoShow: 1,
  totalRestored: 0,
  totalForceClosed: 0,
  duplicateAttempts: 0,
  openServices: 1,
  avgWaitSeconds: 120,
  medianWaitSeconds: 100,
  avgServiceSeconds: 300,
  medianServiceSeconds: 280,
  avgCallToStartSeconds: 30,
  maxCurrentWaitSeconds: 200,
  waitSecondsByHour: { 9: 120, 10: 90 },
  byChannel: { QR_CODE: 6, LINK: 3, CHECKIN_ASSISTED: 1 },
  cancelledByChannel: { QR_CODE: 1 },
  noShowByChannel: { LINK: 1 },
  volumeByHour: { 9: 3, 10: 4 },
  peakHours: [10],
  serviceByCounter: { 'Caixa 1': 7 },
  serviceByOperator: { 'Operadora 1': 7 },
  callsByOperator: { 'Operadora 1': 8 },
  pauseSecondsByCounter: { 'Caixa 1': 60 },
  activeCounters: 1,
  pausedCounters: 0,
}

const er = { id: 'er-1', name: 'ER Teste', isDayOpen: true }

function authenticateManager() {
  sessionStorage.setItem('token', 'mgr-token')
  sessionStorage.setItem('staffRole', 'MANAGER')
  sessionStorage.setItem('staffUserId', 'mgr-1')
  sessionStorage.setItem('erId', 'er-1')
  sessionStorage.setItem('userName', 'Gestora')
}

function mockGet() {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path.includes('/overview')) return Promise.resolve(overview)
    if (path.includes('/daily')) return Promise.resolve(metrics)
    if (path.startsWith('/ers/')) return Promise.resolve(er)
    return Promise.resolve([])
  })
}

function renderManager() {
  return render(
    <MemoryRouter>
      <ManagerPage />
    </MemoryRouter>,
  )
}

describe('ManagerPage', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
    authenticateManager()
    mockGet()
  })

  it('renders metrics, counters and the queue tables', async () => {
    renderManager()
    expect(await screen.findByText('Caixas')).toBeInTheDocument()
    expect(screen.getByText('Fila ativa')).toBeInTheDocument()
    expect(screen.getByText('Chamadas recentes')).toBeInTheDocument()
    // counter state badge
    expect(screen.getByText('Ativo')).toBeInTheDocument()
    // active queue ticket row
    expect(screen.getByText('A001')).toBeInTheDocument()
  })

  it('shows prolonged services for a long-running attendance', async () => {
    renderManager()
    expect(await screen.findByText('Atendimentos prolongados')).toBeInTheDocument()
    // Bia aparece na fila ativa e em atendimentos prolongados.
    expect(screen.getAllByText('Bia Lima').length).toBeGreaterThan(0)
  })

  it('switches the day distribution tabs', async () => {
    renderManager()
    await screen.findByText('Distribuição do dia')
    fireEvent.click(screen.getByRole('tab', { name: 'Por canal' }))
    expect(screen.getByRole('tab', { name: 'Por canal' })).toHaveAttribute('aria-selected', 'true')
    // Channel table header
    expect(screen.getByText('Entradas')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Por caixa' }))
    expect(screen.getByText('Pausa')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Por operadora' }))
    expect(screen.getByText('Chamadas')).toBeInTheDocument()
  })

  it('confirms closing the operation through the modal', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    renderManager()
    await screen.findByText('Caixas')

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar operação' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Encerrar operação?')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Encerrar operação' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/ers/er-1/close-day'),
    )
  })

  it('opens the cancel confirmation from the active queue row menu', async () => {
    renderManager()
    await screen.findByText('Fila ativa')

    const menus = screen.getAllByRole('button', { name: /Ações da senha A001/ })
    fireEvent.click(menus[0])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancelar senha' }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Cancelar senha')).toBeInTheDocument()
  })

  it('cancels a ticket with a reason through the confirm dialog', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    renderManager()
    await screen.findByText('Fila ativa')

    fireEvent.click(screen.getAllByRole('button', { name: /Ações da senha A001/ })[0])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancelar senha' }))

    const dialog = await screen.findByRole('dialog')
    const user = userEvent.setup()
    await user.type(within(dialog).getByRole('textbox'), 'duplicada')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/tickets/w1/cancel', { reason: 'duplicada' }),
    )
  })

  it('restores a no-show ticket from the recent calls menu', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    renderManager()
    await screen.findByText('Chamadas recentes')

    fireEvent.click(screen.getByRole('button', { name: /Ações da senha A003/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restaurar senha' }))

    const dialog = await screen.findByRole('dialog')
    const user = userEvent.setup()
    await user.type(within(dialog).getByRole('textbox'), 'voltou')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/tickets/r1/restore', { reason: 'voltou' }),
    )
  })

  it('releases a counter through the counter menu', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    renderManager()
    await screen.findByText('Caixas')

    fireEvent.click(screen.getByRole('button', { name: 'Ações do caixa 1' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Liberar caixa' }))

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Liberar caixa' }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/counters/c1/force-release'),
    )
  })

  it('finishes a prolonged attendance correction', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    renderManager()
    const prolongedHeading = await screen.findByText('Atendimentos prolongados')
    const section = prolongedHeading.closest('section') as HTMLElement

    fireEvent.click(within(section).getByRole('button', { name: /Ações da senha A002/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Finalizar atendimento' }))

    const dialog = await screen.findByRole('dialog')
    const user = userEvent.setup()
    await user.type(within(dialog).getByRole('textbox'), 'concluído manualmente')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/tickets/s1/correct', {
        action: 'FINISH',
        reason: 'concluído manualmente',
      }),
    )
  })

  it('opens the operation when the day is closed', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.includes('/overview')) return Promise.resolve(overview)
      if (path.includes('/daily')) return Promise.resolve(metrics)
      if (path.startsWith('/ers/')) return Promise.resolve({ ...er, isDayOpen: false })
      return Promise.resolve([])
    })
    renderManager()

    fireEvent.click(await screen.findByRole('button', { name: 'Abrir operação' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Abrir operação' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/ers/er-1/open-day'))
  })

  it('lets an admin pick the ER to follow', async () => {
    sessionStorage.setItem('staffRole', 'ADMIN')
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === '/admin/ers') {
        return Promise.resolve([
          { id: 'er-1', name: 'ER Teste', isDayOpen: true },
          { id: 'er-2', name: 'ER Dois', isDayOpen: false },
        ])
      }
      if (path.includes('/overview')) return Promise.resolve(overview)
      if (path.includes('/daily')) return Promise.resolve(metrics)
      if (path.startsWith('/ers/')) return Promise.resolve(er)
      return Promise.resolve([])
    })
    renderManager()

    expect(await screen.findByText('ER acompanhado')).toBeInTheDocument()
    const select = screen.getByLabelText('Espaço do Revendedor')
    fireEvent.change(select, { target: { value: 'er-2' } })
    expect(select).toHaveValue('er-2')
  })
})
