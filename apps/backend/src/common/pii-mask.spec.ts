import { maskCpf, maskPhone } from './pii-mask'

describe('pii-mask', () => {
  it('masks a normalized 11-digit CPF to the documented shape', () => {
    expect(maskCpf('11122233344')).toBe('***.***.344-**')
  })

  it('masks an 11-digit mobile phone showing only the last four digits', () => {
    expect(maskPhone('11999990000')).toBe('(**) *****-0000')
  })

  it('never leaks a malformed/short CPF in full', () => {
    expect(maskCpf('12')).toBe('***.***.***-**')
    expect(maskCpf('')).toBe('***.***.***-**')
    expect(maskCpf(null)).toBe('***.***.***-**')
  })

  it('never leaks a malformed/short phone in full', () => {
    expect(maskPhone('99')).toBe('(**) *****-****')
    expect(maskPhone('')).toBe('(**) *****-****')
    expect(maskPhone(null)).toBe('(**) *****-****')
  })
})
