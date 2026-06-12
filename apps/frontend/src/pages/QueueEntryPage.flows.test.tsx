import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueueEntryPage } from './QueueEntryPage'

interface ErOptions {
  isDayOpen?: boolean
  erOk?: boolean
  authStatus?: number
  authBody?: Record<string, unknown>
}

function stubFetch({ isDayOpen = true, erOk = true, authStatus = 200, authBody }: ErOptions = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString()
    if (url.includes('/api/public/ers/er-1')) {
      if (!erOk) return new Response(JSON.stringify({}), { status: 404 })
      return new Response(
        JSON.stringify({
          id: 'er-1',
          name: 'ER Teste',
          isDayOpen,
          entryChannel: url.includes('source=link') ? 'LINK' : 'QR_CODE',
        }),
        { status: 200 },
      )
    }
    if (url.includes('/api/auth/login') || url.includes('/api/auth/register')) {
      return new Response(JSON.stringify(authBody ?? { access_token: 'tok-123' }), {
        status: authStatus,
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

describe('QueueEntryPage flows', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('logs in and navigates to the ticket screen', async () => {
    const fetchMock = stubFetch()
    renderPage()
    await screen.findByText('ER Teste')

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('CPF ou Código RE'), 'RE0001')
    await user.type(screen.getByLabelText('Senha'), 'Teste@123')
    fireEvent.click(screen.getByRole('button', { name: 'Entrar na fila' }))

    expect(await screen.findByText('Tela da senha')).toBeInTheDocument()
    expect(sessionStorage.getItem('token')).toBe('tok-123')
    expect(
      fetchMock.mock.calls.some(([url]) => url.toString().includes('/api/auth/login')),
    ).toBe(true)
  })

  it('shows an inline error when the credentials are rejected', async () => {
    stubFetch({ authStatus: 401, authBody: { message: 'Credenciais inválidas' } })
    renderPage()
    await screen.findByText('ER Teste')

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('CPF ou Código RE'), 'RE0001')
    await user.type(screen.getByLabelText('Senha'), 'errada')
    fireEvent.click(screen.getByRole('button', { name: 'Entrar na fila' }))

    expect(await screen.findByText('Credenciais inválidas')).toBeInTheDocument()
    expect(sessionStorage.getItem('token')).toBeNull()
  })

  it('registers a new representative and navigates to the ticket screen', async () => {
    const fetchMock = stubFetch()
    renderPage()
    await screen.findByText('ER Teste')

    fireEvent.click(screen.getByRole('tab', { name: 'Criar cadastro' }))
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nome completo'), 'Maria Silva')
    await user.type(screen.getByLabelText('CPF (somente números)'), '12345678901')
    await user.type(screen.getByLabelText('Telefone celular (somente números)'), '11999999999')
    fireEvent.change(screen.getByLabelText('Data de nascimento'), {
      target: { value: '1990-01-01' },
    })
    await user.type(screen.getByLabelText('Código de RE'), 'RE0001')
    await user.type(screen.getByLabelText('Senha (mín. 8 caracteres)'), 'Teste@123')
    fireEvent.click(screen.getByRole('button', { name: 'Criar cadastro e entrar' }))

    expect(await screen.findByText('Tela da senha')).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(([url]) => url.toString().includes('/api/auth/register')),
    ).toBe(true)
  })

  it('disables the submit and signals a closed operation', async () => {
    stubFetch({ isDayOpen: false })
    renderPage()
    await screen.findByText('ER Teste')

    expect(screen.getByText('Atendimento encerrado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar na fila' })).toBeDisabled()
  })

  it('shows an error when the ER cannot be validated', async () => {
    stubFetch({ erOk: false })
    renderPage()
    expect(await screen.findByText('Unidade não encontrada. Verifique o QR Code ou o link utilizados.')).toBeInTheDocument()
  })

  it('requires confirming the ER when arriving through a link', async () => {
    stubFetch()
    renderPage('/fila/er-1?source=link')
    await screen.findByText('ER Teste')

    const submit = screen.getByRole('button', { name: 'Entrar na fila' })
    expect(submit).toBeDisabled()

    fireEvent.click(screen.getByRole('checkbox'))
    expect(submit).toBeEnabled()
  })

  it('shows an error when the route has no unit id', async () => {
    stubFetch()
    render(
      <MemoryRouter initialEntries={['/fila']}>
        <Routes>
          <Route path="/fila" element={<QueueEntryPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(
      await screen.findByText('Unidade não encontrada. Verifique o QR Code ou o link utilizados.'),
    ).toBeInTheDocument()
  })

  it('surfaces the error message when the unit request rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Network down')
      }),
    )
    renderPage()
    expect(await screen.findByText('Network down')).toBeInTheDocument()
  })

  it('falls back to a generic message when the rejection has no message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject('boom')),
    )
    renderPage()
    expect(
      await screen.findByText('Não foi possível carregar os dados da unidade. Tente novamente.'),
    ).toBeInTheDocument()
  })

  it('defaults the entry channel to QR_CODE when the API omits it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : input.toString()
        if (url.includes('/api/public/ers/er-1')) {
          return new Response(
            JSON.stringify({ id: 'er-1', name: 'ER Teste', isDayOpen: true }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ access_token: 'tok-123' }), { status: 200 })
      }),
    )
    renderPage()
    await screen.findByText('ER Teste')
    // QR_CODE channel means there is no confirmation checkbox and submit is enabled.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar na fila' })).toBeEnabled()
  })

  it('shows an inline error when registration is rejected', async () => {
    stubFetch({ authStatus: 400, authBody: { message: 'CPF já cadastrado' } })
    renderPage()
    await screen.findByText('ER Teste')

    fireEvent.click(screen.getByRole('tab', { name: 'Criar cadastro' }))
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nome completo'), 'Maria Silva')
    await user.type(screen.getByLabelText('CPF (somente números)'), '12345678901')
    await user.type(screen.getByLabelText('Telefone celular (somente números)'), '11999999999')
    fireEvent.change(screen.getByLabelText('Data de nascimento'), {
      target: { value: '1990-01-01' },
    })
    await user.type(screen.getByLabelText('Código de RE'), 'RE0001')
    await user.type(screen.getByLabelText('Senha (mín. 8 caracteres)'), 'Teste@123')
    fireEvent.click(screen.getByRole('button', { name: 'Criar cadastro e entrar' }))

    expect(await screen.findByText('CPF já cadastrado')).toBeInTheDocument()
    expect(sessionStorage.getItem('token')).toBeNull()
  })

  it('blocks registration when the operation is closed', async () => {
    stubFetch({ isDayOpen: false })
    renderPage()
    await screen.findByText('ER Teste')

    fireEvent.click(screen.getByRole('tab', { name: 'Criar cadastro' }))
    const form = screen.getByLabelText('Nome completo').closest('form') as HTMLFormElement
    fireEvent.submit(form)

    expect(await screen.findByText('O atendimento está encerrado no momento.')).toBeInTheDocument()
    expect(sessionStorage.getItem('token')).toBeNull()
  })

  it('uses the default login error message when the response omits one', async () => {
    stubFetch({ authStatus: 401, authBody: {} })
    renderPage()
    await screen.findByText('ER Teste')

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('CPF ou Código RE'), 'RE0001')
    await user.type(screen.getByLabelText('Senha'), 'errada')
    fireEvent.click(screen.getByRole('button', { name: 'Entrar na fila' }))

    expect(await screen.findByText('Credenciais inválidas')).toBeInTheDocument()
  })

  it('blocks submission and warns when the operation is closed', async () => {
    stubFetch({ isDayOpen: false })
    renderPage()
    await screen.findByText('ER Teste')

    // Submit the form directly (bypassing the disabled button) to hit the guard.
    const form = screen.getByLabelText('CPF ou Código RE').closest('form') as HTMLFormElement
    fireEvent.submit(form)

    expect(await screen.findByText('O atendimento está encerrado no momento.')).toBeInTheDocument()
  })

  it('blocks submission until the link entry is confirmed', async () => {
    stubFetch()
    renderPage('/fila/er-1?source=link')
    await screen.findByText('ER Teste')

    const form = screen.getByLabelText('CPF ou Código RE').closest('form') as HTMLFormElement
    fireEvent.submit(form)

    expect(await screen.findByText('Confirme sua entrada antes de continuar.')).toBeInTheDocument()
  })

  it('forwards a signed link token without exposing it in the query string', async () => {
    const fetchMock = stubFetch()
    renderPage('/fila/er-1?source=link#entry=signed-entry-token')
    await screen.findByText('ER Teste')

    const publicCall = fetchMock.mock.calls.find(([input]) =>
      input.toString().includes('/api/public/ers/er-1'),
    )
    expect(publicCall?.[0].toString()).not.toContain('signed-entry-token')
    expect(new Headers(publicCall?.[1]?.headers).get('x-entry-token')).toBe('signed-entry-token')

    const user = userEvent.setup()
    fireEvent.click(screen.getByRole('checkbox'))
    await user.type(screen.getByLabelText('CPF ou Código RE'), 'RE0001')
    await user.type(screen.getByLabelText('Senha'), 'Teste@123')
    fireEvent.click(screen.getByRole('button', { name: 'Entrar na fila' }))

    expect(await screen.findByText('Tela da senha')).toBeInTheDocument()
    const authCall = fetchMock.mock.calls.find(([input]) =>
      input.toString().includes('/api/auth/login'),
    )
    expect(JSON.parse(String(authCall?.[1]?.body))).toMatchObject({
      erId: 'er-1',
      entryToken: 'signed-entry-token',
      entryChannel: 'LINK',
    })
    expect(sessionStorage.getItem('queue-entry-token:er-1')).toBe('signed-entry-token')
    expect(sessionStorage.getItem('queue-entry:er-1')).toBe('LINK')
  })
})
