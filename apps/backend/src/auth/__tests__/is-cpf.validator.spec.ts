import { validateSync } from 'class-validator'
import { isValidCpf, IsCpf } from '../validators/is-cpf.validator'

class CpfDto {
  @IsCpf()
  cpf!: unknown
}

function decoratorAccepts(value: unknown): boolean {
  const dto = new CpfDto()
  dto.cpf = value
  return validateSync(dto).length === 0
}

describe('isValidCpf', () => {
  it('accepts valid CPFs, plain and masked', () => {
    expect(isValidCpf('52998224725')).toBe(true)
    expect(isValidCpf('529.982.247-25')).toBe(true)
  })

  it('accepts a CPF that exercises the remainder-10 → 0 check-digit branch', () => {
    // 01234567890: o segundo dígito verificador cai no caso (resto === 10 → 0).
    expect(isValidCpf('01234567890')).toBe(true)
  })

  it('rejects an all-same-digit CPF (passes the length test but is invalid)', () => {
    expect(isValidCpf('00000000000')).toBe(false)
    expect(isValidCpf('11111111111')).toBe(false)
  })

  it('rejects when only the first check digit is valid', () => {
    // 5299822472(4): 1º dígito verificador correto, 2º incorreto (esperado 5).
    expect(isValidCpf('52998224724')).toBe(false)
  })

  it('rejects wrong length', () => {
    expect(isValidCpf('123')).toBe(false)
    expect(isValidCpf('529982247250')).toBe(false)
  })
})

describe('IsCpf decorator', () => {
  it('accepts a valid CPF string', () => {
    expect(decoratorAccepts('52998224725')).toBe(true)
  })

  it('rejects non-string values', () => {
    expect(decoratorAccepts(52998224725)).toBe(false)
    expect(decoratorAccepts(undefined)).toBe(false)
  })

  it('rejects an invalid CPF string', () => {
    expect(decoratorAccepts('11122233344')).toBe(false)
  })
})
