import axe from 'axe-core'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { StaffLoginForm } from './StaffLoginForm'

function renderForm(onAuthenticated = vi.fn()) {
  return {
    onAuthenticated,
    ...render(
      <MemoryRouter>
        <StaffLoginForm
          title="Operação da fila"
          allowedRoles={['OPERATOR']}
          onAuthenticated={onAuthenticated}
        />
      </MemoryRouter>,
    ),
  }
}

async function fillAndSubmit() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('E-mail'), 'operadora@example.com')
  await user.type(screen.getByLabelText('Senha'), 'password123')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('StaffLoginForm', () => {
  it('authenticates an allowed profile and stores its session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: 'token-1',
            user: {
              id: 'staff-1',
              name: 'Pessoa Operadora',
              role: 'OPERATOR',
              erId: 'er-1',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    const { onAuthenticated } = renderForm()

    await fillAndSubmit()

    await waitFor(() =>
      expect(onAuthenticated).toHaveBeenCalledWith({
        id: 'staff-1',
        name: 'Pessoa Operadora',
        role: 'OPERATOR',
        erId: 'er-1',
      }),
    )
    expect(sessionStorage.getItem('token')).toBe('token-1')
    expect(sessionStorage.getItem('staffRole')).toBe('OPERATOR')
  })

  it('rejects a valid account that lacks access to the requested area', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: 'token-1',
            user: { id: 'staff-1', name: 'Gestora', role: 'MANAGER', erId: 'er-1' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    const { onAuthenticated } = renderForm()

    await fillAndSubmit()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Seu perfil não possui acesso a esta área',
    )
    expect(onAuthenticated).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('token')).toBeNull()
  })

  it('shows API and network errors without leaving the form busy', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Credenciais inválidas' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockRejectedValueOnce('offline')
    vi.stubGlobal('fetch', fetchMock)
    const { unmount } = renderForm()

    await fillAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciais inválidas')
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled()

    unmount()
    renderForm()
    await fillAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro ao autenticar')
  })

  it('offers a return path and has no detectable axe violations', async () => {
    renderForm()

    expect(screen.getByRole('link', { name: 'Voltar ao portal da equipe' })).toHaveAttribute(
      'href',
      '/',
    )
    expect(
      (
        await axe.run(document.body, {
          rules: { 'color-contrast': { enabled: false } },
        })
      ).violations,
    ).toEqual([])
  })
})
