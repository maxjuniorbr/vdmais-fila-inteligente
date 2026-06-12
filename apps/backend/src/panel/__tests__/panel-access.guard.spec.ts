import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { PanelAccessGuard } from '../panel-access.guard'
import { PanelTokenService } from '../panel-token.service'

const panelTokens = { verify: jest.fn() }

function context(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
}

describe('PanelAccessGuard', () => {
  let guard: PanelAccessGuard

  beforeEach(() => {
    jest.resetAllMocks()
    guard = new PanelAccessGuard(panelTokens as unknown as PanelTokenService)
  })

  it('allows the request with a valid token in the header', async () => {
    panelTokens.verify.mockResolvedValue(true)
    const request = { params: { erId: 'er-1' }, headers: { 'x-panel-token': 'tok' }, query: {} }

    await expect(guard.canActivate(context(request))).resolves.toBe(true)
    expect(panelTokens.verify).toHaveBeenCalledWith('er-1', 'tok')
  })

  it('falls back to the token query parameter', async () => {
    panelTokens.verify.mockResolvedValue(true)
    const request = { params: { erId: 'er-1' }, headers: {}, query: { token: 'q-tok' } }

    await expect(guard.canActivate(context(request))).resolves.toBe(true)
    expect(panelTokens.verify).toHaveBeenCalledWith('er-1', 'q-tok')
  })

  it('rejects when the token is missing or invalid', async () => {
    panelTokens.verify.mockResolvedValue(false)
    const request = { params: { erId: 'er-1' }, headers: {}, query: {} }

    await expect(guard.canActivate(context(request))).rejects.toThrow(UnauthorizedException)
  })
})
