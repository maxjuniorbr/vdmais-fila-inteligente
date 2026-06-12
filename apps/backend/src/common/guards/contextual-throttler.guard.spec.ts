import { queueThrottleTracker } from './contextual-throttler.guard'

describe('queueThrottleTracker', () => {
  it('scopes public queue traffic by ip, ER and channel', () => {
    expect(
      queueThrottleTracker({
        ip: '203.0.113.10',
        body: { erId: 'er-1', entryChannel: 'QR_CODE' },
      }),
    ).toBe('203.0.113.10:er-1:QR_CODE')
  })

  it('keeps a stable fallback for requests without queue context', () => {
    expect(queueThrottleTracker({ ip: '127.0.0.1' })).toBe('127.0.0.1:-:-')
  })
})
