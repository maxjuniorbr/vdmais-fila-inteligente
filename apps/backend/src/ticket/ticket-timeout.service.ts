import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron, CronExpression } from '@nestjs/schedule'
import { CounterState, TicketState } from '@prisma/client'
import { PanelGateway } from '../panel/panel.gateway'
import { PrismaService } from '../prisma/prisma.service'

const DEFAULT_CALL_TIMEOUT_MINUTES = 10

/**
 * Encerra automaticamente senhas que ficaram em CHAMADA por mais tempo que a
 * tolerância operacional (a RE foi chamada e não compareceu, ou a operadora
 * abandonou o caixa sem registrar o não comparecimento). Sem isso, o caixa
 * fica preso em CALLING — não dá para chamar a próxima, fechar o caixa nem
 * encerrar o dia.
 */
@Injectable()
export class TicketTimeoutService {
  private readonly logger = new Logger(TicketTimeoutService.name)
  private readonly timeoutMs: number

  constructor(
    private readonly prisma: PrismaService,
    private readonly panelGateway: PanelGateway,
    config: ConfigService,
  ) {
    const minutes = Number(config.get<string>('CALL_TIMEOUT_MINUTES'))
    this.timeoutMs =
      (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_CALL_TIMEOUT_MINUTES) * 60_000
  }

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
   * Marca como NO_SHOW as senhas em chamada há mais que a tolerância e libera o
   * caixa. Cada senha é resolvida na própria transação, com guarda de estado
   * para não competir com uma ação manual concorrente (recall/no-show/início).
   */
  async sweepExpiredCalls(now = new Date(), erId?: string): Promise<number> {
    const threshold = new Date(now.getTime() - this.timeoutMs)
    const expired = await this.prisma.ticket.findMany({
      where: {
        state: TicketState.CALLING,
        calledAt: { lt: threshold },
        ...(erId ? { erId } : {}),
      },
      select: { id: true, erId: true, code: true, counterId: true },
    })

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
