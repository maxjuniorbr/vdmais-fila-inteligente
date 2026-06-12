import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { Role } from '@prisma/client'
import { AuditLogService } from '../../audit-log/audit-log.service'
import { PrismaService } from '../../prisma/prisma.service'
import { TelemetryService } from '../telemetry.service'

const prisma = {
  ticket: { findUnique: jest.fn() },
  operator: { update: jest.fn() },
}
const auditLog = { log: jest.fn() }

const representative = { userId: 're-1', role: Role.REPRESENTATIVE, erId: undefined }
const attendant = { userId: 'att-1', role: Role.ATTENDANT, erId: 'er-1' }
const operator = { userId: 'op-1', role: Role.OPERATOR, erId: 'er-1' }

describe('TelemetryService', () => {
  let service: TelemetryService

  beforeEach(() => {
    jest.resetAllMocks()
    service = new TelemetryService(
      prisma as unknown as PrismaService,
      auditLog as unknown as AuditLogService,
    )
  })

  describe('recordTicketDisplayed', () => {
    it('records when the owner views their ticket', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        id: 't-1',
        erId: 'er-1',
        representativeId: 're-1',
      })
      await expect(service.recordTicketDisplayed('t-1', representative)).resolves.toEqual({
        recorded: true,
      })
    })

    it('throws when the ticket is missing', async () => {
      prisma.ticket.findUnique.mockResolvedValue(null)
      await expect(service.recordTicketDisplayed('t-x', representative)).rejects.toThrow(
        NotFoundException,
      )
    })

    it('forbids viewing a ticket of another representative', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        id: 't-1',
        erId: 'er-1',
        representativeId: 'other',
      })
      await expect(service.recordTicketDisplayed('t-1', representative)).rejects.toThrow(
        ForbiddenException,
      )
    })
  })

  describe('recordLogout', () => {
    it('records the staff logout and revokes the session', async () => {
      prisma.operator.update.mockResolvedValue({})
      await expect(service.recordLogout(operator)).resolves.toEqual({ recorded: true })
      expect(prisma.operator.update).toHaveBeenCalledWith({
        where: { id: 'op-1' },
        data: { sessionVersion: { increment: 1 } },
      })
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'operator_logged_out' }),
      )
    })

    it('revokes an admin session even without an ER bound', async () => {
      prisma.operator.update.mockResolvedValue({})
      await expect(
        service.recordLogout({ userId: 'adm-1', role: Role.ADMIN, erId: undefined }),
      ).resolves.toEqual({ recorded: true })
      expect(prisma.operator.update).toHaveBeenCalledWith({
        where: { id: 'adm-1' },
        data: { sessionVersion: { increment: 1 } },
      })
      expect(auditLog.log).not.toHaveBeenCalled()
    })

    it('forbids a representative logout', async () => {
      await expect(service.recordLogout(representative)).rejects.toThrow(ForbiddenException)
      expect(prisma.operator.update).not.toHaveBeenCalled()
    })
  })

  describe('recordManualCheckinStarted', () => {
    it('records the manual check-in for an attendant', async () => {
      await expect(service.recordManualCheckinStarted(attendant)).resolves.toEqual({
        recorded: true,
      })
    })

    it('forbids non-attendants', async () => {
      await expect(service.recordManualCheckinStarted(operator)).rejects.toThrow(ForbiddenException)
    })
  })
})
