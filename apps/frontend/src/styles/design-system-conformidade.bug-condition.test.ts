/**
 * Conformidade do design system — guardas de regressão de tokens.
 *
 * Originalmente este arquivo provava as violações ANTES do fix (task 3–10).
 * Concluído o fix, ele agora atua como regressão: garante que os tokens e o
 * utilitário central de formatação permanecem presentes e dentro da escala.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */

import { describe, expect, it } from 'vitest'
import { formatDate, formatDuration, formatTime } from '../utils/format'
import { brand } from './brand'
import { layout } from './layout'

const VALID_SPACING_SET = new Set([4, 8, 12, 16, 20, 24, 32, 48])

function extractNumericBorderRadii(): number[] {
  return Object.values(layout)
    .filter((style): style is Record<string, unknown> => typeof style === 'object' && style !== null)
    .flatMap((style) => {
      const r = (style as Record<string, unknown>).borderRadius
      if (typeof r === 'number') return [r]
      return []
    })
}

function extractSpacingValues(): { key: string; rawValue: string }[] {
  const spacingKeys = ['gap', 'padding', 'margin', 'marginBottom', 'marginTop', 'marginLeft', 'marginRight']
  const result: { key: string; rawValue: string }[] = []

  for (const [layoutKey, style] of Object.entries(layout)) {
    if (typeof style !== 'object' || style === null) continue
    for (const spacingKey of spacingKeys) {
      const val = (style as Record<string, unknown>)[spacingKey]
      if (typeof val === 'string' && val.includes('rem')) {
        result.push({ key: `layout.${layoutKey}.${spacingKey}`, rawValue: val })
      }
    }
  }

  return result
}

function remToPx(remStr: string): number {
  const match = remStr.match(/^([\d.]+)rem/)
  if (!match) return NaN
  return parseFloat(match[1]) * 16
}

describe('Conformidade de tokens do brand', () => {
  it('brand.font usa a família IBM Plex Sans', () => {
    expect(brand.font).toContain('IBM Plex Sans')
  })

  it('expõe os tokens radius, spacing, typography e borderMuted', () => {
    expect(brand).toHaveProperty('radius')
    expect(brand).toHaveProperty('spacing')
    expect(brand).toHaveProperty('typography')
    expect(brand).toHaveProperty('borderMuted')
  })
})

describe('Utilitário central de formatação', () => {
  it('expõe formatDate, formatTime e formatDuration de utils/format', () => {
    expect(typeof formatDate).toBe('function')
    expect(typeof formatTime).toBe('function')
    expect(typeof formatDuration).toBe('function')
  })
})

describe('Escala de espaçamento e radius em layout.ts', () => {
  it('mantém todo literal rem de spacing dentro da escala {4,8,12,16,20,24,32,48}', () => {
    const offScale = extractSpacingValues().filter(({ rawValue }) => {
      const px = remToPx(rawValue)
      return !VALID_SPACING_SET.has(Math.round(px))
    })
    expect(offScale).toEqual([])
  })

  it('mantém todo borderRadius numérico dentro de {4, 8, 16, 40}', () => {
    const VALID_RADIUS_SET = new Set([4, 8, 16, 40])
    const numericRadii = extractNumericBorderRadii()

    expect(numericRadii.length).toBeGreaterThan(0)
    expect(numericRadii.filter((r) => !VALID_RADIUS_SET.has(r))).toEqual([])
  })
})
