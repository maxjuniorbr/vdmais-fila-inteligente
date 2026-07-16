import { afterEach, describe, expect, it, vi } from 'vitest'
import { API_BASE, apiFetch, resolveApiBase, resolveSocketUrl } from './config'

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

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('prepends the resolved API base to the path and forwards the init verbatim', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    const init = { method: 'POST', headers: { Authorization: 'Bearer t' } }
    await apiFetch('/tickets', init)

    // In tests VITE_API_URL is unset, so API_BASE is the '/api' proxy; the wrapper
    // must be the single place that prepends it, with the caller's init untouched.
    expect(API_BASE).toBe('/api')
    expect(fetchMock).toHaveBeenCalledWith('/api/tickets', init)
  })
})

describe('API_BASE / SOCKET_URL resolved from the environment', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('points REST and WebSocket at the configured backend host (the cross-origin/AWS path)', async () => {
    vi.stubEnv('VITE_API_URL', 'https://backend.example.com/')
    vi.resetModules()
    const mod = await import('./config')
    expect(mod.API_BASE).toBe('https://backend.example.com')
    expect(mod.SOCKET_URL).toBe('https://backend.example.com/')
  })

  it('keeps the same-origin defaults when VITE_API_URL is empty', async () => {
    vi.stubEnv('VITE_API_URL', '')
    vi.resetModules()
    const mod = await import('./config')
    expect(mod.API_BASE).toBe('/api')
    expect(mod.SOCKET_URL).toBe('/')
  })
})
