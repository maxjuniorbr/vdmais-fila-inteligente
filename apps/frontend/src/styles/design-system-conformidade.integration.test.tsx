/**
 * Post-fix integration tests — Design System Conformidade
 *
 * Validates that after the fix:
 * 1. OperationPage uses `formatDuration` (not inline elapsed expression)
 * 2. ManagerPage has no local `formatSeconds` function
 * 3. PanelPage has no local `formatDuration` function
 * 4. index.html contains <link> for IBM Plex Sans
 * 5. Smoke tests: main pages/components render without runtime errors
 *
 * Validates: Requirements 2.6, 2.7, 3.1, 3.2
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { seedStaffSession } from '../test/staffToken'
import { OperationPage } from '../pages/OperationPage'
import { PanelPage } from '../pages/PanelPage'
import { ManagerPage } from '../pages/ManagerPage'
import { HomePage } from '../pages/HomePage'
import { QueueEntryPage } from '../pages/QueueEntryPage'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('../hooks/useSocket', () => ({
  useSocket: () => null,
}))

const SRC_DIR = resolve(__dirname, '..')

function readSource(relativePath: string): string {
  return readFileSync(resolve(SRC_DIR, relativePath), 'utf-8')
}

describe('Integration 2.7 — OperationPage: elapsed timer uses formatDuration', () => {
  beforeEach(() => {
    seedStaffSession({ id: 'operator-1', name: 'Operadora Teste', role: 'OPERATOR', erId: 'er-1' })

    vi.mocked(api.get).mockResolvedValue({
      waiting: [],
      calling: [],
      inService: [],
      paused: [],
      recent: [],
      counters: [
        {
          id: 'counter-1',
          number: 1,
          state: 'ACTIVE',
          operator: { id: 'operator-1', name: 'Operadora Teste' },
        },
      ],
    })
  })

  it('OperationPage source does not contain inline elapsed expression', () => {
    const source = readSource('pages/OperationPage.tsx')

    expect(source).not.toContain('Math.floor(elapsed / 60)}m')
    expect(source).not.toContain('elapsed % 60}s')
  })

  it('OperationPage source imports formatDuration from utils/format', () => {
    const source = readSource('pages/OperationPage.tsx')
    expect(source).toContain('formatDuration')
    expect(source).toMatch(/import.*formatDuration.*from.*utils\/format/)
  })

  it('OperationPage renders without runtime errors with mocked data', async () => {
    expect(() => render(<OperationPage />)).not.toThrow()
    expect(await screen.findByLabelText('Caixa de atendimento')).toBeInTheDocument()
  })
})

describe('Integration 2.7 — ManagerPage: no local formatSeconds function', () => {
  it('ManagerPage source does not define a local formatSeconds function', () => {
    const source = readSource('pages/ManagerPage.tsx')

    expect(source).not.toMatch(/function\s+formatSeconds\s*\(/)
    expect(source).not.toMatch(/const\s+formatSeconds\s*=/)
  })

  it('ManagerPage source imports formatDuration from utils/format', () => {
    const source = readSource('pages/ManagerPage.tsx')
    expect(source).toContain('formatDuration')
    expect(source).toMatch(/import.*formatDuration.*from.*utils\/format/)
  })
})

describe('Integration 2.7 — PanelPage: no local formatDuration function', () => {
  it('PanelPage source does not define a local formatDuration function', () => {
    const source = readSource('pages/PanelPage.tsx')

    expect(source).not.toMatch(/function\s+formatDuration\s*\(/)
    expect(source).not.toMatch(/const\s+formatDuration\s*=/)
  })

  it('PanelPage source imports formatDuration from utils/format', () => {
    const source = readSource('pages/PanelPage.tsx')
    expect(source).toContain('formatDuration')
    expect(source).toMatch(/import.*formatDuration.*from.*utils\/format/)
  })
})

describe('Integration 2.6 — index.html: IBM Plex Sans font link present', () => {
  it('index.html contains a <link> tag loading IBM Plex Sans', () => {
    const indexHtmlPath = resolve(__dirname, '../../index.html')
    const html = readFileSync(indexHtmlPath, 'utf-8')

    expect(html).toContain('IBM+Plex+Sans')
    expect(html).toContain('fonts.googleapis.com')
  })

  it('index.html has preconnect hints for Google Fonts', () => {
    const indexHtmlPath = resolve(__dirname, '../../index.html')
    const html = readFileSync(indexHtmlPath, 'utf-8')

    expect(html).toContain('rel="preconnect"')
    expect(html).toContain('fonts.googleapis.com')
    expect(html).toContain('fonts.gstatic.com')
  })
})

describe('Smoke tests 3.1, 3.2 — Main pages render without runtime errors', () => {
  it('Alert renders without errors for all tones', () => {
    expect(() => render(<Alert tone="error">Erro</Alert>)).not.toThrow()
    expect(() => render(<Alert tone="warning">Aviso</Alert>)).not.toThrow()
    expect(() => render(<Alert tone="success">Sucesso</Alert>)).not.toThrow()
    expect(() => render(<Alert tone="info">Info</Alert>)).not.toThrow()
  })

  it('Button renders without errors for all variants and sizes', () => {
    expect(() => render(<Button variant="primary" size="md">Primário</Button>)).not.toThrow()
    expect(() => render(<Button variant="secondary" size="md">Secundário</Button>)).not.toThrow()
    expect(() => render(<Button variant="danger" size="md">Perigo</Button>)).not.toThrow()
    expect(() => render(<Button variant="primary" size="sm">Primário sm</Button>)).not.toThrow()
  })

  it('HomePage renders without runtime errors', () => {
    expect(() =>
      render(
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>,
      ),
    ).not.toThrow()
  })

  it('QueueEntryPage renders without runtime errors', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : input.toString()
        if (url.includes('/api/public/ers/')) {
          return new Response(
            JSON.stringify({ id: 'er-smoke', name: 'ER Smoke', isDayOpen: true }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(null, { status: 201 })
      }),
    )

    expect(() =>
      render(
        <MemoryRouter initialEntries={['/fila/er-smoke']}>
          <Routes>
            <Route path="/fila/:erId" element={<QueueEntryPage />} />
          </Routes>
        </MemoryRouter>,
      ),
    ).not.toThrow()
  })

  it('PanelPage renders without runtime errors', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            current: null,
            calling: [],
            inService: [],
            waiting: [],
            avgServiceSeconds: null,
            avgWaitSeconds: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    expect(() =>
      render(
        <MemoryRouter initialEntries={['/painel/er-smoke']}>
          <Routes>
            <Route path="/painel/:erId" element={<PanelPage />} />
          </Routes>
        </MemoryRouter>,
      ),
    ).not.toThrow()
  })

  it('OperationPage renders without runtime errors (authenticated state)', async () => {
    seedStaffSession({ id: 'operator-1', name: 'Operadora Smoke', role: 'OPERATOR', erId: 'er-1' })

    vi.mocked(api.get).mockResolvedValue({
      waiting: [],
      calling: [],
      inService: [],
      paused: [],
      recent: [],
      counters: [],
    })

    expect(() => render(<OperationPage />)).not.toThrow()
  })

  it('ManagerPage renders without runtime errors (authenticated state)', async () => {
    seedStaffSession({ id: 'manager-1', name: 'Gestora Smoke', role: 'MANAGER', erId: 'er-1' })

    vi.mocked(api.get).mockResolvedValue({
      waiting: [],
      calling: [],
      inService: [],
      paused: [],
      recent: [],
      counters: [],
    })

    expect(() =>
      render(
        <MemoryRouter>
          <ManagerPage />
        </MemoryRouter>,
      ),
    ).not.toThrow()
  })
})
