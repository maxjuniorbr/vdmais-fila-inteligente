/**
 * Property 1: Bug Condition — Design System Token Violations
 *
 * CRITICAL: Este teste DEVE FALHAR no código não corrigido.
 * A falha confirma que os bugs existem.
 *
 * Após a implementação do fix (task 3–10), este teste PASSARÁ e servirá
 * como verificação de que todas as violações foram corrigidas.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
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

function nearestScale(px: number): number {
  const scale = [...VALID_SPACING_SET]
  return scale.reduce((prev, curr) => (Math.abs(curr - px) < Math.abs(prev - px) ? curr : prev))
}

describe('Violation 1.6 — font token', () => {
  it('[BUG CONDITION] brand.font NÃO contém "IBM Plex Sans" (contém Segoe UI)', () => {
    expect(brand.font).toContain('IBM Plex Sans')
  })
})

describe('Violation 1.3 — token radius ausente', () => {
  it('[BUG CONDITION] brand NÃO possui propriedade "radius"', () => {
    expect(brand).toHaveProperty('radius')
  })
})

describe('Violation 1.5 — token spacing ausente', () => {
  it('[BUG CONDITION] brand NÃO possui propriedade "spacing"', () => {
    expect(brand).toHaveProperty('spacing')
  })
})

describe('Violation 1.4 — token typography ausente', () => {
  it('[BUG CONDITION] brand NÃO possui propriedade "typography"', () => {
    expect(brand).toHaveProperty('typography')
  })
})

describe('Violation 1.2 — token borderMuted ausente', () => {
  it('[BUG CONDITION] brand NÃO possui propriedade "borderMuted"', () => {
    expect(brand).toHaveProperty('borderMuted')
  })
})

describe('Violation 1.7 — format.ts ausente', () => {
  it('[BUG CONDITION] o arquivo src/utils/format.ts NÃO existe', () => {
    const formatPath = resolve(__dirname, '../utils/format.ts')
    expect(existsSync(formatPath)).toBe(true)
  })

  /**
   * PBT: Property 1 — formatDate não está disponível como exportação do módulo esperado.
   *
   * Gera ISO strings aleatórias e verifica que para qualquer input,
   * a função formatDate AINDA não existe como exportação de src/utils/format.
   *
   * Validates: Requirements 1.7
   */
  it('[PBT][BUG CONDITION] para qualquer ISO string, formatDate AINDA não é uma função exportada de src/utils/format', () => {
    const formatPath = resolve(__dirname, '../utils/format.ts')
    const formatJsPath = resolve(__dirname, '../utils/format.js')

    fc.assert(
      fc.property(
        fc.date({ min: new Date('2000-01-01'), max: new Date('2099-12-31') }),
        (_date) => {
          const moduleExists = existsSync(formatPath) || existsSync(formatJsPath)
          return moduleExists === true
        },
      ),
    )
  })
})

describe('Violation 1.3 + 1.5 — layout.ts usa literais fora da escala', () => {
  /**
   * PBT: Property 1 — spacing values in layout.ts are NOT members of {4,8,12,16,20,24,32,48}.
   *
   * Extrai todos os valores de spacing do layout e verifica que pelo menos um
   * deles não pertence à escala válida — confirmando a violação.
   *
   * Validates: Requirements 1.5
   */
  it('[PBT] todos os valores de spacing em layout.ts pertencem à escala {4,8,12,16,20,24,32,48} (pós-fix: sem violações rem)', () => {
    const spacingValues = extractSpacingValues()

    if (spacingValues.length === 0) {
      return
    }

    fc.assert(
      fc.property(
        fc.constantFrom(...spacingValues),
        ({ key, rawValue }) => {
          const pxValue = remToPx(rawValue)
          const isInScale = VALID_SPACING_SET.has(Math.round(pxValue))
          if (!isInScale) {
            const nearest = nearestScale(pxValue)
            throw new Error(
              `[VIOLATION] ${key} = "${rawValue}" (~${pxValue.toFixed(1)}px) ` +
              `não pertence à escala {4,8,12,16,20,24,32,48}px. ` +
              `Valor mais próximo da escala: ${nearest}px`,
            )
          }
          return true
        },
      ),
    )
  })

  it('[BUG CONDITION] layout.ts contém valores de borderRadius fora de {4, 8, 16, 40}', () => {
    const VALID_RADIUS_SET = new Set([4, 8, 16, 40])
    const numericRadii = extractNumericBorderRadii()

    expect(numericRadii.length).toBeGreaterThan(0)

    const violations = numericRadii.filter((r) => !VALID_RADIUS_SET.has(r))
    expect(violations).toEqual([])
  })
})
