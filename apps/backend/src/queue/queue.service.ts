import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { CounterState, Role, Ticket, TicketState } from '@prisma/client'
import { AuthenticatedUser } from '../common/authenticated-user'
import { getBusinessDate } from '../common/business-date'
import { PanelGateway } from '../panel/panel.gateway'
import { abbreviateName } from '../panel/panel.presenter'
import { PrismaService } from '../prisma/prisma.service'

type CalledTicket = Ticket & {
  representative: { fullName: string }
  counter: { number: number } | null
}

@Injectable()
export class QueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly panelGateway: PanelGateway,
  ) {}

  async callNext(erId: string, counterId: string, user: AuthenticatedUser): Promise<CalledTicket> {
    if (user.role !== Role.OPERATOR) {
      throw new ForbiddenException('Somente operadores(as) podem chamar senhas')
    }
    this._assertERAccess(erId, user)
    await this.prisma.auditEvent.create({
      data: {
        eventType: 'next_ticket_requested',
        erId,
        operatorId: user.userId,
        metadata: { counterId },
      },
    })

    const ticket = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "counters"
        WHERE "id" = ${counterId}
        FOR UPDATE
      `

      const counter = await tx.counter.findUnique({ where: { id: counterId } })
      if (!counter) throw new NotFoundException('Caixa não encontrado')
      if (counter.erId !== erId) {
        throw new BadRequestException('O caixa não pertence a este ER')
      }
      if (counter.operatorId !== user.userId) {
        throw new ForbiddenException('O(a) operador(a) deve abrir este caixa antes de chamar')
      }
      if (counter.state !== CounterState.ACTIVE) {
        throw new BadRequestException('O caixa deve estar ativo para chamar a próxima senha')
      }

      const openTicket = await tx.ticket.findFirst({
        where: {
          operatorId: user.userId,
          state: { in: [TicketState.CALLING, TicketState.IN_SERVICE] },
        },
      })
      if (openTicket) {
        throw new BadRequestException('Finalize a senha atual antes de chamar a próxima')
      }

      const queue = await tx.queue.findUnique({
        where: {
          erId_businessDate: {
            erId,
            businessDate: getBusinessDate(),
          },
        },
        select: { id: true },
      })
      if (!queue) throw new BadRequestException('A operação do ER não está aberta hoje')

      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "tickets"
        WHERE "queueId" = ${queue.id}
          AND "state" = 'WAITING'
        ORDER BY "isPriority" DESC, "queuePosition" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `
      if (rows.length === 0) {
        throw new BadRequestException('Não há senhas aguardando na fila')
      }

      const now = new Date()
      await tx.auditEvent.create({
        data: {
          eventType: 'ticket_locked_for_call',
          erId,
          ticketId: rows[0].id,
          operatorId: user.userId,
          metadata: { counterId },
        },
      })
      const called = await tx.ticket.update({
        where: { id: rows[0].id },
        data: {
          state: TicketState.CALLING,
          counterId,
          operatorId: user.userId,
          calledAt: now,
        },
        include: {
          representative: { select: { fullName: true } },
          counter: { select: { number: true } },
        },
      })

      await tx.counter.update({
        where: { id: counterId },
        data: { state: CounterState.CALLING },
      })
      await tx.auditEvent.create({
        data: {
          eventType: 'ticket_called',
          erId,
          ticketId: called.id,
          operatorId: user.userId,
          metadata: {
            counterId,
            counterNumber: called.counter?.number ?? 0,
            code: called.code,
            displayName: abbreviateName(called.representative.fullName),
          },
        },
      })
      await tx.auditEvent.create({
        data: {
          eventType: 'ticket_call_displayed_on_panel',
          erId,
          ticketId: called.id,
          operatorId: user.userId,
          metadata: {
            counterNumber: called.counter?.number ?? 0,
            code: called.code,
          },
        },
      })
      return called
    })

    this.panelGateway.emitToER(erId, 'ticket.called', {
      ticketId: ticket.id,
      code: ticket.code,
      displayName: abbreviateName(ticket.representative.fullName),
      counterNumber: ticket.counter?.number ?? 0,
      calledAt: ticket.calledAt,
    })
    return ticket
  }

  async getQueueOverview(erId: string, user: AuthenticatedUser) {
    this._assertERAccess(erId, user)
    const businessDate = getBusinessDate()

    const [er, waiting, calling, inService, paused, recent, counters] = await Promise.all([
      this.prisma.eR.findUnique({ where: { id: erId }, select: { isDayOpen: true } }),
      this.prisma.ticket.findMany({
        where: { erId, state: TicketState.WAITING, queue: { businessDate } },
        orderBy: [{ isPriority: 'desc' }, { queuePosition: 'asc' }],
        include: { representative: { select: { fullName: true } } },
      }),
      this.prisma.ticket.findMany({
        where: { erId, state: TicketState.CALLING, queue: { businessDate } },
        orderBy: { calledAt: 'asc' },
        include: {
          representative: { select: { fullName: true } },
          counter: true,
        },
      }),
      this.prisma.ticket.findMany({
        where: { erId, state: TicketState.IN_SERVICE, queue: { businessDate } },
        orderBy: { serviceStartedAt: 'asc' },
        include: {
          representative: { select: { fullName: true } },
          counter: true,
        },
      }),
      this.prisma.ticket.findMany({
        where: { erId, state: TicketState.PAUSED, queue: { businessDate } },
        orderBy: { pausedAt: 'asc' },
        include: { representative: { select: { fullName: true } } },
      }),
      this.prisma.ticket.findMany({
        where: {
          erId,
          queue: { businessDate },
          state: {
            in: [TicketState.FINISHED, TicketState.NO_SHOW, TicketState.CANCELLED],
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        include: {
          representative: { select: { fullName: true } },
          counter: true,
        },
      }),
      this.prisma.counter.findMany({
        where: { erId },
        orderBy: { number: 'asc' },
        include: { operator: { select: { id: true, name: true } } },
      }),
    ])

    return { isDayOpen: er?.isDayOpen ?? false, waiting, calling, inService, paused, recent, counters }
  }

  private _assertERAccess(erId: string, user: AuthenticatedUser) {
    if (user.role === Role.ADMIN) return
    if (!user.erId || user.erId !== erId) {
      throw new ForbiddenException('Não é possível acessar a fila de outro ER')
    }
  }
}
