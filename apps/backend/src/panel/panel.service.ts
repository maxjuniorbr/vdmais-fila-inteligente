import { Injectable, NotFoundException } from '@nestjs/common'
import { TicketState } from '@prisma/client'
import { getBusinessDayRange } from '../common/business-date'
import { PrismaService } from '../prisma/prisma.service'
import { abbreviateName } from './panel.presenter'

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
    const [callingTickets, inService, waiting, finishedToday, calledToday] = await Promise.all([
      this.prisma.ticket.findMany({
        where: { erId, state: TicketState.CALLING },
        orderBy: { counter: { number: 'asc' } },
        include: {
          representative: { select: { fullName: true } },
          counter: { select: { number: true } },
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
      this.prisma.ticket.findMany({
        where: {
          erId,
          calledAt: { gte: start, lt: end },
          createdAt: { not: undefined },
        },
        select: { createdAt: true, calledAt: true, pausedSeconds: true },
      }),
    ])

    const presentCall = (ticket: (typeof callingTickets)[number]) => ({
      ticketId: ticket.id,
      code: ticket.code,
      displayName: abbreviateName(ticket.representative.fullName),
      counterNumber: ticket.counter?.number ?? 0,
      calledAt: ticket.calledAt,
    })

    const calling = callingTickets.map(presentCall)
    // The most recently called ticket (for highlight + telemetry / back-compat).
    const current =
      calling.length === 0
        ? null
        : [...calling].sort(
            (a, b) => (b.calledAt?.getTime() ?? 0) - (a.calledAt?.getTime() ?? 0),
          )[0]

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
