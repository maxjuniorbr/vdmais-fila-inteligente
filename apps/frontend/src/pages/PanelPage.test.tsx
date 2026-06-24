import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PanelPage } from './PanelPage'

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

  it('never leaks PII even when the panel state payload carries extra identifiers', async () => {
    // The TV is public (gated only by a panel token). Even if the backend payload
    // ever regresses and ships raw identifiers, the public panel must render only
    // the modeled fields (code / displayName / counterNumber / position) and never
    // surface CPF, phone, full name or the internal RE code.
    const pii = {
      fullName: 'João da Silva Santos',
      cpf: '123.456.789-00',
      phone: '11999990000',
      reCode: 'RE0001',
    }
    const state = {
      isDayOpen: true,
      current: { code: 'A001', displayName: 'João S.', counterNumber: 1, ...pii },
      calling: [{ code: 'A001', displayName: 'João S.', counterNumber: 1, ...pii }],
      inService: [{ code: 'S001', counterNumber: 1, ...pii }],
      waiting: [{ code: 'W001', position: 1, ...pii }],
      avgServiceSeconds: null,
      avgWaitSeconds: null,
    } as unknown as PanelFixture
    renderPanel(state)

    // The abbreviated display name (the only person identifier the TV shows) renders.
    expect(await screen.findByText('João S.')).toBeInTheDocument()
    expect(screen.getByText('A001')).toBeInTheDocument()
    expect(screen.getByText('W001')).toBeInTheDocument()

    // None of the raw PII values reach the DOM, on any of the board sections.
    expect(screen.queryByText('João da Silva Santos')).not.toBeInTheDocument()
    expect(screen.queryByText('123.456.789-00')).not.toBeInTheDocument()
    expect(screen.queryByText('11999990000')).not.toBeInTheDocument()
    expect(screen.queryByText('RE0001')).not.toBeInTheDocument()
    expect(screen.queryByText(/João da Silva/)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('123.456.789-00')
    expect(document.body.textContent).not.toContain('11999990000')
    expect(document.body.textContent).not.toContain('RE0001')
  })

  it('flags a priority ticket in the waiting list at a non-first position', async () => {
    const state = fixture(1)
    state.waiting = [
      { code: 'W1', position: 1 },
      { code: 'W2', position: 2, isPriority: true },
      { code: 'W3', position: 3 },
    ] as unknown as PanelFixture['waiting']
    renderPanel(state)

    // The PREFERENCIAL tag is shown for the priority ticket even though it is not
    // the next one in line, and it is the only ticket carrying that tag.
    await screen.findByText('W2')
    const tags = screen.getAllByText('PREFERENCIAL')
    expect(tags).toHaveLength(1)

    // The priority ticket is the second row, not promoted to the front of the queue.
    const codes = screen.getAllByText(/^W\d$/).map((node) => node.textContent)
    expect(codes).toEqual(['W1', 'W2', 'W3'])

    // PREFERENCIAL sits on the priority (non-first) ticket's row.
    const priorityRow = screen.getByText('W2').closest('div')
    expect(priorityRow).toHaveTextContent('PREFERENCIAL')
    // The first ticket carries PRÓXIMA, never PREFERENCIAL.
    const firstRow = screen.getByText('W1').closest('div')
    expect(firstRow).toHaveTextContent('PRÓXIMA')
    expect(firstRow).not.toHaveTextContent('PREFERENCIAL')
  })

  it('renders the waiting list, queue count, inService overflow and average durations', async () => {
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
    // inService renders up to 8 chips plus a "+N" overflow chip (9 - 8 = 1).
    expect(screen.getByText('+1')).toBeInTheDocument()
    // Averages are formatted through formatDuration (Xm Ys), never raw seconds.
    expect(screen.getByText('ESPERA MÉDIA')).toBeInTheDocument()
    expect(screen.getByText('0m 45s')).toBeInTheDocument()
    expect(screen.getByText('ATENDIMENTO MÉDIO')).toBeInTheDocument()
    expect(screen.getByText('2m 5s')).toBeInTheDocument()

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
    expect(screen.queryByText('A001')).not.toBeInTheDocument()
    expect(screen.queryByText('Aguardando próxima chamada')).not.toBeInTheDocument()
  })

  it('does not crash when the state payload omits inService', async () => {
    const state = {
      isDayOpen: true,
      current: { code: 'A001', displayName: 'Pessoa 1', counterNumber: 1 },
      calling: [{ code: 'A001', displayName: 'Pessoa 1', counterNumber: 1 }],
      waiting: [],
      avgServiceSeconds: null,
      avgWaitSeconds: null,
    } as unknown as PanelFixture
    renderPanel(state)

    expect(await screen.findByText('A001')).toBeInTheDocument()
    expect(screen.getByText('EM ATENDIMENTO')).toBeInTheDocument()
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

      // The clock renders HHhMM:SS, so a 1s tick must change the displayed text.
      const before = screen.getByText(/\d{2}h\d{2}:\d{2}/).textContent
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      const after = screen.getByText(/\d{2}h\d{2}:\d{2}/).textContent
      expect(after).not.toBe(before)
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

