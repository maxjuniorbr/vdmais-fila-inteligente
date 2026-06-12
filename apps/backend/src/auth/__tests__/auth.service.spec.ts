import { ConflictException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Prisma, Role } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { AuditLogService } from '../../audit-log/audit-log.service'
import { PrismaService } from '../../prisma/prisma.service'
import { AuthService } from '../auth.service'

jest.mock('bcrypt')

const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>

const prisma = {
  representative: { findFirst: jest.fn(), create: jest.fn() },
  operator: { findUnique: jest.fn() },
}

const jwt = { sign: jest.fn(() => 'signed-token') }
const auditLog = { log: jest.fn(), logIfERExists: jest.fn() }

const registerDto = {
  fullName: '  Ana  Souza ',
  cpf: '111.222.333-44',
  phone: '(11) 99999-0000',
  birthDate: '1990-01-01',
  reCode: 're0001',
  password: 'Teste@123',
  erId: 'er-1',
}

describe('AuthService', () => {
  let service: AuthService

  beforeEach(() => {
    jest.resetAllMocks()
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      auditLog as unknown as AuditLogService,
    )
    mockedBcrypt.hash.mockResolvedValue('hashed' as never)
    mockedBcrypt.compare.mockResolvedValue(true as never)
    jwt.sign.mockReturnValue('signed-token')
  })

  describe('createRepresentative', () => {
    it('normalizes data, persists and audits a self registration', async () => {
      prisma.representative.findFirst.mockResolvedValue(null)
      prisma.representative.create.mockResolvedValue({
        id: 're-1',
        fullName: 'Ana Souza',
        cpf: '11122233344',
        phone: '11999990000',
        reCode: 'RE0001',
      })

      const result = await service.createRepresentative(registerDto, { erId: 'er-1' })

      expect(prisma.representative.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fullName: 'Ana Souza',
            cpf: '11122233344',
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
      prisma.representative.findFirst.mockResolvedValue({ cpf: '11122233344' })
      await expect(service.createRepresentative(registerDto)).rejects.toThrow('CPF já cadastrado')
    })

    it('rejects a duplicated phone', async () => {
      prisma.representative.findFirst.mockResolvedValue({ cpf: 'x', phone: '11999990000' })
      await expect(service.createRepresentative(registerDto)).rejects.toThrow(
        'Telefone já cadastrado',
      )
    })

    it('rejects a duplicated RE code', async () => {
      prisma.representative.findFirst.mockResolvedValue({ cpf: 'x', phone: 'y', reCode: 'RE0001' })
      await expect(service.createRepresentative(registerDto)).rejects.toThrow(
        'Código de RE já cadastrado',
      )
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
  })

  describe('register', () => {
    it('creates the representative and signs a token', async () => {
      prisma.representative.findFirst.mockResolvedValue(null)
      prisma.representative.create.mockResolvedValue({
        id: 're-1',
        fullName: 'Ana Souza',
        cpf: '11122233344',
        phone: '11999990000',
        reCode: 'RE0001',
      })

      const result = await service.register(registerDto)
      expect(result.access_token).toBe('signed-token')
      expect(result.user.role).toBe(Role.REPRESENTATIVE)
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
      })

      expect(result.access_token).toBe('signed-token')
      expect(auditLog.logIfERExists).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'representative_authenticated' }),
      )
    })

    it('rejects an unknown credential', async () => {
      prisma.representative.findFirst.mockResolvedValue(null)
      await expect(
        service.login({ credential: '00000000000', password: 'x', erId: 'er-1' }),
      ).rejects.toThrow(UnauthorizedException)
      expect(auditLog.logIfERExists).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'authentication_failed' }),
      )
    })

    it('rejects a wrong password', async () => {
      prisma.representative.findFirst.mockResolvedValue({ id: 're-1', passwordHash: 'hashed' })
      mockedBcrypt.compare.mockResolvedValue(false as never)
      await expect(
        service.login({ credential: 'RE0001', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException)
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
      })

      const result = await service.staffLogin({ email: 'OP@x.com', password: 'Teste@123' })
      expect(result.user.name).toBe('Operadora')
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'operator_logged_in' }),
      )
    })

    it('rejects an unknown operator', async () => {
      prisma.operator.findUnique.mockResolvedValue(null)
      await expect(
        service.staffLogin({ email: 'no@x.com', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException)
    })

    it('rejects a wrong password and audits the failure', async () => {
      prisma.operator.findUnique.mockResolvedValue({
        id: 'op-1',
        passwordHash: 'hashed',
        role: Role.OPERATOR,
        erId: 'er-1',
        name: 'Operadora',
      })
      mockedBcrypt.compare.mockResolvedValue(false as never)
      await expect(
        service.staffLogin({ email: 'op@x.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException)
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'authentication_failed' }),
      )
    })
  })
})
