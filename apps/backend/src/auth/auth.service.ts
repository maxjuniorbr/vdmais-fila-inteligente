import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import { EntryChannel, Prisma, RepresentativeKind, Role } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { StaffLoginDto } from './dto/staff-login.dto'
import { GuestEntryDto } from './dto/guest-entry.dto'
import { AuditLogService } from '../audit-log/audit-log.service'
import { AuthenticatedUser } from '../common/authenticated-user'
import { normalizeReCode, onlyDigits } from '../common/representative-identifiers'
import { getBusinessDayRange } from '../common/business-date'
import { QueueEntryTokenService } from './queue-entry-token.service'
import { LoginThrottleService } from './login-throttle.service'

const BCRYPT_ROUNDS = 12

// Floor for the representative session so a login moments before midnight still
// yields a usable (if short) token instead of an already-expired one.
const MIN_RE_SESSION_SECONDS = 60

// Compared against on the "account not found" path so a missing account costs the
// same time as a wrong password — without it, the timing gap (no bcrypt run when
// the lookup misses) leaks which CPFs/e-mails are registered.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('vdmais-timing-equalizer', BCRYPT_ROUNDS)

// Key the per-credential brute-force lock by the targeted account, normalized so
// formatting variants (e.g. "111.222.333-44" vs "11122233344") can't dodge it.
// An 11-digit value is treated as a CPF; anything else as a RE code.
function representativeLoginKey(credential: string): string {
  const digits = onlyDigits(credential)
  return digits.length === 11 ? `re-cpf:${digits}` : `re-code:${normalizeReCode(credential)}`
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly auditLog: AuditLogService,
    private readonly queueEntryTokens: QueueEntryTokenService,
    private readonly loginThrottle: LoginThrottleService,
  ) {}

  async register(dto: RegisterDto) {
    const entry = this._resolveQueueEntry(dto)
    const rep = await this.createRepresentative(dto, { erId: dto.erId })
    await this.auditLog.logIfERExists({
      eventType: 'queue_entry_started',
      erId: entry.erId,
      representativeId: rep.id,
      metadata: { entryChannel: entry.entryChannel },
    })
    return this._sign(
      rep.id,
      Role.REPRESENTATIVE,
      entry.erId,
      undefined,
      undefined,
      entry.entryChannel,
      this._entrySessionTtlSeconds(entry),
    )
  }

  async createRepresentative(
    dto: RegisterDto,
    context: { erId?: string; actor?: AuthenticatedUser } = {},
  ) {
    const normalized = {
      fullName: dto.fullName.trim().replace(/\s+/g, ' '),
      cpf: onlyDigits(dto.cpf),
      phone: onlyDigits(dto.phone),
      reCode: normalizeReCode(dto.reCode),
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

  async guestEntry(dto: GuestEntryDto) {
    const entry = this._resolveQueueEntry(dto)

    const er = await this.prisma.eR.findUnique({
      where: { id: entry.erId },
      select: { guestEntryEnabled: true },
    })
    if (!er?.guestEntryEnabled) {
      throw new ForbiddenException('Entrada como convidada não está habilitada neste espaço')
    }

    const fullName = `${dto.firstName} ${dto.lastName}`.trim().replace(/\s+/g, ' ')
    const guest = await this._resolveGuest(fullName, onlyDigits(dto.phone))

    await this.auditLog.logIfERExists({
      eventType: 'queue_entry_started',
      erId: entry.erId,
      representativeId: guest.id,
      metadata: { entryChannel: entry.entryChannel, guest: true },
    })

    return this._sign(
      guest.id,
      Role.REPRESENTATIVE,
      entry.erId,
      undefined,
      undefined,
      entry.entryChannel,
      this._entrySessionTtlSeconds(entry),
    )
  }

  // The phone is the guest's identity: same phone → same person → same record
  // (and therefore the same active ticket via the per-representative dedup).
  private async _resolveGuest(fullName: string, phone: string): Promise<{ id: string }> {
    const existing = await this.prisma.representative.findUnique({ where: { phone } })
    if (existing) {
      if (existing.kind !== RepresentativeKind.GUEST) {
        // Typing a registered RE's phone must not assume her identity nor leak
        // her name; her path is the password login.
        throw new ConflictException(
          'Este telefone pertence a um cadastro. Entre com CPF ou código de RE e senha.',
        )
      }
      // Same phone is the same person; refreshing the name lets a re-scan fix a typo.
      if (existing.fullName !== fullName) {
        return this.prisma.representative.update({
          where: { id: existing.id },
          data: { fullName },
        })
      }
      return existing
    }

    try {
      return await this.prisma.representative.create({
        data: { kind: RepresentativeKind.GUEST, fullName, phone },
      })
    } catch (error) {
      // Two first entries racing on the same phone: the loser reuses the winner's record.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this._resolveGuest(fullName, phone)
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
    const throttleKey = representativeLoginKey(credential)
    this.loginThrottle.assertNotLocked(throttleKey)

    const rep = await this.prisma.representative.findFirst({
      where: {
        OR: [{ cpf: onlyDigits(credential) }, { reCode: normalizeReCode(credential) }],
      },
    })

    // Use same error message regardless of which field is wrong (security).
    // A guest record has no password, so it must fail exactly like an unknown
    // account (same message and timing), never reach the hash comparison.
    if (!rep?.passwordHash) {
      await bcrypt.compare(dto.password, DUMMY_PASSWORD_HASH)
      this.loginThrottle.registerFailure(throttleKey)
      await this._recordAuthenticationFailure(dto.erId, 'representative', rep?.id)
      throw new UnauthorizedException('Credenciais inválidas')
    }

    const valid = await bcrypt.compare(dto.password, rep.passwordHash)
    if (!valid) {
      this.loginThrottle.registerFailure(throttleKey)
      await this._recordAuthenticationFailure(dto.erId, 'representative', rep.id)
      throw new UnauthorizedException('Credenciais inválidas')
    }

    this.loginThrottle.clear(throttleKey)

    if (dto.erId) {
      await this.auditLog.logIfERExists({
        eventType: 'representative_authenticated',
        erId: dto.erId,
        representativeId: rep.id,
      })
    }

    await this.auditLog.logIfERExists({
      eventType: 'queue_entry_started',
      erId: entry.erId,
      representativeId: rep.id,
      metadata: { entryChannel: entry.entryChannel },
    })

    return this._sign(
      rep.id,
      Role.REPRESENTATIVE,
      entry.erId,
      undefined,
      undefined,
      entry.entryChannel,
      this._entrySessionTtlSeconds(entry),
    )
  }

  async staffLogin(dto: StaffLoginDto) {
    const email = dto.email.trim().toLowerCase()
    const throttleKey = `staff:${email}`
    this.loginThrottle.assertNotLocked(throttleKey)

    const operator = await this.prisma.operator.findUnique({ where: { email } })
    if (!operator) {
      await bcrypt.compare(dto.password, DUMMY_PASSWORD_HASH)
      this.loginThrottle.registerFailure(throttleKey)
      throw new UnauthorizedException('Credenciais inválidas')
    }

    const valid = await bcrypt.compare(dto.password, operator.passwordHash)
    if (!valid) {
      this.loginThrottle.registerFailure(throttleKey)
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

    this.loginThrottle.clear(throttleKey)

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

  // The RE session is scoped to the current business day: the queue, its tickets
  // and the day's operation all reset at rollover (day_rollover force-closes
  // pending tickets), so a session is useless past midnight. We expire it at the
  // end of the business day, capped by the entry token, with a small floor so a
  // near-midnight login still gets a usable session (the floor may push the token
  // up to MIN_RE_SESSION_SECONDS past those bounds — a deliberate, benign window).
  private _entrySessionTtlSeconds(entry: { exp: number }): number {
    const nowSeconds = Math.floor(Date.now() / 1000)
    const endOfDaySeconds = Math.floor(getBusinessDayRange().end.getTime() / 1000)
    const sessionExpiry = Math.min(endOfDaySeconds, entry.exp)
    return Math.max(MIN_RE_SESSION_SECONDS, sessionExpiry - nowSeconds)
  }

  private _sign(
    userId: string,
    role: Role,
    erId?: string,
    name?: string,
    sessionVersion?: number,
    entryChannel?: EntryChannel,
    expiresInSeconds?: number,
  ) {
    const payload = { sub: userId, userId, role, erId, sv: sessionVersion, entryChannel }
    // Representative tokens are day-scoped (see _entrySessionTtlSeconds); staff
    // tokens keep the global JWT_EXPIRES_IN.
    const access_token =
      expiresInSeconds === undefined
        ? this.jwt.sign(payload)
        : this.jwt.sign(payload, { expiresIn: expiresInSeconds })
    return { access_token, user: { id: userId, role, erId, name, entryChannel } }
  }
}
