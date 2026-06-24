import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { formatDate, formatTime, formatTimeWithSeconds, formatDuration } from './format'

describe('format utilities — property-based tests', () => {
  /**
   * O gerador é restrito ao intervalo real de uso do sistema de filas
   * (anos 1900–2099) para garantir anos sempre com 4 dígitos.
   */
  it('Property 1 — formatDate sempre retorna DD/MM/AAAA para qualquer data válida', () => {
    const pattern = /^\d{2}\/\d{2}\/\d{4}$/
    const minDate = new Date('1900-01-01T00:00:00.000Z')
    const maxDate = new Date('2099-12-31T23:59:59.999Z')
    fc.assert(
      fc.property(fc.date({ min: minDate, max: maxDate, noInvalidDate: true }), (date) => {
        const isoString = date.toISOString()
        const result = formatDate(isoString)
        expect(result).toMatch(pattern)
      }),
      { numRuns: 500 }
    )
  })

  it('Property 2 — formatDuration nunca produz valores negativos e segue padrão Xm Ys', () => {
    const pattern = /^\d+m \d+s$/
    // O intervalo inclui valores negativos de propósito: clock skew pode produzir
    // um elapsed negativo, e a função precisa absorver isso sem emitir "-1m -30s".
    fc.assert(
      fc.property(fc.integer({ min: -86400, max: 86400 }), (seconds) => {
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

  it('Property 2b — formatDuration zera entradas negativas e fracionárias', () => {
    expect(formatDuration(-30)).toBe('0m 0s')
    expect(formatDuration(-1)).toBe('0m 0s')
    expect(formatDuration(90.7)).toBe('1m 30s')
  })

  it('Property 3 — formatTime sempre retorna HHhMM para qualquer data válida', () => {
    const pattern = /^\d{2}h\d{2}$/
    const minDate = new Date('1900-01-01T00:00:00.000Z')
    const maxDate = new Date('2099-12-31T23:59:59.999Z')
    fc.assert(
      fc.property(fc.date({ min: minDate, max: maxDate, noInvalidDate: true }), (date) => {
        const isoString = date.toISOString()
        const result = formatTime(isoString)
        expect(result).toMatch(pattern)
      }),
      { numRuns: 500 }
    )
  })
})

describe('format utilities — valores concretos e contrato de hora local', () => {
  // Strings ISO SEM fuso são lidas como hora LOCAL, então estes valores são
  // determinísticos em qualquer runner (não dependem do fuso da máquina).
  it('formatDate retorna DD/MM/AAAA com zero à esquerda', () => {
    expect(formatDate('2026-03-08T10:45:00')).toBe('08/03/2026')
    expect(formatDate('2026-12-31T23:59:00')).toBe('31/12/2026')
  })

  it('formatTime retorna HHhMM com minuto zero-preenchido', () => {
    expect(formatTime('2026-03-08T10:45:00')).toBe('10h45')
    expect(formatTime('2026-03-08T09:05:00')).toBe('09h05')
    expect(formatTime('2026-03-08T00:00:00')).toBe('00h00')
  })

  it('formatTimeWithSeconds acrescenta :SS', () => {
    expect(formatTimeWithSeconds('2026-03-08T10:45:07')).toBe('10h45:07')
  })

  it('formatDuration formata minutos e segundos', () => {
    expect(formatDuration(3661)).toBe('61m 1s')
    expect(formatDuration(0)).toBe('0m 0s')
    expect(formatDuration(59)).toBe('0m 59s')
  })

  it('formata no fuso LOCAL do usuário (não em UTC)', () => {
    // Um ISO com `Z` (UTC) é convertido para o relógio LOCAL na exibição. O
    // esperado é derivado dos componentes locais de new Date(iso) — self-consistente,
    // sem acoplar a um fuso fixo, mas pinando a invariante "usa hora local".
    const iso = '2026-03-08T10:45:00Z'
    const local = new Date(iso)
    const hh = String(local.getHours()).padStart(2, '0')
    const mm = String(local.getMinutes()).padStart(2, '0')
    const dd = String(local.getDate()).padStart(2, '0')
    const mo = String(local.getMonth() + 1).padStart(2, '0')
    expect(formatTime(iso)).toBe(`${hh}h${mm}`)
    expect(formatDate(iso)).toBe(`${dd}/${mo}/${local.getFullYear()}`)
  })
})
