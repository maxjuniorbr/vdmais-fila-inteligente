import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PanelPage } from './PanelPage'

// A controllable socket double so tests can drive the realtime refresh path.
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

vi.mock('../hooks/useSocket', () => ({
  useSocket: () => socketDouble,
}))

interface PanelFixture {
  isDayOpen: boolean
  current: null | {
    code: string
    displayName: string
    counterNumber: number
  }
  calling: Array<{
    code: string
    displayName: string
    counterNumber: number
  }>
  inService: Array<{ code: string; counterNumber: number }>
  waiting: Array<{ code: string; position: number }>
  avgServiceSeconds: number | null
  avgWaitSeconds: number | null
}

function fixture(callCount: number): PanelFixture {
  const calling = Array.from({ length: callCount }, (_, index) => ({
    code: `A${String(index + 1).padStart(3, '0')}`,
    displayName: `Pessoa ${index + 1}`,
    counterNumber: index + 1,
  }))

  return {
    isDayOpen: true,
    current: calling[0] ?? null,
    calling,
    inService: [],
    waiting: [],
    avgServiceSeconds: null,
    avgWaitSeconds: null,
  }
}

function renderPanel(state: PanelFixture, entry = '/painel/er-1') {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString()
    if (url.includes('/api/panel/er-1/state')) {
      return new Response(JSON.stringify(state), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(null, { status: 201 })
  })
  vi.stubGlobal('fetch', fetchMock)

  return {
    fetchMock,
    ...render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/painel/:erId" element={<PanelPage />} />
        </Routes>
      </MemoryRouter>,
    ),
  }
}

describe('PanelPage', () => {
  beforeEach(() => {
    socketDouble = null
    document.documentElement.removeAttribute('style')
    document.body.removeAttribute('style')
  })

  it.each([
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 2],
  ])('adapts the calling grid for %i simultaneous calls', async (callCount, columns) => {
    renderPanel(fixture(callCount))

    const firstCode = await screen.findByText('A001')
    const grid = firstCode.closest('article')?.parentElement

    expect(grid).toHaveStyle({ gridTemplateColumns: `repeat(${columns}, 1fr)` })
    expect(screen.getAllByText(/^CAIXA /)).toHaveLength(callCount)
  })

  it('shows operational data without presenting an unvalidated ETA', async () => {
    const state = fixture(2)
    state.inService = Array.from({ length: 9 }, (_, index) => ({
      code: `S${index + 1}`,
      counterNumber: index + 1,
    }))
    state.waiting = Array.from({ length: 8 }, (_, index) => ({
      code: `W${index + 1}`,
      position: index + 1,
    }))
    state.avgWaitSeconds = 45
    state.avgServiceSeconds = 125
    const { unmount } = renderPanel(state)

    expect(await screen.findByText('W1')).toBeInTheDocument()
    expect(screen.getByText('8 na fila')).toBeInTheDocument()
    expect(screen.getByText('PRÓXIMA')).toBeInTheDocument()
    expect(screen.getByText('+1')).toBeInTheDocument()
    expect(screen.getByText('0m 45s')).toBeInTheDocument()
    expect(screen.getByText('2m 5s')).toBeInTheDocument()
    expect(screen.queryByText(/~\d+\s*min/)).not.toBeInTheDocument()
    expect(screen.queryByText(/última espera/i)).not.toBeInTheDocument()

    expect(document.documentElement.style.overflow).toBe('hidden')

    unmount()
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('sends the display token from the URL when fetching the panel state', async () => {
    const { fetchMock } = renderPanel(fixture(1), '/painel/er-1?token=tv-token')

    await screen.findByText('A001')

    const stateCall = fetchMock.mock.calls.find(([input]) => {
      const url = input instanceof Request ? input.url : String(input)
      return url.includes('/api/panel/er-1/state')
    })
    expect(stateCall?.[1]).toMatchObject({ headers: { 'x-panel-token': 'tv-token' } })
  })

  it('shows an explicit blocked screen when the panel token is missing or invalid', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/painel/er-1']}>
        <Routes>
          <Route path="/painel/:erId" element={<PanelPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Painel sem acesso')).toBeInTheDocument()
    expect(screen.queryByText('Aguardando próxima chamada')).not.toBeInTheDocument()
  })

  it('announces the operation is closed when the day is not open', async () => {
    const state = fixture(1)
    state.isDayOpen = false
    renderPanel(state)

    expect(await screen.findByText('Atendimento encerrado por hoje')).toBeInTheDocument()
    // The live board (calling card) must not show while closed.
    expect(screen.queryByText('A001')).not.toBeInTheDocument()
    expect(screen.queryByText('Aguardando próxima chamada')).not.toBeInTheDocument()
  })

  it('keeps the panel available when polling fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    render(
      <MemoryRouter initialEntries={['/painel/er-1']}>
        <Routes>
          <Route path="/painel/:erId" element={<PanelPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Aguardando próxima chamada')).toBeInTheDocument()
    expect(screen.getByText('Fila vazia')).toBeInTheDocument()
  })

  it('keeps the panel on screen when the state request is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })))

    render(
      <MemoryRouter initialEntries={['/painel/er-1']}>
        <Routes>
          <Route path="/painel/:erId" element={<PanelPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Aguardando próxima chamada')).toBeInTheDocument()
    expect(screen.queryByText('Painel sem acesso')).not.toBeInTheDocument()
  })

  it('ticks the wall clock once per second', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      renderPanel(fixture(1))
      await screen.findByText('A001')

      const before = screen.getByText(/\d{2}h\d{2}/).textContent
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      // The clock element still renders after the interval fired.
      expect(screen.getByText(/\d{2}h\d{2}/)).toBeInTheDocument()
      expect(typeof before).toBe('string')
    } finally {
      vi.useRealTimers()
    }
  })

  it('rotates the upcoming tickets window over time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const state = fixture(1)
      state.waiting = Array.from({ length: 10 }, (_, index) => ({
        code: `W${index + 1}`,
        position: index + 1,
      }))
      renderPanel(state)
      await screen.findByText('W1')

      // First window shows W1 (fixed) plus W2..W7.
      expect(screen.getByText('W2')).toBeInTheDocument()
      expect(screen.queryByText('W8')).not.toBeInTheDocument()

      // The rotation interval re-arms once the queue length settles; pump the
      // clock in 5s steps until the second window surfaces the later tickets.
      for (let step = 0; step < 5 && !screen.queryByText('W8'); step += 1) {
        act(() => {
          vi.advanceTimersByTime(5000)
        })
      }

      expect(screen.getByText('W8')).toBeInTheDocument()
      expect(screen.getByText('W1')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('refetches the board when a realtime queue event arrives', async () => {
    socketDouble = makeSocketDouble()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { fetchMock } = renderPanel(fixture(1))
      await screen.findByText('A001')

      const stateCalls = () =>
        fetchMock.mock.calls.filter(([input]) => {
          const url = input instanceof Request ? input.url : String(input)
          return url.includes('/api/panel/er-1/state')
        }).length
      const before = stateCalls()

      act(() => {
        socketDouble!.emit('ticket.called')
        vi.advanceTimersByTime(250)
      })

      await waitFor(() => expect(stateCalls()).toBeGreaterThan(before))
    } finally {
      vi.useRealTimers()
    }
  })
})

