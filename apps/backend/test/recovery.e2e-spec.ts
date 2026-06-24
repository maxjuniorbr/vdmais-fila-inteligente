import { INestApplication, ValidationPipe } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { CounterState, EntryChannel, Role, TicketState } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { getBusinessDate } from '../src/common/business-date'
import { validationExceptionFactory } from '../src/common/validation-exception.factory'
import { PrismaService } from '../src/prisma/prisma.service'
import { TicketTimeoutService } from '../src/ticket/ticket-timeout.service'

/**
 * Cenários adversos de recuperação operacional:
 * - virada de dia sem encerramento (saneamento de senhas + caixas);
 * - liberação forçada de caixa órfão pela gestora;
 * - auto-finalização de atendimentos em aberto no fechamento do dia;
 * - expiração automática de senhas presas em chamada;
 * - bloqueio de abertura de caixa com a operação do dia fechada.
 */
describe('Operational recovery scenarios (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let jwt: JwtService
  let timeout: TicketTimeoutService
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
          email: `mgr_${label}_${suffix}@test.local`,
          passwordHash,
          role: Role.MANAGER,
          erId: er.id,
        },
      }),
      prisma.operator.create({
        data: {
          name: `Operadora ${label}`,
          email: `op_${label}_${suffix}@test.local`,
          passwordHash,
          role: Role.OPERATOR,
          erId: er.id,
        },
      }),
    ])
    const counter = await prisma.counter.create({ data: { number: 1, erId: er.id } })
    return {
      erId: er.id,
      counterId: counter.id,
      operatorId: operator.id,
      managerToken: signStaff(manager.id, Role.MANAGER, er.id),
      operatorToken: signStaff(operator.id, Role.OPERATOR, er.id),
    }
  }

  async function createRepresentative(erId: string) {
    repCounter += 1
    const rep = await prisma.representative.create({
      data: {
        fullName: `RE Recovery ${repCounter}`,
        cpf: String(10000000000 + suffix * 10 + repCounter).slice(-11),
        phone: `1190000${String(suffix * 10 + repCounter).slice(-6)}`,
        birthDate: new Date('1990-01-01'),
        reCode: `REC_${suffix}_${repCounter}`,
        passwordHash: await bcrypt.hash('senha123', 10),
      },
    })
    return {
      id: rep.id,
      token: jwt.sign({
        sub: rep.id,
        userId: rep.id,
        role: Role.REPRESENTATIVE,
        erId,
        entryChannel: EntryChannel.QR_CODE,
      }),
    }
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
    timeout = app.get(TicketTimeoutService)
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
    await prisma.representative.deleteMany({ where: { reCode: { startsWith: `REC_${suffix}` } } })
    await app.close()
  })

  it('blocks opening a counter while the operation of the day is closed', async () => {
    const { counterId, operatorToken } = await provisionER('ER Fechado')

    await request(app.getHttpServer())
      .post(`/counters/${counterId}/open`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(400)
  })

  it('sanitizes leftover tickets and counters from a previous unclosed day when opening', async () => {
    const { erId, counterId, operatorId, managerToken } = await provisionER('ER Virada')
    const rep = await createRepresentative(erId)

    // Simula um dia anterior que não foi encerrado: fila de ontem com senha
    // ainda aguardando, ER marcado como aberto e caixa preso a uma operadora.
    const staleBusinessDate = getBusinessDate(new Date(Date.now() - 48 * 60 * 60 * 1000))
    const staleQueue = await prisma.queue.create({
      data: { erId, businessDate: staleBusinessDate, nextSequence: 1, openedAt: new Date() },
    })
    const staleTicket = await prisma.ticket.create({
      data: {
        code: 'A001',
        erId,
        queueId: staleQueue.id,
        representativeId: rep.id,
        entryChannel: 'QR_CODE',
        queuePosition: 1,
        state: TicketState.WAITING,
      },
    })
    await prisma.eR.update({ where: { id: erId }, data: { isDayOpen: true } })
    await prisma.counter.update({
      where: { id: counterId },
      data: { state: CounterState.ACTIVE, operatorId },
    })

    await request(app.getHttpServer())
      .post(`/ers/${erId}/open-day`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201)

    const ticketAfter = await prisma.ticket.findUniqueOrThrow({ where: { id: staleTicket.id } })
    expect(ticketAfter.state).toBe(TicketState.NO_SHOW)

    const counterAfter = await prisma.counter.findUniqueOrThrow({ where: { id: counterId } })
    expect(counterAfter.state).toBe(CounterState.UNAVAILABLE)
    expect(counterAfter.operatorId).toBeNull()

    const forceClosed = await prisma.auditEvent.findFirst({
      where: { erId, ticketId: staleTicket.id, eventType: 'ticket_force_closed' },
    })
    expect(forceClosed).not.toBeNull()

    const todayQueue = await prisma.queue.findUnique({
      where: { erId_businessDate: { erId, businessDate: getBusinessDate() } },
    })
    expect(todayQueue).not.toBeNull()
  })

  it('lets a manager force-release an orphan counter, resolving the called ticket', async () => {
    const { erId, counterId, operatorToken, managerToken } = await provisionER('ER Orfao')
    const rep = await createRepresentative(erId)

    await request(app.getHttpServer())
      .post(`/ers/${erId}/open-day`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201)
    await request(app.getHttpServer())
      .post(`/counters/${counterId}/open`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(201)
    const created = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${rep.token}`)
      .send({ erId, entryChannel: 'QR_CODE' })
      .expect(201)
    await request(app.getHttpServer())
      .post(`/queues/${erId}/call-next`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ counterId })
      .expect(201)

    await request(app.getHttpServer())
      .post(`/counters/${counterId}/force-release`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201)

    const counterAfter = await prisma.counter.findUniqueOrThrow({ where: { id: counterId } })
    expect(counterAfter.state).toBe(CounterState.UNAVAILABLE)
    expect(counterAfter.operatorId).toBeNull()

    const ticketAfter = await prisma.ticket.findUniqueOrThrow({ where: { id: created.body.id } })
    expect(ticketAfter.state).toBe(TicketState.NO_SHOW)

    const released = await prisma.auditEvent.findFirst({
      where: { erId, eventType: 'counter_force_released' },
    })
    expect(released).not.toBeNull()
  })

  it('rejects force-release attempted by an operator', async () => {
    const { counterId, operatorToken } = await provisionER('ER ForcaProibida')

    await request(app.getHttpServer())
      .post(`/counters/${counterId}/force-release`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(403)
  })

  it('auto-finishes an in-service ticket when the day is closed', async () => {
    const { erId, counterId, operatorToken, managerToken } = await provisionER('ER Encerra')
    const rep = await createRepresentative(erId)

    await request(app.getHttpServer())
      .post(`/ers/${erId}/open-day`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201)
    await request(app.getHttpServer())
      .post(`/counters/${counterId}/open`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(201)
    const created = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${rep.token}`)
      .send({ erId, entryChannel: 'QR_CODE' })
      .expect(201)
    await request(app.getHttpServer())
      .post(`/queues/${erId}/call-next`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ counterId })
      .expect(201)
    await request(app.getHttpServer())
      .post(`/tickets/${created.body.id}/start-service`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(201)

    await request(app.getHttpServer())
      .post(`/ers/${erId}/close-day`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201)

    const ticketAfter = await prisma.ticket.findUniqueOrThrow({ where: { id: created.body.id } })
    expect(ticketAfter.state).toBe(TicketState.FINISHED)

    const forceFinished = await prisma.auditEvent.findFirst({
      where: { erId, ticketId: created.body.id, eventType: 'service_force_finished' },
    })
    expect(forceFinished).not.toBeNull()

    const er = await prisma.eR.findUniqueOrThrow({ where: { id: erId } })
    expect(er.isDayOpen).toBe(false)
  })

  it('auto-expires a ticket stuck in CALLING beyond the tolerance window', async () => {
    const { erId, counterId, operatorToken, managerToken } = await provisionER('ER Timeout')
    const rep = await createRepresentative(erId)

    await request(app.getHttpServer())
      .post(`/ers/${erId}/open-day`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201)
    await request(app.getHttpServer())
      .post(`/counters/${counterId}/open`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(201)
    const created = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${rep.token}`)
      .send({ erId, entryChannel: 'QR_CODE' })
      .expect(201)
    await request(app.getHttpServer())
      .post(`/queues/${erId}/call-next`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ counterId })
      .expect(201)

    // Simula o relógio adiantado além da tolerância (default 10 min).
    const futureNow = new Date(Date.now() + 60 * 60 * 1000)
    const closed = await timeout.sweepExpiredCalls(futureNow, erId)
    expect(closed).toBeGreaterThanOrEqual(1)

    const ticketAfter = await prisma.ticket.findUniqueOrThrow({ where: { id: created.body.id } })
    expect(ticketAfter.state).toBe(TicketState.NO_SHOW)

    const counterAfter = await prisma.counter.findUniqueOrThrow({ where: { id: counterId } })
    expect(counterAfter.state).toBe(CounterState.ACTIVE)

    const autoNoShow = await prisma.auditEvent.findFirst({
      where: { erId, ticketId: created.body.id, eventType: 'ticket_auto_no_show' },
    })
    expect(autoNoShow).not.toBeNull()
  })

  it('staff pause frees the counter and staff resume returns the ticket in place', async () => {
    const { erId, counterId, operatorToken, managerToken } = await provisionER('ER Staff Pause')
    const rep = await createRepresentative(erId)
    await request(app.getHttpServer())
      .post(`/ers/${erId}/open-day`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201)
    await request(app.getHttpServer())
      .post(`/counters/${counterId}/open`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(201)
    const created = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${rep.token}`)
      .send({ erId, entryChannel: 'QR_CODE' })
      .expect(201)
    await request(app.getHttpServer())
      .post(`/queues/${erId}/call-next`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ counterId })
      .expect(201)

    // staff-pause de uma senha em CHAMADA: a senha vai a PAUSED e o caixa é liberado.
    await request(app.getHttpServer())
      .post(`/tickets/${created.body.id}/staff-pause`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(201)
    const paused = await prisma.ticket.findUniqueOrThrow({ where: { id: created.body.id } })
    expect(paused.state).toBe(TicketState.PAUSED)
    expect(paused.counterId).toBeNull()
    const freedCounter = await prisma.counter.findUniqueOrThrow({ where: { id: counterId } })
    expect(freedCounter.state).toBe(CounterState.ACTIVE)

    // staff-resume: retomada NO LUGAR — mantém o mesmo código (não vai ao fim).
    await request(app.getHttpServer())
      .post(`/tickets/${created.body.id}/staff-resume`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(201)
    const resumed = await prisma.ticket.findUniqueOrThrow({ where: { id: created.body.id } })
    expect(resumed.state).toBe(TicketState.WAITING)
    expect(resumed.code).toBe(created.body.code)
    expect(resumed.pausedAt).toBeNull()
  })

  it('sends a ticket to the end of the queue when its pause times out', async () => {
    const { erId, counterId, operatorToken, managerToken } = await provisionER('ER Pause Timeout')
    await request(app.getHttpServer())
      .post(`/ers/${erId}/open-day`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201)
    await request(app.getHttpServer())
      .post(`/counters/${counterId}/open`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(201)
    // Habilita a tolerância de pausa (>0) para este ER.
    await prisma.eR.update({ where: { id: erId }, data: { pauseTimeoutSeconds: 300 } })

    const rep1 = await createRepresentative(erId)
    const rep2 = await createRepresentative(erId)
    const a1 = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${rep1.token}`)
      .send({ erId, entryChannel: 'QR_CODE' })
      .expect(201)
    await request(app.getHttpServer())
      .post(`/tickets/${a1.body.id}/pause`)
      .set('Authorization', `Bearer ${rep1.token}`)
      .expect(201)
    // Outra senha entra durante a pausa.
    const a2 = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${rep2.token}`)
      .send({ erId, entryChannel: 'QR_CODE' })
      .expect(201)

    // Força a pausa a estourar a tolerância (pausedAt no passado). A própria RE
    // consultar sua senha já dispara a expiração no read-time — escopada só a ESTA
    // senha (sem varredura global que poderia tocar dados de outros ERs).
    await prisma.ticket.update({
      where: { id: a1.body.id },
      data: { pausedAt: new Date(Date.now() - 3600_000) },
    })
    await request(app.getHttpServer())
      .get(`/tickets/my-active?erId=${erId}`)
      .set('Authorization', `Bearer ${rep1.token}`)
      .expect(200)

    const a2db = await prisma.ticket.findUniqueOrThrow({ where: { id: a2.body.id } })
    const expired = await prisma.ticket.findUniqueOrThrow({ where: { id: a1.body.id } })
    expect(expired.state).toBe(TicketState.WAITING)
    // Penalidade: NOVO código e posição ao FIM (atrás da a2 que entrou na pausa).
    expect(expired.code).not.toBe(a1.body.code)
    expect(expired.queuePosition).toBeGreaterThan(a2db.queuePosition)
    const event = await prisma.auditEvent.findFirst({
      where: { erId, ticketId: a1.body.id, eventType: 'ticket_pause_expired' },
    })
    expect(event).not.toBeNull()
  })

  it('accumulates paused time across multiple pause/resume cycles', async () => {
    const { erId, managerToken } = await provisionER('ER Paused Sum')
    const rep = await createRepresentative(erId)
    await request(app.getHttpServer())
      .post(`/ers/${erId}/open-day`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201)
    const created = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${rep.token}`)
      .send({ erId, entryChannel: 'QR_CODE' })
      .expect(201)

    const pauseResume = async () => {
      await request(app.getHttpServer())
        .post(`/tickets/${created.body.id}/pause`)
        .set('Authorization', `Bearer ${rep.token}`)
        .expect(201)
      await new Promise((resolve) => setTimeout(resolve, 1100))
      await request(app.getHttpServer())
        .post(`/tickets/${created.body.id}/resume`)
        .set('Authorization', `Bearer ${rep.token}`)
        .expect(201)
    }

    await pauseResume()
    const after1 = await prisma.ticket.findUniqueOrThrow({ where: { id: created.body.id } })
    expect(after1.pausedSeconds).toBeGreaterThan(0)

    await pauseResume()
    const after2 = await prisma.ticket.findUniqueOrThrow({ where: { id: created.body.id } })
    // O segundo ciclo SOMA ao tempo do primeiro (increment, não substituição).
    expect(after2.pausedSeconds).toBeGreaterThan(after1.pausedSeconds)
  })

  it('rejects a concurrent duplicate ticket for the same representative', async () => {
    const { erId, managerToken } = await provisionER('ER Create Race')
    const rep = await createRepresentative(erId)
    await request(app.getHttpServer())
      .post(`/ers/${erId}/open-day`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201)

    const enter = () =>
      request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${rep.token}`)
        .send({ erId, entryChannel: 'QR_CODE' })
    const [a, b] = await Promise.all([enter(), enter()])

    // Sob concorrência: uma cria (201), a outra é barrada como duplicada (409).
    expect([a.status, b.status].sort((x, y) => x - y)).toEqual([201, 409])

    // Exatamente UMA senha ativa para a RE — sem colisão de queuePosition/código.
    const active = await prisma.ticket.findMany({
      where: {
        erId,
        representativeId: rep.id,
        state: {
          in: [
            TicketState.WAITING,
            TicketState.CALLING,
            TicketState.IN_SERVICE,
            TicketState.PAUSED,
          ],
        },
      },
    })
    expect(active).toHaveLength(1)
  })
})
