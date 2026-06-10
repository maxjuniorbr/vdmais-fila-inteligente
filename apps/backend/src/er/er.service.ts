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
import { Role, TicketState } from '@prisma/client'

@Injectable()
export class ERService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly panelGateway: PanelGateway,
  ) {}

  async findById(erId: string) {
    const er = await this.prisma.eR.findUnique({ where: { id: erId } })
    if (!er) throw new NotFoundException('ER não encontrado')
    return er
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
      if (er.isDayOpen) throw new ConflictException('A operação do dia já está aberta')

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
        data: { eventType: 'daily_queue_opened', erId, operatorId: user.userId },
      })
      return result
    })

    this.panelGateway.emitToER(erId, 'day.opened', { openedAt: now })
    return updated
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

  private _assertERAccess(erId: string, user: AuthenticatedUser) {
    if (user.role === Role.ADMIN) return
    if (user.role !== Role.MANAGER || !user.erId || user.erId !== erId) {
      throw new ForbiddenException('Não é possível gerenciar outro ER')
    }
  }
}
