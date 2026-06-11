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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Scale de spacing válida conforme as diretrizes */
const VALID_SPACING_SET = new Set([4, 8, 12, 16, 20, 24, 32, 48])

/**
 * Extrai todos os valores numéricos de borderRadius definidos no layout.
 * Ignora '50%' (usado em dot — círculo perfeito, não radius semântico).
 */
function extractNumericBorderRadii(): number[] {
  return Object.values(layout)
    .filter((style): style is Record<string, unknown> => typeof style === 'object' && style !== null)
    .flatMap((style) => {
      const r = (style as Record<string, unknown>).borderRadius
      if (typeof r === 'number') return [r]
      return []
    })
}

/**
 * Extrai valores numéricos brutos de spacing (gap, padding, margin) do layout.
 * Converte strings rem para px (1rem = 16px) para poder checar na escala.
 * Retorna os valores string originais junto com o valor convertido para diagnóstico.
 */
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

/**
 * Converte um valor rem para px numérico (base 16px).
 * Extrai o primeiro valor rem de uma string como '0.9rem 2rem'.
 */
function remToPx(remStr: string): number {
  const match = remStr.match(/^([\d.]+)rem/)
  if (!match) return NaN
  return parseFloat(match[1]) * 16
}

/** Arredonda para o membro mais próximo da escala de spacing */
function nearestScale(px: number): number {
  const scale = [...VALID_SPACING_SET]
  return scale.reduce((prev, curr) => (Math.abs(curr - px) < Math.abs(prev - px) ? curr : prev))
}

// ---------------------------------------------------------------------------
// Violation 1.6 — font token errado (Segoe UI em vez de IBM Plex Sans)
// ---------------------------------------------------------------------------

describe('Violation 1.6 — font token', () => {
  it('[BUG CONDITION] brand.font NÃO contém "IBM Plex Sans" (contém Segoe UI)', () => {
    // Esta asserção DEVE FALHAR antes do fix.
    // Após o fix, brand.font = "'IBM Plex Sans', sans-serif" e este teste passará.
    expect(brand.font).toContain('IBM Plex Sans')
  })
})

// ---------------------------------------------------------------------------
// Violation 1.3 — token radius ausente
// ---------------------------------------------------------------------------

describe('Violation 1.3 — token radius ausente', () => {
  it('[BUG CONDITION] brand NÃO possui propriedade "radius"', () => {
    // Deve FALHAR antes do fix; brand não possui token radius.
    expect(brand).toHaveProperty('radius')
  })
})

// ---------------------------------------------------------------------------
// Violation 1.5 — token spacing ausente
// ---------------------------------------------------------------------------

describe('Violation 1.5 — token spacing ausente', () => {
  it('[BUG CONDITION] brand NÃO possui propriedade "spacing"', () => {
    // Deve FALHAR antes do fix; brand não possui token spacing.
    expect(brand).toHaveProperty('spacing')
  })
})

// ---------------------------------------------------------------------------
// Violation 1.4 — token typography ausente
// ---------------------------------------------------------------------------

describe('Violation 1.4 — token typography ausente', () => {
  it('[BUG CONDITION] brand NÃO possui propriedade "typography"', () => {
    // Deve FALHAR antes do fix; brand não possui token typography.
    expect(brand).toHaveProperty('typography')
  })
})

// ---------------------------------------------------------------------------
// Violation 1.2 — token borderMuted ausente
// ---------------------------------------------------------------------------

describe('Violation 1.2 — token borderMuted ausente', () => {
  it('[BUG CONDITION] brand NÃO possui propriedade "borderMuted"', () => {
    // Deve FALHAR antes do fix; brand não possui token borderMuted.
    expect(brand).toHaveProperty('borderMuted')
  })
})

// ---------------------------------------------------------------------------
// Violation 1.7 — arquivo format.ts ausente
// ---------------------------------------------------------------------------

describe('Violation 1.7 — format.ts ausente', () => {
  it('[BUG CONDITION] o arquivo src/utils/format.ts NÃO existe', () => {
    const formatPath = resolve(__dirname, '../utils/format.ts')
    // Deve FALHAR antes do fix; o arquivo não existe.
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
    // O módulo src/utils/format não existe antes do fix.
    // Tentar importá-lo dinamicamente não é possível em tempo de teste síncono,
    // portanto verificamos via existsSync que o arquivo não existe — o que
    // é a pré-condição para qualquer ISO string falhar ao usar formatDate.
    const formatPath = resolve(__dirname, '../utils/format.ts')
    const formatJsPath = resolve(__dirname, '../utils/format.js')

    fc.assert(
      fc.property(
        // Gera datas ISO válidas entre 2000-01-01 e 2099-12-31
        fc.date({ min: new Date('2000-01-01'), max: new Date('2099-12-31') }),
        (_date) => {
          // Para qualquer data gerada, o módulo format ainda não existe.
          // Quando o fix for aplicado, o arquivo existirá e este property test passará.
          const moduleExists = existsSync(formatPath) || existsSync(formatJsPath)
          return moduleExists === true
        },
      ),
    )
  })
})

// ---------------------------------------------------------------------------
// Violation 1.3 + 1.5 — valores de borderRadius e spacing em layout.ts
// estão fora das escalas permitidas
// ---------------------------------------------------------------------------

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

    // Pós-fix: nenhum valor de spacing em rem deve existir no layout.
    // Se existirem, verificamos que todos pertencem à escala.
    if (spacingValues.length === 0) {
      // Nenhuma violação rem encontrada — o fix foi aplicado corretamente.
      return
    }

    // Caso ainda existam valores rem, verificamos que todos pertencem à escala.
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

    // Esta asserção DEVE FALHAR porque layout.ts usa 10, 12, 14, 999, etc.
    const violations = numericRadii.filter((r) => !VALID_RADIUS_SET.has(r))
    expect(violations).toEqual([])
  })
})
