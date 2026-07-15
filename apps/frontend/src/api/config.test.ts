import { describe, expect, it } from 'vitest'
import { resolveApiBase, resolveSocketUrl } from './config'

describe('resolveApiBase', () => {
  it('falls back to the same-origin proxy path when the env is unset', () => {
    expect(resolveApiBase(undefined)).toBe('/api')
    expect(resolveApiBase('')).toBe('/api')
    expect(resolveApiBase('   ')).toBe('/api')
  })

  it('uses the backend host directly when the env is set', () => {
    expect(resolveApiBase('https://backend.example.com')).toBe('https://backend.example.com')
  })

  it('strips trailing slashes so paths concatenate cleanly', () => {
    expect(resolveApiBase('https://backend.example.com/')).toBe('https://backend.example.com')
    expect(resolveApiBase('https://backend.example.com//')).toBe('https://backend.example.com')
  })
})

describe('resolveSocketUrl', () => {
  it('falls back to same origin when the env is unset', () => {
    expect(resolveSocketUrl(undefined)).toBe('/')
    expect(resolveSocketUrl('  ')).toBe('/')
  })

  it('uses the backend host directly when the env is set', () => {
    expect(resolveSocketUrl('https://backend.example.com')).toBe('https://backend.example.com')
  })
})
