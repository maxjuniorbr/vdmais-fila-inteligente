import { JwtService } from '@nestjs/jwt'
import { Role } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { PanelAccessService } from '../panel-access.service'
import { PanelTokenService } from '../panel-token.service'

const panelTokens = { verify: jest.fn() }
const jwt = { verify: jest.fn() }
const prisma = { operator: { findUnique: jest.fn() } }

function build() {
  return new PanelAccessService(
    panelTokens as unknown as PanelTokenService,
    jwt as unknown as JwtService,
    prisma as unknown as PrismaService,
  )
}

describe('PanelAccessService', () => {
  beforeEach(() => jest.resetAllMocks())

  it('delegates panel clients to the display token verification', async () => {
    panelTokens.verify.mockResolvedValue(true)
    const service = build()

    await expect(
      service.authorize({ erId: 'er-1', clientType: 'panel', panelToken: 't' }),
    ).resolves.toBe(true)
    expect(panelTokens.verify).toHaveBeenCalledWith('er-1', 't')
    expect(jwt.verify).not.toHaveBeenCalled()
  })

  it('authorizes a staff token scoped to the same ER with a current session', async () => {
    jwt.verify.mockReturnValue({ userId: 'op-1', role: Role.OPERATOR, erId: 'er-1', sv: 2 })
    prisma.operator.findUnique.mockResolvedValue({ sessionVersion: 2 })

    await expect(
      build().authorize({ erId: 'er-1', clientType: 'dashboard', staffToken: 'jwt' }),
    ).resolves.toBe(true)
    expect(prisma.operator.findUnique).toHaveBeenCalledWith({
      where: { id: 'op-1' },
      select: { sessionVersion: true },
    })
  })

  it('rejects a staff token bound to a different ER', async () => {
    jwt.verify.mockReturnValue({ userId: 'op-1', role: Role.OPERATOR, erId: 'er-2', sv: 0 })

    await expect(
      build().authorize({ erId: 'er-1', clientType: 'dashboard', staffToken: 'jwt' }),
    ).resolves.toBe(false)
    expect(prisma.operator.findUnique).not.toHaveBeenCalled()
  })

  it('allows an ADMIN token on any ER', async () => {
    jwt.verify.mockReturnValue({ userId: 'admin-1', role: Role.ADMIN, sv: 0 })
    prisma.operator.findUnique.mockResolvedValue({ sessionVersion: 0 })

    await expect(
      build().authorize({ erId: 'er-9', clientType: 'dashboard', staffToken: 'jwt' }),
    ).resolves.toBe(true)
  })

  it('rejects a staff token whose session was revoked', async () => {
    jwt.verify.mockReturnValue({ userId: 'op-1', role: Role.OPERATOR, erId: 'er-1', sv: 1 })
    prisma.operator.findUnique.mockResolvedValue({ sessionVersion: 5 })

    await expect(
      build().authorize({ erId: 'er-1', clientType: 'dashboard', staffToken: 'jwt' }),
    ).resolves.toBe(false)
  })

  it('rejects an invalid or missing staff token', async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('bad token')
    })
    const service = build()

    await expect(
      service.authorize({ erId: 'er-1', clientType: 'dashboard', staffToken: 'bad' }),
    ).resolves.toBe(false)
    await expect(
      service.authorize({ erId: 'er-1', clientType: 'dashboard' }),
    ).resolves.toBe(false)
  })
})
