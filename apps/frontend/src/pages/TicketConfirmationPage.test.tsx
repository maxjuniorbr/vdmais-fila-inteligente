import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
})
