import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuthenticatedUser } from '../common/authenticated-user'
import { getBusinessDate } from '../common/business-date'
import { PanelGateway } from '../panel/panel.gateway'
import { CounterState, Prisma, Role, TicketState } from '@prisma/client'

const PENDING_TICKET_STATES = [
  TicketState.WAITING,
  TicketState.CALLING,
  TicketState.IN_SERVICE,
  TicketState.PAUSED,
] as const

@Injectable()
export class ERService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly panelGateway: PanelGateway,
  ) {}

  async findById(erId: string) {
    const er = await this.prisma.eR.findUnique({ where: { id: erId } })
    if (!er) throw new NotFoundException('ER não encontrado')
    // Never expose the panel token hash to staff responses; surface only whether
    // a token exists, mirroring the admin path.
    const { panelTokenHash, ...rest } = er
    return { ...rest, hasPanelToken: Boolean(panelTokenHash) }
  }

  async getPublic(erId: string) {
    const er = await this.prisma.eR.findUnique({
      where: { id: erId },
      select: { id: true, name: true, isDayOpen: true },
    })
    if (!er) throw new NotFoundException('ER não encontrado')
    return er
  }

  getForStaff(erId: string, user: AuthenticatedUser) {
    this._assertERAccess(erId, user)
    return this.findById(erId)
  }

  async openDay(erId: string, user: AuthenticatedUser) {
    this._assertERAccess(erId, user)
    const now = new Date()
    const businessDate = getBusinessDate(now)
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "ers"
        WHERE "id" = ${erId}
        FOR UPDATE
      `
      const er = await tx.eR.findUnique({ where: { id: erId } })
      if (!er) throw new NotFoundException('ER não encontrado')

      const todayQueue = await tx.queue.findUnique({
        where: { erId_businessDate: { erId, businessDate } },
        select: { closedAt: true },
      })
      // Conflito real só quando o dia de HOJE já está aberto. Se `isDayOpen`
      // ficou `true` de um dia anterior não encerrado, não é conflito — é
      // sobra que será saneada abaixo antes de abrir o novo dia.
      if (er.isDayOpen && todayQueue && !todayQueue.closedAt) {
        throw new ConflictException('A operação do dia já está aberta')
      }

      const forcedClosedCount = await this._forceCloseStaleTickets(tx, erId, businessDate, now, user)
      const releasedCounters = await this._releaseAllCounters(tx, erId, user)

      await tx.queue.upsert({
        where: { erId_businessDate: { erId, businessDate } },
        create: { erId, businessDate, openedAt: now },
        update: { openedAt: now, closedAt: null },
      })

      const result = await tx.eR.update({
        where: { id: erId },
        data: { isDayOpen: true, dayOpenedAt: now, dayClosedAt: null },
      })

      await tx.auditEvent.create({
        data: {
          eventType: 'daily_queue_opened',
          erId,
          operatorId: user.userId,
          metadata: { forcedClosedCount, releasedCounters },
        },
      })
      return result
    })

    this.panelGateway.emitToER(erId, 'day.opened', { openedAt: now })
    return updated
  }

  /**
   * Encerra forçadamente senhas não finalizadas de dias anteriores (a RE não
   * está mais na loja). Elas vão para NO_SHOW e ganham o evento de auditoria
   * `ticket_force_closed`, que permite quantificá-las e mantê-las fora dos
   * indicadores de não comparecimento/cancelamento do dia atual.
   */
  private async _forceCloseStaleTickets(
    tx: Prisma.TransactionClient,
    erId: string,
    businessDate: Date,
    now: Date,
    user: AuthenticatedUser,
  ): Promise<number> {
    const stale = await tx.ticket.findMany({
      where: {
        erId,
        state: { in: [...PENDING_TICKET_STATES] },
        queue: { businessDate: { lt: businessDate } },
      },
      select: { id: true, counterId: true, state: true },
    })
    if (stale.length === 0) return 0

    await tx.ticket.updateMany({
      where: { id: { in: stale.map((ticket) => ticket.id) } },
      data: { state: TicketState.NO_SHOW, noShowAt: now },
    })

    await tx.auditEvent.createMany({
      data: stale.map((ticket) => ({
        eventType: 'ticket_force_closed',
        erId,
        ticketId: ticket.id,
        operatorId: user.userId,
        metadata: {
          forcedClose: true,
          reason: 'day_rollover',
          previousState: ticket.state,
          counterId: ticket.counterId,
        },
      })),
    })

    return stale.length
  }

  /**
   * Um novo dia sempre começa com os caixas fechados. Liberar todos os caixas
   * (UNAVAILABLE + sem operadora) elimina caixas órfãos deixados por operadoras
   * que saíram sem fechar o caixa no dia anterior.
   */
  private async _releaseAllCounters(
    tx: Prisma.TransactionClient,
    erId: string,
    user: AuthenticatedUser,
  ): Promise<number> {
    const result = await tx.counter.updateMany({
      where: { erId, state: { not: CounterState.UNAVAILABLE } },
      data: { state: CounterState.UNAVAILABLE, operatorId: null },
    })
    if (result.count > 0) {
      await tx.auditEvent.create({
        data: {
          eventType: 'counters_reset_for_day',
          erId,
          operatorId: user.userId,
          metadata: { releasedCounters: result.count },
        },
      })
    }
    return result.count
  }

  async closeDay(erId: string, user: AuthenticatedUser) {
    this._assertERAccess(erId, user)
    const now = new Date()
    const businessDate = getBusinessDate(now)
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "ers"
        WHERE "id" = ${erId}
        FOR UPDATE
      `
      const er = await tx.eR.findUnique({ where: { id: erId } })
      if (!er) throw new NotFoundException('ER não encontrado')
      if (!er.isDayOpen) throw new ConflictException('A operação do dia já está encerrada')

      const pendingTickets = await tx.ticket.count({
        where: {
          erId,
          queue: { businessDate },
          state: {
            in: [TicketState.WAITING, TicketState.CALLING, TicketState.PAUSED],
          },
        },
      })
      if (pendingTickets > 0) {
        throw new ConflictException(
          'Não é possível encerrar a operação enquanto houver senhas aguardando, em chamada ou pausadas',
        )
      }

      await this._forceFinishInServiceTickets(tx, erId, businessDate, now, user)

      await tx.queue.updateMany({
        where: { erId, businessDate, closedAt: null },
        data: { closedAt: now },
      })

      const result = await tx.eR.update({
        where: { id: erId },
        data: { isDayOpen: false, dayClosedAt: now },
      })

      await tx.auditEvent.create({
        data: { eventType: 'daily_queue_closed', erId, operatorId: user.userId },
      })
      return result
    })

    this.panelGateway.emitToER(erId, 'day.closed', { closedAt: now })
    return updated
  }

  /**
   * Atendimentos que ficaram em andamento no encerramento do dia são
   * auto-finalizados (a operadora esqueceu de finalizar). Usa o evento
   * `service_force_finished`, que já é contabilizado como atendimento concluído
   * nas métricas — evitando senhas órfãs em IN_SERVICE e preservando os números.
   */
  private async _forceFinishInServiceTickets(
    tx: Prisma.TransactionClient,
    erId: string,
    businessDate: Date,
    now: Date,
    user: AuthenticatedUser,
  ): Promise<number> {
    const open = await tx.ticket.findMany({
      where: { erId, state: TicketState.IN_SERVICE, queue: { businessDate } },
      select: { id: true, counterId: true },
    })
    if (open.length === 0) return 0

    await tx.ticket.updateMany({
      where: { id: { in: open.map((ticket) => ticket.id) } },
      data: { state: TicketState.FINISHED, serviceFinishedAt: now },
    })

    const counterIds = [
      ...new Set(
        open
          .map((ticket) => ticket.counterId)
          .filter((counterId): counterId is string => Boolean(counterId)),
      ),
    ]
    if (counterIds.length > 0) {
      await tx.counter.updateMany({
        where: { id: { in: counterIds } },
        data: { state: CounterState.ACTIVE },
      })
    }

    await tx.auditEvent.createMany({
      data: open.map((ticket) => ({
        eventType: 'service_force_finished',
        erId,
        ticketId: ticket.id,
        operatorId: user.userId,
        metadata: { reason: 'day_close', counterId: ticket.counterId },
      })),
    })

    return open.length
  }

  private _assertERAccess(erId: string, user: AuthenticatedUser) {
    if (user.role === Role.ADMIN) return
    if (user.role !== Role.MANAGER || !user.erId || user.erId !== erId) {
      throw new ForbiddenException('Não é possível gerenciar outro ER')
    }
  }
}