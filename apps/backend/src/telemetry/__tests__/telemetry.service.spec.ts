import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { Role } from '@prisma/client'
import { AuditLogService } from '../../audit-log/audit-log.service'
import { PrismaService } from '../../prisma/prisma.service'
import { TelemetryService } from '../telemetry.service'

const prisma = {
  eR: { findUnique: jest.fn() },
  ticket: { findUnique: jest.fn(), findFirst: jest.fn() },
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

  describe('recordQueueEntryStarted', () => {
    it('records the entry for an existing ER', async () => {
      prisma.eR.findUnique.mockResolvedValue({ id: 'er-1' })
      await expect(service.recordQueueEntryStarted('er-1')).resolves.toEqual({ recorded: true })
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'queue_entry_started' }),
      )
    })

    it('throws when the ER is unknown', async () => {
      prisma.eR.findUnique.mockResolvedValue(null)
      await expect(service.recordQueueEntryStarted('missing')).rejects.toThrow(NotFoundException)
    })
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

  describe('recordPanelCallDisplayed', () => {
    it('records a panel call for an existing ticket', async () => {
      prisma.ticket.findFirst.mockResolvedValue({ id: 't-1' })
      await expect(service.recordPanelCallDisplayed('er-1', 't-1')).resolves.toEqual({
        recorded: true,
      })
    })

    it('throws when the ticket is not in the ER', async () => {
      prisma.ticket.findFirst.mockResolvedValue(null)
      await expect(service.recordPanelCallDisplayed('er-1', 't-x')).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe('recordLogout', () => {
    it('records the staff logout', async () => {
      await expect(service.recordLogout(operator)).resolves.toEqual({ recorded: true })
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'operator_logged_out' }),
      )
    })

    it('forbids a representative logout', async () => {
      await expect(service.recordLogout(representative)).rejects.toThrow(ForbiddenException)
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
