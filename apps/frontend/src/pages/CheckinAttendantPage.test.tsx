import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seedStaffSession } from '../test/staffToken'
import { CheckinAttendantPage } from './CheckinAttendantPage'

function authenticate() {
  seedStaffSession({ id: 'att-1', name: 'Atendente', role: 'ATTENDANT', erId: 'er-1' })
}

// The page itself no longer renders a login form: logout, an expired session, or
// a direct visit without a session redirect to the central login at '/'. The
// stub route lets the test observe that redirect.
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/checkin']}>
      <Routes>
        <Route path="/" element={<div>central-login</div>} />
        <Route path="/checkin" element={<CheckinAttendantPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CheckinAttendantPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('redirects to the central login when not authenticated', () => {
    renderPage()
    expect(screen.getByText('central-login')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Check-in assistido' })).not.toBeInTheDocument()
  })

  it('searches representatives and reports an empty result', async () => {
    authenticate()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString()
        if (url.includes('/representatives/search')) {
          return new Response(JSON.stringify([]), { status: 200 })
        }
        return new Response(null, { status: 200 })
      }),
    )

    renderPage()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('CPF, telefone ou código RE'), 'ana')
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(await screen.findByText('Nenhuma RE encontrada.')).toBeInTheDocument()
  })

  it('creates a ticket from a found representative and shows the confirmation screen', async () => {
    authenticate()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString()
        if (url.includes('/representatives/search')) {
          return new Response(
            JSON.stringify([
              { id: 're-1', fullName: 'Ana Souza', cpf: '***.***.344-**', phone: '(**) *****-0000', reCode: 'RE0001' },
            ]),
            { status: 200 },
          )
        }
        if (url.includes('/tickets')) {
          return new Response(
            JSON.stringify({ id: 't-1', code: 'A001', queuePosition: 1, currentPosition: 1 }),
            { status: 201 },
          )
        }
        return new Response(null, { status: 200 })
      }),
    )

    renderPage()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('CPF, telefone ou código RE'), 'ana')
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))

    const createButton = await screen.findByRole('button', { name: 'Criar senha' })

    // The backend already masks CPF/phone in /representatives/search; the results
    // list must show that masked value verbatim and never the full digits.
    expect(screen.getByText(/\*\*\*\.\*\*\*\.344-\*\*/)).toBeInTheDocument()
    // Nenhum identificador com dígitos completos (11 dígitos seguidos) aparece no DOM —
    // guarda genérica que subsume valores crus específicos.
    expect(screen.queryByText(/\b\d{11}\b/)).not.toBeInTheDocument()

    fireEvent.click(createButton)

    expect(await screen.findByText('Check-in realizado')).toBeInTheDocument()
    expect(screen.getByText('A001')).toBeInTheDocument()
    expect(screen.getByText('Ana Souza')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Novo check-in' }))
    expect(screen.getByLabelText('CPF, telefone ou código RE')).toHaveValue('')
  })

  it('sends the preferential flag when the switch is on', async () => {
    authenticate()
    let ticketBody: string | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString()
        if (url.includes('/representatives/search')) {
          return new Response(
            JSON.stringify([
              { id: 're-1', fullName: 'Ana Souza', cpf: '***.***.344-**', phone: '(**) *****-0000', reCode: 'RE0001' },
            ]),
            { status: 200 },
          )
        }
        if (url.includes('/tickets')) {
          ticketBody = init?.body ? init.body.toString() : null
          return new Response(
            JSON.stringify({ id: 't-1', code: 'A001', queuePosition: 1, currentPosition: 1 }),
            { status: 201 },
          )
        }
        return new Response(null, { status: 200 })
      }),
    )

    renderPage()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('CPF, telefone ou código RE'), 'ana')
    fireEvent.click(screen.getByLabelText('Atendimento preferencial'))
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Criar senha' }))

    expect(await screen.findByText('Check-in realizado')).toBeInTheDocument()
    expect(ticketBody).toContain('"isPriority":true')
    expect(screen.getByText('Atendimento preferencial')).toBeInTheDocument()
  })

  it('keeps the registration form open with its data when the ticket creation fails after registering', async () => {
    authenticate()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString()
        if (url.endsWith('/api/representatives') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              id: 're-9',
              fullName: 'Bruna Lima',
              cpf: '99988877766',
              phone: '11988887777',
              reCode: 'RE0099',
            }),
            { status: 201 },
          )
        }
        if (url.includes('/api/tickets')) {
          return new Response(JSON.stringify({ message: 'Senha já existe' }), { status: 409 })
        }
        return new Response(null, { status: 200 })
      }),
    )

    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar nova RE' }))

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nome completo'), 'Bruna Lima')
    await user.type(screen.getByLabelText('CPF'), '99988877766')
    await user.type(screen.getByLabelText('Telefone'), '11988887777')
    fireEvent.change(screen.getByLabelText('Data de nascimento'), {
      target: { value: '1992-05-05' },
    })
    await user.type(screen.getByLabelText('Código RE'), 'RE0099')
    await user.type(screen.getByLabelText('Senha inicial'), 'Teste@123')
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar e criar senha' }))

    // The ticket failed, so the RE is registered but has no senha: the form must
    // stay open with the typed data instead of silently clearing as if it worked.
    expect(await screen.findByText('Senha já existe')).toBeInTheDocument()
    expect(screen.queryByText('Check-in realizado')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nome completo')).toHaveValue('Bruna Lima')
    expect(screen.getByLabelText('Código RE')).toHaveValue('RE0099')
  })

  it('surfaces an error when the search request fails', async () => {
    authenticate()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString()
        if (url.includes('/representatives/search')) {
          return new Response(JSON.stringify({ message: 'Falha no servidor' }), { status: 500 })
        }
        return new Response(null, { status: 200 })
      }),
    )

    renderPage()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('CPF, telefone ou código RE'), 'ana')
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(await screen.findByText('Falha no servidor')).toBeInTheDocument()
  })

  it('redirects to the central login when an authenticated request gets a 401', async () => {
    authenticate()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString()
        if (url.includes('/representatives/search')) {
          return new Response(JSON.stringify({ message: 'Sessão expirada' }), { status: 401 })
        }
        return new Response(null, { status: 201 })
      }),
    )

    renderPage()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('CPF, telefone ou código RE'), 'ana')
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(await screen.findByText('central-login')).toBeInTheDocument()
    expect(sessionStorage.getItem('token')).toBeNull()
  })

  it('registers a new representative and creates the ticket', async () => {
    authenticate()
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/api/representatives') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 're-9',
            fullName: 'Bruna Lima',
            cpf: '99988877766',
            phone: '11988887777',
            reCode: 'RE0099',
          }),
          { status: 201 },
        )
      }
      if (url.includes('/api/tickets')) {
        return new Response(
          JSON.stringify({ id: 't-9', code: 'B009', queuePosition: 1, currentPosition: 2 }),
          { status: 201 },
        )
      }
      return new Response(null, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar nova RE' }))

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nome completo'), 'Bruna Lima')
    await user.type(screen.getByLabelText('CPF'), '99988877766')
    await user.type(screen.getByLabelText('Telefone'), '11988887777')
    fireEvent.change(screen.getByLabelText('Data de nascimento'), {
      target: { value: '1992-05-05' },
    })
    await user.type(screen.getByLabelText('Código RE'), 'RE0099')
    await user.type(screen.getByLabelText('Senha inicial'), 'Teste@123')
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar e criar senha' }))

    expect(await screen.findByText('Check-in realizado')).toBeInTheDocument()
    expect(screen.getByText('B009')).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(([url]) => url.toString().endsWith('/api/representatives')),
    ).toBe(true)
  })

  it('surfaces an error when creating the ticket fails', async () => {
    authenticate()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString()
        if (url.includes('/representatives/search')) {
          return new Response(
            JSON.stringify([
              { id: 're-1', fullName: 'Ana Souza', cpf: '***.***.344-**', phone: '(**) *****-0000', reCode: 'RE0001' },
            ]),
            { status: 200 },
          )
        }
        if (url.includes('/tickets')) {
          return new Response(JSON.stringify({ message: 'Senha já existe' }), { status: 409 })
        }
        return new Response(null, { status: 200 })
      }),
    )

    renderPage()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('CPF, telefone ou código RE'), 'ana')
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Criar senha' }))

    expect(await screen.findByText('Senha já existe')).toBeInTheDocument()
    expect(screen.queryByText('Check-in realizado')).not.toBeInTheDocument()
  })

  it('surfaces an error when registering a new representative fails', async () => {
    authenticate()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString()
        if (url.endsWith('/api/representatives') && init?.method === 'POST') {
          return new Response(JSON.stringify({ message: 'CPF inválido' }), { status: 400 })
        }
        return new Response(null, { status: 200 })
      }),
    )

    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar nova RE' }))
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nome completo'), 'Bruna Lima')
    await user.type(screen.getByLabelText('CPF'), '00000000000')
    await user.type(screen.getByLabelText('Telefone'), '11988887777')
    fireEvent.change(screen.getByLabelText('Data de nascimento'), {
      target: { value: '1992-05-05' },
    })
    await user.type(screen.getByLabelText('Código RE'), 'RE0099')
    await user.type(screen.getByLabelText('Senha inicial'), 'Teste@123')
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar e criar senha' }))

    expect(await screen.findByText('CPF inválido')).toBeInTheDocument()
    expect(screen.queryByText('Check-in realizado')).not.toBeInTheDocument()
  })

  it('falls back to an empty ER when the session has no erId', async () => {
    seedStaffSession({ id: 'att-2', name: 'Atendente', role: 'ATTENDANT' })

    renderPage()

    expect(await screen.findByText('ER:')).toBeInTheDocument()
  })

  it('shows a generic message when the search rejects with a non-error value', async () => {
    authenticate()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString()
        if (url.includes('/representatives/search')) throw 'boom'
        return new Response(null, { status: 200 })
      }),
    )

    renderPage()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('CPF, telefone ou código RE'), 'ana')
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(await screen.findByText('Erro na busca')).toBeInTheDocument()
  })

  it('shows a generic message when the ticket request rejects with a non-error value', async () => {
    authenticate()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString()
        if (url.includes('/representatives/search')) {
          return new Response(
            JSON.stringify([
              { id: 're-1', fullName: 'Ana Souza', cpf: '***.***.344-**', phone: '(**) *****-0000', reCode: 'RE0001' },
            ]),
            { status: 200 },
          )
        }
        if (url.includes('/tickets')) throw 'boom'
        return new Response(null, { status: 200 })
      }),
    )

    renderPage()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('CPF, telefone ou código RE'), 'ana')
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Criar senha' }))

    expect(await screen.findByText('Erro no check-in')).toBeInTheDocument()
  })

  it('shows a generic message when registration rejects with a non-error value', async () => {
    authenticate()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString()
        if (url.endsWith('/api/representatives') && init?.method === 'POST') {
          throw 'boom'
        }
        return new Response(null, { status: 200 })
      }),
    )

    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar nova RE' }))
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nome completo'), 'Bruna Lima')
    await user.type(screen.getByLabelText('CPF'), '99988877766')
    await user.type(screen.getByLabelText('Telefone'), '11988887777')
    fireEvent.change(screen.getByLabelText('Data de nascimento'), {
      target: { value: '1992-05-05' },
    })
    await user.type(screen.getByLabelText('Código RE'), 'RE0099')
    await user.type(screen.getByLabelText('Senha inicial'), 'Teste@123')
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar e criar senha' }))

    expect(await screen.findByText('Erro no cadastro')).toBeInTheDocument()
  })

  it('logs out from the search screen', async () => {
    authenticate()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })))

    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /sair/i }))

    expect(await screen.findByText('central-login')).toBeInTheDocument()
  })

  it('logs out from the confirmation screen', async () => {
    authenticate()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString()
        if (url.includes('/representatives/search')) {
          return new Response(
            JSON.stringify([
              { id: 're-1', fullName: 'Ana Souza', cpf: '***.***.344-**', phone: '(**) *****-0000', reCode: 'RE0001' },
            ]),
            { status: 200 },
          )
        }
        if (url.includes('/tickets')) {
          return new Response(
            JSON.stringify({ id: 't-1', code: 'A001', queuePosition: 1, currentPosition: 1 }),
            { status: 201 },
          )
        }
        return new Response(null, { status: 200 })
      }),
    )

    renderPage()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('CPF, telefone ou código RE'), 'ana')
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Criar senha' }))
    await screen.findByText('Check-in realizado')

    fireEvent.click(screen.getByRole('button', { name: /sair/i }))
    expect(await screen.findByText('central-login')).toBeInTheDocument()
  })
})
