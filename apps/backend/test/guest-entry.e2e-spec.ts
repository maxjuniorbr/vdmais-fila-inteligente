import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { EntryChannel, RepresentativeKind, TicketState } from '@prisma/client'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { validationExceptionFactory } from '../src/common/validation-exception.factory'
import { PrismaService } from '../src/prisma/prisma.service'
import { QueueEntryTokenService } from '../src/auth/queue-entry-token.service'
import { calculateCpfCheckDigit } from '../src/auth/validators/is-cpf.validator'

describe('Guest entry by QR (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let queueEntryTokens: QueueEntryTokenService
  let erId: string
  let noGuestErId: string
  let qrEntryToken: string
  let noGuestEntryToken: string
  let firstTicketCode: string

  const suffix = Date.now()
  // Build valid CPFs (correct check digits) so the DTO accepts them and the tests
  // exercise identity/conflict logic, not format rejection.
  const makeCpf = (base9: string) => {
    const d1 = calculateCpfCheckDigit(base9, 9)
    const d2 = calculateCpfCheckDigit(`${base9}${d1}`, 10)
    return `${base9}${d1}${d2}`
  }
  const tail = String(suffix).slice(-8)
  const guestCpf = makeCpf(`1${tail}`)
  const sameNameCpf = makeCpf(`2${tail}`)
  const registeredCpf = makeCpf(`3${tail}`)

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
    queueEntryTokens = app.get(QueueEntryTokenService)

    const [er, noGuestEr] = await Promise.all([
      prisma.eR.create({
        data: {
          name: `ER Convidada E2E ${suffix}`,
          isDayOpen: true,
          dayOpenedAt: new Date(),
          guestEntryEnabled: true,
        },
      }),
      prisma.eR.create({
        data: { name: `ER Sem Convidada E2E ${suffix}`, isDayOpen: true, dayOpenedAt: new Date() },
      }),
    ])
    erId = er.id
    noGuestErId = noGuestEr.id
    qrEntryToken = queueEntryTokens.issue(erId, EntryChannel.QR_CODE).token
    noGuestEntryToken = queueEntryTokens.issue(noGuestErId, EntryChannel.QR_CODE).token

    await prisma.representative.create({
      data: {
        fullName: 'Maria Cadastrada E2E',
        cpf: registeredCpf,
        birthDate: new Date('1990-01-01'),
        reCode: `E2E_GUEST_${suffix}`,
        passwordHash: 'not-used-in-this-spec',
      },
    })
  })

  afterAll(async () => {
    const erIds = [erId, noGuestErId].filter(Boolean)
    if (erIds.length) {
      await prisma.auditEvent.deleteMany({ where: { erId: { in: erIds } } })
      await prisma.ticket.deleteMany({ where: { erId: { in: erIds } } })
      await prisma.queue.deleteMany({ where: { erId: { in: erIds } } })
      await prisma.eR.deleteMany({ where: { id: { in: erIds } } })
    }
    await prisma.representative.deleteMany({
      where: { cpf: { in: [guestCpf, sameNameCpf, registeredCpf] } },
    })
    await app.close()
  })

  function guestEntry(payload: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/auth/guest-entry')
      .send({ erId, entryChannel: EntryChannel.QR_CODE, entryToken: qrEntryToken, ...payload })
  }

  it('joins the queue with name and CPF only', async () => {
    const entry = await guestEntry({
      firstName: 'Ana',
      lastName: 'Silva',
      cpf: guestCpf,
    }).expect(200)
    expect(entry.body.user.role).toBe('REPRESENTATIVE')
    const token = entry.body.access_token as string

    const created = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ erId, entryChannel: EntryChannel.QR_CODE })
      .expect(201)
    firstTicketCode = created.body.code as string

    const status = await request(app.getHttpServer())
      .get(`/tickets/my-status?erId=${erId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(status.body.code).toBe(firstTicketCode)
    expect(status.body.state).toBe(TicketState.WAITING)

    const guest = await prisma.representative.findUnique({ where: { cpf: guestCpf } })
    expect(guest?.kind).toBe(RepresentativeKind.GUEST)
    expect(guest?.phone).toBeNull()
    expect(guest?.passwordHash).toBeNull()
  })

  it('recognizes a re-scan by CPF: same ticket back, name typo fixed', async () => {
    const reEntry = await guestEntry({
      firstName: 'Anna',
      lastName: 'Silva',
      cpf: guestCpf,
    }).expect(200)
    const token = reEntry.body.access_token as string

    await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ erId, entryChannel: EntryChannel.QR_CODE })
      .expect(409)

    const status = await request(app.getHttpServer())
      .get(`/tickets/my-status?erId=${erId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(status.body.code).toBe(firstTicketCode)

    const guest = await prisma.representative.findUnique({ where: { cpf: guestCpf } })
    expect(guest?.fullName).toBe('Anna Silva')
  })

  it('keeps guests with the same name apart by CPF', async () => {
    const entry = await guestEntry({
      firstName: 'Anna',
      lastName: 'Silva',
      cpf: sameNameCpf,
    }).expect(200)
    const token = entry.body.access_token as string

    const created = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ erId, entryChannel: EntryChannel.QR_CODE })
      .expect(201)
    expect(created.body.code).not.toBe(firstTicketCode)
  })

  it('rejects a registered CPF with a login hint and no identity leak', async () => {
    const response = await guestEntry({
      firstName: 'Outra',
      lastName: 'Pessoa',
      cpf: registeredCpf,
    }).expect(409)
    expect(JSON.stringify(response.body)).not.toContain('Maria')
  })

  it('rejects guest entry on an ER that did not enable it', async () => {
    await request(app.getHttpServer())
      .post('/auth/guest-entry')
      .send({
        erId: noGuestErId,
        entryChannel: EntryChannel.QR_CODE,
        entryToken: noGuestEntryToken,
        firstName: 'Ana',
        lastName: 'Silva',
        cpf: sameNameCpf,
      })
      .expect(403)
  })

  it('rejects an entry token issued for another ER', async () => {
    await guestEntry({
      firstName: 'Ana',
      lastName: 'Silva',
      cpf: sameNameCpf,
      entryToken: noGuestEntryToken,
    }).expect(401)
  })

  it('rejects an invalid CPF (bad check digit)', async () => {
    await guestEntry({ firstName: 'Ana', lastName: 'Silva', cpf: '12345678900' }).expect(400)
  })

  it('rejects a junk repeated-digit CPF', async () => {
    await guestEntry({ firstName: 'Ana', lastName: 'Silva', cpf: '11111111111' }).expect(400)
  })

  it('rejects an offensive guest name', async () => {
    await guestEntry({ firstName: 'Caralho', lastName: 'Silva', cpf: sameNameCpf }).expect(400)
  })

  it('does not let a guest log in with the CPF as credential', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        credential: guestCpf,
        password: 'qualquer-senha',
        erId,
        entryChannel: EntryChannel.QR_CODE,
        entryToken: qrEntryToken,
      })
      .expect(401)
  })

  it('exposes the guest entry flag on the public ER payload', async () => {
    const enabled = await request(app.getHttpServer())
      .get(`/public/ers/${erId}`)
      .set('x-entry-token', qrEntryToken)
      .expect(200)
    expect(enabled.body.guestEntryEnabled).toBe(true)

    const disabled = await request(app.getHttpServer())
      .get(`/public/ers/${noGuestErId}`)
      .set('x-entry-token', noGuestEntryToken)
      .expect(200)
    expect(disabled.body.guestEntryEnabled).toBe(false)
  })
})
