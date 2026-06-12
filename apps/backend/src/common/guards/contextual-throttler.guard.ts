import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'

interface ThrottledRequest {
  ip?: string
  body?: {
    erId?: unknown
    entryChannel?: unknown
  }
}

export function queueThrottleTracker(request: ThrottledRequest): string {
  const erId = typeof request.body?.erId === 'string' ? request.body.erId : '-'
  const entryChannel =
    typeof request.body?.entryChannel === 'string' ? request.body.entryChannel : '-'
  return `${request.ip ?? 'unknown'}:${erId}:${entryChannel}`
}

@Injectable()
export class ContextualThrottlerGuard extends ThrottlerGuard {
  protected getTracker(request: ThrottledRequest): Promise<string> {
    return Promise.resolve(queueThrottleTracker(request))
  }
}
