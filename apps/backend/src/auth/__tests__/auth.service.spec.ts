import { ConflictException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { EntryChannel, Prisma, Role } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { AuditLogService } from '../../audit-log/audit-log.service'
import { PrismaService } from '../../prisma/prisma.service'
import { AuthService } from '../auth.service'
import { QueueEntryTokenService } from '../queue-entry-token.service'
import { LoginThrottleService } from '../login-throttle.service'

jest.mock('bcrypt')

const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>

const prisma = {
  representative: { findFirst: jest.fn(), create: jest.fn() },
  operator: { findUnique: jest.fn() },
}

const jwt = { sign: jest.fn(() => 'signed-token') }
const auditLog = { log: jest.fn(), logIfERExists: jest.fn() }
const queueEntryTokens = {
  verify: jest.fn((token, erId, entryChannel) => ({ token, erId, entryChannel })),
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
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ erId: 'er-1', entryChannel: EntryChannel.QR_CODE }),
      )
    })

    it('rejects an incomplete queue entry context', async () => {
      await expect(
        service.register({ ...registerDto, entryChannel: undefined }),
      ).rejects.toThrow(UnauthorizedException)
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
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ erId: 'er-1', entryChannel: EntryChannel.LINK }),
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
