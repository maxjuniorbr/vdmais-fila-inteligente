/**
 * **Validates: Requirements 2.7**
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { formatDate, formatTime, formatDuration } from './format'

describe('format utilities — property-based tests', () => {
  /**
   * O gerador é restrito ao intervalo real de uso do sistema de filas
   * (anos 1900–2099) para garantir anos sempre com 4 dígitos.
   *
   * **Validates: Requirements 2.7**
   */
  it('Property 1 — formatDate sempre retorna DD/MM/AAAA para qualquer data válida', () => {
    const pattern = /^\d{2}\/\d{2}\/\d{4}$/
    const minDate = new Date('1900-01-01T00:00:00.000Z')
    const maxDate = new Date('2099-12-31T23:59:59.999Z')
    fc.assert(
      fc.property(fc.date({ min: minDate, max: maxDate }), (date) => {
        const isoString = date.toISOString()
        const result = formatDate(isoString)
        expect(result).toMatch(pattern)
      }),
      { numRuns: 500 }
    )
  })

  /**
   * **Validates: Requirements 2.7**
   */
  it('Property 2 — formatDuration nunca produz valores negativos e segue padrão Xm Ys', () => {
    const pattern = /^\d+m \d+s$/
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 86400 }), (seconds) => {
        const result = formatDuration(seconds)
        expect(result).toMatch(pattern)
        const [mPart, sPart] = result.split(' ')
        const minutes = parseInt(mPart.replace('m', ''), 10)
        const secs = parseInt(sPart.replace('s', ''), 10)
        expect(minutes).toBeGreaterThanOrEqual(0)
        expect(secs).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: 500 }
    )
  })

  /**
   * **Validates: Requirements 2.7**
   */
  it('Property 3 — formatTime sempre retorna HHhMM para qualquer data válida', () => {
    const pattern = /^\d{2}h\d{2}$/
    const minDate = new Date('1900-01-01T00:00:00.000Z')
    const maxDate = new Date('2099-12-31T23:59:59.999Z')
    fc.assert(
      fc.property(fc.date({ min: minDate, max: maxDate }), (date) => {
        const isoString = date.toISOString()
        const result = formatTime(isoString)
        expect(result).toMatch(pattern)
      }),
      { numRuns: 500 }
    )
  })
})
