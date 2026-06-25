import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { seedStaffSession } from '../test/staffToken'
import { notifySessionExpired } from '../auth/session'
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
    {
      id: 'r1',
      code: 'A003',
      state: 'NO_SHOW',
      entryChannel: 'QR_CODE',
      createdAt: minutesAgo(60),
      calledAt: minutesAgo(57),
    },
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

// The page no longer renders a login form: logout, an expired session, or a
// direct visit without a session redirect to the central login at '/'. The stub
// route lets the test observe that redirect.
function renderManager() {
  return render(
    <MemoryRouter initialEntries={['/gestao']}>
      <Routes>
        <Route path="/" element={<div>central-login</div>} />
        <Route path="/gestao" element={<ManagerPage />} />
      </Routes>
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

  it('drops back to the central login when the session expires mid-use', async () => {
    renderManager()
    expect(await screen.findByText('Caixas')).toBeInTheDocument()

    // 401 do servidor → notifySessionExpired derruba a tela protegida.
    act(() => notifySessionExpired())

    expect(await screen.findByText('central-login')).toBeInTheDocument()
    expect(screen.queryByText('Caixas')).not.toBeInTheDocument()
  })

  it('shows the live active/paused counters tile while the day is open', async () => {
    renderManager()
    const tile = (await screen.findByText('Caixas ativos/pausados')).closest('article')!
    expect(within(tile).getByText('1/0')).toBeInTheDocument()
  })

  it('blanks the active/paused counters tile once the day is closed', async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.includes('/overview')) return Promise.resolve(overview)
      if (path.includes('/daily')) return Promise.resolve(metrics)
      if (path.startsWith('/ers/')) return Promise.resolve({ ...er, isDayOpen: false })
      return Promise.resolve([])
    })
    renderManager()
    // The day is closed: counters were already released, so the live tile shows
    // "—" instead of a misleading "0/0" under the "último dia operado" banner.
    const tile = (await screen.findByText('Caixas ativos/pausados')).closest('article')!
    expect(within(tile).getByText('—')).toBeInTheDocument()
    expect(within(tile).queryByText('1/0')).not.toBeInTheDocument()
  })

  it('shows prolonged services for a long-running attendance', async () => {
    renderManager()
    expect(await screen.findByText('Atendimentos prolongados')).toBeInTheDocument()
    expect(screen.getAllByText('Bia Lima').length).toBeGreaterThan(0)
  })

  it('freezes the wait of a recent ticket instead of counting it live', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      renderManager()
      // A003 foi criada há 60min e chamada há 57min: a espera real é fixa em 3min.
      // Antes da correção a coluna usava (agora − criação), então a espera de uma
      // senha já encerrada seguia subindo a cada tick de 1s.
      const recentWait = () => within(screen.getByText('A003').closest('tr')!).getByText('3m 0s')
      expect(await screen.findByText('A003')).toBeInTheDocument()
      expect(recentWait()).toBeInTheDocument()

      // A senha já saiu da fila (foi chamada): avançar o relógio não move a espera.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })
      expect(recentWait()).toBeInTheDocument()
    } finally {
      vi.runOnlyPendingTimers()
      vi.useRealTimers()
    }
  })

  it('keeps the elapsed service time live between the 15s refreshes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const liveOverview = {
        ...overview,
        waiting: [],
        recent: [],
        inService: [
          {
            id: 's9',
            code: 'A009',
            state: 'IN_SERVICE',
            entryChannel: 'LINK',
            createdAt: new Date(Date.now() - 50 * 60_000).toISOString(),
            serviceStartedAt: new Date(Date.now() - 40 * 60_000).toISOString(),
            representative: { fullName: 'Caio Souza' },
            counter: { number: 1 },
          },
        ],
      }
      vi.mocked(api.get).mockImplementation((path: string) => {
        if (path.includes('/overview')) return Promise.resolve(liveOverview)
        if (path.includes('/daily')) return Promise.resolve(metrics)
        if (path.startsWith('/ers/')) return Promise.resolve(er)
        return Promise.resolve([])
      })

      renderManager()
      expect(await screen.findByText('40m 0s')).toBeInTheDocument()

      // Without the per-second tick this would stay frozen at 40m 0s until the
      // next 15s refresh; advancing only 3s must already move the display.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })
      expect(screen.getByText('40m 3s')).toBeInTheDocument()
    } finally {
      vi.runOnlyPendingTimers()
      vi.useRealTimers()
    }
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

    const menus = await screen.findAllByRole('button', { name: /Ações da senha A001/ })
    fireEvent.click(menus[0])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancelar senha' }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cancelar senha' })).toBeInTheDocument()
  })

  it('lets the manager mark a waiting ticket as preferential', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    renderManager()
    await screen.findByText('Fila ativa')

    fireEvent.click((await screen.findAllByRole('button', { name: /Ações da senha A001/ }))[0])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Marcar preferencial' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/tickets/w1/mark-priority'))
  })

  it('lets the manager remove the preferential flag from a waiting ticket', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    // A senha aguardando já é preferencial: o menu oferece "Remover preferencial",
    // que chama o endpoint de desmarcação.
    const waiting = [
      {
        id: 'wp',
        code: 'A010',
        state: 'WAITING',
        isPriority: true,
        entryChannel: 'QR_CODE',
        createdAt: minutesAgo(5),
      },
    ]
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.includes('/overview')) return Promise.resolve({ ...overview, waiting })
      if (path.includes('/daily')) return Promise.resolve(metrics)
      if (path.startsWith('/ers/')) return Promise.resolve(er)
      return Promise.resolve([])
    })
    renderManager()
    await screen.findByText('Fila ativa')

    fireEvent.click(await screen.findByRole('button', { name: /Ações da senha A010/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remover preferencial' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/tickets/wp/unmark-priority'))
  })

  it('offers attendance correction (not /cancel) for a ticket already in service', async () => {
    renderManager()
    const queueHeading = await screen.findByText('Fila ativa')
    const queueSection = queueHeading.closest('section') as HTMLElement

    // A002 está em atendimento (IN_SERVICE). O toggle de preferencial só existe para
    // senhas aguardando, e "Cancelar senha" (/cancel) é proibido em atendimento — ele
    // marcaria CANCELLED de forma irreversível e distorceria as métricas. O menu deve
    // oferecer a correção (/correct: finalizar/cancelar atendimento). (A002 também
    // aparece em "Atendimentos prolongados", por isso buscamos na fila ativa.)
    fireEvent.click(await within(queueSection).findByRole('button', { name: /Ações da senha A002/ }))
    expect(screen.getByRole('menuitem', { name: 'Finalizar atendimento' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Cancelar atendimento' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Cancelar senha' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('menuitem', { name: /preferencial/ }),
    ).not.toBeInTheDocument()
  })

  it('finishes an in-service ticket from the active queue through /correct', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    renderManager()
    const queueHeading = await screen.findByText('Fila ativa')
    const queueSection = queueHeading.closest('section') as HTMLElement

    fireEvent.click(await within(queueSection).findByRole('button', { name: /Ações da senha A002/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Finalizar atendimento' }))

    const dialog = await screen.findByRole('dialog')
    const user = userEvent.setup()
    await user.type(within(dialog).getByRole('textbox'), 'concluído pela gestora')
    fireEvent.click(within(dialog).getByRole('button', { name: /Cancelar senha|Restaurar senha|Corrigir atendimento|Finalizar atendimento/ }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/tickets/s1/correct', {
        action: 'FINISH',
        reason: 'concluído pela gestora',
      }),
    )
  })

  it('cancels an in-service ticket from the active queue through /correct', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    renderManager()
    const queueHeading = await screen.findByText('Fila ativa')
    const queueSection = queueHeading.closest('section') as HTMLElement

    fireEvent.click(await within(queueSection).findByRole('button', { name: /Ações da senha A002/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancelar atendimento' }))

    const dialog = await screen.findByRole('dialog')
    const user = userEvent.setup()
    await user.type(within(dialog).getByRole('textbox'), 'desistência no caixa')
    fireEvent.click(within(dialog).getByRole('button', { name: /Cancelar senha|Restaurar senha|Corrigir atendimento|Finalizar atendimento/ }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/tickets/s1/correct', {
        action: 'CANCEL',
        reason: 'desistência no caixa',
      }),
    )
  })

  it('freezes a cancelled ticket wait minus the paused time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      // Criada há 12min e cancelada há 3min, sem ter sido chamada: a espera bruta
      // é de 9min e desconta 90s de pausa → 7m30s, fixo. Antes da correção a coluna
      // contaria (agora − criação) e seguiria subindo a cada tick de 1s.
      const recent = [
        {
          id: 'rc',
          code: 'A011',
          state: 'CANCELLED',
          entryChannel: 'LINK',
          createdAt: minutesAgo(12),
          cancelledAt: minutesAgo(3),
          pausedSeconds: 90,
        },
      ]
      vi.mocked(api.get).mockImplementation((path: string) => {
        if (path.includes('/overview')) return Promise.resolve({ ...overview, recent })
        if (path.includes('/daily')) return Promise.resolve(metrics)
        if (path.startsWith('/ers/')) return Promise.resolve(er)
        return Promise.resolve([])
      })
      renderManager()
      const cancelledWait = () =>
        within(screen.getByText('A011').closest('tr')!).getByText('7m 30s')
      expect(await screen.findByText('A011')).toBeInTheDocument()
      expect(cancelledWait()).toBeInTheDocument()

      // A senha saiu da fila ao ser cancelada: avançar o relógio não move a espera.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })
      expect(cancelledWait()).toBeInTheDocument()
    } finally {
      vi.runOnlyPendingTimers()
      vi.useRealTimers()
    }
  })

  it('cancels a ticket with a reason through the confirm dialog', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    renderManager()
    await screen.findByText('Fila ativa')

    fireEvent.click((await screen.findAllByRole('button', { name: /Ações da senha A001/ }))[0])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancelar senha' }))

    const dialog = await screen.findByRole('dialog')
    const user = userEvent.setup()
    await user.type(within(dialog).getByRole('textbox'), 'duplicada')
    fireEvent.click(within(dialog).getByRole('button', { name: /Cancelar senha|Restaurar senha|Corrigir atendimento|Finalizar atendimento/ }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/tickets/w1/cancel', { reason: 'duplicada' }),
    )
  })

  it('lists paused tickets in the manager view', async () => {
    const paused = [
      {
        id: 'p1',
        code: 'A050',
        state: 'PAUSED',
        entryChannel: 'QR_CODE',
        createdAt: minutesAgo(8),
        pausedSeconds: 60,
        representative: { fullName: 'Dora Reis' },
      },
    ]
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.includes('/overview')) return Promise.resolve({ ...overview, paused })
      if (path.includes('/daily')) return Promise.resolve(metrics)
      if (path.startsWith('/ers/')) return Promise.resolve(er)
      return Promise.resolve([])
    })
    renderManager()
    const pausedHeading = await screen.findByText('Senhas pausadas')
    const pausedSection = pausedHeading.closest('section') as HTMLElement

    expect(await within(pausedSection).findByText('A050')).toBeInTheDocument()
    expect(within(pausedSection).getByText('Dora Reis')).toBeInTheDocument()
    expect(within(pausedSection).getByText('Pausada')).toBeInTheDocument()
  })

  it('restores a no-show ticket from the recent calls menu', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    renderManager()
    await screen.findByText('Chamadas recentes')

    fireEvent.click(await screen.findByRole('button', { name: /Ações da senha A003/ }))
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

  it('logs out and redirects to the central login', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    renderManager()
    await screen.findByText('Caixas')

    fireEvent.click(screen.getByRole('button', { name: /sair/i }))

    expect(await screen.findByText('central-login')).toBeInTheDocument()
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

    fireEvent.click((await screen.findAllByRole('button', { name: /Ações da senha A001/ }))[0])
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

    fireEvent.click((await screen.findAllByRole('button', { name: /Ações da senha A001/ }))[0])
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

    expect(await screen.findByRole('button', { name: /Ações da senha A003/ })).toBeInTheDocument()
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
