import { queueThrottleTracker } from './contextual-throttler.guard'

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
