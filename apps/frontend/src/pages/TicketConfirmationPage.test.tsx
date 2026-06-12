import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TicketConfirmationPage } from './TicketConfirmationPage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/fila/er-1/senha']}>
      <Routes>
        <Route path="/fila/:erId/senha" element={<TicketConfirmationPage />} />
        <Route path="/fila/:erId" element={<div>Tela de entrada</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('TicketConfirmationPage', () => {
  beforeEach(() => {
    sessionStorage.clear()
    sessionStorage.setItem('token', 'rep-token')
    sessionStorage.setItem('queue-entry:er-1', 'QR_CODE')
  })

  it('joins the queue and shows the ticket code and position', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString()
        if (url.endsWith('/api/tickets') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              id: 't-1',
              code: 'A001',
              queuePosition: 1,
              currentPosition: 2,
              state: 'WAITING',
              erId: 'er-1',
            }),
            { status: 201 },
          )
        }
        return new Response(null, { status: 200 })
      }),
    )

    renderPage()
    expect(await screen.findByText('A001')).toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sair da fila' })).toBeInTheDocument()
  })

  it('creates the ticket with the validated entry channel', async () => {
    sessionStorage.setItem('queue-entry:er-1', 'LINK')
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString().endsWith('/api/tickets') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 't-1',
            code: 'A001',
            queuePosition: 1,
            currentPosition: 1,
            state: 'WAITING',
            erId: 'er-1',
          }),
          { status: 201 },
        )
      }
      return new Response(null, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    await screen.findByText('A001')

    const createCall = fetchMock.mock.calls.find(
      ([input, init]) => input.toString().endsWith('/api/tickets') && init?.method === 'POST',
    )
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      erId: 'er-1',
      entryChannel: 'LINK',
    })
  })

  it('confirms leaving the queue through the modal and calls self-cancel', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/api/tickets') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 't-1',
            code: 'A001',
            queuePosition: 1,
            currentPosition: 1,
            state: 'WAITING',
            erId: 'er-1',
          }),
          { status: 201 },
        )
      }
      return new Response(null, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    await screen.findByText('A001')

    fireEvent.click(screen.getByRole('button', { name: 'Sair da fila' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Sair da fila?')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Sair da fila' }))

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => url.toString().includes('/tickets/t-1/self-cancel')),
      ).toBe(true),
    )
  })

  it('redirects to the entry screen when there is no token', async () => {
    sessionStorage.removeItem('token')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })))
    renderPage()
    expect(await screen.findByText('Tela de entrada')).toBeInTheDocument()
  })

  function stubJoinWith(ticket: Record<string, unknown>, status = 201) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString()
        if (url.endsWith('/api/tickets') && init?.method === 'POST') {
          return new Response(JSON.stringify(ticket), { status })
        }
        return new Response(null, { status: 200 })
      }),
    )
  }

  it('shows the called state with guidance to the counter', async () => {
    stubJoinWith({
      id: 't-1',
      code: 'B010',
      queuePosition: 0,
      currentPosition: 0,
      state: 'CALLING',
      erId: 'er-1',
    })
    renderPage()
    expect(await screen.findByText('Chamada! Dirija-se ao caixa')).toBeInTheDocument()
  })

  it('shows the in-service state', async () => {
    stubJoinWith({
      id: 't-1',
      code: 'B011',
      queuePosition: 0,
      currentPosition: 0,
      state: 'IN_SERVICE',
      erId: 'er-1',
    })
    renderPage()
    expect(await screen.findByText('Em atendimento')).toBeInTheDocument()
  })

  it.each([
    ['FINISHED', 'Atendimento concluído'],
    ['CANCELLED', 'Senha cancelada'],
    ['NO_SHOW', 'Não comparecimento'],
  ])('renders the terminal card for %s', async (state, title) => {
    stubJoinWith({
      id: 't-1',
      code: 'C001',
      queuePosition: 0,
      currentPosition: 0,
      state,
      erId: 'er-1',
    })
    renderPage()
    expect(await screen.findByText(title)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao início' }))
    expect(await screen.findByText('Tela de entrada')).toBeInTheDocument()
    expect(sessionStorage.getItem('token')).toBeNull()
  })

  it('pauses a waiting ticket and shows the pause countdown', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/api/tickets') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 't-1',
            code: 'A001',
            queuePosition: 1,
            currentPosition: 3,
            state: 'WAITING',
            erId: 'er-1',
          }),
          { status: 201 },
        )
      }
      if (url.includes('/tickets/t-1/pause')) {
        return new Response(
          JSON.stringify({
            id: 't-1',
            code: 'A001',
            queuePosition: 1,
            currentPosition: 0,
            state: 'PAUSED',
            erId: 'er-1',
            pausedAt: new Date().toISOString(),
            pauseTimeoutSeconds: 300,
          }),
          { status: 200 },
        )
      }
      return new Response(null, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Não estou pronta — pausar' }))

    expect(await screen.findByText('Pausada')).toBeInTheDocument()
    expect(screen.getByText('Tempo restante para retomar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Estou pronta — retomar senha' })).toBeInTheDocument()
  })

  it('falls back to the active ticket when joining returns a 409 conflict', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/api/tickets') && init?.method === 'POST') {
        return new Response(JSON.stringify({ message: 'já está na fila' }), { status: 409 })
      }
      if (url.includes('/api/tickets/my-active')) {
        return new Response(
          JSON.stringify({
            id: 't-9',
            code: 'Z099',
            queuePosition: 1,
            currentPosition: 5,
            state: 'WAITING',
            erId: 'er-1',
          }),
          { status: 200 },
        )
      }
      return new Response(null, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    expect(await screen.findByText('Z099')).toBeInTheDocument()
    expect(screen.getByText('#5')).toBeInTheDocument()
  })

  it('shows an error when joining the queue fails', async () => {
    stubJoinWith({ message: 'Fila fechada' }, 400)
    renderPage()
    expect(await screen.findByText('Ops!')).toBeInTheDocument()
    expect(screen.getByText('Fila fechada')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(await screen.findByText('Tela de entrada')).toBeInTheDocument()
  })

  it('resumes a paused ticket back to waiting', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/api/tickets') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 't-1',
            code: 'A001',
            queuePosition: 1,
            currentPosition: 0,
            state: 'PAUSED',
            erId: 'er-1',
          }),
          { status: 201 },
        )
      }
      if (url.includes('/tickets/t-1/resume')) {
        return new Response(
          JSON.stringify({
            id: 't-1',
            code: 'A001',
            queuePosition: 1,
            currentPosition: 4,
            state: 'WAITING',
            erId: 'er-1',
          }),
          { status: 200 },
        )
      }
      return new Response(null, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Estou pronta — retomar senha' }))
    expect(await screen.findByText('#4')).toBeInTheDocument()
  })

  it('shows an error when leaving the queue fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/api/tickets') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 't-1',
            code: 'A001',
            queuePosition: 1,
            currentPosition: 1,
            state: 'WAITING',
            erId: 'er-1',
          }),
          { status: 201 },
        )
      }
      if (url.includes('/self-cancel')) {
        return new Response(JSON.stringify({ message: 'Não foi possível cancelar' }), {
          status: 400,
        })
      }
      return new Response(null, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    await screen.findByText('A001')
    fireEvent.click(screen.getByRole('button', { name: 'Sair da fila' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sair da fila' }))

    expect(await screen.findByText('Não foi possível cancelar')).toBeInTheDocument()
    // The action error shows inline; the ticket stays visible (no full "Ops!" screen).
    expect(screen.getByText('A001')).toBeInTheDocument()
    expect(screen.queryByText('Ops!')).not.toBeInTheDocument()
  })

  it('shows "Em chamada" when a waiting ticket has no concrete position yet', async () => {
    stubJoinWith({
      id: 't-1',
      code: 'A001',
      queuePosition: 0,
      currentPosition: 0,
      state: 'WAITING',
      erId: 'er-1',
    })
    renderPage()
    expect(await screen.findByText('Em chamada')).toBeInTheDocument()
  })

  it('shows the representative name above the ticket when present', async () => {
    stubJoinWith({
      id: 't-1',
      code: 'A001',
      queuePosition: 1,
      currentPosition: 2,
      state: 'WAITING',
      erId: 'er-1',
      representative: { fullName: 'Maria Souza' },
    })
    renderPage()
    expect(await screen.findByText('Maria Souza')).toBeInTheDocument()
  })

  it('falls back to a generic message when joining fails without a message', async () => {
    stubJoinWith({}, 400)
    renderPage()
    expect(await screen.findByText('Erro ao entrar na fila')).toBeInTheDocument()
  })

  it('surfaces an error when the 409 fallback cannot fetch the active ticket', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/api/tickets') && init?.method === 'POST') {
        return new Response(JSON.stringify({ message: 'já está na fila' }), { status: 409 })
      }
      if (url.includes('/api/tickets/my-active')) {
        return new Response(null, { status: 500 })
      }
      return new Response(null, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    expect(await screen.findByText('Ops!')).toBeInTheDocument()
    expect(
      screen.getByText('Você já está na fila, mas não foi possível obter a senha.'),
    ).toBeInTheDocument()
  })

  it('uses a generic message when pausing fails without a message body', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/api/tickets') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 't-1',
            code: 'A001',
            queuePosition: 1,
            currentPosition: 3,
            state: 'WAITING',
            erId: 'er-1',
          }),
          { status: 201 },
        )
      }
      if (url.includes('/tickets/t-1/pause')) {
        return new Response(JSON.stringify({}), { status: 400 })
      }
      return new Response(null, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Não estou pronta — pausar' }))
    expect(await screen.findByText('Erro')).toBeInTheDocument()
  })

  it('falls back to a generic message when leaving fails without a message body', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/api/tickets') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 't-1',
            code: 'A001',
            queuePosition: 1,
            currentPosition: 1,
            state: 'WAITING',
            erId: 'er-1',
          }),
          { status: 201 },
        )
      }
      if (url.includes('/self-cancel')) {
        // Non-JSON body forces the .catch(() => ({})) fallback in handleLeaveQueue.
        return new Response('not json', { status: 500 })
      }
      return new Response(null, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    await screen.findByText('A001')
    fireEvent.click(screen.getByRole('button', { name: 'Sair da fila' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sair da fila' }))
    expect(await screen.findByText('Erro ao cancelar senha')).toBeInTheDocument()
  })

  it('shows an unexpected error when joining rejects with a non-error value', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (input.toString().endsWith('/api/tickets') && init?.method === 'POST') {
          // Reject with a non-Error so the `instanceof Error` guard takes its fallback.
          return Promise.reject('boom')
        }
        return new Response(null, { status: 200 })
      }),
    )
    renderPage()
    expect(await screen.findByText('Erro inesperado')).toBeInTheDocument()
  })

  it('shows a generic message when the pause request rejects with a non-error', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/api/tickets') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 't-1',
            code: 'A001',
            queuePosition: 1,
            currentPosition: 3,
            state: 'WAITING',
            erId: 'er-1',
          }),
          { status: 201 },
        )
      }
      if (url.includes('/tickets/t-1/pause')) {
        return Promise.reject('boom')
      }
      return new Response(null, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Não estou pronta — pausar' }))
    expect(await screen.findByText('Erro ao atualizar senha')).toBeInTheDocument()
  })

  it('shows a generic message when leaving rejects with a non-error', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/api/tickets') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 't-1',
            code: 'A001',
            queuePosition: 1,
            currentPosition: 1,
            state: 'WAITING',
            erId: 'er-1',
          }),
          { status: 201 },
        )
      }
      if (url.includes('/self-cancel')) {
        return Promise.reject('boom')
      }
      return new Response(null, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    await screen.findByText('A001')
    fireEvent.click(screen.getByRole('button', { name: 'Sair da fila' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sair da fila' }))
    expect(await screen.findByText('Erro ao cancelar senha')).toBeInTheDocument()
  })

  it('shows the pause action without a countdown when no timeout is configured', async () => {
    stubJoinWith({
      id: 't-1',
      code: 'A001',
      queuePosition: 1,
      currentPosition: 0,
      state: 'PAUSED',
      erId: 'er-1',
      pausedAt: new Date().toISOString(),
    })
    renderPage()
    expect(await screen.findByText('Pausada')).toBeInTheDocument()
    // pauseTimeoutSeconds is absent, so the (?? 0) > 0 guard suppresses the countdown.
    expect(screen.queryByText('Tempo restante para retomar')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Estou pronta — retomar senha' }),
    ).toBeInTheDocument()
  })

  it('falls back to an empty bearer token when the session token disappears', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/api/tickets') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 't-1',
            code: 'A001',
            queuePosition: 1,
            currentPosition: 3,
            state: 'WAITING',
            erId: 'er-1',
          }),
          { status: 201 },
        )
      }
      if (url.includes('/tickets/t-1/pause')) {
        return new Response(
          JSON.stringify({
            id: 't-1',
            code: 'A001',
            queuePosition: 1,
            currentPosition: 0,
            state: 'PAUSED',
            erId: 'er-1',
          }),
          { status: 200 },
        )
      }
      return new Response(null, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    const pauseBtn = await screen.findByRole('button', { name: 'Não estou pronta — pausar' })
    // Drop the token, then trigger a re-render: the render-time token read now hits
    // its empty-string fallback while the component stays interactive.
    sessionStorage.removeItem('token')
    fireEvent.click(pauseBtn)

    expect(await screen.findByText('Pausada')).toBeInTheDocument()
    expect(sessionStorage.getItem('token')).toBeNull()
  })

  it('redirects to the entry screen when the entry channel is missing', async () => {
    sessionStorage.removeItem('queue-entry:er-1')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })))
    renderPage()
    expect(await screen.findByText('Tela de entrada')).toBeInTheDocument()
  })

  it('shows an inline error when pausing the ticket fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/api/tickets') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 't-1',
            code: 'A001',
            queuePosition: 1,
            currentPosition: 3,
            state: 'WAITING',
            erId: 'er-1',
          }),
          { status: 201 },
        )
      }
      if (url.includes('/tickets/t-1/pause')) {
        return new Response(JSON.stringify({ message: 'Não foi possível pausar' }), { status: 400 })
      }
      return new Response(null, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Não estou pronta — pausar' }))

    expect(await screen.findByText('Não foi possível pausar')).toBeInTheDocument()
    // The ticket card stays in place — pausing failed without losing state.
    expect(screen.getByText('A001')).toBeInTheDocument()
  })

  it('shows a generic error when the pause request throws', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/api/tickets') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 't-1',
            code: 'A001',
            queuePosition: 1,
            currentPosition: 3,
            state: 'WAITING',
            erId: 'er-1',
          }),
          { status: 201 },
        )
      }
      if (url.includes('/tickets/t-1/pause')) {
        throw new Error('network down')
      }
      return new Response(null, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Não estou pronta — pausar' }))

    expect(await screen.findByText('network down')).toBeInTheDocument()
  })

  describe('polling and countdown (fake timers)', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.runOnlyPendingTimers()
      vi.useRealTimers()
    })

    async function renderWaitingTicket(
      fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
      initial: Record<string, unknown> = {},
    ) {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString()
        if (url.endsWith('/api/tickets') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              id: 't-1',
              code: 'A001',
              queuePosition: 1,
              currentPosition: 3,
              state: 'WAITING',
              erId: 'er-1',
              ...initial,
            }),
            { status: 201 },
          )
        }
        return fetchImpl(input, init)
      })
      vi.stubGlobal('fetch', fetchMock)
      renderPage()
      // Flush the join promise chain that resolves the initial ticket.
      await vi.waitFor(() => expect(screen.getByText('A001')).toBeInTheDocument())
      return fetchMock
    }

    it('polls my-active and updates the ticket position', async () => {
      await renderWaitingTicket(async (input) => {
        if (input.toString().includes('/api/tickets/my-active')) {
          return new Response(
            JSON.stringify({
              id: 't-1',
              code: 'A001',
              queuePosition: 1,
              currentPosition: 1,
              state: 'WAITING',
              erId: 'er-1',
            }),
            { status: 200 },
          )
        }
        return new Response(null, { status: 200 })
      })

      expect(screen.getByText('#3')).toBeInTheDocument()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000)
      })
      expect(screen.getByText('#1')).toBeInTheDocument()
    })

    it('marks the ticket as finished when polling returns 404', async () => {
      await renderWaitingTicket(async (input) => {
        if (input.toString().includes('/api/tickets/my-active')) {
          return new Response(null, { status: 404 })
        }
        return new Response(null, { status: 200 })
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000)
      })
      expect(screen.getByText('Atendimento concluído')).toBeInTheDocument()
    })

    it('marks a paused ticket as cancelled when polling returns 404', async () => {
      await renderWaitingTicket(
        async (input) => {
          if (input.toString().includes('/api/tickets/my-active')) {
            return new Response(null, { status: 404 })
          }
          return new Response(null, { status: 200 })
        },
        { state: 'PAUSED', pausedAt: new Date().toISOString(), pauseTimeoutSeconds: 600 },
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000)
      })
      expect(screen.getByText('Senha cancelada')).toBeInTheDocument()
    })

    it('ignores a non-ok, non-404 polling response and keeps the last state', async () => {
      await renderWaitingTicket(async (input) => {
        if (input.toString().includes('/api/tickets/my-active')) {
          return new Response(null, { status: 500 })
        }
        return new Response(null, { status: 200 })
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000)
      })
      expect(screen.getByText('#3')).toBeInTheDocument()
    })

    it('keeps the last known state when polling rejects', async () => {
      await renderWaitingTicket(async (input) => {
        if (input.toString().includes('/api/tickets/my-active')) {
          throw new Error('offline')
        }
        return new Response(null, { status: 200 })
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000)
      })
      expect(screen.getByText('#3')).toBeInTheDocument()
    })

    it('cancels the ticket when the pause countdown expires', async () => {
      await renderWaitingTicket(
        async () => new Response(null, { status: 200 }),
        {
          state: 'PAUSED',
          currentPosition: 0,
          pausedAt: new Date().toISOString(),
          pauseTimeoutSeconds: 1,
        },
      )

      expect(screen.getByText('Pausada')).toBeInTheDocument()
      // Drive the countdown past its 1s deadline so onExpire cancels the ticket.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })
      expect(screen.getByText('Senha cancelada')).toBeInTheDocument()
    })
  })
})
