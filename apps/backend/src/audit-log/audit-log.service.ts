import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

interface LogParams {
  eventType: string
  erId: string
  ticketId?: string
  representativeId?: string
  operatorId?: string
  metadata?: Prisma.InputJsonObject
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: LogParams) {
    return this.prisma.auditEvent.create({
      data: {
        eventType: params.eventType,
        erId: params.erId,
        ticketId: params.ticketId,
        representativeId: params.representativeId,
        operatorId: params.operatorId,
        metadata: params.metadata ?? {},
      },
    })
  }

  async logIfERExists(params: LogParams) {
    const exists = await this.prisma.eR.findUnique({
      where: { id: params.erId },
      select: { id: true },
    })
    if (!exists) return null
    return this.log(params)
  }
}
