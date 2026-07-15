import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playCallAlert } from '../utils/callAlert'
import { TicketConfirmationPage } from './TicketConfirmationPage'

vi.mock('../utils/callAlert', () => ({
  playCallAlert: vi.fn(),
  unlockCallAlert: vi.fn(),
}))

function renderPage({ strict = false } = {}) {
  const tree = (
    <MemoryRouter initialEntries={['/fila/er-1/senha']}>
      <Routes>
        <Route path="/fila/:erId/senha" element={<TicketConfirmationPage />} />
        <Route path="/fila/:erId" element={<div>Tela de entrada</div>} />
      </Routes>
    </MemoryRouter>
  )
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

describe('TicketConfirmationPage', () => {
  beforeEach(() => {
    sessionStorage.clear()
    sessionStorage.setItem('token', 'rep-token')
    sessionStorage.setItem('queue-entry:er-1', 'QR_CODE')
    // Default: arriving from a deliberate entry, so the screen creates a ticket.
    // Read-only (refresh) tests clear this flag to assert no ticket is created.
    sessionStorage.setItem('queue-entry-pending:er-1', '1')
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

  it('creates a single ticket under StrictMode double-invoke', async () => {
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

    renderPage({ strict: true })
    await screen.findByText('A001')

    const createCalls = fetchMock.mock.calls.filter(
      ([input, init]) => input.toString().endsWith('/api/tickets') && init?.method === 'POST',
    )
    expect(createCalls).toHaveLength(1)
  })

  function postCount(fetchMock: ReturnType<typeof vi.fn>): number {
    return fetchMock.mock.calls.filter(
      ([input, init]) =>
        input.toString().endsWith('/api/tickets') && (init as RequestInit)?.method === 'POST',
    ).length
  }

  it('reads the current status on refresh without creating a ticket', async () => {
    sessionStorage.removeItem('queue-entry-pending:er-1')
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (input.toString().includes('/api/tickets/my-status')) {
        return new Response(
          JSON.stringify({
            id: 't-1',
            code: 'A001',
            queuePosition: 1,
            currentPosition: 2,
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
    expect(await screen.findByText('A001')).toBeInTheDocument()
    expect(screen.getByText('#2')).toBeInTheDocument()
    expect(postCount(fetchMock)).toBe(0)
  })

  it('keeps the no-show state on refresh instead of re-entering the queue', async () => {
    sessionStorage.removeItem('queue-entry-pending:er-1')
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (input.toString().includes('/api/tickets/my-status')) {
        return new Response(
          JSON.stringify({
            id: 't-1',
            code: 'A001',
            queuePosition: 1,
            currentPosition: 0,
            state: 'NO_SHOW',
            erId: 'er-1',
          }),
          { status: 200 },
        )
      }
      return new Response(null, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    expect(await screen.findByText('Não comparecimento')).toBeInTheDocument()
    expect(postCount(fetchMock)).toBe(0)
  })

  it('redirects to the entry screen on refresh when there is no ticket', async () => {
    sessionStorage.removeItem('queue-entry-pending:er-1')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (input.toString().includes('/api/tickets/my-status')) {
          return new Response(null, { status: 404 })
        }
        return new Response(null, { status: 200 })
      }),
    )

    renderPage()
    expect(await screen.findByText('Tela de entrada')).toBeInTheDocument()
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

  it('closes the leave dialog on cancel without self-cancelling', async () => {
    stubJoinWith({
      id: 't-1',
      code: 'A001',
      queuePosition: 1,
      currentPosition: 1,
      state: 'WAITING',
      erId: 'er-1',
    })
    renderPage()
    await screen.findByText('A001')

    fireEvent.click(screen.getByRole('button', { name: 'Sair da fila' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Voltar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    // Reopen and dismiss through the modal's own onClose (cancel event).
    fireEvent.click(screen.getByRole('button', { name: 'Sair da fila' }))
    const reopened = await screen.findByRole('dialog')
    fireEvent(reopened, new Event('cancel', { cancelable: true }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('marks the ticket NO_SHOW when the call countdown expires', async () => {
    stubJoinWith({
      id: 't-1',
      code: 'B010',
      queuePosition: 0,
      currentPosition: 0,
      state: 'CALLING',
      erId: 'er-1',
      calledAt: new Date('2020-01-01T00:00:00Z').toISOString(),
      callTimeoutSeconds: 600,
    })
    renderPage()
    // The deadline is long past, so the call countdown's onExpire fires on mount
    // and transitions the ticket to NO_SHOW.
    expect(await screen.findByText('Não comparecimento')).toBeInTheDocument()
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

  it('shows a countdown while called with a configured call timeout', async () => {
    stubJoinWith({
      id: 't-1',
      code: 'B010',
      queuePosition: 0,
      currentPosition: 0,
      state: 'CALLING',
      erId: 'er-1',
      calledAt: new Date().toISOString(),
      callTimeoutSeconds: 600,
    })
    renderPage()
    expect(await screen.findByText('Chamada! Dirija-se ao caixa')).toBeInTheDocument()
    expect(screen.getByText('Tempo para chegar ao caixa')).toBeInTheDocument()
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

  it('pauses then resumes, preserving the ticket code through the round trip', async () => {
    // Fluxo real: a senha nasce WAITING (POST /api/tickets), a RE pausa (POST /pause →
    // PAUSED) e depois retoma (POST /resume → WAITING). O invariante "retoma no lugar" é
    // verificado pela preservação do mesmo `code` da senha em todo o trajeto.
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
      if (url.includes('/tickets/t-1/resume')) {
        return new Response(
          JSON.stringify({
            id: 't-1',
            code: 'A001',
            queuePosition: 1,
            currentPosition: 3,
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

    // Nasce aguardando, na posição #3.
    expect(await screen.findByText('A001')).toBeInTheDocument()
    expect(screen.getByText('#3')).toBeInTheDocument()

    // Pausar: a RE não está pronta.
    fireEvent.click(screen.getByRole('button', { name: 'Não estou pronta — pausar' }))
    expect(await screen.findByText('Pausada')).toBeInTheDocument()

    // Retomar: volta para a fila com o MESMO code e a MESMA posição (#3).
    fireEvent.click(screen.getByRole('button', { name: 'Estou pronta — retomar senha' }))
    expect(await screen.findByText('#3')).toBeInTheDocument()
    // A mesma senha atravessa pausar→retomar sem ser reemitida.
    expect(screen.getByText('A001')).toBeInTheDocument()

    // O backend foi exercitado nos dois sentidos, na ordem pause → resume.
    const pauseCalled = fetchMock.mock.calls.some(([url, init]) =>
      url.toString().includes('/tickets/t-1/pause') && (init as RequestInit)?.method === 'POST',
    )
    const resumeCalled = fetchMock.mock.calls.some(([url, init]) =>
      url.toString().includes('/tickets/t-1/resume') && (init as RequestInit)?.method === 'POST',
    )
    expect(pauseCalled).toBe(true)
    expect(resumeCalled).toBe(true)
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

  it('greets the representative by first name only (not the full name)', async () => {
    stubJoinWith({
      id: 't-1',
      code: 'A001',
      queuePosition: 1,
      currentPosition: 2,
      state: 'WAITING',
      erId: 'er-1',
      representative: { fullName: 'Maria Souza Lima' },
    })
    renderPage()
    // Confirmação no dispositivo da própria RE: só o primeiro nome (amigável/minimalista).
    expect(await screen.findByText('Maria')).toBeInTheDocument()
    expect(screen.queryByText('Maria Souza Lima')).not.toBeInTheDocument()
  })

  it('never self-prioritizes: the join body omits isPriority on the QR path', async () => {
    // Default beforeEach uses the QR_CODE channel. A RE must not be able to flag her
    // own ticket as priority, so the create payload carries only erId + entryChannel.
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
    const body = JSON.parse(String(createCall?.[1]?.body))
    expect(body).not.toHaveProperty('isPriority')
    expect(body).toEqual({ erId: 'er-1', entryChannel: 'QR_CODE' })
  })

  it('never self-prioritizes: the join body omits isPriority on the LINK path', async () => {
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
    const body = JSON.parse(String(createCall?.[1]?.body))
    expect(body).not.toHaveProperty('isPriority')
    expect(body).toEqual({ erId: 'er-1', entryChannel: 'LINK' })
  })

  it('exposes no priority toggle on the confirmation screen', async () => {
    stubJoinWith({
      id: 't-1',
      code: 'A001',
      queuePosition: 1,
      currentPosition: 2,
      state: 'WAITING',
      erId: 'er-1',
    })
    renderPage()
    await screen.findByText('A001')

    // The RE cannot self-prioritize: no switch/checkbox/control for "preferencial".
    expect(screen.queryByText(/preferencial/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/preferencial/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('hides the leave and pause actions while the ticket is being called', async () => {
    stubJoinWith({
      id: 't-1',
      code: 'B010',
      queuePosition: 0,
      currentPosition: 0,
      state: 'CALLING',
      erId: 'er-1',
    })
    renderPage()
    await screen.findByText('Chamada! Dirija-se ao caixa')

    // Protects the counter flow: once called, the RE can't leave or pause and slip
    // out from under the attendant.
    expect(screen.queryByText('Sair da fila')).not.toBeInTheDocument()
    expect(screen.queryByText('Não estou pronta — pausar')).not.toBeInTheDocument()
    expect(screen.queryByText('Estou pronta — retomar senha')).not.toBeInTheDocument()
  })

  it('hides the leave and pause actions while the ticket is in service', async () => {
    stubJoinWith({
      id: 't-1',
      code: 'B011',
      queuePosition: 0,
      currentPosition: 0,
      state: 'IN_SERVICE',
      erId: 'er-1',
    })
    renderPage()
    await screen.findByText('Em atendimento')

    expect(screen.queryByText('Sair da fila')).not.toBeInTheDocument()
    expect(screen.queryByText('Não estou pronta — pausar')).not.toBeInTheDocument()
    expect(screen.queryByText('Estou pronta — retomar senha')).not.toBeInTheDocument()
  })

  // The three mutating actions (join/pause/leave) share a "no message body" branch:
  // each falls back to its own default copy via `?? '<generic>'` when the failing
  // response carries no `message`. One it.each per action keeps that branch covered
  // without three near-identical bodies.
  const waitingTicket = {
    id: 't-1',
    code: 'A001',
    queuePosition: 1,
    currentPosition: 3,
    state: 'WAITING',
    erId: 'er-1',
  } as const

  async function clickLeaveConfirm() {
    fireEvent.click(screen.getByRole('button', { name: 'Sair da fila' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sair da fila' }))
  }

  it.each([
    {
      label: 'joining',
      // POST /api/tickets fails with an empty JSON body → no `message` to surface.
      fetchImpl: (url: string, init?: RequestInit) =>
        url.endsWith('/api/tickets') && init?.method === 'POST'
          ? new Response(JSON.stringify({}), { status: 400 })
          : null,
      act: async () => {},
      expected: 'Erro ao entrar na fila',
    },
    {
      label: 'pausing',
      fetchImpl: (url: string) =>
        url.includes('/tickets/t-1/pause')
          ? new Response(JSON.stringify({}), { status: 400 })
          : null,
      act: async () =>
        fireEvent.click(
          await screen.findByRole('button', { name: 'Não estou pronta — pausar' }),
        ),
      expected: 'Erro',
    },
    {
      label: 'leaving',
      // Non-JSON body forces the `.catch(() => ({}))` fallback in handleLeaveQueue.
      fetchImpl: (url: string) =>
        url.includes('/self-cancel') ? new Response('not json', { status: 500 }) : null,
      act: async () => {
        await screen.findByText('A001')
        await clickLeaveConfirm()
      },
      expected: 'Erro ao cancelar senha',
    },
  ])(
    'falls back to a generic message when $label fails without a message body',
    async ({ label, fetchImpl, act, expected }) => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString()
        // The join itself succeeds for the pause/leave cases so the screen renders.
        if (label !== 'joining' && url.endsWith('/api/tickets') && init?.method === 'POST') {
          return new Response(JSON.stringify(waitingTicket), { status: 201 })
        }
        return fetchImpl(url, init) ?? new Response(null, { status: 200 })
      })
      vi.stubGlobal('fetch', fetchMock)

      renderPage()
      await act()
      expect(await screen.findByText(expected)).toBeInTheDocument()
    },
  )

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

  // Same three actions, but here the request itself rejects with a non-Error value,
  // so the `err instanceof Error ? err.message : '<generic>'` guard takes its fallback
  // branch. One it.each per action covers all three guards.
  it.each([
    {
      label: 'joining',
      fetchImpl: (url: string, init?: RequestInit) =>
        url.endsWith('/api/tickets') && init?.method === 'POST' ? Promise.reject('boom') : null,
      act: async () => {},
      expected: 'Erro inesperado',
    },
    {
      label: 'the pause request',
      fetchImpl: (url: string) =>
        url.includes('/tickets/t-1/pause') ? Promise.reject('boom') : null,
      act: async () =>
        fireEvent.click(
          await screen.findByRole('button', { name: 'Não estou pronta — pausar' }),
        ),
      expected: 'Erro ao atualizar senha',
    },
    {
      label: 'leaving',
      fetchImpl: (url: string) =>
        url.includes('/self-cancel') ? Promise.reject('boom') : null,
      act: async () => {
        await screen.findByText('A001')
        await clickLeaveConfirm()
      },
      expected: 'Erro ao cancelar senha',
    },
  ])('shows a generic message when $label rejects with a non-error', async ({
    label,
    fetchImpl,
    act,
    expected,
  }) => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      // The join succeeds for the pause/leave cases so the screen renders first.
      if (label !== 'joining' && url.endsWith('/api/tickets') && init?.method === 'POST') {
        return new Response(JSON.stringify(waitingTicket), { status: 201 })
      }
      return fetchImpl(url, init) ?? new Response(null, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    await act()
    expect(await screen.findByText(expected)).toBeInTheDocument()
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
      // Zero the poll jitter so the timing assertions stay deterministic.
      vi.spyOn(Math, 'random').mockReturnValue(0)
    })

    afterEach(() => {
      vi.runOnlyPendingTimers()
      vi.useRealTimers()
      vi.mocked(Math.random).mockRestore()
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
      await vi.waitFor(() => expect(screen.getByText('A001')).toBeInTheDocument())
      return fetchMock
    }

    function statusResponse(overrides: Record<string, unknown>) {
      return new Response(
        JSON.stringify({
          id: 't-1',
          code: 'A001',
          queuePosition: 1,
          currentPosition: 0,
          state: 'WAITING',
          erId: 'er-1',
          ...overrides,
        }),
        { status: 200 },
      )
    }

    it('polls my-status and updates the ticket position', async () => {
      await renderWaitingTicket(async (input) => {
        if (input.toString().includes('/api/tickets/my-status')) {
          return statusResponse({ currentPosition: 1 })
        }
        return new Response(null, { status: 200 })
      })

      expect(screen.getByText('#3')).toBeInTheDocument()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000)
      })
      expect(screen.getByText('#1')).toBeInTheDocument()
    })

    it('plays the call alert when the ticket transitions to CALLING', async () => {
      vi.mocked(playCallAlert).mockClear()
      let state = 'WAITING'
      await renderWaitingTicket(async (input) => {
        if (input.toString().includes('/api/tickets/my-status')) {
          return statusResponse({ state })
        }
        return new Response(null, { status: 200 })
      })
      expect(playCallAlert).not.toHaveBeenCalled()

      state = 'CALLING'
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000)
      })
      expect(playCallAlert).toHaveBeenCalled()
    })

    it('shows finished when polling reports a finished service', async () => {
      await renderWaitingTicket(async (input) => {
        if (input.toString().includes('/api/tickets/my-status')) {
          return statusResponse({ state: 'FINISHED' })
        }
        return new Response(null, { status: 200 })
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000)
      })
      expect(screen.getByText('Atendimento concluído')).toBeInTheDocument()
    })

    it('shows não comparecimento (not concluído) when polling reports NO_SHOW', async () => {
      await renderWaitingTicket(async (input) => {
        if (input.toString().includes('/api/tickets/my-status')) {
          return statusResponse({ state: 'NO_SHOW' })
        }
        return new Response(null, { status: 200 })
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000)
      })
      expect(screen.getByText('Não comparecimento')).toBeInTheDocument()
      expect(screen.queryByText('Atendimento concluído')).not.toBeInTheDocument()
    })

    it('recovers the live status when a no-show ticket is restored to waiting', async () => {
      let state = 'NO_SHOW'
      await renderWaitingTicket(async (input) => {
        if (input.toString().includes('/api/tickets/my-status')) {
          return statusResponse({ state, currentPosition: state === 'WAITING' ? 5 : 0 })
        }
        return new Response(null, { status: 200 })
      })

      // First poll: the operator marked a no-show.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000)
      })
      expect(screen.getByText('Não comparecimento')).toBeInTheDocument()

      // The manager restores the ticket; the next poll brings the live view back.
      state = 'WAITING'
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000)
      })
      expect(screen.queryByText('Não comparecimento')).not.toBeInTheDocument()
      expect(screen.getByText('#5')).toBeInTheDocument()
    })

    it('ignores a non-ok polling response and keeps the last state', async () => {
      await renderWaitingTicket(async (input) => {
        if (input.toString().includes('/api/tickets/my-status')) {
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
        if (input.toString().includes('/api/tickets/my-status')) {
          throw new Error('offline')
        }
        return new Response(null, { status: 200 })
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000)
      })
      expect(screen.getByText('#3')).toBeInTheDocument()
    })

    it('spreads polls with jitter so synchronized clients drift apart', async () => {
      vi.mocked(Math.random).mockReturnValue(1)
      const fetchMock = await renderWaitingTicket(async (input) => {
        if (input.toString().includes('/api/tickets/my-status')) {
          return statusResponse({ currentPosition: 1 })
        }
        return new Response(null, { status: 200 })
      })
      const statusCalls = () =>
        fetchMock.mock.calls.filter(([input]) =>
          input.toString().includes('/api/tickets/my-status'),
        ).length

      // With maximum jitter the poll lands at 12s: the base interval alone must not fire.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000)
      })
      expect(statusCalls()).toBe(0)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })
      expect(statusCalls()).toBe(1)
    })

    it('backs off the polling cadence after a 429 rate-limit response', async () => {
      const fetchMock = await renderWaitingTicket(async (input) => {
        if (input.toString().includes('/api/tickets/my-status')) {
          return new Response(null, { status: 429 })
        }
        return new Response(null, { status: 200 })
      })
      const statusCalls = () =>
        fetchMock.mock.calls.filter(([input]) =>
          input.toString().includes('/api/tickets/my-status'),
        ).length

      // First poll at the base cadence gets rate limited…
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000)
      })
      expect(statusCalls()).toBe(1)
      // …so the next attempt waits 20s: still nothing after only 10s more…
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000)
      })
      expect(statusCalls()).toBe(1)
      // …and it fires once the doubled interval elapses.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000)
      })
      expect(statusCalls()).toBe(2)
      // The screen quietly keeps the last known position meanwhile.
      expect(screen.getByText('#3')).toBeInTheDocument()
    })

    it('resumes the ticket to the queue when the pause countdown expires', async () => {
      await renderWaitingTicket(
        async (input) => {
          if (input.toString().includes('/api/tickets/my-status')) {
            // Expirar a pausa agora RETOMA a senha (volta ao fim da fila).
            return statusResponse({ code: 'A005', currentPosition: 5, state: 'WAITING' })
          }
          return new Response(null, { status: 200 })
        },
        {
          state: 'PAUSED',
          currentPosition: 0,
          pausedAt: new Date().toISOString(),
          pauseTimeoutSeconds: 1,
        },
      )

      expect(screen.getByText('Pausada')).toBeInTheDocument()
      // Drive the countdown past its 1s deadline so onExpire re-fetches the status.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })
      expect(screen.queryByText('Senha cancelada')).not.toBeInTheDocument()
      expect(screen.queryByText('Pausada')).not.toBeInTheDocument()
      expect(screen.getByText('#5')).toBeInTheDocument()
    })

    it('retries the status re-fetch if it fails when the pause expires', async () => {
      let statusCalls = 0
      await renderWaitingTicket(
        async (input) => {
          if (input.toString().includes('/api/tickets/my-status')) {
            statusCalls += 1
            // 1ª re-busca falha; a retentativa (3s) deve reconciliar para WAITING.
            if (statusCalls === 1) return new Response(null, { status: 500 })
            return statusResponse({ code: 'A005', currentPosition: 5, state: 'WAITING' })
          }
          return new Response(null, { status: 200 })
        },
        {
          state: 'PAUSED',
          currentPosition: 0,
          pausedAt: new Date().toISOString(),
          pauseTimeoutSeconds: 1,
        },
      )

      // Conta expira → 1ª re-busca falha → ainda pausada.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })
      expect(screen.getByText('Pausada')).toBeInTheDocument()

      // Retentativa após 3s → sucesso → volta para a fila.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })
      expect(screen.queryByText('Pausada')).not.toBeInTheDocument()
      expect(screen.getByText('#5')).toBeInTheDocument()
    })
  })
})
