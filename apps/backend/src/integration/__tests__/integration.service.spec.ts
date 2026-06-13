import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { TicketState } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { TicketService } from '../../ticket/ticket.service'
import { IntegrationService } from '../integration.service'
import { IntegrationPrincipal } from '../auth/integration-jwt.strategy'

const principal: IntegrationPrincipal = {
  type: 'integration',
  client: 'legacy-erp',
  scopes: ['tickets:start'],
}

describe('IntegrationService', () => {
  const prisma = {
    representative: { findUnique: jest.fn() },
    ticket: { findMany: jest.fn() },
  }
  const ticketService = {
    advanceToInService: jest.fn(),
    completeService: jest.fn(),
  }
  let service: IntegrationService

  beforeEach(() => {
    jest.resetAllMocks()
    service = new IntegrationService(
      prisma as unknown as PrismaService,
      ticketService as unknown as TicketService,
    )
  })

  it('rejects when neither reCode nor cpf is provided', async () => {
    const err = await service.startService({}, principal).catch((e) => e)
    expect(err).toBeInstanceOf(BadRequestException)
    expect(err.getResponse()).toMatchObject({ code: 'INVALID_IDENTIFIER' })
  })

  it('rejects when both reCode and cpf are provided', async () => {
    const err = await service.startService({ reCode: 'RE1', cpf: '123' }, principal).catch((e) => e)
    expect(err.getResponse()).toMatchObject({ code: 'INVALID_IDENTIFIER' })
  })

  it('rejects when the representative is not found', async () => {
    prisma.representative.findUnique.mockResolvedValue(null)
    const err = await service.startService({ reCode: 're001' }, principal).catch((e) => e)
    expect(err).toBeInstanceOf(NotFoundException)
    expect(err.getResponse()).toMatchObject({ code: 'REPRESENTATIVE_NOT_FOUND' })
    expect(prisma.representative.findUnique).toHaveBeenCalledWith({
      where: { reCode: 'RE001' },
      select: { id: true },
    })
  })

  it('normalizes cpf to digits when looking up the representative', async () => {
    prisma.representative.findUnique.mockResolvedValue(null)
    await service.startService({ cpf: '529.982.247-25' }, principal).catch(() => undefined)
    expect(prisma.representative.findUnique).toHaveBeenCalledWith({
      where: { cpf: '52998224725' },
      select: { id: true },
    })
  })

  it('rejects when the representative has no active ticket', async () => {
    prisma.representative.findUnique.mockResolvedValue({ id: 'rep-1' })
    prisma.ticket.findMany.mockResolvedValue([])
    const err = await service.startService({ reCode: 'RE1' }, principal).catch((e) => e)
    expect(err.getResponse()).toMatchObject({ code: 'NO_ACTIVE_TICKET' })
  })

  it('rejects when the representative is active in more than one ER', async () => {
    prisma.representative.findUnique.mockResolvedValue({ id: 'rep-1' })
    prisma.ticket.findMany.mockResolvedValue([
      { id: 't1', erId: 'er-1' },
      { id: 't2', erId: 'er-2' },
    ])
    const err = await service.startService({ reCode: 'RE1' }, principal).catch((e) => e)
    expect(err).toBeInstanceOf(ConflictException)
    expect(err.getResponse()).toMatchObject({ code: 'MULTIPLE_ACTIVE_TICKETS' })
  })

  it('starts the service: resolves the ticket and delegates with the integration context', async () => {
    prisma.representative.findUnique.mockResolvedValue({ id: 'rep-1' })
    prisma.ticket.findMany.mockResolvedValue([{ id: 'ticket-9', erId: 'er-1' }])
    ticketService.advanceToInService.mockResolvedValue({
      ticket: {
        id: 'ticket-9',
        code: 'A012',
        erId: 'er-1',
        state: TicketState.IN_SERVICE,
        serviceStartedAt: new Date('2026-06-12T10:00:00Z'),
        serviceFinishedAt: null,
      },
      idempotent: false,
    })

    const result = await service.startService(
      { reCode: 'RE1', idempotencyKey: 'idem-1' },
      principal,
    )

    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          state: { in: [TicketState.CALLING, TicketState.IN_SERVICE] },
        }),
      }),
    )
    expect(ticketService.advanceToInService).toHaveBeenCalledWith('ticket-9', {
      client: 'legacy-erp',
      scopes: ['tickets:start'],
      idempotencyKey: 'idem-1',
    })
    expect(result).toMatchObject({
      ticketId: 'ticket-9',
      code: 'A012',
      erId: 'er-1',
      state: TicketState.IN_SERVICE,
      idempotent: false,
    })
  })

  it("finish falls back to today's FINISHED ticket so retries stay idempotent", async () => {
    prisma.representative.findUnique.mockResolvedValue({ id: 'rep-1' })
    prisma.ticket.findMany
      .mockResolvedValueOnce([]) // no active ticket (already finished)
      .mockResolvedValueOnce([{ id: 'ticket-9', erId: 'er-1' }]) // finished today
    ticketService.completeService.mockResolvedValue({
      ticket: {
        id: 'ticket-9',
        code: 'A012',
        erId: 'er-1',
        state: TicketState.FINISHED,
        serviceStartedAt: null,
        serviceFinishedAt: new Date(),
      },
      idempotent: true,
    })

    const result = await service.finishService({ reCode: 'RE1' }, principal)

    expect(result.idempotent).toBe(true)
    expect(ticketService.completeService).toHaveBeenCalledWith('ticket-9', expect.any(Object))
    expect(prisma.ticket.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ state: TicketState.FINISHED }),
      }),
    )
  })

  it('throws NO_ACTIVE_TICKET when neither an active nor a finished-today ticket exists', async () => {
    prisma.representative.findUnique.mockResolvedValue({ id: 'rep-1' })
    prisma.ticket.findMany.mockResolvedValue([])
    const err = await service.finishService({ reCode: 'RE1' }, principal).catch((e) => e)
    expect(err.getResponse()).toMatchObject({ code: 'NO_ACTIVE_TICKET' })
  })

  it('passes erId as a disambiguator to the active-ticket lookup', async () => {
    prisma.representative.findUnique.mockResolvedValue({ id: 'rep-1' })
    prisma.ticket.findMany.mockResolvedValue([{ id: 'ticket-9', erId: 'er-1' }])
    ticketService.completeService.mockResolvedValue({
      ticket: {
        id: 'ticket-9',
        code: 'A012',
        erId: 'er-1',
        state: TicketState.FINISHED,
        serviceStartedAt: null,
        serviceFinishedAt: new Date(),
      },
      idempotent: true,
    })

    const result = await service.finishService({ cpf: '52998224725', erId: 'er-1' }, principal)

    expect(prisma.ticket.findMany).toHaveBeenCalledWith({
      where: {
        representativeId: 'rep-1',
        state: { in: expect.any(Array) },
        erId: 'er-1',
      },
      select: { id: true, erId: true },
    })
    expect(ticketService.completeService).toHaveBeenCalledWith('ticket-9', expect.any(Object))
    expect(result.idempotent).toBe(true)
    expect(result.state).toBe(TicketState.FINISHED)
  })
})
