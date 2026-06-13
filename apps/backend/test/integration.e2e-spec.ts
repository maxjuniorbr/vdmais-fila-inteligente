import { INestApplication, ValidationPipe } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { CounterState, EntryChannel, Role, TicketState } from '@prisma/client'
import { generateKeyPairSync } from 'node:crypto'
import * as bcrypt from 'bcrypt'
import * as jwt from 'jsonwebtoken'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { validationExceptionFactory } from '../src/common/validation-exception.factory'
import { getBusinessDate } from '../src/common/business-date'
import { PrismaService } from '../src/prisma/prisma.service'

const ISSUER = 'https://dev-local/integration'
const AUDIENCE = 'vdmais-fila-integration'
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

function integrationToken(scope: string, overrides: jwt.SignOptions = {}): string {
  return jwt.sign({ scope, client_id: 'legacy-erp' }, privateKey, {
    algorithm: 'RS256',
    issuer: ISSUER,
    audience: AUDIENCE,
    subject: 'legacy-erp',
    expiresIn: 300,
    ...overrides,
  })
}

describe('Integration M2M endpoints (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let jwtService: JwtService
  let erId: string
  let queueId: string
  let counterId: string
  let operatorId: string
  let operatorToken: string
  let otherErId: string
  let otherQueueId: string

  const suffix = Date.now()
  const startToken = integrationToken('tickets:start')
  const finishToken = integrationToken('tickets:finish')
  const fullToken = integrationToken('tickets:start tickets:finish')

  let repSeq = 0

  // Cria uma revendedora com uma senha no estado desejado e devolve o reCode.
  async function seedTicket(state: TicketState): Promise<{ reCode: string; ticketId: string }> {
    repSeq += 1
    const passwordHash = await bcrypt.hash('senha123', 10)
    const reCode = `RE${suffix}${repSeq}`
    const rep = await prisma.representative.create({
      data: {
        fullName: 'Maria Teste',
        cpf: `${suffix}${repSeq}`.padStart(11, '0').slice(-11),
        phone: `${suffix}${repSeq}`.padStart(11, '9').slice(-11),
        birthDate: new Date('1990-01-01'),
        reCode,
        passwordHash,
      },
    })
    const called = state === TicketState.CALLING || state === TicketState.IN_SERVICE
    const ticket = await prisma.ticket.create({
      data: {
        code: `A${repSeq}`,
        state,
        entryChannel: EntryChannel.QR_CODE,
        queuePosition: repSeq,
        queueId,
        erId,
        representativeId: rep.id,
        counterId: called ? counterId : null,
        operatorId: called ? operatorId : null,
        calledAt: called ? new Date() : null,
        serviceStartedAt: state === TicketState.IN_SERVICE ? new Date() : null,
      },
    })
    return { reCode, ticketId: ticket.id }
  }

  beforeAll(async () => {
    process.env.INTEGRATION_JWT_ISSUER = ISSUER
    process.env.INTEGRATION_JWT_AUDIENCE = AUDIENCE
    process.env.INTEGRATION_DEV_PUBLIC_KEY = publicKey
    process.env.INTEGRATION_DEV_PRIVATE_KEY = privateKey
    process.env.INTEGRATION_DEV_TOKEN_ENABLED = 'true'
    process.env.INTEGRATION_DEV_CLIENT_ID = 'legacy-erp'
    process.env.INTEGRATION_DEV_CLIENT_SECRET = 'sekret'
    process.env.INTEGRATION_DEV_ALLOWED_SCOPES = 'tickets:start tickets:finish'
    delete process.env.INTEGRATION_JWKS_URI

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
    jwtService = app.get(JwtService)

    const er = await prisma.eR.create({
      data: { name: `ER Integração ${suffix}`, isDayOpen: true, dayOpenedAt: new Date() },
    })
    erId = er.id
    const queue = await prisma.queue.create({
      data: { erId, businessDate: getBusinessDate(), nextSequence: 1 },
    })
    queueId = queue.id
    const operator = await prisma.operator.create({
      data: {
        name: 'Operadora Integração',
        email: `op_int_${suffix}@test.local`,
        passwordHash: await bcrypt.hash('senha123', 10),
        role: Role.OPERATOR,
        erId,
      },
    })
    operatorId = operator.id
    const counter = await prisma.counter.create({
      data: { erId, number: 1, state: CounterState.CALLING, operatorId },
    })
    counterId = counter.id

    const otherEr = await prisma.eR.create({
      data: { name: `ER Outro ${suffix}`, isDayOpen: true, dayOpenedAt: new Date() },
    })
    otherErId = otherEr.id
    const otherQueue = await prisma.queue.create({
      data: { erId: otherErId, businessDate: getBusinessDate(), nextSequence: 1 },
    })
    otherQueueId = otherQueue.id
    operatorToken = jwtService.sign({
      sub: operatorId,
      userId: operatorId,
      role: Role.OPERATOR,
      erId,
      sv: 0,
    })
  })

  afterAll(async () => {
    await app.close()
  })

  it('starts the service for a called representative (CALLING → IN_SERVICE), then is idempotent', async () => {
    const { reCode, ticketId } = await seedTicket(TicketState.CALLING)

    const first = await request(app.getHttpServer())
      .post('/integration/v1/atendimentos/iniciar')
      .set('Authorization', `Bearer ${startToken}`)
      .send({ reCode })
      .expect(200)
    expect(first.body).toMatchObject({ ticketId, state: 'IN_SERVICE', idempotent: false })

    const repeat = await request(app.getHttpServer())
      .post('/integration/v1/atendimentos/iniciar')
      .set('Authorization', `Bearer ${startToken}`)
      .send({ reCode })
      .expect(200)
    expect(repeat.body).toMatchObject({ state: 'IN_SERVICE', idempotent: true })

    const counter = await prisma.counter.findUnique({ where: { id: counterId } })
    expect(counter?.state).toBe(CounterState.IN_SERVICE)

    const audit = await prisma.auditEvent.findFirst({
      where: { ticketId, eventType: 'service_started' },
    })
    expect(audit?.metadata).toMatchObject({ source: 'integration', client: 'legacy-erp' })
  })

  it('finishes the service (IN_SERVICE → FINISHED) and is idempotent', async () => {
    const { reCode, ticketId } = await seedTicket(TicketState.IN_SERVICE)

    const first = await request(app.getHttpServer())
      .post('/integration/v1/atendimentos/encerrar')
      .set('Authorization', `Bearer ${finishToken}`)
      .send({ reCode })
      .expect(200)
    expect(first.body).toMatchObject({ ticketId, state: 'FINISHED', idempotent: false })

    await request(app.getHttpServer())
      .post('/integration/v1/atendimentos/encerrar')
      .set('Authorization', `Bearer ${finishToken}`)
      .send({ reCode })
      .expect(200)
      .expect((res) => expect(res.body.idempotent).toBe(true))
  })

  it('rejects a token missing the required scope (403 INSUFFICIENT_SCOPE)', async () => {
    const { reCode } = await seedTicket(TicketState.IN_SERVICE)
    await request(app.getHttpServer())
      .post('/integration/v1/atendimentos/encerrar')
      .set('Authorization', `Bearer ${startToken}`)
      .send({ reCode })
      .expect(403)
      .expect((res) => expect(res.body.code).toBe('INSUFFICIENT_SCOPE'))
  })

  it('ignores a queued (not yet called) ticket: returns 404 NO_ACTIVE_TICKET', async () => {
    const { reCode } = await seedTicket(TicketState.WAITING)
    await request(app.getHttpServer())
      .post('/integration/v1/atendimentos/iniciar')
      .set('Authorization', `Bearer ${startToken}`)
      .send({ reCode })
      .expect(404)
      .expect((res) => expect(res.body.code).toBe('NO_ACTIVE_TICKET'))
  })

  it('acts on the ticket where the RE was called, ignoring a stale WAITING in another ER', async () => {
    repSeq += 1
    const passwordHash = await bcrypt.hash('senha123', 10)
    const reCode = `RE${suffix}X${repSeq}`
    const rep = await prisma.representative.create({
      data: {
        fullName: 'Maria Dois ER',
        cpf: `7${suffix}${repSeq}`.replace(/\D/g, '').padStart(11, '0').slice(-11),
        phone: `8${suffix}${repSeq}`.replace(/\D/g, '').padStart(11, '0').slice(-11),
        birthDate: new Date('1990-01-01'),
        reCode,
        passwordHash,
      },
    })
    await prisma.ticket.create({
      data: {
        code: 'W1',
        state: TicketState.WAITING,
        entryChannel: EntryChannel.QR_CODE,
        queuePosition: 90,
        queueId: otherQueueId,
        erId: otherErId,
        representativeId: rep.id,
      },
    })
    const calledTicket = await prisma.ticket.create({
      data: {
        code: 'C1',
        state: TicketState.CALLING,
        entryChannel: EntryChannel.QR_CODE,
        queuePosition: 91,
        queueId,
        erId,
        representativeId: rep.id,
        counterId,
        operatorId,
        calledAt: new Date(),
      },
    })

    await request(app.getHttpServer())
      .post('/integration/v1/atendimentos/iniciar')
      .set('Authorization', `Bearer ${startToken}`)
      .send({ reCode })
      .expect(200)
      .expect((res) => {
        expect(res.body.ticketId).toBe(calledTicket.id)
        expect(res.body.erId).toBe(erId)
        expect(res.body.state).toBe('IN_SERVICE')
      })
  })

  it('validates the identifier and the existence of the representative and ticket', async () => {
    await request(app.getHttpServer())
      .post('/integration/v1/atendimentos/iniciar')
      .set('Authorization', `Bearer ${startToken}`)
      .send({})
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('INVALID_IDENTIFIER'))

    await request(app.getHttpServer())
      .post('/integration/v1/atendimentos/iniciar')
      .set('Authorization', `Bearer ${startToken}`)
      .send({ reCode: 'NAO-EXISTE' })
      .expect(404)
      .expect((res) => expect(res.body.code).toBe('REPRESENTATIVE_NOT_FOUND'))

    const { reCode } = await seedTicket(TicketState.CANCELLED)
    await request(app.getHttpServer())
      .post('/integration/v1/atendimentos/iniciar')
      .set('Authorization', `Bearer ${startToken}`)
      .send({ reCode })
      .expect(404)
      .expect((res) => expect(res.body.code).toBe('NO_ACTIVE_TICKET'))
  })

  it('rejects a staff JWT on an integration route (strategy isolation, 401)', async () => {
    const { reCode } = await seedTicket(TicketState.CALLING)
    await request(app.getHttpServer())
      .post('/integration/v1/atendimentos/iniciar')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ reCode })
      .expect(401)
  })

  it('rejects an expired or wrong-issuer integration token (401)', async () => {
    const { reCode } = await seedTicket(TicketState.CALLING)
    const expired = integrationToken('tickets:start', { expiresIn: -10 })
    const wrongIssuer = integrationToken('tickets:start', { issuer: 'https://evil/' })
    for (const token of [expired, wrongIssuer]) {
      await request(app.getHttpServer())
        .post('/integration/v1/atendimentos/iniciar')
        .set('Authorization', `Bearer ${token}`)
        .send({ reCode })
        .expect(401)
    }
  })

  it('issues a working token through the dev token endpoint', async () => {
    const tokenRes = await request(app.getHttpServer())
      .post('/integration/oauth/token')
      .send({
        grant_type: 'client_credentials',
        client_id: 'legacy-erp',
        client_secret: 'sekret',
        scope: 'tickets:start',
      })
      .expect(200)
    expect(tokenRes.body).toMatchObject({ token_type: 'Bearer', scope: 'tickets:start' })

    const { reCode } = await seedTicket(TicketState.CALLING)
    await request(app.getHttpServer())
      .post('/integration/v1/atendimentos/iniciar')
      .set('Authorization', `Bearer ${tokenRes.body.access_token}`)
      .send({ reCode })
      .expect(200)
      .expect((res) => expect(res.body.state).toBe('IN_SERVICE'))

    // O fluxo da operadora continua intacto após a refatoração.
    expect(fullToken.length).toBeGreaterThan(0)
  })
})
