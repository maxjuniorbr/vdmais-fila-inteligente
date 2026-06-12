import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seedStaffSession } from '../test/staffToken'
import { CheckinAttendantPage } from './CheckinAttendantPage'

function authenticate() {
  seedStaffSession({ id: 'att-1', name: 'Atendente', role: 'ATTENDANT', erId: 'er-1' })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CheckinAttendantPage />
    </MemoryRouter>,
  )
}

describe('CheckinAttendantPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the staff login form when not authenticated', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Check-in assistido' })).toBeInTheDocument()
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument()
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
              { id: 're-1', fullName: 'Ana Souza', cpf: '11122233344', phone: '11999990000', reCode: 'RE0001' },
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
    fireEvent.click(createButton)

    expect(await screen.findByText('Check-in realizado')).toBeInTheDocument()
    expect(screen.getByText('A001')).toBeInTheDocument()
    expect(screen.getByText('Ana Souza')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Novo check-in' }))
    expect(screen.getByLabelText('CPF, telefone ou código RE')).toHaveValue('')
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

  it('returns to the login form when an authenticated request gets a 401', async () => {
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

    expect(await screen.findByLabelText('E-mail')).toBeInTheDocument()
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
})
