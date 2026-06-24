import { validateSync } from 'class-validator'
import { IsNotFutureDate } from '../validators/is-not-future-date.validator'

class BirthDateDto {
  @IsNotFutureDate()
  birthDate!: unknown
}

function accepts(value: unknown): boolean {
  const dto = new BirthDateDto()
  dto.birthDate = value
  return validateSync(dto).length === 0
}

describe('IsNotFutureDate', () => {
  const NOW = new Date('2026-06-23T12:00:00Z').getTime()

  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(NOW)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('accepts a past date', () => {
    expect(accepts('1990-05-15')).toBe(true)
  })

  it('accepts the exact current instant (boundary is <=)', () => {
    expect(accepts(new Date(NOW).toISOString())).toBe(true)
  })

  it('rejects a date one millisecond in the future', () => {
    expect(accepts(new Date(NOW + 1).toISOString())).toBe(false)
  })

  it('honors the timezone offset in the string', () => {
    // 09:00 em UTC-3 == 12:00Z == agora (limite, ainda válido).
    expect(accepts('2026-06-23T09:00:00-03:00')).toBe(true)
    // 10:00 em UTC-3 == 13:00Z == 1h no futuro.
    expect(accepts('2026-06-23T10:00:00-03:00')).toBe(false)
  })

  it('treats a date-only string as UTC midnight', () => {
    // '2026-06-23' => 2026-06-23T00:00:00Z, passado em relação a 12:00Z.
    expect(accepts('2026-06-23')).toBe(true)
  })

  it('rejects non-string values', () => {
    expect(accepts(new Date(NOW - 1000))).toBe(false)
    expect(accepts(12345)).toBe(false)
    expect(accepts(undefined)).toBe(false)
  })

  it('rejects an unparseable date string', () => {
    expect(accepts('not-a-date')).toBe(false)
  })
})
