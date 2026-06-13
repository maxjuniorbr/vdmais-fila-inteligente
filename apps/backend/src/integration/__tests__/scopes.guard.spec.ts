import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ScopesGuard } from '../auth/scopes.guard'

function contextWith(scopes: string[] | undefined): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user: scopes ? { scopes } : undefined }) }),
  } as unknown as ExecutionContext
}

describe('ScopesGuard', () => {
  function guardRequiring(required: string[] | undefined) {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) } as unknown as Reflector
    return new ScopesGuard(reflector)
  }

  it('fails closed when the route declares no scope', () => {
    expect(() => guardRequiring(undefined).canActivate(contextWith(['tickets:start']))).toThrow(
      ForbiddenException,
    )
    expect(() => guardRequiring([]).canActivate(contextWith(['tickets:start']))).toThrow(
      ForbiddenException,
    )
  })

  it('rejects when the token lacks the required scope', () => {
    const err = (() => {
      try {
        guardRequiring(['tickets:finish']).canActivate(contextWith(['tickets:start']))
      } catch (e) {
        return e as ForbiddenException
      }
    })()
    expect(err).toBeInstanceOf(ForbiddenException)
    expect(err!.getResponse()).toMatchObject({ code: 'INSUFFICIENT_SCOPE' })
  })

  it('allows when the token carries the required scope', () => {
    expect(
      guardRequiring(['tickets:start']).canActivate(contextWith(['tickets:start', 'tickets:finish'])),
    ).toBe(true)
  })

  it('treats a missing user as no scopes', () => {
    expect(() => guardRequiring(['tickets:start']).canActivate(contextWith(undefined))).toThrow(
      ForbiddenException,
    )
  })
})
