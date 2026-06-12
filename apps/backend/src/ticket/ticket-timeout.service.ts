import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { CounterState, TicketState } from '@prisma/client'
import { PanelGateway } from '../panel/panel.gateway'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Encerra automaticamente senhas que ficaram em CHAMADA por mais tempo que a
 * tolerância operacional do ER (a RE foi chamada e não compareceu, ou a
 * operadora abandonou o caixa sem registrar o não comparecimento). Sem isso,
 * o caixa fica preso em CALLING — não dá para chamar a próxima, fechar o
 * caixa nem encerrar o dia. A tolerância é configurável por ER via
 * callTimeoutSeconds; 0 desativa para aquele ER.
 */
@Injectable()
export class TicketTimeoutService {
  private readonly logger = new Logger(TicketTimeoutService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly panelGateway: PanelGateway,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron(): Promise<void> {
    try {
      const closed = await this.sweepExpiredCalls()
      if (closed > 0) {
        this.logger.log(`Encerradas ${closed} senha(s) em chamada por tempo limite`)
      }
    } catch (error) {
      this.logger.error('Falha ao varrer senhas em chamada expiradas', error as Error)
    }
  }

  /**
   * Marca como NO_SHOW as senhas em chamada cujo ER atingiu callTimeoutSeconds
   * e libera o caixa. Cada senha é resolvida na própria transação para não
   * competir com ações manuais concorrentes (recall/no-show/início).
   */
  async sweepExpiredCalls(now = new Date(), erId?: string): Promise<number> {
    const tickets = await this.prisma.ticket.findMany({
      where: {
        state: TicketState.CALLING,
        er: { callTimeoutSeconds: { gt: 0 } },
        ...(erId ? { erId } : {}),
      },
      select: {
        id: true,
        erId: true,
        code: true,
        counterId: true,
        calledAt: true,
        er: { select: { callTimeoutSeconds: true } },
      },
    })

    const expired = tickets.filter(
      (t) => t.calledAt && now.getTime() >= t.calledAt.getTime() + t.er.callTimeoutSeconds * 1000,
    )

    let closedCount = 0
    for (const ticket of expired) {
      const resolved = await this.prisma.$transaction(async (tx) => {
        const result = await tx.ticket.updateMany({
          where: { id: ticket.id, state: TicketState.CALLING },
          data: { state: TicketState.NO_SHOW, noShowAt: now },
        })
        if (result.count !== 1) return false

        if (ticket.counterId) {
          await tx.counter.updateMany({
            where: { id: ticket.counterId, state: CounterState.CALLING },
            data: { state: CounterState.ACTIVE },
          })
        }

        await tx.auditEvent.create({
          data: {
            eventType: 'ticket_auto_no_show',
            erId: ticket.erId,
            ticketId: ticket.id,
            metadata: { counterId: ticket.counterId, reason: 'call_timeout' },
          },
        })
        return true
      })

      if (resolved) {
        closedCount += 1
        this.panelGateway.emitToER(ticket.erId, 'ticket.no_show', {
          ticketId: ticket.id,
          code: ticket.code,
        })
      }
    }

    return closedCount
  }
}
