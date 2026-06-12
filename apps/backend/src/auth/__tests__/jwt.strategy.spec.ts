import { ConfigService } from '@nestjs/config'
import { Role } from '@prisma/client'
import { JwtStrategy } from '../jwt.strategy'

function config(): ConfigService {
  return {
    get: (key: string) => (key === 'JWT_SECRET' ? 'test-secret' : 'test'),
  } as unknown as ConfigService
}

describe('JwtStrategy', () => {
  const strategy = new JwtStrategy(config())

  it('maps the payload to the authenticated user, preferring userId', () => {
    expect(
      strategy.validate({ sub: 's-1', userId: 'u-1', role: Role.MANAGER, erId: 'er-1' }),
    ).toEqual({ userId: 'u-1', role: Role.MANAGER, erId: 'er-1' })
  })

  it('falls back to sub when userId is absent', () => {
    expect(strategy.validate({ sub: 's-1', role: Role.OPERATOR })).toEqual({
      userId: 's-1',
      role: Role.OPERATOR,
      erId: undefined,
    })
  })
})
