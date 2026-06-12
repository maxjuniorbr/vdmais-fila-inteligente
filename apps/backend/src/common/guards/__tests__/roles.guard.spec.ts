import { ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Role } from '@prisma/client'
import { RolesGuard } from '../roles.guard'

function contextWith(user: unknown) {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as never
}

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock }
  let guard: RolesGuard

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() }
    guard = new RolesGuard(reflector as unknown as Reflector)
  })

  it('allows when no roles are required', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined)
    expect(guard.canActivate(contextWith({ role: Role.OPERATOR }))).toBe(true)
  })

  it('denies when there is no authenticated user', () => {
    reflector.getAllAndOverride.mockReturnValue(['MANAGER'])
    expect(() => guard.canActivate(contextWith(undefined))).toThrow(ForbiddenException)
  })

  it('always allows an ADMIN', () => {
    reflector.getAllAndOverride.mockReturnValue(['MANAGER'])
    expect(guard.canActivate(contextWith({ role: Role.ADMIN }))).toBe(true)
  })

  it('allows a user whose role is permitted', () => {
    reflector.getAllAndOverride.mockReturnValue(['MANAGER', 'OPERATOR'])
    expect(guard.canActivate(contextWith({ role: Role.OPERATOR }))).toBe(true)
  })

  it('denies a user without the required role', () => {
    reflector.getAllAndOverride.mockReturnValue(['MANAGER'])
    expect(() => guard.canActivate(contextWith({ role: Role.OPERATOR }))).toThrow(
      ForbiddenException,
    )
  })
})
