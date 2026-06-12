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

import * as fc from 'fast-check'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { StatusDot } from '../components/StatusDot'
import { HomePage } from '../pages/HomePage'
import { QueueEntryPage } from '../pages/QueueEntryPage'
import { brand } from './brand'
import { layout } from './layout'

const ALL_TONES = ['error', 'warning', 'success', 'info'] as const
type Tone = (typeof ALL_TONES)[number]

const ALL_SIZES = ['md', 'sm'] as const
type Size = (typeof ALL_SIZES)[number]

const ALL_VARIANTS = ['primary', 'secondary', 'danger'] as const
type Variant = (typeof ALL_VARIANTS)[number]

describe('Preservation 3.1 — Alert: role="alert" when tone="error", absent otherwise', () => {
  /**
   * PBT: For any combination of Alert props, role="alert" is present when tone="error"
   * and absent otherwise.
   *
   * Validates: Requirements 3.1
   */
  it('[PBT] role="alert" present when tone="error", absent for all other tones', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_TONES),
        (tone: Tone) => {
          const { container, unmount } = render(
            <Alert tone={tone}>Mensagem de teste</Alert>,
          )

          if (tone === 'error') {
            const alertEl = container.querySelector('[role="alert"]')
            const hasAlert = alertEl !== null
            unmount()
            return hasAlert
          } else {
            const alertEl = container.querySelector('[role="alert"]')
            const hasNoAlert = alertEl === null
            unmount()
            return hasNoAlert
          }
        },
      ),
    )
  })

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
  /**
   * PBT: For any combination of Button size and variant, minHeight >= 44 in "md"
   * and minHeight >= 36 in "sm".
   *
   * Validates: Requirements 3.2
   */
  it('[PBT] md button always has minHeight >= 44, sm button always has minHeight >= 36', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_SIZES),
        fc.constantFrom(...ALL_VARIANTS),
        (size: Size, variant: Variant) => {
          const { container, unmount } = render(
            <Button size={size} variant={variant}>
              Ação
            </Button>,
          )

          const btn = container.querySelector('button')
          if (!btn) {
            unmount()
            return false
          }

          const inlineMinHeight = btn.style.minHeight

          let minHeightValue: number | null = null
          if (inlineMinHeight) {
            const parsed = Number.parseFloat(inlineMinHeight)
            if (!Number.isNaN(parsed)) minHeightValue = parsed
          }

          unmount()

          if (size === 'md') {
            const variantStyles: Record<Variant, React.CSSProperties> = {
              primary: layout.primaryButton,
              secondary: layout.ghostButton,
              danger: layout.dangerButton,
            }
            const mdMinHeight = variantStyles[variant].minHeight
            return typeof mdMinHeight === 'number' && mdMinHeight >= 44
          } else {
            return minHeightValue !== null && minHeightValue >= 36
          }
        },
      ),
    )
  })

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

  const EXPECTED_COLOR_TOKENS = {
    surface: '#ffffff',
    canvas: '#f5f5f5',
    canvasWarm: '#f5f1eb',
    ink: '#222222',
    inkSoft: '#444444',
    inkMuted: '#666666',
    emphasis: '#00325f',
    border: '#e2e2e2',
    borderStrong: '#c4c4c4',
    borderMuted: '#94a3b8',
    link: '#264fec',
    linkHover: '#002ec9',
    linkVisited: '#4c2c91',
    actionable: '#264fec',
    actionableHover: '#002ec9',
    actionableActive: '#001c76',
    actionableContent: '#ffffff',
    conversion: '#db1e8c',
    conversionHover: '#b2006a',
    conversionActive: '#750059',
    conversionContent: '#ffffff',
    danger: '#d32f2f',
    dangerHover: '#b71c1c',
    dangerSoft: '#ffebee',
    dangerBorder: '#f4c7c7',
    success: '#1b5e20',
    successSoft: '#e8f5e9',
    successBorder: '#bfe3c2',
    warning: '#f57f17',
    warningSoft: '#fffde7',
    warningBorder: '#f5e2a8',
    info: '#0288d1',
    infoSoft: '#e1f5fe',
    infoBorder: '#bce6f5',
    keyboardFocus: '#011e38',
  } as const

  type ColorTokenKey = keyof typeof EXPECTED_COLOR_TOKENS

  it('[PBT] every existing color token keeps its hex value unchanged', () => {
    const tokenEntries = Object.entries(EXPECTED_COLOR_TOKENS) as [ColorTokenKey, string][]

    fc.assert(
      fc.property(
        fc.constantFrom(...tokenEntries),
        ([tokenName, expectedHex]) => {
          const actualHex = (brand as Record<string, unknown>)[tokenName]
          return actualHex === expectedHex
        },
      ),
    )
  })

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

describe('Preservation 3.6 — Smoke test: main components render without runtime errors', () => {
  it('Alert renders without errors for all tones', () => {
    for (const tone of ALL_TONES) {
      expect(() =>
        render(<Alert tone={tone}>Mensagem {tone}</Alert>),
      ).not.toThrow()
    }
  })

  it('Button renders without errors for all variants and sizes', () => {
    for (const variant of ALL_VARIANTS) {
      for (const size of ALL_SIZES) {
        expect(() =>
          render(
            <Button variant={variant} size={size}>
              Botão
            </Button>,
          ),
        ).not.toThrow()
      }
    }
  })

  it('ConfirmDialog renders without errors', () => {
    expect(() =>
      render(<ConfirmDialog title="Teste" onConfirm={vi.fn()} onClose={vi.fn()} />),
    ).not.toThrow()
  })

  it('HomePage renders without errors', () => {
    expect(() =>
      render(
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>,
      ),
    ).not.toThrow()
  })
})
