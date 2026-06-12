import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { EntryChannel, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { AuditLogService } from '../audit-log/audit-log.service'
import { PanelTokenService } from '../panel/panel-token.service'
import { AuthenticatedUser } from '../common/authenticated-user'
import { CreateERDto } from './dto/create-er.dto'
import { UpdateERDto } from './dto/update-er.dto'
import { CreateCounterDto } from './dto/create-counter.dto'
import { CreateStaffDto } from './dto/create-staff.dto'
import { QueueEntryTokenService } from '../auth/queue-entry-token.service'

const BCRYPT_ROUNDS = 12

const STAFF_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
} as const

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly panelTokens: PanelTokenService,
    private readonly queueEntryTokens: QueueEntryTokenService,
  ) {}

  listERs() {
    return this.prisma.eR.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        qrCodeUrl: true,
        isDayOpen: true,
        pauseTimeoutSeconds: true,
        callTimeoutSeconds: true,
        createdAt: true,
        _count: { select: { counters: true, operators: true } },
      },
    })
  }

  async getER(erId: string) {
    const er = await this.prisma.eR.findUnique({
      where: { id: erId },
      include: {
        counters: { orderBy: { number: 'asc' } },
        operators: { orderBy: { createdAt: 'asc' }, select: STAFF_SELECT },
      },
    })
    if (!er) throw new NotFoundException('ER não encontrado')
    const { panelTokenHash, ...rest } = er
    return {
      ...rest,
      hasPanelToken: panelTokenHash !== null,
      entryAccess: {
        qrCode: this.queueEntryTokens.issue(erId, EntryChannel.QR_CODE),
        link: this.queueEntryTokens.issue(erId, EntryChannel.LINK),
      },
    }
  }

  async createER(dto: CreateERDto, user: AuthenticatedUser) {
    const er = await this.prisma.eR.create({
      data: {
        name: dto.name.trim(),
        qrCodeUrl: dto.qrCodeUrl,
        ...(dto.pauseTimeoutSeconds === undefined
          ? {}
          : { pauseTimeoutSeconds: dto.pauseTimeoutSeconds }),
        ...(dto.callTimeoutSeconds === undefined
          ? {}
          : { callTimeoutSeconds: dto.callTimeoutSeconds }),
      },
    })
    await this.auditLog.log({
      eventType: 'er_created',
      erId: er.id,
      operatorId: user.userId,
      metadata: { name: er.name },
    })
    return er
  }

  async updateER(erId: string, dto: UpdateERDto, user: AuthenticatedUser) {
    await this._assertERExists(erId)
    const er = await this.prisma.eR.update({
      where: { id: erId },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
        ...(dto.qrCodeUrl === undefined ? {} : { qrCodeUrl: dto.qrCodeUrl }),
        ...(dto.pauseTimeoutSeconds === undefined
          ? {}
          : { pauseTimeoutSeconds: dto.pauseTimeoutSeconds }),
        ...(dto.callTimeoutSeconds === undefined
          ? {}
          : { callTimeoutSeconds: dto.callTimeoutSeconds }),
      },
    })
    await this.auditLog.log({
      eventType: 'er_updated',
      erId,
      operatorId: user.userId,
      metadata: { name: er.name },
    })
    return er
  }

  async createCounter(erId: string, dto: CreateCounterDto, user: AuthenticatedUser) {
    await this._assertERExists(erId)
    try {
      const counter = await this.prisma.counter.create({
        data: { erId, number: dto.number },
      })
      await this.auditLog.log({
        eventType: 'counter_created',
        erId,
        operatorId: user.userId,
        metadata: { counterId: counter.id, number: counter.number },
      })
      return counter
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Este número de caixa já existe neste ER')
      }
      throw error
    }
  }

  async createStaff(erId: string, dto: CreateStaffDto, user: AuthenticatedUser) {
    await this._assertERExists(erId)
    const email = dto.email.trim().toLowerCase()
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS)

    try {
      const staff = await this.prisma.operator.create({
        data: {
          erId,
          name: dto.name.trim(),
          email,
          passwordHash,
          role: dto.role,
        },
        select: STAFF_SELECT,
      })
      await this.auditLog.log({
        eventType: 'staff_account_created',
        erId,
        operatorId: user.userId,
        metadata: { staffId: staff.id, role: staff.role },
      })
      return staff
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('E-mail já cadastrado')
      }
      throw error
    }
  }

  async rotatePanelToken(erId: string, user: AuthenticatedUser) {
    await this._assertERExists(erId)
    const token = await this.panelTokens.rotate(erId)
    await this.auditLog.log({
      eventType: 'panel_token_rotated',
      erId,
      operatorId: user.userId,
    })
    return { token }
  }

  async revokePanelToken(erId: string, user: AuthenticatedUser) {
    await this._assertERExists(erId)
    await this.panelTokens.revoke(erId)
    await this.auditLog.log({
      eventType: 'panel_token_revoked',
      erId,
      operatorId: user.userId,
    })
    return { revoked: true }
  }

  private async _assertERExists(erId: string) {
    const er = await this.prisma.eR.findUnique({ where: { id: erId }, select: { id: true } })
    if (!er) throw new NotFoundException('ER não encontrado')
  }
}
