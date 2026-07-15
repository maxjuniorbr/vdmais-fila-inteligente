import { ContextualThrottlerGuard, queueThrottleTracker } from './contextual-throttler.guard'

interface TrackedRequest {
  ip?: string
  headers?: Record<string, string | string[] | undefined>
}

// getTracker only touches `this.jwtService`; call it off the prototype with a
// stubbed context to avoid building the full ThrottlerGuard dependency graph.
function getTracker(
  request: TrackedRequest,
  verifyAsync: jest.Mock = jest.fn().mockRejectedValue(new Error('invalid')),
): Promise<string> {
  const prototype = ContextualThrottlerGuard.prototype as unknown as {
    getTracker(this: { jwtService: { verifyAsync: jest.Mock } }, req: TrackedRequest): Promise<string>
  }
  return prototype.getTracker.call({ jwtService: { verifyAsync } }, request)
}

describe('ContextualThrottlerGuard', () => {
  it('keys authenticated requests by the verified user, not the shared IP', async () => {
    const verifyAsync = jest.fn().mockResolvedValue({ sub: 're-1', role: 'REPRESENTATIVE' })
    const request = { ip: '203.0.113.10', headers: { authorization: 'Bearer signed-token' } }

    await expect(getTracker(request, verifyAsync)).resolves.toBe('user:re-1')
    expect(verifyAsync).toHaveBeenCalledWith('signed-token')
  })

  it('prefers userId over sub, matching JwtStrategy identity resolution', async () => {
    const verifyAsync = jest.fn().mockResolvedValue({ sub: 'login-cpf', userId: 're-9' })
    const request = { ip: '203.0.113.10', headers: { authorization: 'Bearer signed-token' } }

    await expect(getTracker(request, verifyAsync)).resolves.toBe('user:re-9')
  })

  it('gives each user on the same NAT an independent bucket', async () => {
    const ip = '203.0.113.10'
    const trackerFor = (sub: string) =>
      getTracker(
        { ip, headers: { authorization: `Bearer token-${sub}` } },
        jest.fn().mockResolvedValue({ sub }),
      )

    await expect(trackerFor('re-1')).resolves.toBe('user:re-1')
    await expect(trackerFor('re-2')).resolves.toBe('user:re-2')
  })

  it('falls back to the IP when the token fails verification', async () => {
    const request = { ip: '203.0.113.10', headers: { authorization: 'Bearer forged' } }

    await expect(getTracker(request)).resolves.toBe('203.0.113.10')
  })

  it('falls back to the IP when the verified payload has no identity (queue-entry token)', async () => {
    const verifyAsync = jest.fn().mockResolvedValue({ kind: 'queue-entry', erId: 'er-1' })
    const request = { ip: '203.0.113.10', headers: { authorization: 'Bearer entry-token' } }

    await expect(getTracker(request, verifyAsync)).resolves.toBe('203.0.113.10')
  })

  it('does not attempt verification without a bearer authorization header', async () => {
    const verifyAsync = jest.fn()

    await expect(getTracker({ ip: '203.0.113.10' }, verifyAsync)).resolves.toBe('203.0.113.10')
    await expect(
      getTracker({ ip: '203.0.113.10', headers: { authorization: 'Basic abc' } }, verifyAsync),
    ).resolves.toBe('203.0.113.10')
    expect(verifyAsync).not.toHaveBeenCalled()
  })
})

describe('queueThrottleTracker', () => {
  it('keys the rate limit by the client IP only', () => {
    expect(queueThrottleTracker({ ip: '203.0.113.10' })).toBe('203.0.113.10')
  })

  it('ignores client-controlled request body so the limit cannot be bypassed', () => {
    const base = { ip: '203.0.113.10' }
    const withErId = { ip: '203.0.113.10', body: { erId: 'er-1', entryChannel: 'QR_CODE' } }
    const withOtherErId = { ip: '203.0.113.10', body: { erId: 'er-2', entryChannel: 'LINK' } }

    // Varying erId/entryChannel must NOT change the bucket — otherwise an attacker
    // lands in a fresh bucket on every request and defeats the throttle.
    expect(queueThrottleTracker(withErId)).toBe(queueThrottleTracker(base))
    expect(queueThrottleTracker(withOtherErId)).toBe(queueThrottleTracker(base))
  })

  it('keeps a stable fallback when the IP is absent', () => {
    expect(queueThrottleTracker({})).toBe('unknown')
  })
})
