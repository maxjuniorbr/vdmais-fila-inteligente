import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { notifySessionExpired } from '../auth/session'
import { seedStaffSession } from '../test/staffToken'
import { AdminPage } from './AdminPage'

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

const { navigateSpy } = vi.hoisted(() => ({ navigateSpy: vi.fn() }))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateSpy }
})

function authenticate() {
  seedStaffSession({ id: 'admin-1', name: 'Admin', role: 'ADMIN' })
}

// The page no longer renders a login form: logout, an expired session, or a
// direct visit without a session redirect to the central login at '/'. The stub
// route lets the test observe that redirect.
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/" element={<div>central-login</div>} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AdminPage', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
  })

  it('redirects to the central login when not authenticated', () => {
    vi.mocked(api.get).mockResolvedValue([])
    renderPage()
    expect(screen.getByText('central-login')).toBeInTheDocument()
    expect(screen.queryByText('Cadastrar ER')).not.toBeInTheDocument()
  })

  it('drops back to the central login when the session expires mid-use', async () => {
    authenticate()
    vi.mocked(api.get).mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('Cadastrar ER')).toBeInTheDocument()

    // 401 do servidor → notifySessionExpired limpa a sessão e derruba a tela.
    act(() => notifySessionExpired())

    expect(await screen.findByText('central-login')).toBeInTheDocument()
    expect(screen.queryByText('Cadastrar ER')).not.toBeInTheDocument()
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
        callTimeoutSeconds: 600,
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

  it('falls back to a generic message when loading ERs rejects with a non-error', async () => {
    authenticate()
    vi.mocked(api.get).mockRejectedValue('boom')

    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro ao carregar ERs')
  })
})

const erDetail = {
  id: 'er-1',
  name: 'ER Centro',
  qrCodeUrl: null,
  isDayOpen: true,
  pauseTimeoutSeconds: 300,
  callTimeoutSeconds: 600,
  guestEntryEnabled: false,
  createdAt: '2026-01-01T12:00:00.000Z',
  counters: [{ id: 'c1', number: 1, state: 'UNAVAILABLE', _count: { tickets: 0 } }],
  operators: [
    {
      id: 'o1',
      name: 'Operadora 1',
      email: 'op1@x.com',
      role: 'OPERATOR',
      createdAt: '2026-01-01T12:00:00.000Z',
    },
  ],
  hasPanelToken: false,
  entryAccess: {
    qrCode: {
      token: 'qr-entry-token',
      expiresAt: '2026-07-12T12:00:00.000Z',
    },
    link: {
      token: 'link-entry-token',
      expiresAt: '2026-06-13T12:00:00.000Z',
    },
  },
}

const erSummary = {
  id: 'er-1',
  name: 'ER Centro',
  qrCodeUrl: null,
  isDayOpen: true,
  pauseTimeoutSeconds: 300,
  callTimeoutSeconds: 600,
  guestEntryEnabled: false,
  createdAt: '2026-01-01T12:00:00.000Z',
  _count: { counters: 1, operators: 1 },
}

describe('AdminPage — ER management', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
    vi.mocked(api.patch).mockReset()
    vi.mocked(api.delete).mockReset()
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
    expect(screen.getByRole('link', { name: 'Testar entrada (abre em nova aba)' })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/fila\/er-1#entry=qr-entry-token$/),
    )
    expect(screen.getByRole('link', { name: 'Testar link (abre em nova aba)' })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/fila\/er-1\?source=link#entry=link-entry-token$/),
    )
    expect(screen.getByText('Painel de TV')).toBeInTheDocument()
    expect(screen.getByText('Caixa 1')).toBeInTheDocument()
    expect(screen.getByText('op1@x.com')).toBeInTheDocument()
  })

  it('adds the next available counter number with one button', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    await openManagement()
    // Counter 1 is taken, so the next free number is 2.
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar caixa 2' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/admin/ers/er-1/counters', { number: 2 }),
    )
  })

  it('fills the lowest free number when there is a gap', async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      Promise.resolve(
        path === '/admin/ers'
          ? [erSummary]
          : {
              ...erDetail,
              counters: [
                { id: 'c1', number: 1, state: 'UNAVAILABLE', _count: { tickets: 0 } },
                { id: 'c3', number: 3, state: 'UNAVAILABLE', _count: { tickets: 0 } },
              ],
            },
      ),
    )
    await openManagement()
    expect(screen.getByRole('button', { name: 'Adicionar caixa 2' })).toBeInTheDocument()
  })

  it('removes a closed counter without service history via the menu', async () => {
    vi.mocked(api.delete).mockResolvedValue(undefined)
    await openManagement()
    fireEvent.click(screen.getByRole('button', { name: 'Ações do caixa 1' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remover caixa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/admin/ers/er-1/counters/c1'))
  })

  it('disables removing a counter with service history', async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      Promise.resolve(
        path === '/admin/ers'
          ? [erSummary]
          : {
              ...erDetail,
              counters: [{ id: 'c1', number: 1, state: 'UNAVAILABLE', _count: { tickets: 5 } }],
            },
      ),
    )
    await openManagement()
    fireEvent.click(screen.getByRole('button', { name: 'Ações do caixa 1' }))
    expect(screen.getByRole('menuitem', { name: 'Remover caixa' })).toBeDisabled()
  })

  it('disables removing an open counter', async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      Promise.resolve(
        path === '/admin/ers'
          ? [erSummary]
          : {
              ...erDetail,
              counters: [{ id: 'c1', number: 1, state: 'ACTIVE', _count: { tickets: 0 } }],
            },
      ),
    )
    await openManagement()
    fireEvent.click(screen.getByRole('button', { name: 'Ações do caixa 1' }))
    expect(screen.getByRole('menuitem', { name: 'Remover caixa' })).toBeDisabled()
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
        callTimeoutSeconds: 600,
        guestEntryEnabled: false,
      }),
    )
  })

  it('toggles guest entry and saves it with the ER settings', async () => {
    vi.mocked(api.patch).mockResolvedValue({})
    await openManagement()

    const toggle = screen.getByRole('switch', {
      name: 'Entrada de convidada (nome + CPF, sem cadastro)',
    })
    expect(toggle).not.toBeChecked()
    // Save stays disabled until something actually changes.
    expect(screen.getByRole('button', { name: 'Salvar alteração' })).toBeDisabled()

    fireEvent.click(toggle)
    expect(toggle).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alteração' }))

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/admin/ers/er-1', {
        name: 'ER Centro',
        pauseTimeoutSeconds: 300,
        callTimeoutSeconds: 600,
        guestEntryEnabled: true,
      }),
    )
  })

  it('generates a panel access token and shows the URL only once', async () => {
    vi.mocked(api.post).mockResolvedValue({ token: 'tv-secret' })
    await openManagement()
    fireEvent.click(screen.getByRole('button', { name: 'Gerar token de acesso' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/ers/er-1/panel-token'))
    expect(await screen.findByText(/\?token=tv-secret/)).toBeInTheDocument()
  })

  it('hides the panel token URL after the ER detail reloads, never reshowing the secret', async () => {
    vi.mocked(api.post).mockResolvedValue({ token: 'tv-secret' })
    await openManagement()

    // Gerar o token: a URL com o segredo aparece neste render.
    fireEvent.click(screen.getByRole('button', { name: 'Gerar token de acesso' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/ers/er-1/panel-token'))
    expect(await screen.findByText(/\?token=tv-secret/)).toBeInTheDocument()

    // O servidor agora reporta o ER com acesso configurado; em qualquer recarga
    // do detalhe do ER o backend NÃO devolve o segredo — só a flag.
    vi.mocked(api.get).mockImplementation((path: string) =>
      Promise.resolve(path === '/admin/ers' ? [erSummary] : { ...erDetail, hasPanelToken: true }),
    )

    // Recarregar o ER: fechar e reabrir o gerenciamento força um novo fetch do
    // detalhe e remonta o PanelAccessManager (o gatilho que a tela usa após
    // gerar/rotacionar — o estado local com a URL não sobrevive ao reload).
    fireEvent.click(screen.getByRole('button', { name: 'Fechar gerenciamento' }))
    await waitFor(() => expect(screen.queryByText('Acessos do ER')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Gerenciar ER' }))
    await screen.findByText('Acessos do ER')

    // O segredo desapareceu do DOM e o status volta a indicar acesso configurado
    // sem reexibir a URL com o token.
    expect(screen.queryByText(/tv-secret/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\?token=tv-secret/)).not.toBeInTheDocument()
    expect(screen.getByText('Acesso configurado')).toBeInTheDocument()
  })

  it('revokes the panel access token', async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      Promise.resolve(path === '/admin/ers' ? [erSummary] : { ...erDetail, hasPanelToken: true }),
    )
    vi.mocked(api.delete).mockResolvedValue(undefined)
    await openManagement()
    fireEvent.click(screen.getByRole('button', { name: 'Revogar acesso' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/admin/ers/er-1/panel-token'))
  })

  it('surfaces an error when generating the panel token fails', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('Falha ao gerar token'))
    await openManagement()
    fireEvent.click(screen.getByRole('button', { name: 'Gerar token de acesso' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao gerar token')
  })

  it('toggles the management panel closed from the card button', async () => {
    await openManagement()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar gerenciamento' }))
    await waitFor(() => expect(screen.queryByText('Acessos do ER')).not.toBeInTheDocument())
  })

  it('closes the management panel from the Fechar button', async () => {
    await openManagement()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByText('Acessos do ER')).not.toBeInTheDocument())
  })

  it('shows empty notes when the ER has no counters or operators', async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      Promise.resolve(
        path === '/admin/ers'
          ? [{ ...erSummary, _count: { counters: 0, operators: 0 } }]
          : { ...erDetail, counters: [], operators: [] },
      ),
    )
    await openManagement()
    expect(screen.getByText('Nenhum caixa cadastrado.')).toBeInTheDocument()
    expect(screen.getByText('Nenhuma conta cadastrada.')).toBeInTheDocument()
  })

  it('renders the closed-day state and entry URLs without a signed token', async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      Promise.resolve(
        path === '/admin/ers'
          ? [{ ...erSummary, isDayOpen: false }]
          : {
              ...erDetail,
              isDayOpen: false,
              counters: [
                { id: 'c1', number: 1, state: 'ACTIVE' },
                { id: 'c2', number: 2, state: 'ACTIVE' },
              ],
              entryAccess: undefined,
            },
      ),
    )
    await openManagement()
    expect(screen.getByText('Dia fechado')).toBeInTheDocument()
    expect(screen.getByText('Operação fechada')).toBeInTheDocument()
    expect(screen.getByText('caixas disponíveis')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Testar entrada (abre em nova aba)' })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/fila\/er-1$/),
    )
    expect(screen.getByRole('link', { name: 'Testar link (abre em nova aba)' })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/fila\/er-1\?source=link$/),
    )
  })

  it('surfaces an error when loading the ER detail fails', async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === '/admin/ers'
        ? Promise.resolve([erSummary])
        : Promise.reject(new Error('Falha ao carregar ER')),
    )
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Gerenciar ER' }))
    expect(await screen.findByText('Falha ao carregar ER')).toBeInTheDocument()
  })

  it('rejects an invalid pause timeout before calling the API', async () => {
    vi.mocked(api.patch).mockResolvedValue({})
    await openManagement()
    const user = userEvent.setup()
    const editForm = screen.getByRole('button', { name: 'Salvar alteração' }).closest('form')!
    const pauseField = within(editForm).getByLabelText('Tempo limite de pausa (min)')
    await user.clear(pauseField)
    await user.type(pauseField, '5000')
    fireEvent.submit(editForm)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Informe um tempo de pausa entre 0 e 1440 minutos',
    )
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('rejects an invalid call timeout before calling the API', async () => {
    vi.mocked(api.patch).mockResolvedValue({})
    await openManagement()
    const user = userEvent.setup()
    const editForm = screen.getByRole('button', { name: 'Salvar alteração' }).closest('form')!
    const callField = within(editForm).getByLabelText('Tempo limite de chamada (min)')
    await user.clear(callField)
    await user.type(callField, '5000')
    fireEvent.submit(editForm)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Informe um tempo de chamada entre 0 e 1440 minutos',
    )
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('surfaces an error when saving the ER fails', async () => {
    vi.mocked(api.patch).mockRejectedValue(new Error('Falha ao salvar'))
    await openManagement()
    const user = userEvent.setup()
    const editForm = screen.getByRole('button', { name: 'Salvar alteração' }).closest('form')!
    const nameField = within(editForm).getByLabelText('Nome do ER')
    await user.clear(nameField)
    await user.type(nameField, 'ER Editado')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alteração' }))
    expect(await screen.findByText('Falha ao salvar')).toBeInTheDocument()
  })

  it('surfaces an error when creating a counter fails', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('Falha ao criar caixa'))
    await openManagement()
    fireEvent.click(screen.getByRole('button', { name: /Adicionar caixa/ }))
    expect(await screen.findByText('Falha ao criar caixa')).toBeInTheDocument()
  })

  it('creates a staff account with a chosen role', async () => {
    vi.mocked(api.post).mockResolvedValue({})
    await openManagement()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nome'), 'Gestora X')
    await user.type(screen.getByLabelText('E-mail'), 'gestora@x.com')
    await user.type(screen.getByLabelText('Senha'), 'segredo123')
    await user.selectOptions(screen.getByLabelText('Perfil'), 'MANAGER')
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/admin/ers/er-1/staff', {
        name: 'Gestora X',
        email: 'gestora@x.com',
        password: 'segredo123',
        role: 'MANAGER',
      }),
    )
  })

  it('surfaces an error when creating a staff account fails', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('Falha ao criar conta'))
    await openManagement()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nome'), 'Pessoa')
    await user.type(screen.getByLabelText('E-mail'), 'pessoa@x.com')
    await user.type(screen.getByLabelText('Senha'), 'segredo123')
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(await screen.findByText('Falha ao criar conta')).toBeInTheDocument()
  })

  it('surfaces an error when revoking the panel token fails', async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      Promise.resolve(path === '/admin/ers' ? [erSummary] : { ...erDetail, hasPanelToken: true }),
    )
    vi.mocked(api.delete).mockRejectedValue(new Error('Falha ao revogar'))
    await openManagement()
    fireEvent.click(screen.getByRole('button', { name: 'Revogar acesso' }))
    expect(await screen.findByText('Falha ao revogar')).toBeInTheDocument()
  })
})

describe('AdminPage — navigation, auth and form errors', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
  })

  it('logs out and redirects to the central login', async () => {
    authenticate()
    vi.mocked(api.get).mockResolvedValue([])
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    )

    renderPage()
    await screen.findByText('Cadastrar ER')
    fireEvent.click(screen.getByRole('button', { name: /sair/i }))

    expect(await screen.findByText('central-login')).toBeInTheDocument()
  })

  it('navigates to the home and queue management routes', async () => {
    authenticate()
    vi.mocked(api.get).mockResolvedValue([])

    renderPage()
    await screen.findByText('Cadastrar ER')

    navigateSpy.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao início' }))
    expect(navigateSpy).toHaveBeenCalledWith('/')

    fireEvent.click(screen.getByRole('button', { name: 'Gestão da fila' }))
    expect(navigateSpy).toHaveBeenCalledWith('/gestao')
  })

  it('surfaces an error when creating an ER fails', async () => {
    authenticate()
    vi.mocked(api.get).mockResolvedValue([])
    vi.mocked(api.post).mockRejectedValue(new Error('Falha ao criar ER'))

    renderPage()
    await screen.findByText('Nenhum ER cadastrado ainda.')
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Nome do ER'), 'ER Novo')
    fireEvent.click(screen.getByRole('button', { name: 'Criar ER' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao criar ER')
  })
})
