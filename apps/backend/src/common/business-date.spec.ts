import { getBusinessDate, getBusinessDayRange, getBusinessHour } from './business-date'

// Todos os instantes são fixos em UTC para serem determinísticos, independentes do
// fuso da máquina que roda o teste. São Paulo é UTC-3 atualmente (sem horário de
// verão desde 2019); os casos de DST histórico exercitam a correção de offset.
describe('business-date (America/Sao_Paulo)', () => {
  describe('getBusinessDate', () => {
    it('mantém a data civil local antes da meia-noite de São Paulo', () => {
      // 23/06 02:59Z == 22/06 23:59 em BRT (UTC-3): ainda é o dia 22.
      expect(getBusinessDate(new Date('2026-06-23T02:59:00Z')).toISOString()).toBe(
        '2026-06-22T00:00:00.000Z',
      )
    })

    it('vira o dia exatamente na meia-noite local', () => {
      // 23/06 03:00Z == 23/06 00:00 em BRT: vira o dia 23.
      expect(getBusinessDate(new Date('2026-06-23T03:00:00Z')).toISOString()).toBe(
        '2026-06-23T00:00:00.000Z',
      )
    })
  })

  describe('getBusinessDayRange', () => {
    it('cobre 24h num dia sem transição de fuso', () => {
      const { start, end } = getBusinessDayRange(new Date('2026-06-23T15:00:00Z'))
      expect(start.toISOString()).toBe('2026-06-23T03:00:00.000Z') // 00:00 BRT
      expect(end.toISOString()).toBe('2026-06-24T03:00:00.000Z') // 00:00 BRT do dia seguinte
      expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000)
    })

    it('start e end são sempre meia-noite local, inclusive em transições de DST', () => {
      // Invariante: start/end são SEMPRE meia-noite LOCAL. É afirmada de forma
      // self-consistente (mesmo fuso dos dois lados), então robusta à versão da base
      // tz. Cobre dia normal, verão histórico (jan/2018, UTC-2) e a VOLTA do horário
      // de verão (fall-back, fev/2018) — o caso que a lógica de duas passadas de
      // localMidnightToUtc resolve. NÃO cobre o "spring-forward" (dia em que a
      // meia-noite local não existe).
      for (const iso of [
        '2026-06-23T15:00:00Z',
        '2018-01-15T12:00:00Z',
        '2018-02-18T12:00:00Z',
      ]) {
        const { start, end } = getBusinessDayRange(new Date(iso))
        expect(getBusinessHour(start)).toBe(0)
        expect(getBusinessHour(end)).toBe(0)
      }
    })
  })

  describe('getBusinessHour', () => {
    it('retorna a hora local (UTC-3) no relógio de 24h', () => {
      expect(getBusinessHour(new Date('2026-06-24T02:30:00Z'))).toBe(23) // 23:30 BRT
      expect(getBusinessHour(new Date('2026-06-23T03:30:00Z'))).toBe(0) // 00:30 BRT
      expect(getBusinessHour(new Date('2026-06-23T15:00:00Z'))).toBe(12) // 12:00 BRT
    })
  })
})
