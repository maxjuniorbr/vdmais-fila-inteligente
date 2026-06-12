import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './client'

describe('api client', () => {
  beforeEach(() => {
    sessionStorage.setItem('token', 'test-token')
  })

  it('sends authenticated GET requests and returns JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'value-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.get<{ id: string }>('/values')).resolves.toEqual({ id: 'value-1' })
    expect(fetchMock).toHaveBeenCalledWith('/api/values', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: undefined,
    })
  })

  it.each([
    ['post', 'POST'],
    ['patch', 'PATCH'],
  ] as const)('serializes the body for %s requests', async (operation, method) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await api[operation]('/values', { name: 'Teste' })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/values',
      expect.objectContaining({
        method,
        body: JSON.stringify({ name: 'Teste' }),
      }),
    )
  })

  it('returns undefined for successful responses without content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))

    await expect(api.patch<void>('/values/value-1')).resolves.toBeUndefined()
  })

  it('clears an invalid session and exposes the API error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Sessão expirada' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const onExpired = vi.fn()
    globalThis.addEventListener('staff-session-expired', onExpired)

    await expect(api.get('/private')).rejects.toThrow('Sessão expirada')
    expect(sessionStorage.getItem('token')).toBeNull()
    expect(onExpired).toHaveBeenCalledTimes(1)

    globalThis.removeEventListener('staff-session-expired', onExpired)
  })

  it('uses the HTTP status text when an error body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('invalid-json', { status: 503, statusText: 'Unavailable' })),
    )

    await expect(api.get('/unstable')).rejects.toThrow('Unavailable')
  })

  it('uses a safe fallback when an error body has no message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{}', {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await expect(api.get('/failure')).rejects.toThrow('Não foi possível concluir a solicitação')
  })
})

