import { normalizePem } from '../auth/pem.util'

describe('normalizePem', () => {
  it('returns undefined for empty or undefined input', () => {
    expect(normalizePem(undefined)).toBeUndefined()
    expect(normalizePem('   ')).toBeUndefined()
  })

  it('restores literal \\n sequences to real newlines', () => {
    expect(normalizePem('a\\nb\\nc')).toBe('a\nb\nc')
  })

  it('keeps a PEM that already has real newlines unchanged', () => {
    expect(normalizePem('a\nb')).toBe('a\nb')
  })
})
