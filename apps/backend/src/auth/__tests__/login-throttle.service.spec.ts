import { HttpException } from '@nestjs/common'
import { LoginThrottleService } from '../login-throttle.service'

const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 10

describe('LoginThrottleService', () => {
  let service: LoginThrottleService

  beforeEach(() => {
    service = new LoginThrottleService()
  })

  it('allows attempts up to the threshold', () => {
    for (let i = 0; i < MAX_FAILURES; i += 1) {
      expect(() => service.assertNotLocked('k')).not.toThrow()
      service.registerFailure('k')
    }
  })

  it('locks once the threshold is reached', () => {
    for (let i = 0; i < MAX_FAILURES; i += 1) service.registerFailure('k')
    expect(() => service.assertNotLocked('k')).toThrow(HttpException)
  })

  it('clears a key so attempts start over', () => {
    for (let i = 0; i < MAX_FAILURES; i += 1) service.registerFailure('k')
    service.clear('k')
    expect(() => service.assertNotLocked('k')).not.toThrow()
  })

  it('resets automatically after the window passes', () => {
    jest.useFakeTimers()
    try {
      for (let i = 0; i < MAX_FAILURES; i += 1) service.registerFailure('k')
      expect(() => service.assertNotLocked('k')).toThrow(HttpException)
      jest.advanceTimersByTime(WINDOW_MS + 1)
      expect(() => service.assertNotLocked('k')).not.toThrow()
    } finally {
      jest.useRealTimers()
    }
  })

  it('tracks each key independently', () => {
    for (let i = 0; i < MAX_FAILURES; i += 1) service.registerFailure('a')
    expect(() => service.assertNotLocked('a')).toThrow(HttpException)
    expect(() => service.assertNotLocked('b')).not.toThrow()
  })

  it('prunes expired entries once the tracked-key threshold is crossed', () => {
    jest.useFakeTimers()
    try {
      // Pruning only bounds memory (no public signal), so assert the internal map
      // shrinks. PRUNE_THRESHOLD is 10_000: fill past it within one window...
      const internal = service as unknown as { attempts: Map<string, unknown> }
      for (let i = 0; i < 10_000; i += 1) service.registerFailure(`k${i}`)
      expect(internal.attempts.size).toBe(10_000)

      // ...let the window lapse so every entry is expired, then a fresh failure
      // triggers the sweep before inserting the new key.
      jest.advanceTimersByTime(WINDOW_MS + 1)
      service.registerFailure('fresh')
      expect(internal.attempts.size).toBe(1)
    } finally {
      jest.useRealTimers()
    }
  })
})
