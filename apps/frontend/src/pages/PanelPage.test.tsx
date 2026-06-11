import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PanelPage } from './PanelPage'

vi.mock('../hooks/useSocket', () => ({
  useSocket: () => null,
}))

interface PanelFixture {
  current: null | {
    ticketId: string
    code: string
    displayName: string
    counterNumber: number
  }
  calling: Array<{
    ticketId: string
    code: string
    displayName: string
    counterNumber: number
  }>
  inService: Array<{ ticketId: string; code: string; counterNumber: number }>
  waiting: Array<{ ticketId: string; code: string; position: number; createdAt: string }>
  avgServiceSeconds: number | null
  avgWaitSeconds: number | null
}

function fixture(callCount: number): PanelFixture {
  const calling = Array.from({ length: callCount }, (_, index) => ({
    ticketId: `calling-${index + 1}`,
    code: `A${String(index + 1).padStart(3, '0')}`,
    displayName: `Pessoa ${index + 1}`,
    counterNumber: index + 1,
  }))

  return {
    current: calling[0] ?? null,
    calling,
    inService: [],
    waiting: [],
    avgServiceSeconds: null,
    avgWaitSeconds: null,
  }
}

function renderPanel(state: PanelFixture) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
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
      <MemoryRouter initialEntries={['/painel/er-1']}>
        <Routes>
          <Route path="/painel/:erId" element={<PanelPage />} />
        </Routes>
      </MemoryRouter>,
    ),
  }
}

describe('PanelPage', () => {
  beforeEach(() => {
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
      ticketId: `service-${index + 1}`,
      code: `S${index + 1}`,
      counterNumber: index + 1,
    }))
    state.waiting = Array.from({ length: 8 }, (_, index) => ({
      ticketId: `waiting-${index + 1}`,
      code: `W${index + 1}`,
      position: index + 1,
      createdAt: '2026-06-11T10:00:00.000Z',
    }))
    state.avgWaitSeconds = 45
    state.avgServiceSeconds = 125
    const { fetchMock, unmount } = renderPanel(state)

    expect(await screen.findByText('W1')).toBeInTheDocument()
    expect(screen.getByText('8 na fila')).toBeInTheDocument()
    expect(screen.getByText('PRÓXIMA')).toBeInTheDocument()
    expect(screen.getByText('+1')).toBeInTheDocument()
    expect(screen.getByText('45s')).toBeInTheDocument()
    expect(screen.getByText('2 min')).toBeInTheDocument()
    expect(screen.queryByText(/~\d+\s*min/)).not.toBeInTheDocument()
    expect(screen.queryByText(/última espera/i)).not.toBeInTheDocument()

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/telemetry/panel/er-1/tickets/calling-1/displayed',
        { method: 'POST' },
      ),
    )
    expect(document.documentElement.style.overflow).toBe('hidden')

    unmount()
    expect(document.documentElement.style.overflow).toBe('')
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
})

