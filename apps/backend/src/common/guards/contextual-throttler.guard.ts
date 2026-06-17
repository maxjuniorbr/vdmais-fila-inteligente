import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'

interface ThrottledRequest {
  ip?: string
}

// Key the rate limit strictly by the proxy-resolved client IP. The request body
// (erId/entryChannel) is attacker-controlled: mixing it into the key let a client
// land in a fresh bucket on every attempt by varying those fields, defeating the
// brute-force protection on /auth/login, /auth/register and /tickets.
// `request.ip` (with a fixed `trust proxy` hop count in main.ts) is the trustworthy
// client address — unlike the left-most X-Forwarded-For entry, which is spoofable.
export function queueThrottleTracker(request: ThrottledRequest): string {
  return request.ip ?? 'unknown'
}

@Injectable()
export class ContextualThrottlerGuard extends ThrottlerGuard {
  protected getTracker(request: ThrottledRequest): Promise<string> {
    return Promise.resolve(queueThrottleTracker(request))
  }
}
