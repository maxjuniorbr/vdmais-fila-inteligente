import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { EntryChannel, RepresentativeKind, TicketState } from '@prisma/client'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { validationExceptionFactory } from '../src/common/validation-exception.factory'
import { PrismaService } from '../src/prisma/prisma.service'
import { QueueEntryTokenService } from '../src/auth/queue-entry-token.service'

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
  const guestPhone = `118${String(suffix).slice(-8)}`
  const sameNamePhone = `117${String(suffix).slice(-8)}`
  const registeredPhone = `116${String(suffix).slice(-8)}`

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
        cpf: String(suffix).slice(-11).padStart(11, '0'),
        phone: registeredPhone,
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
      where: { phone: { in: [guestPhone, sameNamePhone, registeredPhone] } },
    })
    await app.close()
  })

  function guestEntry(payload: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/auth/guest-entry')
      .send({ erId, entryChannel: EntryChannel.QR_CODE, entryToken: qrEntryToken, ...payload })
  }

  it('joins the queue with name and phone only', async () => {
    const entry = await guestEntry({
      firstName: 'Ana',
      lastName: 'Silva',
      phone: guestPhone,
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

    const guest = await prisma.representative.findUnique({ where: { phone: guestPhone } })
    expect(guest?.kind).toBe(RepresentativeKind.GUEST)
    expect(guest?.cpf).toBeNull()
    expect(guest?.passwordHash).toBeNull()
  })

  it('recognizes a re-scan by phone: same ticket back, name typo fixed', async () => {
    const reEntry = await guestEntry({
      firstName: 'Anna',
      lastName: 'Silva',
      phone: guestPhone,
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

    const guest = await prisma.representative.findUnique({ where: { phone: guestPhone } })
    expect(guest?.fullName).toBe('Anna Silva')
  })

  it('keeps guests with the same name apart by phone', async () => {
    const entry = await guestEntry({
      firstName: 'Anna',
      lastName: 'Silva',
      phone: sameNamePhone,
    }).expect(200)
    const token = entry.body.access_token as string

    const created = await request(app.getHttpServer())
      .post('/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ erId, entryChannel: EntryChannel.QR_CODE })
      .expect(201)
    expect(created.body.code).not.toBe(firstTicketCode)
  })

  it('rejects a registered phone with a login hint and no identity leak', async () => {
    const response = await guestEntry({
      firstName: 'Outra',
      lastName: 'Pessoa',
      phone: registeredPhone,
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
        phone: sameNamePhone,
      })
      .expect(403)
  })

  it('rejects an entry token issued for another ER', async () => {
    await guestEntry({
      firstName: 'Ana',
      lastName: 'Silva',
      phone: sameNamePhone,
      entryToken: noGuestEntryToken,
    }).expect(401)
  })

  it('rejects an invalid phone', async () => {
    await guestEntry({ firstName: 'Ana', lastName: 'Silva', phone: '11abc' }).expect(400)
  })

  it('does not let a guest log in with the phone as credential', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        credential: guestPhone,
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
