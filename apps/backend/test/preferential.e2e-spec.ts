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
 * Prova COMPORTAMENTAL do atendimento preferencial (Lei 10.048). O unitário de
 * queue.service só valida a string SQL do ORDER BY; aqui exercitamos a regra de
 * ponta a ponta:
 * - call-next chama a senha preferencial antes de uma normal que chegou antes;
 * - marcar/desmarcar preferencial reordena a fila de espera;
 * - a representante NÃO consegue se autopreferenciar na entrada;
 * - apenas staff (não a RE) pode marcar preferencial.
 * Cada cenário usa um ER próprio e isolado, sem estado compartilhado.
 */
describe('Preferential service ordering (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let jwt: JwtService
  const suffix = Date.now()
  const createdErIds: string[] = []
  let repCounter = 0

  const signStaff = (userId: string, role: Role, erId?: string) =>
    jwt.sign({ sub: userId, userId, role, erId })

  async function provisionER(label: string) {
    const er = await prisma.eR.create({ data: { name: `${label} ${suffix}` } })
    createdErIds.push(er.id)
    const passwordHash = await bcrypt.hash('senha123', 10)
    const [manager, operator] = await Promise.all([
      prisma.operator.create({
        data: {
          name: `Gestora ${label}`,
          email: `pref_mgr_${label}_${suffix}@test.local`.replace(/\s+/g, '_'),
          passwordHash,
          role: Role.MANAGER,
          erId: er.id,
        },
      }),
      prisma.operator.create({
        data: {
          name: `Operadora ${label}`,
          email: `pref_op_${label}_${suffix}@test.local`.replace(/\s+/g, '_'),
          passwordHash,
          role: Role.OPERATOR,
          erId: er.id,
        },
      }),
    ])
    const counter = await prisma.counter.create({ data: { number: 1, erId: er.id } })
    const ctx = {
      erId: er.id,
      counterId: counter.id,
      managerToken: signStaff(manager.id, Role.MANAGER, er.id),
      operatorToken: signStaff(operator.id, Role.OPERATOR, er.id),
    }

    await request(app.getHttpServer())
      .post(`/ers/${ctx.erId}/open-day`)
      .set('Authorization', `Bearer ${ctx.managerToken}`)
      .expect(201)
    await request(app.getHttpServer())
      .post(`/counters/${ctx.counterId}/open`)
      .set('Authorization', `Bearer ${ctx.operatorToken}`)
      .expect(201)

    return ctx
  }

  async function createRepresentativeToken(erId: string) {
    repCounter += 1
    const rep = await prisma.representative.create({
      data: {
        fullName: `RE Pref ${repCounter}`,
        cpf: String(20000000000 + suffix * 10 + repCounter).slice(-11),
        phone: `1191000${String(suffix * 10 + repCounter).slice(-6)}`,
        birthDate: new Date('1990-01-01'),
        reCode: `REP_${suffix}_${repCounter}`,
        passwordHash: await bcrypt.hash('senha123', 10),
      },
    })
    return jwt.sign({
      sub: rep.id,
      userId: rep.id,
      role: Role.REPRESENTATIVE,
      erId,
      entryChannel: EntryChannel.QR_CODE,
    })
  }

  const enterQueue = (token: string, erId: string, extra: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ erId, entryChannel: 'QR_CODE', ...extra })

  async function waitingCodes(ctx: { erId: string; operatorToken: string }) {
    const res = await request(app.getHttpServer())
      .get(`/queues/${ctx.erId}/overview`)
      .set('Authorization', `Bearer ${ctx.operatorToken}`)
      .expect(200)
    return (res.body.waiting as Array<{ code: string }>).map((ticket) => ticket.code)
  }

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
  })

  afterAll(async () => {
    for (const erId of createdErIds) {
      await prisma.auditEvent.deleteMany({ where: { erId } })
      await prisma.ticket.deleteMany({ where: { erId } })
      await prisma.counter.deleteMany({ where: { erId } })
      await prisma.operator.deleteMany({ where: { erId } })
      await prisma.queue.deleteMany({ where: { erId } })
    }
    await prisma.eR.deleteMany({ where: { id: { in: createdErIds } } })
    await prisma.representative.deleteMany({ where: { reCode: { startsWith: `REP_${suffix}` } } })
    await app.close()
  })

  it('calls a preferential ticket before an earlier normal one', async () => {
    const ctx = await provisionER('Pref Call')
    const re1 = await createRepresentativeToken(ctx.erId)
    const re2 = await createRepresentativeToken(ctx.erId)
    const a1 = await enterQueue(re1, ctx.erId).expect(201) // chega 1º (normal)
    const a2 = await enterQueue(re2, ctx.erId).expect(201) // chega 2º

    await request(app.getHttpServer())
      .post(`/tickets/${a2.body.id}/mark-priority`)
      .set('Authorization', `Bearer ${ctx.operatorToken}`)
      .expect(201)

    const called = await request(app.getHttpServer())
      .post(`/queues/${ctx.erId}/call-next`)
      .set('Authorization', `Bearer ${ctx.operatorToken}`)
      .send({ counterId: ctx.counterId })
      .expect(201)

    // A preferencial (a2) é chamada, mesmo tendo chegado depois e com queuePosition maior.
    expect(called.body.id).toBe(a2.body.id)
    expect(called.body.code).toBe(a2.body.code)

    const [a1db, a2db] = await Promise.all([
      prisma.ticket.findUniqueOrThrow({ where: { id: a1.body.id } }),
      prisma.ticket.findUniqueOrThrow({ where: { id: a2.body.id } }),
    ])
    expect(a2db.state).toBe(TicketState.CALLING)
    expect(a1db.state).toBe(TicketState.WAITING)
  })

  it('reorders the waiting list when a ticket is marked then unmarked preferential', async () => {
    const ctx = await provisionER('Pref Order')
    const re1 = await createRepresentativeToken(ctx.erId)
    const re2 = await createRepresentativeToken(ctx.erId)
    const a1 = await enterQueue(re1, ctx.erId).expect(201)
    const a2 = await enterQueue(re2, ctx.erId).expect(201)

    // FIFO inicial.
    expect(await waitingCodes(ctx)).toEqual([a1.body.code, a2.body.code])

    // Marca a 2ª como preferencial → fura a fila.
    await request(app.getHttpServer())
      .post(`/tickets/${a2.body.id}/mark-priority`)
      .set('Authorization', `Bearer ${ctx.operatorToken}`)
      .expect(201)
    expect(await waitingCodes(ctx)).toEqual([a2.body.code, a1.body.code])

    // Desmarca → volta ao FIFO.
    await request(app.getHttpServer())
      .post(`/tickets/${a2.body.id}/unmark-priority`)
      .set('Authorization', `Bearer ${ctx.operatorToken}`)
      .expect(201)
    expect(await waitingCodes(ctx)).toEqual([a1.body.code, a2.body.code])
  })

  it('ignores isPriority when the representative tries to prioritize herself', async () => {
    const ctx = await provisionER('Pref Self')
    const re = await createRepresentativeToken(ctx.erId)
    const created = await enterQueue(re, ctx.erId, { isPriority: true }).expect(201)

    const db = await prisma.ticket.findUniqueOrThrow({ where: { id: created.body.id } })
    expect(db.isPriority).toBe(false)
  })

  it('forbids a representative from marking a ticket as preferential', async () => {
    const ctx = await provisionER('Pref Guard')
    const re = await createRepresentativeToken(ctx.erId)
    const a = await enterQueue(re, ctx.erId).expect(201)

    await request(app.getHttpServer())
      .post(`/tickets/${a.body.id}/mark-priority`)
      .set('Authorization', `Bearer ${re}`)
      .expect(403)
  })
})
