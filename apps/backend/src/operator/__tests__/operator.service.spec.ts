import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { Role } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { OperatorService } from '../operator.service'

const prisma = { operator: { findUnique: jest.fn() } }

describe('OperatorService', () => {
  let service: OperatorService

  beforeEach(() => {
    jest.resetAllMocks()
    service = new OperatorService(prisma as unknown as PrismaService)
  })

  it('returns the staff profile', async () => {
    prisma.operator.findUnique.mockResolvedValue({
      id: 'op-1',
      name: 'Operadora',
      email: 'op@x.com',
      role: Role.OPERATOR,
      erId: 'er-1',
    })
    const result = await service.getProfile({ userId: 'op-1', role: Role.OPERATOR, erId: 'er-1' })
    expect(result.name).toBe('Operadora')
  })

  it('forbids a representative', async () => {
    await expect(
      service.getProfile({ userId: 're-1', role: Role.REPRESENTATIVE, erId: undefined }),
    ).rejects.toThrow(ForbiddenException)
  })

  it('throws when the staff user is missing', async () => {
    prisma.operator.findUnique.mockResolvedValue(null)
    await expect(
      service.getProfile({ userId: 'op-x', role: Role.MANAGER, erId: 'er-1' }),
    ).rejects.toThrow(NotFoundException)
  })
})
