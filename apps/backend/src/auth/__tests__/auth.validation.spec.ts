import { ConflictException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditLogService } from '../../audit-log/audit-log.service'
import { AuthService } from '../auth.service'
import { RegisterDto } from '../dto/register.dto'

const validRegistration = {
  fullName: 'Maria da Silva',
  cpf: '52998224725',
  phone: '11987654321',
  birthDate: '1990-05-15',
  reCode: 'RE123456',
  password: 'senha123',
}

describe('RegisterDto validation', () => {
  it('accepts valid data', async () => {
    const errors = await validate(plainToInstance(RegisterDto, validRegistration))
    expect(errors).toHaveLength(0)
  })

  it('rejects a CPF with invalid check digits', async () => {
    const dto = plainToInstance(RegisterDto, {
      ...validRegistration,
      cpf: '12345678901',
    })
    const errors = await validate(dto)
    expect(errors.some((error) => error.property === 'cpf')).toBe(true)
  })

  it('rejects an invalid phone', async () => {
    const dto = plainToInstance(RegisterDto, {
      ...validRegistration,
      phone: '123',
    })
    const errors = await validate(dto)
    expect(errors.some((error) => error.property === 'phone')).toBe(true)
  })

  it('rejects an invalid or future birth date', async () => {
    const invalid = await validate(
      plainToInstance(RegisterDto, {
        ...validRegistration,
        birthDate: 'not-a-date',
      }),
    )
    const future = await validate(
      plainToInstance(RegisterDto, {
        ...validRegistration,
        birthDate: '2999-01-01',
      }),
    )
    expect(invalid.some((error) => error.property === 'birthDate')).toBe(true)
    expect(future.some((error) => error.property === 'birthDate')).toBe(true)
  })

  it('requires an eight-character password', async () => {
    const dto = plainToInstance(RegisterDto, {
      ...validRegistration,
      password: '1234567',
    })
    const errors = await validate(dto)
    expect(errors.some((error) => error.property === 'password')).toBe(true)
  })
})

describe('AuthService uniqueness', () => {
  const prisma = {
    representative: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  }
  const jwt = { sign: jest.fn() }
  const auditLog = { logIfERExists: jest.fn() }
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt as unknown as JwtService,
    auditLog as unknown as AuditLogService,
  )

  beforeEach(() => jest.clearAllMocks())

  it('rejects a duplicate CPF before hashing and creation', async () => {
    prisma.representative.findFirst.mockResolvedValue({
      cpf: validRegistration.cpf,
      phone: '11999999999',
      reCode: 'OTHER',
    })

    await expect(service.register(validRegistration)).rejects.toThrow(
      new ConflictException('Não foi possível concluir o cadastro com os dados informados'),
    )
    expect(prisma.representative.create).not.toHaveBeenCalled()
  })

  it.each([
    [
      'phone',
      {
        cpf: '11144477735',
        phone: validRegistration.phone,
        reCode: 'OTHER',
      },
    ],
    [
      'RE code',
      {
        cpf: '11144477735',
        phone: '11999999999',
        reCode: validRegistration.reCode,
      },
    ],
  ])('hides which identifier (%s) already exists on public registration', async (_field, existing) => {
    prisma.representative.findFirst.mockResolvedValue(existing)
    await expect(service.register(validRegistration)).rejects.toThrow(
      'Não foi possível concluir o cadastro com os dados informados',
    )
  })
})
