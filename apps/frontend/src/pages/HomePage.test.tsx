import { render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { seedStaffSession } from '../test/staffToken'
import { HomePage } from './HomePage'

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )
}

describe('HomePage', () => {
  it('lists the internal access areas for an anonymous visitor', () => {
    renderHome()
    expect(screen.getByRole('heading', { name: 'Acesse sua área de trabalho' })).toBeInTheDocument()
    for (const area of ['Administração', 'Gestão da fila', 'Operação', 'Check-in assistido']) {
      expect(screen.getByRole('heading', { name: area })).toBeInTheDocument()
    }
    expect(screen.queryByText('Sessão reconhecida')).not.toBeInTheDocument()
  })

  it('shows the recognized session for an authenticated user', () => {
    seedStaffSession({ id: 'm1', name: 'Gestora Teste', role: 'MANAGER', erId: 'er-1' })
    renderHome()
    expect(screen.getByText('Sessão reconhecida')).toBeInTheDocument()
    expect(screen.getByText('Gestora Teste')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Encerrar sessão' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Abrir painel deste ER/ })).toHaveAttribute(
      'href',
      '/painel/er-1',
    )
  })

  it('ends the session and returns to the anonymous view', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })))
    seedStaffSession({ id: 'm1', name: 'Gestora Teste', role: 'MANAGER', erId: 'er-1' })
    renderHome()
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar sessão' }))
    await waitFor(() =>
      expect(screen.queryByText('Sessão reconhecida')).not.toBeInTheDocument(),
    )
    vi.unstubAllGlobals()
  })
})
