import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { AdminPage } from './AdminPage'

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

function authenticate() {
  sessionStorage.setItem('token', 'test-token')
  sessionStorage.setItem('staffRole', 'ADMIN')
  sessionStorage.setItem('staffUserId', 'admin-1')
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>,
  )
}

describe('AdminPage', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
  })

  it('shows the staff login form when not authenticated', () => {
    vi.mocked(api.get).mockResolvedValue([])
    renderPage()
    expect(screen.getByRole('heading', { name: 'Administração' })).toBeInTheDocument()
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument()
  })

  it('lists the ERs returned by the API', async () => {
    authenticate()
    vi.mocked(api.get).mockResolvedValue([
      {
        id: 'er-1',
        name: 'ER Centro',
        qrCodeUrl: null,
        isDayOpen: true,
        pauseTimeoutSeconds: 300,
        createdAt: '2026-01-01T12:00:00.000Z',
        _count: { counters: 3, operators: 5 },
      },
    ])

    renderPage()
    expect(await screen.findByText('ER Centro')).toBeInTheDocument()
    expect(screen.getByText('Dia aberto')).toBeInTheDocument()
  })

  it('creates a new ER and reloads the list', async () => {
    authenticate()
    vi.mocked(api.get).mockResolvedValue([])
    vi.mocked(api.post).mockResolvedValue({})

    renderPage()
    await screen.findByText('Nenhum ER cadastrado ainda.')

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nome do ER'), 'ER Novo')
    fireEvent.click(screen.getByRole('button', { name: 'Criar ER' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/ers', { name: 'ER Novo' }))
  })

  it('surfaces an error when loading ERs fails', async () => {
    authenticate()
    vi.mocked(api.get).mockRejectedValue(new Error('Falha ao carregar'))

    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao carregar')
  })
})

const erDetail = {
  id: 'er-1',
  name: 'ER Centro',
  qrCodeUrl: null,
  isDayOpen: true,
  pauseTimeoutSeconds: 300,
  createdAt: '2026-01-01T12:00:00.000Z',
  counters: [{ id: 'c1', number: 1, state: 'ACTIVE' }],
  operators: [
    { id: 'o1', name: 'Operadora 1', email: 'op1@x.com', role: 'OPERATOR', createdAt: '2026-01-01T12:00:00.000Z' },
  ],
}

const erSummary = {
  id: 'er-1',
  name: 'ER Centro',
  qrCodeUrl: null,
  isDayOpen: true,
  pauseTimeoutSeconds: 300,
  createdAt: '2026-01-01T12:00:00.000Z',
  _count: { counters: 1, operators: 1 },
}

describe('AdminPage — ER management', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
    vi.mocked(api.patch).mockReset()
    authenticate()
    vi.mocked(api.get).mockImplementation((path: string) =>
      Promise.resolve(path === '/admin/ers' ? [erSummary] : erDetail),
    )
  })

  async function openManagement() {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Gerenciar ER' }))
    await screen.findByText('Acessos do ER')
  }

  it('opens the management panel with access links, counters and team', async () => {
    await openManagement()
    expect(screen.getByText('QR Code presencial')).toBeInTheDocument()
    expect(screen.getByText('Painel de TV')).toBeInTheDocument()
    expect(screen.getByText('Caixa 1')).toBeInTheDocument()
    expect(screen.getByText('op1@x.com')).toBeInTheDocument()
  })

  it('adds a counter', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    await openManagement()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Número do caixa'), '4')
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar caixa' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/admin/ers/er-1/counters', { number: 4 }),
    )
  })

  it('creates a staff account', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    await openManagement()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nome'), 'Nova Pessoa')
    await user.type(screen.getByLabelText('E-mail'), 'nova@x.com')
    await user.type(screen.getByLabelText('Senha'), 'segredo123')
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/admin/ers/er-1/staff', {
        name: 'Nova Pessoa',
        email: 'nova@x.com',
        password: 'segredo123',
        role: 'OPERATOR',
      }),
    )
  })

  it('edits the ER name and pause timeout', async () => {
    vi.mocked(api.patch).mockResolvedValue({})
    await openManagement()
    const user = userEvent.setup()
    const editForm = screen.getByRole('button', { name: 'Salvar alteração' }).closest('form')!
    const nameField = within(editForm).getByLabelText('Nome do ER')
    await user.clear(nameField)
    await user.type(nameField, 'ER Renomeado')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alteração' }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/admin/ers/er-1', {
        name: 'ER Renomeado',
        pauseTimeoutSeconds: 300,
      }),
    )
  })
})
