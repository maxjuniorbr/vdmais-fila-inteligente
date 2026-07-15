import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { EntryChannel, Prisma, RepresentativeKind, Role } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { AuditLogService } from '../../audit-log/audit-log.service'
import { PrismaService } from '../../prisma/prisma.service'
import { getBusinessDayRange } from '../../common/business-date'
import { AuthService } from '../auth.service'
import { QueueEntryTokenService } from '../queue-entry-token.service'
import { LoginThrottleService } from '../login-throttle.service'

jest.mock('bcrypt')

const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>

const prisma = {
  representative: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  operator: { findUnique: jest.fn() },
  eR: { findUnique: jest.fn() },
}

const jwt = {
  sign: jest.fn((_payload?: unknown, _options?: { expiresIn?: number }) => 'signed-token'),
}
const auditLog = { log: jest.fn(), logIfERExists: jest.fn() }
// Entry tokens are valid 24h on both channels; the mock returns a future exp so
// the day-scoped session (end of business day) is always the binding limit.
const ENTRY_TOKEN_TTL_SECONDS = 24 * 60 * 60
const entryTokenExp = () => Math.floor(Date.now() / 1000) + ENTRY_TOKEN_TTL_SECONDS

const queueEntryTokens = {
  verify: jest.fn((token, erId, entryChannel) => ({
    token,
    erId,
    entryChannel,
    exp: entryTokenExp(),
  })),
}

const registerDto = {
  fullName: '  Ana  Souza ',
  cpf: '529.982.247-25',
  phone: '(11) 99999-0000',
  birthDate: '1990-01-01',
  reCode: 're0001',
  password: 'Teste@123',
  erId: 'er-1',
  entryToken: 'entry-token',
  entryChannel: EntryChannel.QR_CODE,
}

describe('AuthService', () => {
  let service: AuthService

  beforeEach(() => {
    jest.resetAllMocks()
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      auditLog as unknown as AuditLogService,
      queueEntryTokens as unknown as QueueEntryTokenService,
      new LoginThrottleService(),
    )
    mockedBcrypt.hash.mockResolvedValue('hashed' as never)
    mockedBcrypt.compare.mockResolvedValue(true as never)
    jwt.sign.mockReturnValue('signed-token')
    queueEntryTokens.verify.mockImplementation((token, erId, entryChannel) => ({
      token,
      erId,
      entryChannel,
      exp: entryTokenExp(),
    }))
  })

  describe('createRepresentative', () => {
    it('normalizes data, persists and audits a self registration', async () => {
      prisma.representative.findFirst.mockResolvedValue(null)
      prisma.representative.create.mockResolvedValue({
        id: 're-1',
        fullName: 'Ana Souza',
        cpf: '52998224725',
        phone: '11999990000',
        reCode: 'RE0001',
      })

      const result = await service.createRepresentative(registerDto, { erId: 'er-1' })

      expect(prisma.representative.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fullName: 'Ana Souza',
            cpf: '52998224725',
            phone: '11999990000',
            reCode: 'RE0001',
          }),
        }),
      )
      expect(auditLog.logIfERExists).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { source: 'self_registration' } }),
      )
      expect(result.id).toBe('re-1')
    })

    it('rejects a duplicated CPF', async () => {
      prisma.representative.findFirst.mockResolvedValue({ cpf: '52998224725' })
      await expect(service.createRepresentative(registerDto)).rejects.toThrow(
        'Não foi possível concluir o cadastro com os dados informados',
      )
    })

    it('hides which identifier exists on public self-registration', async () => {
      prisma.representative.findFirst.mockResolvedValue({ cpf: 'x', phone: '11999990000' })
      await expect(service.createRepresentative(registerDto)).rejects.toThrow(
        'Não foi possível concluir o cadastro com os dados informados',
      )
    })

    it('keeps the specific message on the assisted (staff) flow', async () => {
      const actor = { userId: 'att-1', role: Role.ATTENDANT, erId: 'er-1' }
      prisma.representative.findFirst.mockResolvedValue({ cpf: '52998224725' })
      await expect(
        service.createRepresentative(registerDto, { erId: 'er-1', actor }),
      ).rejects.toThrow('CPF já cadastrado')

      prisma.representative.findFirst.mockResolvedValue({ cpf: 'x', phone: '11999990000' })
      await expect(
        service.createRepresentative(registerDto, { erId: 'er-1', actor }),
      ).rejects.toThrow('Telefone já cadastrado')

      prisma.representative.findFirst.mockResolvedValue({ cpf: 'x', phone: 'y', reCode: 'RE0001' })
      await expect(
        service.createRepresentative(registerDto, { erId: 'er-1', actor }),
      ).rejects.toThrow('Código de RE já cadastrado')
    })

    it('audits an assisted check-in when an authenticated staff registers', async () => {
      const actor = { userId: 'att-1', role: Role.ATTENDANT, erId: 'er-1' }
      prisma.representative.findFirst.mockResolvedValue(null)
      prisma.representative.create.mockResolvedValue({
        id: 're-1',
        fullName: 'Ana Souza',
        cpf: '52998224725',
        phone: '11999990000',
        reCode: 'RE0001',
      })

      const result = await service.createRepresentative(registerDto, { erId: 'er-1', actor })

      expect(auditLog.logIfERExists).toHaveBeenCalledWith(
        expect.objectContaining({
          operatorId: 'att-1',
          metadata: { source: 'assisted_checkin' },
        }),
      )
      expect(result.id).toBe('re-1')
    })

    it('persists without auditing when no erId context is provided', async () => {
      prisma.representative.findFirst.mockResolvedValue(null)
      prisma.representative.create.mockResolvedValue({
        id: 're-1',
        fullName: 'Ana Souza',
        cpf: '52998224725',
        phone: '11999990000',
        reCode: 'RE0001',
      })

      const result = await service.createRepresentative(registerDto)

      expect(result.id).toBe('re-1')
      expect(auditLog.logIfERExists).not.toHaveBeenCalled()
    })

    it('translates a Prisma unique violation into a conflict', async () => {
      prisma.representative.findFirst.mockResolvedValue(null)
      prisma.representative.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      )
      await expect(service.createRepresentative(registerDto)).rejects.toThrow(ConflictException)
    })

    it('rethrows non-unique persistence errors', async () => {
      prisma.representative.findFirst.mockResolvedValue(null)
      prisma.representative.create.mockRejectedValue(new Error('db down'))
      await expect(service.createRepresentative(registerDto)).rejects.toThrow('db down')
    })
  })

  describe('register', () => {
    it('creates the representative and signs a token', async () => {
      prisma.representative.findFirst.mockResolvedValue(null)
      prisma.representative.create.mockResolvedValue({
        id: 're-1',
        fullName: 'Ana Souza',
        cpf: '52998224725',
        phone: '11999990000',
        reCode: 'RE0001',
      })

      const result = await service.register(registerDto)
      expect(result.access_token).toBe('signed-token')
      expect(result.user.role).toBe(Role.REPRESENTATIVE)
    })

    it('binds the representative token to a validated queue entry', async () => {
      prisma.representative.findFirst.mockResolvedValue(null)
      prisma.representative.create.mockResolvedValue({
        id: 're-1',
        fullName: 'Ana Souza',
        cpf: '52998224725',
        phone: '11999990000',
        reCode: 'RE0001',
      })

      await service.register({
        ...registerDto,
        entryToken: 'entry-token',
        entryChannel: EntryChannel.QR_CODE,
      })

      expect(queueEntryTokens.verify).toHaveBeenCalledWith(
        'entry-token',
        'er-1',
        EntryChannel.QR_CODE,
      )
      // The QR session is day-scoped (expires at end of the business day), well
      // under the entry token's life and the global JWT default.
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ erId: 'er-1', entryChannel: EntryChannel.QR_CODE }),
        expect.objectContaining({ expiresIn: expect.any(Number) }),
      )
      const qrCalls = jwt.sign.mock.calls
      const qrExpiresIn = qrCalls[qrCalls.length - 1]?.[1]?.expiresIn
      expect(qrExpiresIn).toBeGreaterThan(0)
      expect(qrExpiresIn).toBeLessThanOrEqual(24 * 60 * 60)
      expect(auditLog.logIfERExists).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'queue_entry_started',
          erId: 'er-1',
          metadata: { entryChannel: EntryChannel.QR_CODE },
        }),
      )
    })

    it('rejects an incomplete queue entry context', async () => {
      await expect(
        service.register({ ...registerDto, entryChannel: undefined }),
      ).rejects.toThrow(UnauthorizedException)
    })

    it('expires the representative session at the end of the business day', async () => {
      jest.useFakeTimers({ now: new Date('2026-06-24T15:00:00.000Z') })
      try {
        prisma.representative.findFirst.mockResolvedValue(null)
        prisma.representative.create.mockResolvedValue({
          id: 're-1',
          fullName: 'Ana Souza',
          cpf: '52998224725',
          phone: '11999990000',
          reCode: 'RE0001',
        })

        await service.register({ ...registerDto, entryChannel: EntryChannel.QR_CODE })

        const calls = jwt.sign.mock.calls
        const expiresIn = calls[calls.length - 1]?.[1]?.expiresIn
        const expected =
          Math.floor(getBusinessDayRange().end.getTime() / 1000) - Math.floor(Date.now() / 1000)
        // End of the business day binds here (sooner than the entry token's 24h).
        expect(expiresIn).toBe(expected)
      } finally {
        jest.useRealTimers()
      }
    })

    it('caps the representative session at the entry token when it expires before end of day', async () => {
      jest.useFakeTimers({ now: new Date('2026-06-24T15:00:00.000Z') })
      try {
        prisma.representative.findFirst.mockResolvedValue(null)
        prisma.representative.create.mockResolvedValue({
          id: 're-1',
          fullName: 'Ana Souza',
          cpf: '52998224725',
          phone: '11999990000',
          reCode: 'RE0001',
        })
        // Entry token expires in 1h — sooner than the end of the business day
        // (~12h away at this instant), so the entry token is the binding limit.
        const nowSeconds = Math.floor(Date.now() / 1000)
        queueEntryTokens.verify.mockReturnValue({
          token: 'entry-token',
          erId: 'er-1',
          entryChannel: EntryChannel.QR_CODE,
          exp: nowSeconds + 3600,
        })

        await service.register({ ...registerDto, entryChannel: EntryChannel.QR_CODE })

        const calls = jwt.sign.mock.calls
        const expiresIn = calls[calls.length - 1]?.[1]?.expiresIn
        expect(expiresIn).toBe(3600)
      } finally {
        jest.useRealTimers()
      }
    })
  })

  describe('guestEntry', () => {
    const guestEntryDto = {
      firstName: ' Ana ',
      lastName: ' de  Souza ',
      phone: '11999990000',
      erId: 'er-1',
      entryChannel: EntryChannel.QR_CODE,
      entryToken: 'entry-token',
    }

    beforeEach(() => {
      prisma.eR.findUnique.mockResolvedValue({ guestEntryEnabled: true })
    })

    it('creates a guest with normalized name and signs a day-scoped session', async () => {
      prisma.representative.findUnique.mockResolvedValue(null)
      prisma.representative.create.mockResolvedValue({ id: 'guest-1' })

      const result = await service.guestEntry(guestEntryDto)

      expect(prisma.representative.create).toHaveBeenCalledWith({
        data: {
          kind: RepresentativeKind.GUEST,
          fullName: 'Ana de Souza',
          phone: '11999990000',
        },
      })
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'guest-1',
          role: Role.REPRESENTATIVE,
          erId: 'er-1',
          entryChannel: EntryChannel.QR_CODE,
        }),
        expect.objectContaining({ expiresIn: expect.any(Number) }),
      )
      expect(auditLog.logIfERExists).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'queue_entry_started',
          erId: 'er-1',
          representativeId: 'guest-1',
          metadata: { entryChannel: EntryChannel.QR_CODE, guest: true },
        }),
      )
      expect(result.access_token).toBe('signed-token')
    })

    it('reuses the guest matched by phone and refreshes the name', async () => {
      prisma.representative.findUnique.mockResolvedValue({
        id: 'guest-1',
        kind: RepresentativeKind.GUEST,
        fullName: 'Ana Sousa',
      })
      prisma.representative.update.mockResolvedValue({ id: 'guest-1' })

      await service.guestEntry(guestEntryDto)

      expect(prisma.representative.update).toHaveBeenCalledWith({
        where: { id: 'guest-1' },
        data: { fullName: 'Ana de Souza' },
      })
      expect(prisma.representative.create).not.toHaveBeenCalled()
    })

    it('keeps the record untouched when the same guest re-enters with the same name', async () => {
      prisma.representative.findUnique.mockResolvedValue({
        id: 'guest-1',
        kind: RepresentativeKind.GUEST,
        fullName: 'Ana de Souza',
      })

      const result = await service.guestEntry(guestEntryDto)

      expect(prisma.representative.update).not.toHaveBeenCalled()
      expect(prisma.representative.create).not.toHaveBeenCalled()
      expect(result.access_token).toBe('signed-token')
    })

    it('rejects a registered representative phone without assuming her identity', async () => {
      prisma.representative.findUnique.mockResolvedValue({
        id: 're-9',
        kind: RepresentativeKind.REGISTERED,
        fullName: 'Maria Registrada',
      })

      const error = (await service.guestEntry(guestEntryDto).catch((e: Error) => e)) as Error

      expect(error).toBeInstanceOf(ConflictException)
      // The conflict must not leak who owns the phone.
      expect(error.message).not.toContain('Maria')
      expect(jwt.sign).not.toHaveBeenCalled()
    })

    it('rejects guest entry when the ER has it disabled', async () => {
      prisma.eR.findUnique.mockResolvedValue({ guestEntryEnabled: false })

      await expect(service.guestEntry(guestEntryDto)).rejects.toThrow(ForbiddenException)
      expect(prisma.representative.findUnique).not.toHaveBeenCalled()
    })

    it('rejects guest entry when the ER does not exist', async () => {
      prisma.eR.findUnique.mockResolvedValue(null)

      await expect(service.guestEntry(guestEntryDto)).rejects.toThrow(ForbiddenException)
    })

    it('rejects guest entry when the queue entry token is invalid', async () => {
      queueEntryTokens.verify.mockImplementation(() => {
        throw new UnauthorizedException('Acesso à fila inválido ou expirado')
      })

      await expect(service.guestEntry(guestEntryDto)).rejects.toThrow(UnauthorizedException)
      expect(prisma.representative.create).not.toHaveBeenCalled()
    })

    it('recovers from a same-phone create race by reusing the winner', async () => {
      prisma.representative.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'guest-1',
          kind: RepresentativeKind.GUEST,
          fullName: 'Ana de Souza',
        })
      prisma.representative.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '6.19.3',
        }),
      )

      const result = await service.guestEntry(guestEntryDto)

      expect(result.access_token).toBe('signed-token')
      expect(prisma.representative.findUnique).toHaveBeenCalledTimes(2)
    })
  })

  describe('login', () => {
    it('authenticates a representative and audits the success', async () => {
      prisma.representative.findFirst.mockResolvedValue({
        id: 're-1',
        passwordHash: 'hashed',
      })

      const result = await service.login({
        credential: 'RE0001',
        password: 'Teste@123',
        erId: 'er-1',
        entryToken: 'entry-token',
        entryChannel: EntryChannel.QR_CODE,
      })

      expect(result.access_token).toBe('signed-token')
      expect(auditLog.logIfERExists).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'representative_authenticated' }),
      )
    })

    it('validates a signed queue entry before authenticating', async () => {
      prisma.representative.findFirst.mockResolvedValue({
        id: 're-1',
        passwordHash: 'hashed',
      })

      await service.login({
        credential: 'RE0001',
        password: 'Teste@123',
        erId: 'er-1',
        entryToken: 'entry-token',
        entryChannel: EntryChannel.LINK,
      })

      expect(queueEntryTokens.verify).toHaveBeenCalledWith(
        'entry-token',
        'er-1',
        EntryChannel.LINK,
      )
      // The LINK session is day-scoped (expires at end of the business day), not
      // the global 7-day JWT default.
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ erId: 'er-1', entryChannel: EntryChannel.LINK }),
        expect.objectContaining({ expiresIn: expect.any(Number) }),
      )
      const linkCalls = jwt.sign.mock.calls
      const linkExpiresIn = linkCalls[linkCalls.length - 1]?.[1]?.expiresIn
      expect(linkExpiresIn).toBeGreaterThan(0)
      expect(linkExpiresIn).toBeLessThanOrEqual(24 * 60 * 60)
      expect(auditLog.logIfERExists).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'queue_entry_started',
          erId: 'er-1',
          metadata: { entryChannel: EntryChannel.LINK },
        }),
      )
    })

    it('rejects an unknown credential', async () => {
      prisma.representative.findFirst.mockResolvedValue(null)
      await expect(
        service.login({
          credential: '00000000000',
          password: 'x',
          erId: 'er-1',
          entryToken: 'entry-token',
          entryChannel: EntryChannel.QR_CODE,
        }),
      ).rejects.toThrow(UnauthorizedException)
      expect(auditLog.logIfERExists).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'authentication_failed' }),
      )
      // Runs a bcrypt comparison even when the account is missing, so timing does
      // not reveal whether the credential exists.
      expect(mockedBcrypt.compare).toHaveBeenCalled()
    })

    it('rejects a login against a guest record exactly like an unknown account', async () => {
      prisma.representative.findFirst.mockResolvedValue({ id: 'guest-1', passwordHash: null })
      await expect(
        service.login({
          credential: '00000000000',
          password: 'x',
          erId: 'er-1',
          entryToken: 'entry-token',
          entryChannel: EntryChannel.QR_CODE,
        }),
      ).rejects.toThrow('Credenciais inválidas')
      // Same timing-equalizing bcrypt comparison as the missing-account path.
      expect(mockedBcrypt.compare).toHaveBeenCalled()
    })

    it('rejects a wrong password', async () => {
      prisma.representative.findFirst.mockResolvedValue({ id: 're-1', passwordHash: 'hashed' })
      mockedBcrypt.compare.mockResolvedValue(false as never)
      await expect(
        service.login({
          credential: 'RE0001',
          password: 'wrong',
          erId: 'er-1',
          entryToken: 'entry-token',
          entryChannel: EntryChannel.QR_CODE,
        }),
      ).rejects.toThrow(UnauthorizedException)
      // queue_entry_started marks a genuine entry — it must not fire on a failed
      // credential attempt, otherwise wrong-password retries inflate the metric.
      expect(auditLog.logIfERExists).not.toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'queue_entry_started' }),
      )
    })

    it('rejects login without a signed queue entry', async () => {
      await expect(
        service.login({ credential: 'RE0001', password: 'Teste@123', erId: 'er-1' }),
      ).rejects.toThrow('Acesso à fila inválido ou expirado')
      expect(prisma.representative.findFirst).not.toHaveBeenCalled()
    })

    it('locks the credential after repeated failures, before touching the database', async () => {
      prisma.representative.findFirst.mockResolvedValue(null)
      const attempt = () =>
        service.login({
          credential: '12345678901',
          password: 'wrong',
          erId: 'er-1',
          entryToken: 'entry-token',
          entryChannel: EntryChannel.QR_CODE,
        })

      // The first 10 failures pass through as ordinary 401s.
      for (let i = 0; i < 10; i += 1) {
        await expect(attempt()).rejects.toThrow(UnauthorizedException)
      }

      // The 11th is blocked with a 429 without even querying the database — the
      // lock is keyed by the credential, so it holds regardless of source IP.
      prisma.representative.findFirst.mockClear()
      await expect(attempt()).rejects.toThrow('Muitas tentativas')
      expect(prisma.representative.findFirst).not.toHaveBeenCalled()
    })

    it('ignores credential formatting so the lock cannot be dodged', async () => {
      prisma.representative.findFirst.mockResolvedValue(null)
      const fail = (credential: string) =>
        service.login({
          credential,
          password: 'wrong',
          erId: 'er-1',
          entryToken: 'entry-token',
          entryChannel: EntryChannel.QR_CODE,
        })

      // Same CPF, alternating formatting, must accumulate on a single bucket.
      for (let i = 0; i < 10; i += 1) {
        const credential = i % 2 === 0 ? '529.982.247-25' : '52998224725'
        await expect(fail(credential)).rejects.toThrow(UnauthorizedException)
      }
      await expect(fail('529.982.247-25')).rejects.toThrow('Muitas tentativas')
    })

    it('clears the lock after a successful login', async () => {
      prisma.representative.findFirst.mockResolvedValue(null)
      const fail = () =>
        service.login({
          credential: '12345678901',
          password: 'wrong',
          erId: 'er-1',
          entryToken: 'entry-token',
          entryChannel: EntryChannel.QR_CODE,
        })
      for (let i = 0; i < 9; i += 1) {
        await expect(fail()).rejects.toThrow(UnauthorizedException)
      }

      prisma.representative.findFirst.mockResolvedValue({ id: 're-1', passwordHash: 'hashed' })
      mockedBcrypt.compare.mockResolvedValue(true as never)
      await service.login({
        credential: '12345678901',
        password: 'Teste@123',
        erId: 'er-1',
        entryToken: 'entry-token',
        entryChannel: EntryChannel.QR_CODE,
      })

      // The successful login reset the counter, so failures start over from zero.
      prisma.representative.findFirst.mockResolvedValue(null)
      mockedBcrypt.compare.mockResolvedValue(false as never)
      await expect(fail()).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('staffLogin', () => {
    it('authenticates an operator and audits the login', async () => {
      prisma.operator.findUnique.mockResolvedValue({
        id: 'op-1',
        passwordHash: 'hashed',
        role: Role.OPERATOR,
        erId: 'er-1',
        name: 'Operadora',
        sessionVersion: 3,
      })

      const result = await service.staffLogin({ email: 'OP@x.com', password: 'Teste@123' })
      expect(result.user.name).toBe('Operadora')
      expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ sv: 3 }))
      // Staff tokens keep the global JWT_EXPIRES_IN — no per-call expiresIn override.
      const staffCalls = jwt.sign.mock.calls
      expect(staffCalls[staffCalls.length - 1]).toHaveLength(1)
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'operator_logged_in' }),
      )
    })

    it('rejects an unknown operator', async () => {
      prisma.operator.findUnique.mockResolvedValue(null)
      await expect(
        service.staffLogin({ email: 'no@x.com', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException)
      // Equalize timing: a missing operator still runs a bcrypt comparison.
      expect(mockedBcrypt.compare).toHaveBeenCalled()
    })

    it('signs an operator without an ER and skips the login audit', async () => {
      prisma.operator.findUnique.mockResolvedValue({
        id: 'op-1',
        passwordHash: 'hashed',
        role: Role.ADMIN,
        erId: null,
        name: 'Admin',
        sessionVersion: 5,
      })

      const result = await service.staffLogin({ email: 'admin@x.com', password: 'Teste@123' })

      expect(result.user.erId).toBeUndefined()
      expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ erId: undefined }))
      expect(auditLog.log).not.toHaveBeenCalled()
    })

    it('rejects a wrong password for an operator without an ER and skips the audit', async () => {
      prisma.operator.findUnique.mockResolvedValue({
        id: 'op-1',
        passwordHash: 'hashed',
        role: Role.ADMIN,
        erId: null,
        name: 'Admin',
        sessionVersion: 0,
      })
      mockedBcrypt.compare.mockResolvedValue(false as never)

      await expect(
        service.staffLogin({ email: 'admin@x.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException)
      expect(auditLog.log).not.toHaveBeenCalled()
    })

    it('rejects a wrong password and audits the failure', async () => {
      prisma.operator.findUnique.mockResolvedValue({
        id: 'op-1',
        passwordHash: 'hashed',
        role: Role.OPERATOR,
        erId: 'er-1',
        name: 'Operadora',
        sessionVersion: 0,
      })
      mockedBcrypt.compare.mockResolvedValue(false as never)
      await expect(
        service.staffLogin({ email: 'op@x.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException)
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'authentication_failed' }),
      )
    })

    it('locks an operator email after repeated failures, before touching the database', async () => {
      prisma.operator.findUnique.mockResolvedValue(null)
      const attempt = () => service.staffLogin({ email: 'op@x.com', password: 'wrong' })

      for (let i = 0; i < 10; i += 1) {
        await expect(attempt()).rejects.toThrow(UnauthorizedException)
      }

      prisma.operator.findUnique.mockClear()
      await expect(attempt()).rejects.toThrow('Muitas tentativas')
      expect(prisma.operator.findUnique).not.toHaveBeenCalled()
    })
  })
})
