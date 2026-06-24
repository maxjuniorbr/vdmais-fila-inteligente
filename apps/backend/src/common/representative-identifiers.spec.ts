import { normalizeReCode, onlyDigits } from './representative-identifiers'

describe('representative-identifiers', () => {
  describe('onlyDigits', () => {
    it('strips mask characters keeping only digits', () => {
      expect(onlyDigits('123.456.789-09')).toBe('12345678909')
    })

    it('strips letters and spaces keeping only digits', () => {
      expect(onlyDigits(' 12a3 b4 ')).toBe('1234')
    })

    it('returns an empty string for an empty input', () => {
      expect(onlyDigits('')).toBe('')
    })

    it('returns an empty string when there are no digits', () => {
      expect(onlyDigits('abc.-/ ')).toBe('')
    })

    it('leaves an already digit-only string unchanged', () => {
      expect(onlyDigits('00112233445')).toBe('00112233445')
    })
  })

  describe('normalizeReCode', () => {
    it('trims surrounding whitespace', () => {
      expect(normalizeReCode('  re123  ')).toBe('RE123')
    })

    it('uppercases the code', () => {
      expect(normalizeReCode('re-abc')).toBe('RE-ABC')
    })

    it('trims and uppercases together', () => {
      expect(normalizeReCode('\t re_2024 \n')).toBe('RE_2024')
    })

    it('leaves an already normalized code unchanged', () => {
      expect(normalizeReCode('RE-2024')).toBe('RE-2024')
    })

    it('returns an empty string for whitespace-only input', () => {
      expect(normalizeReCode('   ')).toBe('')
    })
  })
})
