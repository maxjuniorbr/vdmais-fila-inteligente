import { Injectable, NotFoundException } from '@nestjs/common'
import { EntryChannel, TicketState } from '@prisma/client'
import { getBusinessDayRange } from '../common/business-date'
import { PrismaService } from '../prisma/prisma.service'
import { QueueEntryTokenService } from '../auth/queue-entry-token.service'
import { abbreviateName } from './panel.presenter'

@Injectable()
export class PanelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueEntryTokens: QueueEntryTokenService,
  ) {}

  async getState(erId: string) {
    const er = await this.prisma.eR.findUnique({
      where: { id: erId },
      select: { id: true, isDayOpen: true },
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
        orderBy: [{ isPriority: 'desc' }, { queuePosition: 'asc' }],
        select: { code: true, isPriority: true },
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
        },
        select: { createdAt: true, calledAt: true, pausedSeconds: true },
      }),
    ])

    const presentCall = (ticket: (typeof callingTickets)[number]) => ({
      code: ticket.code,
      displayName: abbreviateName(ticket.representative.fullName),
      counterNumber: ticket.counter?.number ?? 0,
    })

    const calling = callingTickets.map(presentCall)
    // The most recently called ticket drives the highlight. calledAt is used
    // only here; it never leaves the server in the public payload.
    const mostRecent = callingTickets.reduce(
      (best, ticket, index) =>
        (ticket.calledAt?.getTime() ?? 0) > (callingTickets[best]?.calledAt?.getTime() ?? 0)
          ? index
          : best,
      0,
    )
    const current = calling.length === 0 ? null : calling[mostRecent]

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
      isDayOpen: er.isDayOpen,
      // The TV is the public display: issuing a fresh signed entry token through
      // the panel-token-guarded endpoint keeps the on-screen QR always valid —
      // a token rotation propagates to the TV on the next poll, with no manual
      // step. Suppressed while the day is closed, when entering is blocked anyway.
      qrEntry: er.isDayOpen ? this.queueEntryTokens.issue(erId, EntryChannel.QR_CODE) : null,
      current,
      calling,
      inService: inService.map((ticket) => ({
        code: ticket.code,
        counterNumber: ticket.counter?.number ?? 0,
      })),
      waiting: waiting.map((ticket, index) => ({
        code: ticket.code,
        position: index + 1,
        isPriority: ticket.isPriority,
      })),
      avgServiceSeconds,
      avgWaitSeconds,
    }
  }
}
