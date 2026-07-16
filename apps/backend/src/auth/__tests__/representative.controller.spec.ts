import { RepresentativeKind, Role } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { AuthService } from '../auth.service'
import { RepresentativeController } from '../representative.controller'

const prisma = { representative: { findMany: jest.fn() } }
const authService = { createRepresentative: jest.fn() }
const req = { user: { userId: 'att-1', role: Role.ATTENDANT, erId: 'er-1' } }

describe('RepresentativeController', () => {
  let controller: RepresentativeController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new RepresentativeController(
      prisma as unknown as PrismaService,
      authService as unknown as AuthService,
    )
  })

  it('delegates create with the actor context and masks the response PII', async () => {
    const dto = { fullName: 'Ana' } as never
    authService.createRepresentative.mockResolvedValue({
      id: 're-1',
      fullName: 'Ana Souza',
      cpf: '11122233344',
      phone: '11999990000',
      reCode: 'RE0001',
    })
    const result = await controller.create(dto, req)
    expect(authService.createRepresentative).toHaveBeenCalledWith(dto, {
      erId: 'er-1',
      actor: req.user,
    })
    expect(result).toEqual({
      id: 're-1',
      fullName: 'Ana Souza',
      cpf: '***.***.344-**',
      phone: '(**) *****-0000',
      reCode: 'RE0001',
    })
  })

  it('returns an empty list for short queries', async () => {
    await expect(controller.search('ab', req)).resolves.toEqual([])
    expect(prisma.representative.findMany).not.toHaveBeenCalled()
  })

  it('returns an empty list when the caller has no ER scope', async () => {
    const noErReq = { user: { userId: 'admin-1', role: Role.ADMIN, erId: undefined } }
    await expect(controller.search('11122233344', noErReq)).resolves.toEqual([])
    expect(prisma.representative.findMany).not.toHaveBeenCalled()
  })

  it('scopes the search to representatives with a ticket in the caller ER and masks PII', async () => {
    prisma.representative.findMany.mockResolvedValue([
      {
        id: 're-1',
        fullName: 'Ana Souza',
        cpf: '11122233344',
        phone: '11999990000',
        reCode: 'RE0001',
      },
    ])
    const result = await controller.search('11122233344', req)
    expect(prisma.representative.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { OR: [{ cpf: '11122233344' }, { phone: '11122233344' }, { reCode: '11122233344' }] },
            { kind: RepresentativeKind.REGISTERED },
            { tickets: { some: { erId: 'er-1' } } },
          ],
        },
      }),
    )
    expect(result).toEqual([
      {
        id: 're-1',
        fullName: 'Ana Souza',
        cpf: '***.***.344-**',
        phone: '(**) *****-0000',
        reCode: 'RE0001',
      },
    ])
  })
})
