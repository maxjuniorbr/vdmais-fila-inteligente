import { Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { InjectThrottlerOptions, InjectThrottlerStorage, ThrottlerGuard } from '@nestjs/throttler'
import type { ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler'
import { JwtService } from '@nestjs/jwt'

interface ThrottledRequest {
  ip?: string
  headers?: Record<string, string | string[] | undefined>
}

// Anonymous fallback: key strictly by the proxy-resolved client IP. The request
// body (erId/entryChannel) is attacker-controlled: mixing it into the key let a
// client land in a fresh bucket on every attempt by varying those fields,
// defeating the brute-force protection on /auth/login, /auth/register and
// /tickets. `request.ip` (with a fixed `trust proxy` hop count in main.ts) is the
// trustworthy client address — unlike the left-most X-Forwarded-For entry, which
// is spoofable.
export function queueThrottleTracker(request: ThrottledRequest): string {
  return request.ip ?? 'unknown'
}

function bearerToken(request: ThrottledRequest): string | undefined {
  const header = request.headers?.authorization
  if (typeof header !== 'string') return undefined
  const [scheme, token] = header.split(' ')
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined
}

interface AppJwtPayload {
  sub?: string
  userId?: string
}

// Authenticated traffic is keyed per user, not per IP: REs legitimately share one
// public address (ER Wi-Fi NAT, carrier CGNAT), so a venue full of phones polling
// my-status must not exhaust a single IP bucket. The identity is safe as a key
// because the signature is verified here (this guard runs before JwtAuthGuard, so
// request.user does not exist yet) — forging a fresh bucket would require a
// validly signed token, and minting identities is itself IP-rate-limited at
// /auth/register. Invalid/expired/M2M tokens fall back to the IP bucket.
@Injectable()
export class ContextualThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {
    super(options, storageService, reflector)
  }

  protected async getTracker(request: ThrottledRequest): Promise<string> {
    const token = bearerToken(request)
    if (token) {
      try {
        const payload = await this.jwtService.verifyAsync<AppJwtPayload>(token)
        // Same identity resolution as JwtStrategy.validate (userId ?? sub), so the
        // throttle bucket matches the user the request will act as.
        const userId = payload.userId ?? payload.sub
        if (userId) return `user:${userId}`
      } catch {
        // Not an app-signed token (invalid, expired or RS256/M2M) — anonymous bucket.
      }
    }
    return queueThrottleTracker(request)
  }
}
