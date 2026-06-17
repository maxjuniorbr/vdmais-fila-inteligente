import { abbreviateName } from '../panel.presenter'

describe('abbreviateName', () => {
  it('keeps the first name and the surname initial', () => {
    expect(abbreviateName('Maria Silva')).toBe('Maria S.')
  })

  it('returns a single-word name unchanged', () => {
    expect(abbreviateName('Madonna')).toBe('Madonna')
  })

  it('skips Portuguese name particles when choosing the surname', () => {
    expect(abbreviateName('Maria de Souza')).toBe('Maria S.')
    expect(abbreviateName('Ana dos Santos')).toBe('Ana S.')
  })

  it('falls back to the first name when only particles follow it', () => {
    expect(abbreviateName('Maria de')).toBe('Maria')
  })

  it('normalizes surrounding and repeated whitespace', () => {
    expect(abbreviateName('  Ana   Paula  Costa ')).toBe('Ana P.')
  })
})
