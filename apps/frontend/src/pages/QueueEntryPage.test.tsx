import axe from 'axe-core'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueueEntryPage } from './QueueEntryPage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/fila/er-1']}>
      <Routes>
        <Route path="/fila/:erId" element={<QueueEntryPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('QueueEntryPage accessibility', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : input.toString()
        if (url.includes('/api/public/ers/er-1')) {
          return new Response(JSON.stringify({ id: 'er-1', name: 'ER Teste', isDayOpen: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(null, { status: 201 })
      }),
    )
  })

  it('implements keyboard navigation and relationships for tabs', async () => {
    renderPage()
    await screen.findByText('ER Teste')

    const loginTab = screen.getByRole('tab', { name: 'Já tenho cadastro' })
    const registerTab = screen.getByRole('tab', { name: 'Criar cadastro' })

    expect(loginTab).toHaveAttribute('aria-selected', 'true')
    expect(loginTab).toHaveAttribute('tabindex', '0')
    expect(registerTab).toHaveAttribute('tabindex', '-1')

    loginTab.focus()
    fireEvent.keyDown(loginTab, { key: 'ArrowRight' })

    expect(registerTab).toHaveFocus()
    expect(registerTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Criar cadastro')

    fireEvent.keyDown(registerTab, { key: 'Home' })
    expect(loginTab).toHaveFocus()
    expect(loginTab).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(loginTab, { key: 'ArrowLeft' })
    expect(registerTab).toHaveFocus()

    fireEvent.keyDown(registerTab, { key: 'End' })
    expect(registerTab).toHaveFocus()

    fireEvent.click(loginTab)
    expect(loginTab).toHaveAttribute('aria-selected', 'true')
  })

  it('has no detectable axe violations in both tab panels', async () => {
    renderPage()
    await screen.findByText('ER Teste')

    const axeOptions = { rules: { 'color-contrast': { enabled: false } } }
    expect((await axe.run(document.body, axeOptions)).violations).toEqual([])

    fireEvent.click(screen.getByRole('tab', { name: 'Criar cadastro' }))

    expect((await axe.run(document.body, axeOptions)).violations).toEqual([])
  })
})
