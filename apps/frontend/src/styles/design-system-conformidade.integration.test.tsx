/**
 * Architectural conformance guards — Design System.
 *
 * Enforces the CLAUDE.md rule that all duration formatting goes through the
 * central utils/format helper (no inline duration math / no per-page copies) and
 * that index.html loads the IBM Plex Sans font. Behavioral rendering is covered by
 * the dedicated page/component test files.
 *
 * Validates: Requirements 2.6, 2.7
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import { seedStaffSession } from '../test/staffToken'
import { OperationPage } from '../pages/OperationPage'

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
