import { INestApplication, ValidationPipe } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { EntryChannel, Role, TicketState } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { validationExceptionFactory } from '../src/common/validation-exception.factory'
import { PrismaService } from '../src/prisma/prisma.service'
import { QueueEntryTokenService } from '../src/auth/queue-entry-token.service'

describe('Full queue journey and concurrency (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let jwt: JwtService
  let queueEntryTokens: QueueEntryTokenService
  let erId: string
  let otherErId: string
  let counter1Id: string
  let counter2Id: string
  let operator1Id: string
  let operator2Id: string
  let raceOperator1Id: string
  let raceOperator2Id: string
  let managerToken: string
  let operator1Token: string
  let operator2Token: string
  let raceOperator1Token: string
  let raceOperator2Token: string
  let representativeToken: string
  let ticketId: string
  let restoredTicketId: string
  let assignedOperatorToken: string
  let adminToken: string
  let panelToken: string
  let qrEntryToken: string
  let linkEntryToken: string

  const suffix = Date.now()

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
    // Mirror main.ts so X-Forwarded-For drives req.ip; lets the rate-limit test
    // isolate its flood on a dedicated client IP instead of the shared socket IP.
    ;(app.getHttpAdapter().getInstance() as { set(key: string, value: unknown): void }).set(
      'trust proxy',
      1,
    )
    await app.init()

    prisma = app.get(PrismaService)
    jwt = app.get(JwtService)
    queueEntryTokens = app.get(QueueEntryTokenService)

    const [er, otherEr] = await Promise.all([
      prisma.eR.create({ data: { name: `ER E2E ${suffix}` } }),
      prisma.eR.create({ data: { name: `Outro ER E2E ${suffix}` } }),
    ])
    erId = er.id
    otherErId = otherEr.id

    const passwordHash = await bcrypt.hash('senha123', 10)
    const [manager, admin, operator1, operator2, raceOperator1, raceOperator2] = await Promise.all([
      prisma.operator.create({
        data: {
          name: 'Gestora E2E',
          email: `manager_${suffix}@test.local`,
          passwordHash,
          role: Role.MANAGER,
          erId,
        },
      }),
      prisma.operator.create({
        data: {
          name: 'Admin E2E',
          email: `admin_${suffix}@test.local`,
          passwordHash,
          role: Role.ADMIN,
          erId,
        },
      }),
      prisma.operator.create({
        data: {
          name: 'Operadora Um',
          email: `operator1_${suffix}@test.local`,
          passwordHash,
          role: Role.OPERATOR,
          erId,
        },
      }),
      prisma.operator.create({
        data: {
          name: 'Operadora Dois',
          email: `operator2_${suffix}@test.local`,
          passwordHash,
          role: Role.OPERATOR,
          erId,
        },
      }),
      prisma.operator.create({
        data: {
          name: 'Operadora Concorrência Um',
          email: `race_operator1_${suffix}@test.local`,
          passwordHash,
          role: Role.OPERATOR,
          erId,
        },
      }),
      prisma.operator.create({
        data: {
          name: 'Operadora Concorrência Dois',
          email: `race_operator2_${suffix}@test.local`,
          passwordHash,
          role: Role.OPERATOR,
          erId,
        },
      }),
    ])
    operator1Id = operator1.id
    operator2Id = operator2.id
    raceOperator1Id = raceOperator1.id
    raceOperator2Id = raceOperator2.id

    const [counter1, counter2] = await Promise.all([
      prisma.counter.create({ data: { number: 1, erId } }),
      prisma.counter.create({ data: { number: 2, erId } }),
    ])
    counter1Id = counter1.id
    counter2Id = counter2.id

    const login = async (email: string) => {
      const response = await request(app.getHttpServer())
        .post('/auth/staff-login')
        .send({ email, password: 'senha123' })
        .expect(200)
      return response.body.access_token as string
    }

    managerToken = await login(manager.email)
    operator1Token = await login(operator1.email)
    operator2Token = await login(operator2.email)
    raceOperator1Token = await login(raceOperator1.email)
    raceOperator2Token = await login(raceOperator2.email)
    adminToken = await login(admin.email)

    const erAccess = await request(app.getHttpServer())
      .get(`/admin/ers/${erId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
    qrEntryToken = erAccess.body.entryAccess.qrCode.token
    linkEntryToken = erAccess.body.entryAccess.link.token

    const panelTokenResponse = await request(app.getHttpServer())
      .post(`/admin/ers/${erId}/panel-token`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201)
    panelToken = panelTokenResponse.body.token

    await request(app.getHttpServer())
      .post(`/ers/${erId}/open-day`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201)

    await Promise.all([
      request(app.getHttpServer())
        .post(`/counters/${counter1Id}/open`)
        .set('Authorization', `Bearer ${operator1Token}`)
        .expect(201),
      request(app.getHttpServer())
        .post(`/counters/${counter2Id}/open`)
        .set('Authorization', `Bearer ${operator2Token}`)
        .expect(201),
    ])
  })

  afterAll(async () => {
    if (erId) {
      await prisma.auditEvent.deleteMany({ where: { erId } })
      await prisma.ticket.deleteMany({ where: { erId } })
      await prisma.counter.deleteMany({ where: { erId } })
      await prisma.operator.deleteMany({ where: { erId } })
      await prisma.queue.deleteMany({ where: { erId } })
      await prisma.eR.deleteMany({ where: { id: { in: [erId, otherErId] } } })
    }
    await prisma.representative.deleteMany({
      where: { reCode: { startsWith: `E2E_${suffix}` } },
    })
    await app.close()
  })

  it('registers a representative and returns a valid JWT', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        fullName: 'Maria Teste E2E',
        cpf: '52998224725',
        phone: `119${String(suffix).slice(-8)}`,
        birthDate: '1990-01-01',
        reCode: `E2E_${suffix}_1`,
        password: 'senha123',
        erId,
      })
      .expect(401)

    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        fullName: 'Maria Teste E2E',
        cpf: '52998224725',
        phone: `119${String(suffix).slice(-8)}`,
        birthDate: '1990-01-01',
        reCode: `E2E_${suffix}_1`,
        password: 'senha123',
        erId,
        entryChannel: EntryChannel.QR_CODE,
        entryToken: qrEntryToken,
      })
      .expect(201)

    expect(response.body.access_token).toBeDefined()
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        credential: `E2E_${suffix}_1`,
        password: 'senha123',
        erId,
      })
      .expect(401)

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        credential: `E2E_${suffix}_1`,
        password: 'senha123',
        erId,
        entryChannel: EntryChannel.QR_CODE,
        entryToken: qrEntryToken,
      })
      .expect(200)
    representativeToken = login.body.access_token
    expect(jwt.verify(representativeToken)).toMatchObject({
      erId,
      entryChannel: EntryChannel.QR_CODE,
    })
  })

  it('revokes a staff token on logout (session version)', async () => {
    const passwordHash = await bcrypt.hash('senha123', 10)
    const operator = await prisma.operator.create({
      data: {
        name: 'Operadora Logout',
        email: `logout_${suffix}@test.local`,
        passwordHash,
        role: Role.OPERATOR,
        erId,
      },
    })

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/staff-login')
      .send({ email: operator.email, password: 'senha123' })
      .expect(200)
    const token = loginResponse.body.access_token as string

    // The token works before logout.
    await request(app.getHttpServer())
      .get('/operators/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    await request(app.getHttpServer())
      .post('/telemetry/staff/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(201)

    // The same token is rejected afterwards: revocation took effect.
    await request(app.getHttpServer())
      .get('/operators/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401)
  })

  it('allows only one operator to acquire a counter concurrently', async () => {
    const counter = await prisma.counter.create({ data: { number: 3, erId } })

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post(`/counters/${counter.id}/open`)
        .set('Authorization', `Bearer ${raceOperator1Token}`),
      request(app.getHttpServer())
        .post(`/counters/${counter.id}/open`)
        .set('Authorization', `Bearer ${raceOperator2Token}`),
    ])

    expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual([201, 409])
    const assigned = await prisma.counter.findUniqueOrThrow({ where: { id: counter.id } })
    expect([raceOperator1Id, raceOperator2Id]).toContain(assigned.operatorId)

    const ownerToken =
      assigned.operatorId === raceOperator1Id ? raceOperator1Token : raceOperator2Token
    await request(app.getHttpServer())
      .post(`/counters/${counter.id}/close`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201)
  })

  it('allows an operator to acquire only one of two counters concurrently', async () => {
    const [firstCounter, secondCounter] = await Promise.all([
      prisma.counter.create({ data: { number: 4, erId } }),
      prisma.counter.create({ data: { number: 5, erId } }),
    ])

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post(`/counters/${firstCounter.id}/open`)
        .set('Authorization', `Bearer ${raceOperator1Token}`),
      request(app.getHttpServer())
        .post(`/counters/${secondCounter.id}/open`)
        .set('Authorization', `Bearer ${raceOperator1Token}`),
    ])

    expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual([201, 409])
    const assigned = await prisma.counter.findMany({
      where: { operatorId: raceOperator1Id },
    })
    expect(assigned).toHaveLength(1)

    await request(app.getHttpServer())
      .post(`/counters/${assigned[0].id}/close`)
      .set('Authorization', `Bearer ${raceOperator1Token}`)
      .expect(201)
  })

  it('creates one active ticket and blocks a duplicate', async () => {
    const response = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${representativeToken}`)
      .send({ erId, entryChannel: 'QR_CODE' })
      .expect(201)

    expect(response.body.state).toBe(TicketState.WAITING)
    expect(response.body.code).toBe('A001')
    expect(response.body.representative).toEqual({ fullName: 'Maria Teste E2E' })
    ticketId = response.body.id

    await request(app.getHttpServer())
      .post(`/telemetry/tickets/${ticketId}/displayed`)
      .set('Authorization', `Bearer ${representativeToken}`)
      .expect(201)

    await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${representativeToken}`)
      .send({ erId, entryChannel: 'QR_CODE' })
      .expect(409)
  })

  it('runs the complete call, start and finish journey', async () => {
    const called = await request(app.getHttpServer())
      .post(`/queues/${erId}/call-next`)
      .set('Authorization', `Bearer ${operator1Token}`)
      .send({ counterId: counter1Id })
      .expect(201)
    expect(called.body.id).toBe(ticketId)
    expect(called.body.state).toBe(TicketState.CALLING)

    const started = await request(app.getHttpServer())
      .post(`/tickets/${ticketId}/start-service`)
      .set('Authorization', `Bearer ${operator1Token}`)
      .expect(201)
    expect(started.body.state).toBe(TicketState.IN_SERVICE)

    await request(app.getHttpServer())
      .post(`/queues/${erId}/call-next`)
      .set('Authorization', `Bearer ${operator1Token}`)
      .send({ counterId: counter1Id })
      .expect(400)

    const finished = await request(app.getHttpServer())
      .post(`/tickets/${ticketId}/finish-service`)
      .set('Authorization', `Bearer ${operator1Token}`)
      .expect(201)
    expect(finished.body.state).toBe(TicketState.FINISHED)

    const counter = await prisma.counter.findUniqueOrThrow({
      where: { id: counter1Id },
    })
    expect(counter.state).toBe('ACTIVE')
  })

  it('rejects expired tokens and cross-ER access', async () => {
    const expired = jwt.sign(
      {
        sub: operator1Id,
        userId: operator1Id,
        role: Role.OPERATOR,
        erId,
      },
      { expiresIn: -1 },
    )

    await request(app.getHttpServer())
      .get(`/queues/${erId}/overview`)
      .set('Authorization', `Bearer ${expired}`)
      .expect(401)

    await request(app.getHttpServer())
      .get(`/queues/${otherErId}/overview`)
      .set('Authorization', `Bearer ${operator1Token}`)
      .expect(403)
  })

  it('never assigns the same ticket to two simultaneous counters', async () => {
    const representative = await prisma.representative.create({
      data: {
        fullName: 'Concorrência E2E',
        cpf: '11144477735',
        phone: `118${String(suffix).slice(-8)}`,
        birthDate: new Date('1991-01-01'),
        reCode: `E2E_${suffix}_2`,
        passwordHash: await bcrypt.hash('senha123', 10),
      },
    })
    const token = jwt.sign({
      sub: representative.id,
      userId: representative.id,
      role: Role.REPRESENTATIVE,
      erId,
      entryChannel: EntryChannel.LINK,
    })

    const created = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ erId, entryChannel: 'LINK' })
      .expect(201)

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post(`/queues/${erId}/call-next`)
        .set('Authorization', `Bearer ${operator1Token}`)
        .send({ counterId: counter1Id }),
      request(app.getHttpServer())
        .post(`/queues/${erId}/call-next`)
        .set('Authorization', `Bearer ${operator2Token}`)
        .send({ counterId: counter2Id }),
    ])

    expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual([201, 400])
    const assigned = await prisma.ticket.findMany({
      where: { id: created.body.id, state: TicketState.CALLING },
    })
    expect(assigned).toHaveLength(1)
    expect([operator1Id, operator2Id]).toContain(assigned[0].operatorId)
    restoredTicketId = created.body.id
    assignedOperatorToken = assigned[0].operatorId === operator1Id ? operator1Token : operator2Token
  })

  it('preserves no-show metrics and re-queues the ticket after restoration', async () => {
    await request(app.getHttpServer())
      .post(`/tickets/${restoredTicketId}/no-show`)
      .set('Authorization', `Bearer ${assignedOperatorToken}`)
      .expect(201)

    await request(app.getHttpServer())
      .post(`/tickets/${restoredTicketId}/restore`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ reason: 'RE retornou ao local' })
      .expect(201)

    const metrics = await request(app.getHttpServer())
      .get(`/metrics/${erId}/daily`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200)
    expect(metrics.body.totalNoShow).toBeGreaterThanOrEqual(1)
    expect(metrics.body.noShowByChannel.LINK).toBeGreaterThanOrEqual(1)

    const panel = await request(app.getHttpServer())
      .get(`/panel/${erId}/state`)
      .set('x-panel-token', panelToken)
      .expect(200)
    const restoredCode = (
      await prisma.ticket.findUniqueOrThrow({
        where: { id: restoredTicketId },
        select: { code: true },
      })
    ).code
    expect(panel.body.waiting).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: restoredCode })]),
    )
  })

  it('exposes public ER identification and rejects an unknown ER', async () => {
    await request(app.getHttpServer()).get(`/public/ers/${erId}`).expect(401)

    const response = await request(app.getHttpServer())
      .get(`/public/ers/${erId}`)
      .set('x-entry-token', qrEntryToken)
      .expect(200)
    expect(response.body).toEqual({
      id: erId,
      name: expect.any(String),
      isDayOpen: true,
      entryChannel: EntryChannel.QR_CODE,
    })
    expect(response.body).not.toHaveProperty('dayOpenedAt')

    const unknownToken = queueEntryTokens.issue('unknown-er', EntryChannel.QR_CODE).token
    await request(app.getHttpServer())
      .get('/public/ers/unknown-er')
      .set('x-entry-token', unknownToken)
      .expect(404)

    await request(app.getHttpServer())
      .get(`/public/ers/${erId}?source=link`)
      .set('x-entry-token', linkEntryToken)
      .expect(200)

    await request(app.getHttpServer())
      .get(`/public/ers/${erId}?source=link`)
      .set('x-entry-token', qrEntryToken)
      .expect(401)
  })

  it('limits ticket creation attempts by IP, ER and channel', async () => {
    const rateLimitErId = `rate-limit-${suffix}`
    const token = jwt.sign({
      sub: 'rate-limit-representative',
      userId: 'rate-limit-representative',
      role: Role.REPRESENTATIVE,
      erId: rateLimitErId,
      entryChannel: EntryChannel.QR_CODE,
    })

    // Dedicated client IP so this flood neither inherits nor pollutes the shared
    // per-IP throttle bucket used by the other ticket-creation tests.
    const clientIp = '198.51.100.7'

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post('/tickets')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Forwarded-For', clientIp)
        .send({ erId: rateLimitErId, entryChannel: EntryChannel.QR_CODE })
      expect(response.status).not.toBe(429)
    }

    await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', clientIp)
      .send({ erId: rateLimitErId, entryChannel: EntryChannel.QR_CODE })
      .expect(429)
  })

  it('exposes liveness, readiness and protected Prometheus metrics', async () => {
    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('ok'))
    await request(app.getHttpServer()).get('/health/ready').expect(200).expect({ status: 'ready' })

    const previousToken = process.env.OBSERVABILITY_TOKEN
    process.env.OBSERVABILITY_TOKEN = 'e2e-observability-token'
    try {
      await request(app.getHttpServer()).get('/observability/metrics').expect(401)
      const metrics = await request(app.getHttpServer())
        .get('/observability/metrics')
        .set('Authorization', 'Bearer e2e-observability-token')
        .expect(200)
      expect(metrics.text).toContain('fila_http_requests_total')
      expect(metrics.headers['content-type']).toContain('text/plain')
    } finally {
      if (previousToken === undefined) delete process.env.OBSERVABILITY_TOKEN
      else process.env.OBSERVABILITY_TOKEN = previousToken
    }
  })

  it('allows an admin to access the manager dashboard for its ER', async () => {
    await request(app.getHttpServer())
      .get(`/metrics/${erId}/daily`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
  })

  it('does not close the day while a ticket is still waiting', async () => {
    await request(app.getHttpServer())
      .post(`/ers/${erId}/close-day`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(409)
  })

  it('representative can pause and resume her ticket, accumulating pausedSeconds and receiving a new code', async () => {
    // Create a fresh representative for this scenario
    const pauseRep = await prisma.representative.create({
      data: {
        fullName: 'Pause Test E2E',
        cpf: '87748242069',
        phone: `117${String(suffix).slice(-8)}`,
        birthDate: new Date('1995-06-15'),
        reCode: `E2E_${suffix}_pause`,
        passwordHash: await bcrypt.hash('senha123', 10),
      },
    })
    const pauseToken = jwt.sign({
      sub: pauseRep.id,
      userId: pauseRep.id,
      role: Role.REPRESENTATIVE,
      erId,
      entryChannel: EntryChannel.QR_CODE,
    })

    // Step 1: enter the queue
    const created = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${pauseToken}`)
      .send({ erId, entryChannel: 'QR_CODE' })
      .expect(201)

    const pauseTicketId: string = created.body.id
    const originalCode: string = created.body.code
    expect(created.body.state).toBe(TicketState.WAITING)

    // Step 2: pause — ticket becomes PAUSED and panel shows queue shrunk
    const paused = await request(app.getHttpServer())
      .post(`/tickets/${pauseTicketId}/pause`)
      .set('Authorization', `Bearer ${pauseToken}`)
      .expect(201)
    expect(paused.body.state).toBe(TicketState.PAUSED)

    // Panel state should NOT list the paused ticket in "waiting"
    const panelAfterPause = await request(app.getHttpServer())
      .get(`/panel/${erId}/state`)
      .set('x-panel-token', panelToken)
      .expect(200)
    const waitingCodes = (panelAfterPause.body.waiting as Array<{ code: string }>).map(
      (t) => t.code,
    )
    expect(waitingCodes).not.toContain(originalCode)

    // Step 3: resume — ticket goes back to WAITING with a new code and end-of-queue position
    const resumed = await request(app.getHttpServer())
      .post(`/tickets/${pauseTicketId}/resume`)
      .set('Authorization', `Bearer ${pauseToken}`)
      .expect(201)
    expect(resumed.body.state).toBe(TicketState.WAITING)
    expect(resumed.body.code).not.toBe(originalCode)

    // pausedSeconds must be > 0 (at least 1 s elapsed between pause and resume)
    const dbTicket = await prisma.ticket.findUniqueOrThrow({ where: { id: pauseTicketId } })
    expect(dbTicket.pausedSeconds).toBeGreaterThanOrEqual(0)
    expect(dbTicket.pausedAt).toBeNull()

    // Panel waiting list should include the resumed ticket
    const panelAfterResume = await request(app.getHttpServer())
      .get(`/panel/${erId}/state`)
      .set('x-panel-token', panelToken)
      .expect(200)
    const waitingAfter = panelAfterResume.body.waiting as Array<{
      code: string
      position: number
    }>
    expect(waitingAfter.some((t) => t.code === resumed.body.code)).toBe(true)

    // Positions must be sequential 1..N with no gaps
    const positions = waitingAfter.map((t) => t.position).sort((a, b) => a - b)
    positions.forEach((pos, i) => expect(pos).toBe(i + 1))

    // Step 4: representative leaves the queue via self-cancel
    const cancelled = await request(app.getHttpServer())
      .post(`/tickets/${pauseTicketId}/self-cancel`)
      .set('Authorization', `Bearer ${pauseToken}`)
      .expect(201)
    expect(cancelled.body.state).toBe(TicketState.CANCELLED)

    // my-active should now return 404
    await request(app.getHttpServer())
      .get(`/tickets/my-active?erId=${erId}`)
      .set('Authorization', `Bearer ${pauseToken}`)
      .expect(404)

    // Audit trail must contain pause and resume events
    const auditEvents = await prisma.auditEvent.findMany({
      where: { ticketId: pauseTicketId },
      select: { eventType: true },
    })
    const eventTypes = auditEvents.map((e) => e.eventType)
    expect(eventTypes).toContain('ticket_paused')
    expect(eventTypes).toContain('ticket_resumed')
    expect(eventTypes).toContain('ticket_cancelled')
  })

  it('exposes only sanitized queue data on the public TV endpoint', async () => {
    // Ensure a ticket is being called so the panel exposes a CALLING entry to validate.
    await request(app.getHttpServer())
      .post(`/queues/${erId}/call-next`)
      .set('Authorization', `Bearer ${operator1Token}`)
      .send({ counterId: counter1Id })
      .expect(201)

    await request(app.getHttpServer()).get(`/panel/${erId}/state`).expect(401)

    const response = await request(app.getHttpServer())
      .get(`/panel/${erId}/state`)
      .set('x-panel-token', panelToken)
      .expect(200)

    const serialized = JSON.stringify(response.body)
    expect(serialized).not.toContain('cpf')
    expect(serialized).not.toContain('phone')
    expect(serialized).not.toContain('reCode')
    expect(serialized).not.toContain('representativeId')
    expect(serialized).not.toContain('ticketId')
    const displayedCall = response.body.current ?? response.body.calling[0]
    expect(displayedCall).toBeDefined()
    expect(displayedCall.displayName).toMatch(/^[^\s]+ [A-ZÁ-Ú]\.$/i)
  })

  it('records all mandatory lifecycle events and closes an idle counter', async () => {
    await request(app.getHttpServer())
      .post(`/tickets/${restoredTicketId}/cancel`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ reason: 'Encerramento do cenário E2E' })
      .expect(201)
    await request(app.getHttpServer())
      .post(`/counters/${counter1Id}/pause`)
      .set('Authorization', `Bearer ${operator1Token}`)
      .send({ reason: 'Pausa de validação' })
      .expect(201)
    await request(app.getHttpServer())
      .post(`/counters/${counter1Id}/resume`)
      .set('Authorization', `Bearer ${operator1Token}`)
      .expect(201)
    await request(app.getHttpServer())
      .post(`/counters/${counter1Id}/close`)
      .set('Authorization', `Bearer ${operator1Token}`)
      .expect(201)
    await request(app.getHttpServer())
      .post(`/ers/${erId}/close-day`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201)
    await request(app.getHttpServer())
      .post('/telemetry/staff/logout')
      .set('Authorization', `Bearer ${operator1Token}`)
      .expect(201)

    const events = await prisma.auditEvent.findMany({
      where: { erId },
      select: { eventType: true },
    })
    const eventTypes = new Set(events.map((event) => event.eventType))
    expect([...eventTypes]).toEqual(
      expect.arrayContaining([
        'representative_login_started',
        'representative_authenticated',
        'representative_created_or_updated',
        'ticket_creation_requested',
        'duplicate_ticket_checked',
        'duplicate_ticket_blocked',
        'ticket_created',
        'ticket_displayed_to_re',
        'operator_logged_in',
        'counter_assigned',
        'counter_opened',
        'counter_paused',
        'counter_resumed',
        'next_ticket_requested',
        'ticket_locked_for_call',
        'ticket_called',
        'service_started',
        'service_finished',
        'ticket_marked_no_show',
        'ticket_restoration_requested',
        'ticket_restored',
        'ticket_cancelled',
        'operator_logged_out',
        'counter_closed',
        'daily_queue_opened',
        'daily_queue_closed',
      ]),
    )
  })
})
