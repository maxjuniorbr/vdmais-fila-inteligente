import { INestApplication, ValidationPipe } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { EntryChannel, Role, TicketState } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { validationExceptionFactory } from '../src/common/validation-exception.factory'
import { PrismaService } from '../src/prisma/prisma.service'

/**
 * Prova de ponta a ponta do canal de CHECK-IN ASSISTIDO (critério 1 do §16): o
 * atendente cria a senha em nome da RE. O comportamento já tinha cobertura
 * unitária, mas faltava o caminho HTTP/auth completo — os demais e2e só exercitam
 * QR_CODE/LINK. ER próprio e isolado, sem estado compartilhado.
 */
describe('Assisted check-in channel (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let jwt: JwtService
  const suffix = Date.now()
  let erId: string
  let attendantToken: string
  let managerToken: string
  let representativeId: string

  const signStaff = (userId: string, role: Role, scopedErId: string) =>
    jwt.sign({ sub: userId, userId, role, erId: scopedErId })

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()
    app = moduleFixture.createNestApplication()
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
      }),
    )
    await app.init()
    prisma = app.get(PrismaService)
    jwt = app.get(JwtService)

    const er = await prisma.eR.create({ data: { name: `ER Checkin ${suffix}` } })
    erId = er.id
    const passwordHash = await bcrypt.hash('senha123', 10)
    const [manager, attendant, rep] = await Promise.all([
      prisma.operator.create({
        data: {
          name: 'Gestora Checkin',
          email: `checkin_mgr_${suffix}@test.local`,
          passwordHash,
          role: Role.MANAGER,
          erId,
        },
      }),
      prisma.operator.create({
        data: {
          name: 'Atendente Checkin',
          email: `checkin_att_${suffix}@test.local`,
          passwordHash,
          role: Role.ATTENDANT,
          erId,
        },
      }),
      prisma.representative.create({
        data: {
          fullName: 'RE Checkin Assistido',
          cpf: String(20000000000 + suffix).slice(-11),
          phone: `1192${String(suffix).slice(-8)}`,
          birthDate: new Date('1990-01-01'),
          reCode: `RECHK_${suffix}`,
          passwordHash,
        },
      }),
    ])
    managerToken = signStaff(manager.id, Role.MANAGER, erId)
    attendantToken = signStaff(attendant.id, Role.ATTENDANT, erId)
    representativeId = rep.id

    await request(app.getHttpServer())
      .post(`/ers/${erId}/open-day`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201)
  })

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { erId } })
    await prisma.ticket.deleteMany({ where: { erId } })
    await prisma.counter.deleteMany({ where: { erId } })
    await prisma.operator.deleteMany({ where: { erId } })
    await prisma.queue.deleteMany({ where: { erId } })
    await prisma.eR.deleteMany({ where: { id: erId } })
    await prisma.representative.deleteMany({ where: { reCode: `RECHK_${suffix}` } })
    await app.close()
  })

  it('lets an attendant create a ticket on the assisted channel', async () => {
    const created = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${attendantToken}`)
      .send({ erId, entryChannel: 'CHECKIN_ASSISTED', representativeId })
      .expect(201)

    expect(created.body.code).toBeTruthy()

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: created.body.id } })
    expect(ticket.entryChannel).toBe(EntryChannel.CHECKIN_ASSISTED)
    expect(ticket.state).toBe(TicketState.WAITING)
    expect(ticket.checkinAttendantId).toBeTruthy()

    const events = await prisma.auditEvent.findMany({
      where: { erId },
      select: { eventType: true, metadata: true },
    })
    const types = events.map((event) => event.eventType)
    expect(types).toContain('manual_checkin_completed')
    const entryStarted = events.find((event) => event.eventType === 'queue_entry_started')
    expect(entryStarted?.metadata).toMatchObject({ entryChannel: 'CHECKIN_ASSISTED' })
  })
})
