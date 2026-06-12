import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import { EntryChannel, Prisma, Role } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { StaffLoginDto } from './dto/staff-login.dto'
import { AuditLogService } from '../audit-log/audit-log.service'
import { AuthenticatedUser } from '../common/authenticated-user'
import { QueueEntryTokenService } from './queue-entry-token.service'

const BCRYPT_ROUNDS = 12

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly auditLog: AuditLogService,
    private readonly queueEntryTokens: QueueEntryTokenService,
  ) {}

  async register(dto: RegisterDto) {
    const entry = this._resolveQueueEntry(dto)
    const rep = await this.createRepresentative(dto, { erId: dto.erId })
    return this._sign(
      rep.id,
      Role.REPRESENTATIVE,
      entry.erId,
      undefined,
      undefined,
      entry.entryChannel,
    )
  }

  async createRepresentative(
    dto: RegisterDto,
    context: { erId?: string; actor?: AuthenticatedUser } = {},
  ) {
    const normalized = {
      fullName: dto.fullName.trim().replace(/\s+/g, ' '),
      cpf: dto.cpf.replace(/\D/g, ''),
      phone: dto.phone.replace(/\D/g, ''),
      reCode: dto.reCode.trim().toUpperCase(),
    }

    const existing = await this.prisma.representative.findFirst({
      where: {
        OR: [{ cpf: normalized.cpf }, { phone: normalized.phone }, { reCode: normalized.reCode }],
      },
    })

    if (existing) {
      // Public self-registration must not confirm which identifier already
      // exists (PII enumeration). The assisted flow (authenticated staff) keeps
      // the specific message because it is operationally useful and not public.
      if (!context.actor) {
        throw new ConflictException('Não foi possível concluir o cadastro com os dados informados')
      }
      if (existing.cpf === normalized.cpf) throw new ConflictException('CPF já cadastrado')
      if (existing.phone === normalized.phone) {
        throw new ConflictException('Telefone já cadastrado')
      }
      throw new ConflictException('Código de RE já cadastrado')
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS)

    try {
      const rep = await this.prisma.representative.create({
        data: {
          ...normalized,
          birthDate: new Date(dto.birthDate),
          passwordHash,
        },
      })

      if (context.erId) {
        await this.auditLog.logIfERExists({
          eventType: 'representative_created_or_updated',
          erId: context.erId,
          representativeId: rep.id,
          operatorId: context.actor?.userId,
          metadata: {
            source: context.actor ? 'assisted_checkin' : 'self_registration',
          },
        })
      }

      return {
        id: rep.id,
        fullName: rep.fullName,
        cpf: rep.cpf,
        phone: rep.phone,
        reCode: rep.reCode,
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Representante já cadastrada')
      }
      throw error
    }
  }

  async login(dto: LoginDto) {
    const entry = this._resolveQueueEntry(dto)
    if (dto.erId) {
      await this.auditLog.logIfERExists({
        eventType: 'representative_login_started',
        erId: dto.erId,
      })
    }

    const credential = dto.credential.trim()
    const normalizedCpf = credential.replace(/\D/g, '')
    const rep = await this.prisma.representative.findFirst({
      where: {
        OR: [{ cpf: normalizedCpf }, { reCode: credential.toUpperCase() }],
      },
    })

    // Use same error message regardless of which field is wrong (security)
    if (!rep) {
      await this._recordAuthenticationFailure(dto.erId, 'representative')
      throw new UnauthorizedException('Credenciais inválidas')
    }

    const valid = await bcrypt.compare(dto.password, rep.passwordHash)
    if (!valid) {
      await this._recordAuthenticationFailure(dto.erId, 'representative', rep.id)
      throw new UnauthorizedException('Credenciais inválidas')
    }

    if (dto.erId) {
      await this.auditLog.logIfERExists({
        eventType: 'representative_authenticated',
        erId: dto.erId,
        representativeId: rep.id,
      })
    }

    return this._sign(
      rep.id,
      Role.REPRESENTATIVE,
      entry.erId,
      undefined,
      undefined,
      entry.entryChannel,
    )
  }

  async staffLogin(dto: StaffLoginDto) {
    const operator = await this.prisma.operator.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    })
    if (!operator) throw new UnauthorizedException('Credenciais inválidas')

    const valid = await bcrypt.compare(dto.password, operator.passwordHash)
    if (!valid) {
      if (operator.erId) {
        await this.auditLog.log({
          eventType: 'authentication_failed',
          erId: operator.erId,
          operatorId: operator.id,
          metadata: { actorType: 'operator' },
        })
      }
      throw new UnauthorizedException('Credenciais inválidas')
    }

    if (operator.erId) {
      await this.auditLog.log({
        eventType: 'operator_logged_in',
        erId: operator.erId,
        operatorId: operator.id,
        metadata: { role: operator.role },
      })
    }

    return this._sign(operator.id, operator.role, operator.erId ?? undefined, operator.name, operator.sessionVersion)
  }

  private async _recordAuthenticationFailure(
    erId: string | undefined,
    actorType: string,
    representativeId?: string,
  ) {
    if (!erId) return
    await this.auditLog.logIfERExists({
      eventType: 'authentication_failed',
      erId,
      representativeId,
      metadata: { actorType },
    })
  }

  private _resolveQueueEntry(dto: {
    erId?: string
    entryChannel?: EntryChannel
    entryToken?: string
  }) {
    if (!dto.erId || !dto.entryChannel || !dto.entryToken) {
      throw new UnauthorizedException('Acesso à fila inválido ou expirado')
    }
    return this.queueEntryTokens.verify(dto.entryToken, dto.erId, dto.entryChannel)
  }

  private _sign(
    userId: string,
    role: Role,
    erId?: string,
    name?: string,
    sessionVersion?: number,
    entryChannel?: EntryChannel,
  ) {
    return {
      access_token: this.jwt.sign({
        sub: userId,
        userId,
        role,
        erId,
        sv: sessionVersion,
        entryChannel,
      }),
      user: { id: userId, role, erId, name, entryChannel },
    }
  }
}
