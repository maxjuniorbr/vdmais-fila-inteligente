import { ConflictException, NotFoundException } from '@nestjs/common'
import { CounterState, Prisma, Role } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { AuditLogService } from '../../audit-log/audit-log.service'
import { PrismaService } from '../../prisma/prisma.service'
import { PanelTokenService } from '../../panel/panel-token.service'
import { PanelGateway } from '../../panel/panel.gateway'
import { AdminService } from '../admin.service'
import { QueueEntryTokenService } from '../../auth/queue-entry-token.service'

jest.mock('bcrypt')
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>

const prisma = {
  eR: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  counter: { create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
  operator: { create: jest.fn() },
}
const auditLog = { log: jest.fn() }
const panelTokens = { rotate: jest.fn(), revoke: jest.fn() }
const panelGateway = { emitToER: jest.fn() }
// The implementation is (re)set in beforeEach after resetAllMocks.
const queueEntryTokens = { issue: jest.fn() }
const user = { userId: 'admin-1', role: Role.ADMIN, erId: undefined }

const uniqueViolation = new Prisma.PrismaClientKnownRequestError('dup', {
  code: 'P2002',
  clientVersion: '6.19.3',
})

const fkViolation = new Prisma.PrismaClientKnownRequestError('fk', {
  code: 'P2003',
  clientVersion: '6.19.3',
})

describe('AdminService', () => {
  let service: AdminService

  beforeEach(() => {
    jest.resetAllMocks()
    service = new AdminService(
      prisma as unknown as PrismaService,
      auditLog as unknown as AuditLogService,
      panelTokens as unknown as PanelTokenService,
      queueEntryTokens as unknown as QueueEntryTokenService,
      panelGateway as unknown as PanelGateway,
    )
    mockedBcrypt.hash.mockResolvedValue('hashed' as never)
    prisma.eR.findUnique.mockResolvedValue({ id: 'er-1' })
    queueEntryTokens.issue.mockImplementation((erId, entryChannel) => ({
      token: `${erId}-${entryChannel}`,
      expiresAt: '2026-07-12T12:00:00.000Z',
    }))
  })

  it('lists ERs', async () => {
    prisma.eR.findMany.mockResolvedValue([{ id: 'er-1' }])
    await expect(service.listERs()).resolves.toEqual([{ id: 'er-1' }])
  })

  it('returns an ER with relations and hides the panel token hash', async () => {
    prisma.eR.findUnique.mockResolvedValue({
      id: 'er-1',
      panelTokenHash: 'secret-hash',
      counters: [],
      operators: [],
    })
    const result = await service.getER('er-1')
    expect(result.id).toBe('er-1')
    expect(result).not.toHaveProperty('panelTokenHash')
    expect(result.hasPanelToken).toBe(true)
    expect(result.entryAccess).toEqual({
      qrCode: {
        token: 'er-1-QR_CODE',
        expiresAt: '2026-07-12T12:00:00.000Z',
      },
      link: {
        token: 'er-1-LINK',
        expiresAt: '2026-07-12T12:00:00.000Z',
      },
    })
  })

  it('reports hasPanelToken false when no token is set', async () => {
    prisma.eR.findUnique.mockResolvedValue({
      id: 'er-1',
      panelTokenHash: null,
      counters: [],
      operators: [],
    })
    const result = await service.getER('er-1')
    expect(result.hasPanelToken).toBe(false)
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

  it('updates callTimeoutSeconds on the ER', async () => {
    prisma.eR.update.mockResolvedValue({ id: 'er-1', name: 'ER' })
    await service.updateER('er-1', { callTimeoutSeconds: 900 }, user)
    expect(prisma.eR.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ callTimeoutSeconds: 900 }),
      }),
    )
  })

  it('creates a counter, audits it and notifies the ER in real time', async () => {
    prisma.counter.create.mockResolvedValue({ id: 'c-1', number: 3 })
    await service.createCounter('er-1', { number: 3 }, user)
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'counter_created' }),
    )
    expect(panelGateway.emitToER).toHaveBeenCalledWith('er-1', 'counter.created', {
      counterId: 'c-1',
      number: 3,
    })
  })

  it('rejects a duplicated counter number', async () => {
    prisma.counter.create.mockRejectedValue(uniqueViolation)
    await expect(service.createCounter('er-1', { number: 1 }, user)).rejects.toThrow(
      ConflictException,
    )
  })

  it('rethrows a non-conflict error when creating a counter', async () => {
    const boom = new Error('db down')
    prisma.counter.create.mockRejectedValue(boom)
    await expect(service.createCounter('er-1', { number: 1 }, user)).rejects.toBe(boom)
  })

  it('deletes a closed counter with no service history and audits it', async () => {
    prisma.counter.findFirst.mockResolvedValue({
      id: 'c-1',
      number: 2,
      state: CounterState.UNAVAILABLE,
      operatorId: null,
      _count: { tickets: 0 },
    })
    prisma.counter.delete.mockResolvedValue({ id: 'c-1' })

    await service.deleteCounter('er-1', 'c-1', user)

    expect(prisma.counter.delete).toHaveBeenCalledWith({ where: { id: 'c-1' } })
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'counter_deleted' }),
    )
    expect(panelGateway.emitToER).toHaveBeenCalledWith('er-1', 'counter.deleted', {
      counterId: 'c-1',
      number: 2,
    })
  })

  it('refuses to delete a counter with service history', async () => {
    prisma.counter.findFirst.mockResolvedValue({
      id: 'c-1',
      number: 2,
      state: CounterState.UNAVAILABLE,
      operatorId: null,
      _count: { tickets: 4 },
    })

    await expect(service.deleteCounter('er-1', 'c-1', user)).rejects.toThrow(ConflictException)
    expect(prisma.counter.delete).not.toHaveBeenCalled()
  })

  it('maps a FK violation during delete (history added mid-flight) to a conflict', async () => {
    prisma.counter.findFirst.mockResolvedValue({
      id: 'c-1',
      number: 2,
      state: CounterState.UNAVAILABLE,
      operatorId: null,
      _count: { tickets: 0 },
    })
    prisma.counter.delete.mockRejectedValue(fkViolation)

    await expect(service.deleteCounter('er-1', 'c-1', user)).rejects.toThrow(ConflictException)
  })

  it('rethrows a non-FK error when deleting a counter', async () => {
    prisma.counter.findFirst.mockResolvedValue({
      id: 'c-1',
      number: 2,
      state: CounterState.UNAVAILABLE,
      operatorId: null,
      _count: { tickets: 0 },
    })
    const boom = new Error('db down')
    prisma.counter.delete.mockRejectedValue(boom)

    await expect(service.deleteCounter('er-1', 'c-1', user)).rejects.toBe(boom)
  })

  it('refuses to delete an open counter', async () => {
    prisma.counter.findFirst.mockResolvedValue({
      id: 'c-1',
      number: 2,
      state: CounterState.ACTIVE,
      operatorId: 'op-1',
      _count: { tickets: 0 },
    })

    await expect(service.deleteCounter('er-1', 'c-1', user)).rejects.toThrow(ConflictException)
    expect(prisma.counter.delete).not.toHaveBeenCalled()
  })

  it('throws NotFound when the counter does not belong to the ER', async () => {
    prisma.counter.findFirst.mockResolvedValue(null)

    await expect(service.deleteCounter('er-1', 'missing', user)).rejects.toThrow(NotFoundException)
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

  it('rethrows a non-conflict error when creating staff', async () => {
    const boom = new Error('db down')
    prisma.operator.create.mockRejectedValue(boom)
    await expect(
      service.createStaff(
        'er-1',
        { name: 'X', email: 'x@x.com', password: 'segredo123', role: Role.OPERATOR },
        user,
      ),
    ).rejects.toBe(boom)
  })

  it('rejects operations on a missing ER', async () => {
    prisma.eR.findUnique.mockResolvedValue(null)
    await expect(service.createCounter('missing', { number: 1 }, user)).rejects.toThrow(
      NotFoundException,
    )
  })

  it('rotates a panel token and audits it', async () => {
    panelTokens.rotate.mockResolvedValue('fresh-token')
    const result = await service.rotatePanelToken('er-1', user)
    expect(panelTokens.rotate).toHaveBeenCalledWith('er-1')
    expect(result).toEqual({ token: 'fresh-token' })
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'panel_token_rotated', erId: 'er-1' }),
    )
  })

  it('revokes a panel token and audits it', async () => {
    panelTokens.revoke.mockResolvedValue(undefined)
    const result = await service.revokePanelToken('er-1', user)
    expect(panelTokens.revoke).toHaveBeenCalledWith('er-1')
    expect(result).toEqual({ revoked: true })
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'panel_token_revoked', erId: 'er-1' }),
    )
  })

  it('does not rotate a panel token for a missing ER', async () => {
    prisma.eR.findUnique.mockResolvedValue(null)
    await expect(service.rotatePanelToken('missing', user)).rejects.toThrow(NotFoundException)
    expect(panelTokens.rotate).not.toHaveBeenCalled()
  })
})
