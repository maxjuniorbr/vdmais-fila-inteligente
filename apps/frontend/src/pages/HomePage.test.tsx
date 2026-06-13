import { render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { makeStaffToken, seedStaffSession } from '../test/staffToken'
import { HomePage } from './HomePage'

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/gestao" element={<div>Tela de gestão</div>} />
        <Route path="/operacao" element={<div>Tela de operação</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('HomePage', () => {
  it('shows the login form for an anonymous visitor', () => {
    renderHome()
    expect(
      screen.getByRole('heading', { name: 'Acessar sua área de trabalho' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toBeInTheDocument()
    // The access cards are no longer listed before authentication.
    expect(screen.queryByRole('heading', { name: 'Administração' })).not.toBeInTheDocument()
    // The login at "/" is the entry point, so it offers no "back to portal" link.
    expect(screen.queryByRole('link', { name: 'Voltar ao portal da equipe' })).not.toBeInTheDocument()
  })

  it('authenticates at the entry point and reveals the menu', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: makeStaffToken({ id: 'a1', role: 'ADMIN' }),
            user: { id: 'a1', name: 'Admin Teste', role: 'ADMIN' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    const user = userEvent.setup()
    renderHome()

    await user.type(screen.getByLabelText('E-mail'), 'admin@example.com')
    await user.type(screen.getByLabelText('Senha'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    await waitFor(() => expect(screen.getByText('Sessão reconhecida')).toBeInTheDocument())
    expect(screen.getByText('Admin Teste')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('redirects a single-area profile straight to its area', () => {
    seedStaffSession({ id: 'op1', name: 'Operadora Teste', role: 'OPERATOR', erId: 'er-1' })
    renderHome()
    expect(screen.getByText('Tela de operação')).toBeInTheDocument()
  })

  it('shows a filtered menu for a multi-area profile (ADMIN)', () => {
    seedStaffSession({ id: 'a1', name: 'Admin Teste', role: 'ADMIN' })
    renderHome()
    expect(screen.getByText('Sessão reconhecida')).toBeInTheDocument()
    expect(screen.getByText('Admin Teste')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Administração' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Gestão da fila' })).toBeInTheDocument()
    // Areas outside the ADMIN scope are not offered.
    expect(screen.queryByRole('heading', { name: 'Operação' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Check-in assistido' })).not.toBeInTheDocument()
  })

  it('ends the session and returns to the login form', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })))
    seedStaffSession({ id: 'a1', name: 'Admin Teste', role: 'ADMIN' })
    renderHome()
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar sessão' }))
    await waitFor(() => expect(screen.getByLabelText('E-mail')).toBeInTheDocument())
    expect(screen.queryByText('Sessão reconhecida')).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })
})
