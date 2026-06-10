import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common'
import { Observable, catchError, finalize, throwError } from 'rxjs'
import { ObservabilityService } from './observability.service'

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP')

  constructor(private readonly observability: ObservabilityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle()

    const request = context.switchToHttp().getRequest<{
      method: string
      ip?: string
      user?: { userId?: string; erId?: string; role?: string }
    }>()
    const response = context.switchToHttp().getResponse<{ statusCode: number }>()
    const route = `${context.getClass().name}.${context.getHandler().name}`
    const startedAt = process.hrtime.bigint()
    let failureStatus: number | undefined

    this.observability.requestStarted()
    return next.handle().pipe(
      catchError((error: { status?: number }) => {
        failureStatus = error.status ?? 500
        return throwError(() => error)
      }),
      finalize(() => {
        const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000
        const status = failureStatus ?? response.statusCode
        this.observability.requestFinished({
          method: request.method,
          route,
          status,
          durationSeconds,
        })
        this.logger.log(
          JSON.stringify({
            type: 'http_request',
            method: request.method,
            route,
            status,
            durationMs: Math.round(durationSeconds * 1000),
            userId: request.user?.userId,
            erId: request.user?.erId,
            role: request.user?.role,
            ip: request.ip,
          }),
        )
      }),
    )
  }
}
