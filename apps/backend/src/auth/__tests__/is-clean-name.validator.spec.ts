import { isCleanName } from '../validators/is-clean-name.validator'

describe('isCleanName', () => {
  it('accepts ordinary names, including surnames that contain a blocked substring', () => {
    expect(isCleanName('Ana')).toBe(true)
    expect(isCleanName('João')).toBe(true)
    expect(isCleanName('Cunha')).toBe(true)
    expect(isCleanName('Assis')).toBe(true)
  })

  it('rejects empty or whitespace-only names', () => {
    expect(isCleanName('')).toBe(false)
    expect(isCleanName('   ')).toBe(false)
  })

  it('rejects names without any letters', () => {
    expect(isCleanName('!!!')).toBe(false)
    expect(isCleanName('123')).toBe(false)
  })

  it('rejects blocked terms with adjacent digits', () => {
    expect(isCleanName('Puta1 Silva')).toBe(false)
    expect(isCleanName('Cu123')).toBe(false)
  })

  it('rejects offensive words as whole tokens, ignoring case and accents', () => {
    expect(isCleanName('Caralho')).toBe(false)
    expect(isCleanName('Otário')).toBe(false)
    expect(isCleanName('Fulano Escroto')).toBe(false)
    expect(isCleanName('bosta')).toBe(false)
  })
})
