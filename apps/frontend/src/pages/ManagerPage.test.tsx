import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { makeStaffToken, seedStaffSession } from '../test/staffToken'
import { ManagerPage } from './ManagerPage'

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

type SocketHandler = (...args: unknown[]) => void
let socketDouble: {
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
  emit: (event: string) => void
} | null = null

function makeSocketDouble() {
  const handlers = new Map<string, Set<SocketHandler>>()
  return {
    on: vi.fn((event: string, handler: SocketHandler) => {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event)!.add(handler)
    }),
    off: vi.fn((event: string, handler: SocketHandler) => {
      handlers.get(event)?.delete(handler)
    }),
    emit: (event: string) => {
      handlers.get(event)?.forEach((handler) => handler())
    },
  }
}

vi.mock('../hooks/useSocket', () => ({ useSocket: () => socketDouble }))

const { navigateSpy } = vi.hoisted(() => ({ navigateSpy: vi.fn() }))
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigateSpy }
})

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
  seedStaffSession({ id: 'mgr-1', name: 'Gestora', role: 'MANAGER', erId: 'er-1' })
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
    socketDouble = null
    authenticateManager()
    mockGet()
  })

  it('renders metrics, counters and the queue tables', async () => {
    renderManager()
    expect(await screen.findByText('Caixas')).toBeInTheDocument()
    expect(screen.getByText('Fila ativa')).toBeInTheDocument()
    expect(screen.getByText('Chamadas recentes')).toBeInTheDocument()
    expect(screen.getByText('Ativo')).toBeInTheDocument()
    expect(screen.getByText('A001')).toBeInTheDocument()
  })

  it('shows prolonged services for a long-running attendance', async () => {
    renderManager()
    expect(await screen.findByText('Atendimentos prolongados')).toBeInTheDocument()
    expect(screen.getAllByText('Bia Lima').length).toBeGreaterThan(0)
  })

  it('switches the day distribution tabs', async () => {
    renderManager()
    await screen.findByText('Distribuição do dia')
    fireEvent.click(screen.getByRole('tab', { name: 'Por canal' }))
    expect(screen.getByRole('tab', { name: 'Por canal' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Entradas')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Por caixa' }))
    expect(screen.getByText('Pausa')).toBeInTheDocument()
    // The backend already labels the counter ("Caixa 1"); the column must not
    // prefix "Caixa" again ("Caixa Caixa 1").
    expect(screen.getByText('Caixa 1')).toBeInTheDocument()
    expect(screen.queryByText('Caixa Caixa 1')).not.toBeInTheDocument()

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
    expect(screen.getByRole('heading', { name: 'Cancelar senha' })).toBeInTheDocument()
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
    fireEvent.click(within(dialog).getByRole('button', { name: /Cancelar senha|Restaurar senha|Corrigir atendimento|Finalizar atendimento/ }))

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
    fireEvent.click(within(dialog).getByRole('button', { name: /Cancelar senha|Restaurar senha|Corrigir atendimento|Finalizar atendimento/ }))

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
    fireEvent.click(within(dialog).getByRole('button', { name: /Cancelar senha|Restaurar senha|Corrigir atendimento|Finalizar atendimento/ }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/tickets/s1/correct', {
        action: 'FINISH',
        reason: 'concluído manualmente',
      }),
    )
  })

  it('hides the restore action on recent calls when the day is closed', async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.includes('/overview')) return Promise.resolve(overview)
      if (path.includes('/daily')) return Promise.resolve(metrics)
      if (path.startsWith('/ers/')) return Promise.resolve({ ...er, isDayOpen: false })
      return Promise.resolve([])
    })
    renderManager()
    await screen.findByText('Chamadas recentes')

    expect(screen.queryByRole('button', { name: /Ações da senha A003/ })).not.toBeInTheDocument()
  })

  it('notifies that the operation is closed when the day is not open', async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.includes('/overview')) return Promise.resolve(overview)
      if (path.includes('/daily')) return Promise.resolve(metrics)
      if (path.startsWith('/ers/')) return Promise.resolve({ ...er, isDayOpen: false })
      return Promise.resolve([])
    })
    renderManager()

    expect(await screen.findByText(/Operação encerrada/)).toBeInTheDocument()
  })

  it('does not show the closed-operation notice while the day is open', async () => {
    renderManager()
    await screen.findByText('Chamadas recentes')

    expect(screen.queryByText(/Operação encerrada/)).not.toBeInTheDocument()
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
    seedStaffSession({ id: 'admin-1', name: 'Admin', role: 'ADMIN' })
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
    const select = screen.getByLabelText('Espaço de Revendedora')
    fireEvent.change(select, { target: { value: 'er-2' } })
    expect(select).toHaveValue('er-2')
  })

  it('shows the login form and authenticates a manager through it', async () => {
    sessionStorage.clear()
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          access_token: makeStaffToken({ id: 'mgr-2', role: 'MANAGER', erId: 'er-1' }),
          user: { id: 'mgr-2', name: 'Nova Gestora', role: 'MANAGER', erId: 'er-1' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderManager()

    expect(screen.getByRole('heading', { name: 'Gestão da fila' })).toBeInTheDocument()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('E-mail'), 'gestora@example.com')
    await user.type(screen.getByLabelText('Senha'), 'senha-segura')
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

    expect(await screen.findByText('Caixas')).toBeInTheDocument()
  })

  it('authenticates an admin through the login form into ER selection', async () => {
    sessionStorage.clear()
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          access_token: makeStaffToken({ id: 'admin-2', role: 'ADMIN' }),
          user: { id: 'admin-2', name: 'Admin', role: 'ADMIN' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === '/admin/ers') return Promise.resolve([])
      return Promise.resolve([])
    })
    renderManager()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('E-mail'), 'admin@example.com')
    await user.type(screen.getByLabelText('Senha'), 'senha-segura')
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

    expect(await screen.findByText('ER acompanhado')).toBeInTheDocument()
  })

  it('logs out and returns to the login form', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    renderManager()
    await screen.findByText('Caixas')

    fireEvent.click(screen.getByRole('button', { name: /sair/i }))

    expect(await screen.findByRole('heading', { name: 'Gestão da fila' })).toBeInTheDocument()
  })

  it('navigates home and to administration from the header', async () => {
    seedStaffSession({ id: 'admin-1', name: 'Admin', role: 'ADMIN' })
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === '/admin/ers') {
        return Promise.resolve([{ id: 'er-1', name: 'ER Teste', isDayOpen: true }])
      }
      if (path.includes('/overview')) return Promise.resolve(overview)
      if (path.includes('/daily')) return Promise.resolve(metrics)
      if (path.startsWith('/ers/')) return Promise.resolve(er)
      return Promise.resolve([])
    })
    navigateSpy.mockClear()
    renderManager()
    await screen.findByText('ER acompanhado')

    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao início' }))
    fireEvent.click(screen.getByRole('button', { name: 'Administração' }))

    expect(navigateSpy).toHaveBeenCalledWith('/')
    expect(navigateSpy).toHaveBeenCalledWith('/admin')
  })

  it('refetches the dashboard when a realtime queue event arrives', async () => {
    socketDouble = makeSocketDouble()
    renderManager()
    await screen.findByText('Caixas')

    const callsBefore = vi.mocked(api.get).mock.calls.length
    socketDouble.emit('ticket.created')

    await waitFor(() =>
      expect(vi.mocked(api.get).mock.calls.length).toBeGreaterThan(callsBefore),
    )
  })

  it('shows an error banner when the dashboard fails to load', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Falha na rede'))
    renderManager()

    expect(await screen.findByText('Falha na rede')).toBeInTheDocument()
  })

  it('surfaces a failure when cancelling a ticket inside the dialog', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('Não foi possível cancelar'))
    renderManager()
    await screen.findByText('Fila ativa')

    fireEvent.click(screen.getAllByRole('button', { name: /Ações da senha A001/ })[0])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancelar senha' }))

    const dialog = await screen.findByRole('dialog')
    const user = userEvent.setup()
    await user.type(within(dialog).getByRole('textbox'), 'motivo')
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: /Cancelar senha|Restaurar senha|Corrigir atendimento|Finalizar atendimento/,
      }),
    )

    await waitFor(() =>
      expect(screen.getAllByText('Não foi possível cancelar').length).toBeGreaterThan(0),
    )
  })

  it('cancels a prolonged attendance correction', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    renderManager()
    const prolongedHeading = await screen.findByText('Atendimentos prolongados')
    const section = prolongedHeading.closest('section') as HTMLElement

    fireEvent.click(within(section).getByRole('button', { name: /Ações da senha A002/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancelar atendimento' }))

    const dialog = await screen.findByRole('dialog')
    const user = userEvent.setup()
    await user.type(within(dialog).getByRole('textbox'), 'erro de registro')
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: /Cancelar senha|Restaurar senha|Corrigir atendimento|Finalizar atendimento/,
      }),
    )

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/tickets/s1/correct', {
        action: 'CANCEL',
        reason: 'erro de registro',
      }),
    )
  })

  it('closes the cancel dialog without acting', async () => {
    renderManager()
    await screen.findByText('Fila ativa')

    fireEvent.click(screen.getAllByRole('button', { name: /Ações da senha A001/ })[0])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancelar senha' }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.post).not.toHaveBeenCalled()
  })

  it('closes the counter release dialog without acting', async () => {
    renderManager()
    await screen.findByText('Caixas')

    fireEvent.click(screen.getByRole('button', { name: 'Ações do caixa 1' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Liberar caixa' }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.post).not.toHaveBeenCalled()
  })

  it('closes the day-toggle modal with the secondary button', async () => {
    renderManager()
    await screen.findByText('Caixas')

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar operação' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Voltar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('surfaces an error inside the day-toggle modal when closing fails', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('Encerramento bloqueado'))
    renderManager()
    await screen.findByText('Caixas')

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar operação' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Encerrar operação' }))

    await waitFor(() =>
      expect(screen.getAllByText('Encerramento bloqueado').length).toBeGreaterThan(0),
    )
  })

  it('tells a manager without an ER that the account is not linked', async () => {
    seedStaffSession({ id: 'mgr-3', name: 'Gestora', role: 'MANAGER' })
    renderManager()

    expect(
      await screen.findByText('Sua conta não está vinculada a um ER.'),
    ).toBeInTheDocument()
  })

  it('resets the stored admin ER when it is no longer available', async () => {
    sessionStorage.setItem('managementErId', 'er-removed')
    seedStaffSession({ id: 'admin-1', name: 'Admin', role: 'ADMIN' })
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === '/admin/ers') {
        return Promise.resolve([{ id: 'er-1', name: 'ER Teste', isDayOpen: true }])
      }
      if (path.includes('/overview')) return Promise.resolve(overview)
      if (path.includes('/daily')) return Promise.resolve(metrics)
      if (path.startsWith('/ers/')) return Promise.resolve(er)
      return Promise.resolve([])
    })
    renderManager()

    await screen.findByText('ER acompanhado')
    await waitFor(() =>
      expect(screen.getByLabelText('Espaço de Revendedora')).toHaveValue(''),
    )
  })

  it('surfaces an error when the admin ER list fails to load', async () => {
    seedStaffSession({ id: 'admin-1', name: 'Admin', role: 'ADMIN' })
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === '/admin/ers') return Promise.reject(new Error('ERs indisponíveis'))
      return Promise.resolve([])
    })
    renderManager()

    expect(await screen.findByText('ERs indisponíveis')).toBeInTheDocument()
  })

  it('falls back to a generic message for non-Error load failures', async () => {
    vi.mocked(api.get).mockRejectedValue('boom')
    renderManager()

    expect(await screen.findByText('Erro ao carregar gestão')).toBeInTheDocument()
  })

  it('offers restore only for tickets that may return to the queue', async () => {
    const recent = [
      { id: 'r1', code: 'A003', state: 'NO_SHOW', entryChannel: 'QR_CODE', createdAt: minutesAgo(60) },
      { id: 'r2', code: 'A004', state: 'CANCELLED', entryChannel: 'LINK', createdAt: minutesAgo(70) },
      {
        id: 'r3',
        code: 'A005',
        state: 'CANCELLED',
        entryChannel: 'LINK',
        createdAt: minutesAgo(80),
        serviceStartedAt: minutesAgo(75),
      },
    ]
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.includes('/overview')) return Promise.resolve({ ...overview, recent })
      if (path.includes('/daily')) return Promise.resolve(metrics)
      if (path.startsWith('/ers/')) return Promise.resolve(er)
      return Promise.resolve([])
    })
    renderManager()
    await screen.findByText('Chamadas recentes')

    expect(screen.getByRole('button', { name: /Ações da senha A003/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ações da senha A004/ })).toBeInTheDocument()

    // A CANCELLED ticket that already entered service exposes no restore menu
    // (ActionMenu renders nothing for an empty item list).
    expect(screen.queryByRole('button', { name: /Ações da senha A005/ })).not.toBeInTheDocument()
  })

  it('releases a counter that has no operator assigned', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    const counters = [{ id: 'c3', number: 3, state: 'ACTIVE', operator: null }]
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.includes('/overview')) return Promise.resolve({ ...overview, counters })
      if (path.includes('/daily')) return Promise.resolve(metrics)
      if (path.startsWith('/ers/')) return Promise.resolve(er)
      return Promise.resolve([])
    })
    renderManager()
    await screen.findByText('Caixas')

    fireEvent.click(screen.getByRole('button', { name: 'Ações do caixa 3' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Liberar caixa' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Liberar caixa' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/counters/c3/force-release'))
  })

  it('renders distribution rows when channel and counter keys diverge', async () => {
    const sparseMetrics = {
      ...metrics,
      // Keys appear in only some of the unioned records, exercising the ?? 0
      // fallbacks inside the distribution tables.
      byChannel: { QR_CODE: 4 },
      cancelledByChannel: { LINK: 2 },
      noShowByChannel: { CHECKIN_ASSISTED: 1 },
      // The backend keys these by display label ("Caixa N"), not by raw number.
      serviceByCounter: { 'Caixa 1': 5 },
      pauseSecondsByCounter: { 'Caixa 2': 30 },
      serviceByOperator: { Ana: 3 },
      callsByOperator: { Bruno: 4 },
    }
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.includes('/overview')) return Promise.resolve(overview)
      if (path.includes('/daily')) return Promise.resolve(sparseMetrics)
      if (path.startsWith('/ers/')) return Promise.resolve(er)
      return Promise.resolve([])
    })
    renderManager()
    await screen.findByText('Distribuição do dia')

    fireEvent.click(screen.getByRole('tab', { name: 'Por caixa' }))
    expect(screen.getByText('Caixa 1')).toBeInTheDocument()
    expect(screen.getByText('Caixa 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Por operadora' }))
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('Bruno')).toBeInTheDocument()
  })
})
