import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueueEntryPage } from './QueueEntryPage'

// Valid CPF (correct check digits) so the client-side validation accepts it.
const VALID_CPF = '52998224725'
const CONFLICT_MESSAGE =
  'Não foi possível entrar como convidado(a). Entre com CPF ou código de RE e senha.'

interface GuestStubOptions {
  guestEntryEnabled?: boolean
  guestStatus?: number
  guestBody?: Record<string, unknown>
}

function stubFetch({
  guestEntryEnabled = true,
  guestStatus = 200,
  guestBody,
}: GuestStubOptions = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString()
    if (url.includes('/api/public/ers/er-1')) {
      return new Response(
        JSON.stringify({
          id: 'er-1',
          name: 'ER Teste',
          isDayOpen: true,
          entryChannel: 'QR_CODE',
          guestEntryEnabled,
        }),
        { status: 200 },
      )
    }
    if (url.includes('/api/auth/guest-entry')) {
      return new Response(JSON.stringify(guestBody ?? { access_token: 'guest-tok' }), {
        status: guestStatus,
      })
    }
    return new Response(null, { status: 201 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderPage(entry = '/fila/er-1') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/fila/:erId" element={<QueueEntryPage />} />
        <Route path="/fila/:erId/senha" element={<div>Tela da senha</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('QueueEntryPage guest flow', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('shows the guest form as the primary path when the ER enables it', async () => {
    stubFetch()
    renderPage()

    expect(await screen.findByLabelText('Nome')).toBeInTheDocument()
    expect(screen.getByLabelText('Sobrenome')).toBeInTheDocument()
    expect(screen.getByLabelText('CPF')).toBeInTheDocument()
    // Guest mode is CPF-only: no login path is offered up front (neither tabs nor a
    // "Já tenho cadastro" link) — a registered CPF reaches it via a 409.
    expect(screen.queryByRole('tab', { name: 'Já tenho cadastro' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Já tenho cadastro' })).not.toBeInTheDocument()
  })

  it('masks the CPF and keeps submit disabled until the form is valid', async () => {
    stubFetch()
    renderPage()
    const user = userEvent.setup()

    expect(await screen.findByRole('button', { name: 'Entrar na fila' })).toBeDisabled()

    await user.type(screen.getByLabelText('Nome'), 'Ana')
    await user.type(screen.getByLabelText('Sobrenome'), 'Silva')
    const cpf = screen.getByLabelText('CPF')
    await user.type(cpf, VALID_CPF)

    expect(cpf).toHaveValue('529.982.247-25')
    expect(screen.getByRole('button', { name: 'Entrar na fila' })).toBeEnabled()
  })

  it('flags an invalid CPF with an inline error and blocks submit', async () => {
    stubFetch()
    renderPage()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Nome'), 'Ana')
    await user.type(screen.getByLabelText('Sobrenome'), 'Silva')
    await user.type(screen.getByLabelText('CPF'), '12345678900')

    expect(screen.getByText('Confira o CPF — número inválido.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar na fila' })).toBeDisabled()
  })

  it('does not show an invalid CPF error while the number is incomplete', async () => {
    stubFetch()
    renderPage()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('CPF'), '1234567890')

    expect(screen.queryByText('Confira o CPF — número inválido.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar na fila' })).toBeDisabled()
  })

  it('rejects a repeated-digit CPF (fails the check digit)', async () => {
    stubFetch()
    renderPage()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Nome'), 'Ana')
    await user.type(screen.getByLabelText('Sobrenome'), 'Silva')
    await user.type(screen.getByLabelText('CPF'), '11111111111')

    expect(screen.getByText('Confira o CPF — número inválido.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar na fila' })).toBeDisabled()
  })

  it('enters the queue as a guest, sending raw CPF digits', async () => {
    const fetchMock = stubFetch()
    renderPage()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Nome'), 'Ana')
    await user.type(screen.getByLabelText('Sobrenome'), 'Silva')
    await user.type(screen.getByLabelText('CPF'), VALID_CPF)
    fireEvent.click(screen.getByRole('button', { name: 'Entrar na fila' }))

    expect(await screen.findByText('Tela da senha')).toBeInTheDocument()
    expect(sessionStorage.getItem('token')).toBe('guest-tok')

    const guestCall = fetchMock.mock.calls.find(([url]) =>
      url.toString().includes('/api/auth/guest-entry'),
    )
    const body = JSON.parse(String(guestCall?.[1]?.body))
    expect(body).toMatchObject({
      firstName: 'Ana',
      lastName: 'Silva',
      cpf: VALID_CPF,
      erId: 'er-1',
      entryChannel: 'QR_CODE',
    })
  })

  it('warns first on a registered CPF, then offers login only via an explicit CTA', async () => {
    stubFetch({ guestStatus: 409, guestBody: { message: CONFLICT_MESSAGE } })
    renderPage()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Nome'), 'Ana')
    await user.type(screen.getByLabelText('Sobrenome'), 'Silva')
    await user.type(screen.getByLabelText('CPF'), VALID_CPF)
    fireEvent.click(screen.getByRole('button', { name: 'Entrar na fila' }))

    // Warn first: the message shows and the guest form stays put — no auto-jump.
    expect(await screen.findByText(CONFLICT_MESSAGE)).toBeInTheDocument()
    expect(screen.getByLabelText('CPF')).toBeInTheDocument()
    expect(screen.queryByLabelText('CPF ou Código RE')).not.toBeInTheDocument()
    expect(sessionStorage.getItem('token')).toBeNull()

    // Then the path: the explicit CTA takes her to login.
    fireEvent.click(screen.getByRole('button', { name: 'Entrar com meu cadastro' }))
    expect(screen.getByRole('tab', { name: 'Já tenho cadastro' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByLabelText('CPF ou Código RE')).toBeInTheDocument()
  })

  it('offers the account path if guest entry is disabled while the page is open', async () => {
    stubFetch({ guestStatus: 403, guestBody: { message: 'Entrada de convidado(a) desativada' } })
    renderPage()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Nome'), 'Ana')
    await user.type(screen.getByLabelText('Sobrenome'), 'Silva')
    await user.type(screen.getByLabelText('CPF'), VALID_CPF)
    fireEvent.click(screen.getByRole('button', { name: 'Entrar na fila' }))

    expect(await screen.findByText('Entrada de convidado(a) desativada')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar com meu cadastro' })).toBeInTheDocument()
  })

  it('joins validation messages with spaces when the API returns an array', async () => {
    stubFetch({ guestStatus: 400, guestBody: { message: ['Nome inválido', 'Sobrenome inválido'] } })
    renderPage()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Nome'), 'Ana')
    await user.type(screen.getByLabelText('Sobrenome'), 'Silva')
    await user.type(screen.getByLabelText('CPF'), VALID_CPF)
    fireEvent.click(screen.getByRole('button', { name: 'Entrar na fila' }))

    expect(await screen.findByText('Nome inválido Sobrenome inválido')).toBeInTheDocument()
  })

  it('clears the registered-CPF warning when the guest edits the number', async () => {
    stubFetch({ guestStatus: 409, guestBody: { message: CONFLICT_MESSAGE } })
    renderPage()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('Nome'), 'Ana')
    await user.type(screen.getByLabelText('Sobrenome'), 'Silva')
    await user.type(screen.getByLabelText('CPF'), VALID_CPF)
    fireEvent.click(screen.getByRole('button', { name: 'Entrar na fila' }))
    expect(
      await screen.findByRole('button', { name: 'Entrar com meu cadastro' }),
    ).toBeInTheDocument()

    // Editing the CPF drops the stale conflict CTA and message.
    await user.clear(screen.getByLabelText('CPF'))
    await user.type(screen.getByLabelText('CPF'), '5')
    expect(
      screen.queryByRole('button', { name: 'Entrar com meu cadastro' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(CONFLICT_MESSAGE)).not.toBeInTheDocument()
  })

  it('keeps the account tabs as the only path when guest entry is disabled', async () => {
    stubFetch({ guestEntryEnabled: false })
    renderPage()

    await screen.findByText('ER Teste')
    expect(screen.getByRole('tab', { name: 'Já tenho cadastro' })).toBeInTheDocument()
    expect(screen.queryByLabelText('CPF')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Entrar como convidado(a)' })).not.toBeInTheDocument()
  })
})
