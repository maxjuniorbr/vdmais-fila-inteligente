import { HttpException, HttpStatus, Injectable } from '@nestjs/common'

// Per-credential brute-force lock, keyed by the targeted account rather than the
// source IP. This is the real defense against password guessing: it is immune to
// NAT (shared ER Wi-Fi / carrier CGNAT, where many legitimate REs share one IP)
// and to IP rotation (a botnet hits one account from many IPs). The coarse
// per-IP throttle (ContextualThrottlerGuard) stays as a separate anti-flood layer.
//
// In-memory and per-instance: fine for the current single-instance pilot. A
// multi-instance deployment must move this to a shared store (e.g. Redis).

const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 10
// Above this many tracked keys, sweep expired entries before inserting a new one.
// Bounds memory under high volume / credential-spraying, where keys for one-off
// failures would otherwise accumulate until their window lapses.
const PRUNE_THRESHOLD = 10_000

interface Attempt {
  failures: number
  resetAt: number
}

@Injectable()
export class LoginThrottleService {
  private readonly attempts = new Map<string, Attempt>()

  assertNotLocked(key: string): void {
    const entry = this.attempts.get(key)
    if (!entry) return
    if (entry.resetAt <= Date.now()) {
      this.attempts.delete(key)
      return
    }
    if (entry.failures >= MAX_FAILURES) {
      throw new HttpException(
        'Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
  }

  registerFailure(key: string): void {
    const now = Date.now()
    const entry = this.attempts.get(key)
    if (!entry || entry.resetAt <= now) {
      if (this.attempts.size >= PRUNE_THRESHOLD) this._pruneExpired(now)
      this.attempts.set(key, { failures: 1, resetAt: now + WINDOW_MS })
      return
    }
    entry.failures += 1
  }

  clear(key: string): void {
    this.attempts.delete(key)
  }

  private _pruneExpired(now: number): void {
    for (const [key, entry] of this.attempts) {
      if (entry.resetAt <= now) this.attempts.delete(key)
    }
  }
}
