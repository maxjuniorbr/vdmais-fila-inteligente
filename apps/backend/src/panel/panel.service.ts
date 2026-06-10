import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, TicketState } from '@prisma/client'
import { getBusinessDayRange } from '../common/business-date'
import { PrismaService } from '../prisma/prisma.service'
import { abbreviateName } from './panel.presenter'

function metadataString(metadata: Prisma.JsonValue | null, key: string): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const value = metadata[key]
  return typeof value === 'string' ? value : null
}

function metadataNumber(metadata: Prisma.JsonValue | null, key: string): number | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const value = metadata[key]
  return typeof value === 'number' ? value : null
}

@Injectable()
export class PanelService {
  constructor(private readonly prisma: PrismaService) {}

  async getState(erId: string) {
    const er = await this.prisma.eR.findUnique({
      where: { id: erId },
      select: { id: true },
    })
    if (!er) throw new NotFoundException('ER não encontrado')

    const { start, end } = getBusinessDayRange()
    const [callingTickets, recentEvents, inService, waiting, finishedToday, calledToday] =
      await Promise.all([
        this.prisma.ticket.findMany({
          where: { erId, state: TicketState.CALLING },
          orderBy: { counter: { number: 'asc' } },
          include: {
            representative: { select: { fullName: true } },
            counter: { select: { number: true } },
          },
        }),
        this.prisma.auditEvent.findMany({
          where: {
            erId,
            eventType: 'ticket_called',
            ticketId: { not: null },
            createdAt: { gte: start, lt: end },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            ticket: {
              include: {
                representative: { select: { fullName: true } },
                counter: { select: { number: true } },
              },
            },
          },
        }),
        this.prisma.ticket.findMany({
          where: { erId, state: TicketState.IN_SERVICE },
          orderBy: { serviceStartedAt: 'asc' },
          include: { counter: { select: { number: true } } },
        }),
        this.prisma.ticket.findMany({
          where: { erId, state: TicketState.WAITING },
          orderBy: { queuePosition: 'asc' },
          select: { id: true, code: true, queuePosition: true, createdAt: true },
        }),
        this.prisma.ticket.findMany({
          where: {
            erId,
            state: TicketState.FINISHED,
            serviceStartedAt: { gte: start, lt: end },
            serviceFinishedAt: { not: null },
          },
          select: { serviceStartedAt: true, serviceFinishedAt: true },
        }),
        // Tickets called today: used to calculate avg wait (createdAt → calledAt)
        this.prisma.ticket.findMany({
          where: {
            erId,
            calledAt: { gte: start, lt: end },
            createdAt: { not: undefined },
          },
          select: { createdAt: true, calledAt: true, pausedSeconds: true },
        }),
      ])

    const counterIds = recentEvents
      .map((event) => metadataString(event.metadata, 'counterId'))
      .filter((counterId): counterId is string => Boolean(counterId))
    const counters = await this.prisma.counter.findMany({
      where: { id: { in: counterIds } },
      select: { id: true, number: true },
    })
    const counterNumbers = new Map(counters.map((counter) => [counter.id, counter.number]))

    const presentCall = (ticket: (typeof callingTickets)[number]) => ({
      ticketId: ticket.id,
      code: ticket.code,
      displayName: abbreviateName(ticket.representative.fullName),
      counterNumber: ticket.counter?.number ?? 0,
      calledAt: ticket.calledAt,
    })

    // All tickets currently being called, one per counter, ordered by counter.
    const calling = callingTickets.map(presentCall)
    // The most recently called ticket (for highlight + telemetry / back-compat).
    const current =
      calling.length === 0
        ? null
        : [...calling].sort(
            (a, b) => (b.calledAt?.getTime() ?? 0) - (a.calledAt?.getTime() ?? 0),
          )[0]

    const seenTickets = new Set<string>()
    const recent = recentEvents
      .flatMap((event) => {
        if (!event.ticket || seenTickets.has(event.ticket.id)) return []
        seenTickets.add(event.ticket.id)
        const counterId = metadataString(event.metadata, 'counterId')

        return [
          {
            ticketId: event.ticket.id,
            code: event.ticket.code,
            displayName: abbreviateName(event.ticket.representative.fullName),
            counterNumber:
              metadataNumber(event.metadata, 'counterNumber') ??
              (counterId ? counterNumbers.get(counterId) : undefined) ??
              event.ticket.counter?.number ??
              0,
            calledAt: event.createdAt,
          },
        ]
      })
      .slice(0, 5)

    const durations = finishedToday
      .map((t) => (t.serviceFinishedAt!.getTime() - t.serviceStartedAt!.getTime()) / 1000)
      .filter((s) => s > 0)
    const avgServiceSeconds =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null

    const waitDurations = calledToday
      .filter((t) => t.calledAt !== null)
      .map((t) => {
        const raw = t.calledAt!.getTime() - t.createdAt.getTime()
        return Math.max(0, raw / 1000 - t.pausedSeconds)
      })
      .filter((s) => s > 0)
    const avgWaitSeconds =
      waitDurations.length > 0
        ? Math.round(waitDurations.reduce((a, b) => a + b, 0) / waitDurations.length)
        : null

    return {
      current,
      calling,
      recent,
      inService: inService.map((ticket) => ({
        ticketId: ticket.id,
        code: ticket.code,
        counterNumber: ticket.counter?.number ?? 0,
      })),
      waiting: waiting.map((ticket, index) => ({
        ticketId: ticket.id,
        code: ticket.code,
        position: index + 1,
        createdAt: ticket.createdAt,
      })),
      avgServiceSeconds,
      avgWaitSeconds,
    }
  }
}
