import { UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Role } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtStrategy } from '../jwt.strategy'

function config(): ConfigService {
  return {
    get: (key: string) => (key === 'JWT_SECRET' ? 'test-secret' : 'test'),
  } as unknown as ConfigService
}

const prisma = { operator: { findUnique: jest.fn() } }

function strategy() {
  return new JwtStrategy(config(), prisma as unknown as PrismaService)
}

describe('JwtStrategy', () => {
  beforeEach(() => jest.clearAllMocks())

  it('maps a representative payload without touching the database', async () => {
    const result = await strategy().validate({ sub: 're-1', role: Role.REPRESENTATIVE, erId: 'er-1' })
    expect(result).toEqual({ userId: 're-1', role: Role.REPRESENTATIVE, erId: 'er-1' })
    expect(prisma.operator.findUnique).not.toHaveBeenCalled()
  })

  it('accepts a staff token whose session version matches', async () => {
    prisma.operator.findUnique.mockResolvedValue({ sessionVersion: 2 })
    const result = await strategy().validate({
      sub: 'op-1',
      userId: 'op-1',
      role: Role.MANAGER,
      erId: 'er-1',
      sv: 2,
    })
    expect(result).toEqual({ userId: 'op-1', role: Role.MANAGER, erId: 'er-1' })
  })

  it('treats a missing sv as version 0', async () => {
    prisma.operator.findUnique.mockResolvedValue({ sessionVersion: 0 })
    await expect(
      strategy().validate({ sub: 'op-1', role: Role.OPERATOR }),
    ).resolves.toMatchObject({ userId: 'op-1' })
  })

  it('rejects a staff token with a stale session version', async () => {
    prisma.operator.findUnique.mockResolvedValue({ sessionVersion: 5 })
    await expect(
      strategy().validate({ sub: 'op-1', role: Role.OPERATOR, sv: 4 }),
    ).rejects.toThrow(UnauthorizedException)
  })

  it('rejects a staff token whose account no longer exists', async () => {
    prisma.operator.findUnique.mockResolvedValue(null)
    await expect(
      strategy().validate({ sub: 'op-x', role: Role.ADMIN, sv: 0 }),
    ).rejects.toThrow(UnauthorizedException)
  })
})
