import { describe, expect, it } from 'vitest'
import { cpfCaretPosition, formatCpfInput, isValidCpf, onlyDigits } from './cpf'

describe('onlyDigits', () => {
  it('keeps digits only', () => {
    expect(onlyDigits('529.982.247-25')).toBe('52998224725')
    expect(onlyDigits('abc12x3')).toBe('123')
  })
})

describe('formatCpfInput', () => {
  it('masks a full CPF as 000.000.000-00', () => {
    expect(formatCpfInput('52998224725')).toBe('529.982.247-25')
  })

  it('formats partial input progressively and caps at 11 digits', () => {
    expect(formatCpfInput('529')).toBe('529')
    expect(formatCpfInput('5299')).toBe('529.9')
    expect(formatCpfInput('529982')).toBe('529.982')
    expect(formatCpfInput('5299822')).toBe('529.982.2')
    expect(formatCpfInput('529982247251234')).toBe('529.982.247-25')
  })

  it('strips mask characters before reformatting', () => {
    expect(formatCpfInput('529.982.247-25')).toBe('529.982.247-25')
  })
})

describe('isValidCpf', () => {
  it('accepts a CPF with valid check digits, masked or not', () => {
    expect(isValidCpf('52998224725')).toBe(true)
    expect(isValidCpf('529.982.247-25')).toBe(true)
  })

  it('rejects wrong check digits, repeated digits and wrong lengths', () => {
    expect(isValidCpf('12345678900')).toBe(false)
    expect(isValidCpf('11111111111')).toBe(false)
    expect(isValidCpf('22222222222')).toBe(false)
    expect(isValidCpf('529982247')).toBe(false)
    expect(isValidCpf('')).toBe(false)
  })
})

describe('cpfCaretPosition', () => {
  it('places the caret after the same digit when formatting inserts punctuation', () => {
    expect(cpfCaretPosition('529.9', 4)).toBe(5)
    expect(cpfCaretPosition('529.982.247-25', 11)).toBe(14)
  })

  it('clamps the caret to the formatted value', () => {
    expect(cpfCaretPosition('529', 0)).toBe(0)
    expect(cpfCaretPosition('529', 99)).toBe(3)
  })
})
