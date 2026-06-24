import { timingSafeStringEqual } from './timing-safe-equal'

describe('timingSafeStringEqual', () => {
  it('returns true for identical strings', () => {
    expect(timingSafeStringEqual('s3cr3t-token', 's3cr3t-token')).toBe(true)
  })

  it('returns false for same-length strings that differ', () => {
    expect(timingSafeStringEqual('abcdef', 'abcxef')).toBe(false)
  })

  it('returns false for different-length strings without throwing', () => {
    // timingSafeEqual lança quando os buffers têm tamanhos diferentes; a guarda de
    // comprimento precede a chamada e devolve false em vez de propagar a exceção.
    expect(() => timingSafeStringEqual('short', 'a-much-longer-value')).not.toThrow()
    expect(timingSafeStringEqual('short', 'a-much-longer-value')).toBe(false)
  })

  it('returns false comparing empty with non-empty (either order)', () => {
    expect(timingSafeStringEqual('', 'x')).toBe(false)
    expect(timingSafeStringEqual('x', '')).toBe(false)
  })

  it('returns true for empty vs empty', () => {
    expect(timingSafeStringEqual('', '')).toBe(true)
  })

  it('compares by byte content for multibyte strings', () => {
    expect(timingSafeStringEqual('café', 'café')).toBe(true)
    // 'á' ocupa 2 bytes em UTF-8, assim como 'ab' — mesmo tamanho de buffer, conteúdo
    // diferente: exercita o timingSafeEqual de fato, não só a guarda de comprimento.
    expect(timingSafeStringEqual('á', 'ab')).toBe(false)
  })
})
