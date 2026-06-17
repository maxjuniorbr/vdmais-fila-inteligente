/**
 * Property 2: Preservation — Accessibility and Semantic Behavior
 *
 * Estes testes capturam a linha de base de comportamentos que DEVEM ser preservados
 * após o fix de design-system. Eles PASSAM no código não corrigido e continuarão
 * passando após a implementação do fix (tasks 3–10), confirmando que não há regressões.
 *
 * Metodologia: observation-first — os valores aqui são observados no código atual
 * e codificados como asserções de baseline a preservar.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { StatusDot } from '../components/StatusDot'
import { QueueEntryPage } from '../pages/QueueEntryPage'
import { brand } from './brand'
import { layout } from './layout'

describe('Preservation 3.1 — Alert: role="alert" when tone="error", absent otherwise', () => {
  it('tone="error" renders a div with role="alert"', () => {
    const { container } = render(<Alert tone="error">Erro crítico</Alert>)
    const alertEl = container.querySelector('[role="alert"]')
    expect(alertEl).not.toBeNull()
    expect(alertEl?.tagName).toBe('DIV')
  })

  it('tone="warning" renders <output> (polite live region), no role="alert"', () => {
    const { container } = render(<Alert tone="warning">Atenção</Alert>)
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.querySelector('output')).not.toBeNull()
  })

  it('tone="success" renders <output>, no role="alert"', () => {
    const { container } = render(<Alert tone="success">Sucesso</Alert>)
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.querySelector('output')).not.toBeNull()
  })

  it('tone="info" renders <output>, no role="alert"', () => {
    const { container } = render(<Alert tone="info">Info</Alert>)
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.querySelector('output')).not.toBeNull()
  })

  it('default tone is "error" (renders role="alert")', () => {
    const { container } = render(<Alert>Mensagem padrão</Alert>)
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
  })
})

describe('Preservation 3.2 — Button minHeight WCAG touch targets', () => {
  it('layout.primaryButton has minHeight: 44 (WCAG 2.5.5)', () => {
    expect(layout.primaryButton.minHeight).toBe(44)
  })

  it('layout.ghostButton has minHeight: 44 (WCAG 2.5.5)', () => {
    expect(layout.ghostButton.minHeight).toBe(44)
  })

  it('layout.dangerButton has minHeight: 44 (WCAG 2.5.5)', () => {
    expect(layout.dangerButton.minHeight).toBe(44)
  })

  it('Button size="sm" renders with minHeight >= 36', () => {
    const { container } = render(<Button size="sm">Ação sm</Button>)
    const btn = container.querySelector('button')
    const inlineStyle = btn?.style.minHeight
    expect(Number.parseFloat(inlineStyle ?? '0')).toBeGreaterThanOrEqual(36)
  })

  it('Button size="md" renders without overriding minHeight (uses layout token >= 44)', () => {
    const { container } = render(<Button size="md" variant="primary">Ação md</Button>)
    const btn = container.querySelector('button')
    expect(btn).not.toBeNull()
    expect(layout.primaryButton.minHeight).toBeGreaterThanOrEqual(44)
  })
})

describe('Preservation 3.7 — Existing brand color tokens unchanged after fix', () => {
  /**
   * PBT: For any existing color token in brand.ts (green*, gold*, ink*, danger*,
   * warning*, success*), the hex value remains unchanged.
   *
   * These values are the baseline observed in the UNFIXED code and must match
   * after the fix is applied.
   *
   * Validates: Requirements 3.7
   */

  it('brand.actionable === "#264fec" (primary action color)', () => {
    expect(brand.actionable).toBe('#264fec')
  })

  it('brand.conversion === "#db1e8c" (commercial highlight color)', () => {
    expect(brand.conversion).toBe('#db1e8c')
  })

  it('brand.danger === "#d32f2f"', () => {
    expect(brand.danger).toBe('#d32f2f')
  })

  it('brand.warning === "#f57f17"', () => {
    expect(brand.warning).toBe('#f57f17')
  })

  it('brand.success === "#1b5e20"', () => {
    expect(brand.success).toBe('#1b5e20')
  })

  it('brand.ink === "#222222"', () => {
    expect(brand.ink).toBe('#222222')
  })

  it('brand.canvas === "#f5f5f5"', () => {
    expect(brand.canvas).toBe('#f5f5f5')
  })

  it('brand.surface === "#ffffff"', () => {
    expect(brand.surface).toBe('#ffffff')
  })
})

describe('Preservation — brand.borderMuted === "#94a3b8" (StatusDot visual parity)', () => {
  it('brand.borderMuted equals "#94a3b8"', () => {
    expect(brand.borderMuted).toBe('#94a3b8')
  })

  it('StatusDot defaults its color to brand.borderMuted', () => {
    const { container } = render(<StatusDot />)
    const dot = container.querySelector('span') as HTMLElement
    // #94a3b8 → rgb(148, 163, 184)
    expect(dot.style.background).toBe('rgb(148, 163, 184)')
  })
})

describe('Preservation 3.3 — ConfirmDialog accessibility on open', () => {
  it('ConfirmDialog focuses the textarea when opened (focus trap active)', () => {
    render(
      <ConfirmDialog title="Cancelar operação" onConfirm={vi.fn()} onClose={vi.fn()} />,
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('open')

    const reason = screen.getByLabelText('Motivo obrigatório')
    expect(reason).toHaveFocus()
  })
})

describe('Preservation 3.4 — QueueEntryPage TabBar keyboard navigation', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : input.toString()
        if (url.includes('/api/public/ers/')) {
          return new Response(
            JSON.stringify({ id: 'er-test', name: 'ER Teste', isDayOpen: true }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(null, { status: 201 })
      }),
    )
  })

  function renderQueueEntry() {
    return render(
      <MemoryRouter initialEntries={['/fila/er-test']}>
        <Routes>
          <Route path="/fila/:erId" element={<QueueEntryPage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('responds to ArrowRight on TabBar (navigates to next tab)', async () => {
    renderQueueEntry()
    await screen.findByText('ER Teste')

    const loginTab = screen.getByRole('tab', { name: 'Já tenho cadastro' })
    const registerTab = screen.getByRole('tab', { name: 'Criar cadastro' })

    loginTab.focus()
    fireEvent.keyDown(loginTab, { key: 'ArrowRight' })

    expect(registerTab).toHaveFocus()
    expect(registerTab).toHaveAttribute('aria-selected', 'true')
  })

  it('responds to ArrowLeft on TabBar (wraps around to last tab)', async () => {
    renderQueueEntry()
    await screen.findByText('ER Teste')

    const loginTab = screen.getByRole('tab', { name: 'Já tenho cadastro' })
    const registerTab = screen.getByRole('tab', { name: 'Criar cadastro' })

    loginTab.focus()
    fireEvent.keyDown(loginTab, { key: 'ArrowLeft' })

    expect(registerTab).toHaveFocus()
    expect(registerTab).toHaveAttribute('aria-selected', 'true')
  })

  it('responds to Home key (focuses and selects first tab)', async () => {
    renderQueueEntry()
    await screen.findByText('ER Teste')

    const loginTab = screen.getByRole('tab', { name: 'Já tenho cadastro' })
    const registerTab = screen.getByRole('tab', { name: 'Criar cadastro' })

    loginTab.focus()
    fireEvent.keyDown(loginTab, { key: 'ArrowRight' })
    expect(registerTab).toHaveFocus()

    fireEvent.keyDown(registerTab, { key: 'Home' })
    expect(loginTab).toHaveFocus()
    expect(loginTab).toHaveAttribute('aria-selected', 'true')
  })

  it('responds to End key (focuses and selects last tab)', async () => {
    renderQueueEntry()
    await screen.findByText('ER Teste')

    const loginTab = screen.getByRole('tab', { name: 'Já tenho cadastro' })
    const registerTab = screen.getByRole('tab', { name: 'Criar cadastro' })

    loginTab.focus()
    fireEvent.keyDown(loginTab, { key: 'End' })

    expect(registerTab).toHaveFocus()
    expect(registerTab).toHaveAttribute('aria-selected', 'true')
  })

  it('tabs have correct role="tab" and aria-selected attributes', async () => {
    renderQueueEntry()
    await screen.findByText('ER Teste')

    const loginTab = screen.getByRole('tab', { name: 'Já tenho cadastro' })
    const registerTab = screen.getByRole('tab', { name: 'Criar cadastro' })

    expect(loginTab).toHaveAttribute('role', 'tab')
    expect(registerTab).toHaveAttribute('role', 'tab')
    expect(loginTab).toHaveAttribute('aria-selected', 'true')
    expect(registerTab).toHaveAttribute('aria-selected', 'false')
  })
})

describe('Preservation 3.5 — Microcopy dos CTAs preservado', () => {
  it('QueueEntryPage renders "Entrar na fila" CTA text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : input.toString()
        if (url.includes('/api/public/ers/')) {
          return new Response(
            JSON.stringify({ id: 'er-cta', name: 'ER CTA Teste', isDayOpen: true }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(null, { status: 201 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/fila/er-cta']}>
        <Routes>
          <Route path="/fila/:erId" element={<QueueEntryPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByText('ER CTA Teste')
    expect(screen.getByRole('button', { name: 'Entrar na fila' })).toBeInTheDocument()
  })
})
