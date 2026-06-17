import { PrismaService } from '../../prisma/prisma.service'
import { AuditLogService } from '../audit-log.service'

const prisma = {
  auditEvent: { create: jest.fn() },
  eR: { findUnique: jest.fn() },
}

describe('AuditLogService', () => {
  let service: AuditLogService

  beforeEach(() => {
    jest.resetAllMocks()
    service = new AuditLogService(prisma as unknown as PrismaService)
  })

  it('creates an audit event with default empty metadata', async () => {
    prisma.auditEvent.create.mockResolvedValue({ id: 'a-1' })
    await service.log({ eventType: 'er_created', erId: 'er-1' })
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: 'er_created', erId: 'er-1', metadata: {} }),
    })
  })

  it('keeps explicit metadata', async () => {
    prisma.auditEvent.create.mockResolvedValue({ id: 'a-1' })
    await service.log({ eventType: 'x', erId: 'er-1', metadata: { foo: 'bar' } })
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadata: { foo: 'bar' } }),
    })
  })

  it('logs when the ER exists', async () => {
    prisma.eR.findUnique.mockResolvedValue({ id: 'er-1' })
    prisma.auditEvent.create.mockResolvedValue({ id: 'a-1' })
    const result = await service.logIfERExists({ eventType: 'x', erId: 'er-1' })
    expect(result).toEqual({ id: 'a-1' })
    // Prove the event was actually persisted (not just the mock return surfaced).
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: 'x', erId: 'er-1' }),
    })
  })

  it('skips logging when the ER is missing', async () => {
    prisma.eR.findUnique.mockResolvedValue(null)
    const result = await service.logIfERExists({ eventType: 'x', erId: 'missing' })
    expect(result).toBeNull()
    expect(prisma.auditEvent.create).not.toHaveBeenCalled()
  })
})
