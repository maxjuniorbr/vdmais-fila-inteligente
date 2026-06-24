/**
 * Conformidade de ESCALA do design system: todo espaçamento/raio definido em
 * `layout.ts` deve estar dentro da escala canônica (spacing {4,8,12,16,20,24,32,48},
 * radius {4,8,16,40}). Guarda de regressão contra valores fora da escala (ex.: um
 * `padding: '1.1rem'` ou `borderRadius: 10`). A paridade brand.ts↔theme.css é coberta
 * por `theme-parity.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { layout } from './layout'

const VALID_SPACING_SET = new Set([4, 8, 12, 16, 20, 24, 32, 48])
const VALID_RADIUS_SET = new Set([4, 8, 16, 40])

function extractNumericBorderRadii(): number[] {
  return Object.values(layout)
    .filter((style): style is Record<string, unknown> => typeof style === 'object' && style !== null)
    .flatMap((style) => {
      const r = (style as Record<string, unknown>).borderRadius
      return typeof r === 'number' ? [r] : []
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
  return match ? parseFloat(match[1]) * 16 : NaN
}

describe('Escala de espaçamento e radius em layout.ts', () => {
  it('mantém todo literal rem de spacing dentro da escala {4,8,12,16,20,24,32,48}', () => {
    const offScale = extractSpacingValues().filter(
      ({ rawValue }) => !VALID_SPACING_SET.has(Math.round(remToPx(rawValue))),
    )
    expect(offScale).toEqual([])
  })

  it('mantém todo borderRadius numérico dentro de {4, 8, 16, 40}', () => {
    const numericRadii = extractNumericBorderRadii()
    expect(numericRadii.length).toBeGreaterThan(0)
    expect(numericRadii.filter((r) => !VALID_RADIUS_SET.has(r))).toEqual([])
  })
})
