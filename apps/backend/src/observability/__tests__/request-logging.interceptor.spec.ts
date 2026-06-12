import { lastValueFrom, of, throwError } from 'rxjs'
import { ObservabilityService } from '../observability.service'
import { RequestLoggingInterceptor } from '../request-logging.interceptor'

function httpContext() {
  return {
    getType: () => 'http',
    getClass: () => ({ name: 'PanelController' }),
    getHandler: () => ({ name: 'getState' }),
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', ip: '127.0.0.1', user: { userId: 'u-1' } }),
      getResponse: () => ({ statusCode: 200 }),
    }),
  } as never
}

describe('RequestLoggingInterceptor', () => {
  let observability: ObservabilityService
  let interceptor: RequestLoggingInterceptor

  beforeEach(() => {
    observability = new ObservabilityService()
    jest.spyOn(observability, 'requestStarted')
    jest.spyOn(observability, 'requestFinished')
    interceptor = new RequestLoggingInterceptor(observability)
  })

  it('passes non-http contexts straight through', async () => {
    const ctx = { getType: () => 'ws' } as never
    const next = { handle: () => of('ws-result') }
    const result = await lastValueFrom(interceptor.intercept(ctx, next as never))
    expect(result).toBe('ws-result')
    expect(observability.requestStarted).not.toHaveBeenCalled()
  })

  it('records a successful request', async () => {
    const next = { handle: () => of('ok') }
    const result = await lastValueFrom(interceptor.intercept(httpContext(), next as never))
    expect(result).toBe('ok')
    expect(observability.requestStarted).toHaveBeenCalled()
    expect(observability.requestFinished).toHaveBeenCalledWith(
      expect.objectContaining({ route: 'PanelController.getState', status: 200 }),
    )
  })

  it('records a failed request with its status', async () => {
    const next = { handle: () => throwError(() => ({ status: 403 })) }
    await expect(
      lastValueFrom(interceptor.intercept(httpContext(), next as never)),
    ).rejects.toEqual({ status: 403 })
    expect(observability.requestFinished).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403 }),
    )
  })

  it('defaults a failure without status to 500', async () => {
    const next = { handle: () => throwError(() => ({})) }
    await expect(
      lastValueFrom(interceptor.intercept(httpContext(), next as never)),
    ).rejects.toEqual({})
    expect(observability.requestFinished).toHaveBeenCalledWith(
      expect.objectContaining({ status: 500 }),
    )
  })
})
