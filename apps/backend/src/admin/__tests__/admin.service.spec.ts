import { ConflictException, NotFoundException } from '@nestjs/common'
import { Prisma, Role } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { AuditLogService } from '../../audit-log/audit-log.service'
import { PrismaService } from '../../prisma/prisma.service'
import { AdminService } from '../admin.service'

jest.mock('bcrypt')
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>

const prisma = {
  eR: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  counter: { create: jest.fn() },
  operator: { create: jest.fn() },
}
const auditLog = { log: jest.fn() }
const user = { userId: 'admin-1', role: Role.ADMIN, erId: undefined }

const uniqueViolation = new Prisma.PrismaClientKnownRequestError('dup', {
  code: 'P2002',
  clientVersion: '6.19.3',
})

describe('AdminService', () => {
  let service: AdminService

  beforeEach(() => {
    jest.resetAllMocks()
    service = new AdminService(
      prisma as unknown as PrismaService,
      auditLog as unknown as AuditLogService,
    )
    mockedBcrypt.hash.mockResolvedValue('hashed' as never)
    prisma.eR.findUnique.mockResolvedValue({ id: 'er-1' })
  })

  it('lists ERs', async () => {
    prisma.eR.findMany.mockResolvedValue([{ id: 'er-1' }])
    await expect(service.listERs()).resolves.toEqual([{ id: 'er-1' }])
  })

  it('returns an ER with relations', async () => {
    prisma.eR.findUnique.mockResolvedValue({ id: 'er-1', counters: [], operators: [] })
    const result = await service.getER('er-1')
    expect(result.id).toBe('er-1')
  })

  it('throws when the ER does not exist', async () => {
    prisma.eR.findUnique.mockResolvedValue(null)
    await expect(service.getER('missing')).rejects.toThrow(NotFoundException)
  })

  it('creates an ER and audits it', async () => {
    prisma.eR.create.mockResolvedValue({ id: 'er-9', name: 'Novo ER' })
    const result = await service.createER({ name: ' Novo ER ', qrCodeUrl: 'http://x' }, user)
    expect(prisma.eR.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Novo ER' }) }),
    )
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'er_created' }),
    )
    expect(result.id).toBe('er-9')
  })

  it('updates an ER and audits it', async () => {
    prisma.eR.update.mockResolvedValue({ id: 'er-1', name: 'Renomeado' })
    await service.updateER('er-1', { name: ' Renomeado ', pauseTimeoutSeconds: 300 }, user)
    expect(prisma.eR.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'er-1' } }),
    )
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'er_updated' }),
    )
  })

  it('creates a counter and audits it', async () => {
    prisma.counter.create.mockResolvedValue({ id: 'c-1', number: 3 })
    await service.createCounter('er-1', { number: 3 }, user)
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'counter_created' }),
    )
  })

  it('rejects a duplicated counter number', async () => {
    prisma.counter.create.mockRejectedValue(uniqueViolation)
    await expect(service.createCounter('er-1', { number: 1 }, user)).rejects.toThrow(
      ConflictException,
    )
  })

  it('creates a staff account hashing the password', async () => {
    prisma.operator.create.mockResolvedValue({ id: 'op-1', role: Role.OPERATOR })
    await service.createStaff(
      'er-1',
      { name: ' Nova ', email: ' NOVA@x.com ', password: 'segredo123', role: Role.OPERATOR },
      user,
    )
    expect(mockedBcrypt.hash).toHaveBeenCalled()
    expect(prisma.operator.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'nova@x.com', name: 'Nova' }),
      }),
    )
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'staff_account_created' }),
    )
  })

  it('rejects a duplicated staff email', async () => {
    prisma.operator.create.mockRejectedValue(uniqueViolation)
    await expect(
      service.createStaff(
        'er-1',
        { name: 'X', email: 'x@x.com', password: 'segredo123', role: Role.OPERATOR },
        user,
      ),
    ).rejects.toThrow(ConflictException)
  })

  it('rejects operations on a missing ER', async () => {
    prisma.eR.findUnique.mockResolvedValue(null)
    await expect(service.createCounter('missing', { number: 1 }, user)).rejects.toThrow(
      NotFoundException,
    )
  })
})
