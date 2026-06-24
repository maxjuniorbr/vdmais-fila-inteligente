import { INestApplication, ValidationPipe } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import { EntryChannel, Role } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { validationExceptionFactory } from '../src/common/validation-exception.factory'
import { PrismaService } from '../src/prisma/prisma.service'

/**
 * Matriz de autorização (@Roles) dos endpoints sensíveis. O RolesGuard roda ANTES
 * do handler, então um id fictício basta para o caso negado (403). Cada token
 * autentica de fato (operadora/gestora reais no banco) mas com o papel que deve
 * ser recusado. Cobre o que os specs de controller não exercitam (guards desligados
 * na instanciação manual).
 */
describe('Endpoint authorization matrix (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let jwt: JwtService
  const suffix = Date.now()
  let erId: string
  let operatorToken: string
  let managerToken: string
  let repToken: string
  const DUMMY = 'ticket-inexistente'

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

    const er = await prisma.eR.create({ data: { name: `ER Authz ${suffix}` } })
    erId = er.id
    const passwordHash = await bcrypt.hash('senha123', 10)
    const [operator, manager] = await Promise.all([
      prisma.operator.create({
        data: { name: 'Op Authz', email: `authz_op_${suffix}@test.local`, passwordHash, role: Role.OPERATOR, erId },
      }),
      prisma.operator.create({
        data: { name: 'Mgr Authz', email: `authz_mgr_${suffix}@test.local`, passwordHash, role: Role.MANAGER, erId },
      }),
    ])
    operatorToken = jwt.sign({ sub: operator.id, userId: operator.id, role: Role.OPERATOR, erId })
    managerToken = jwt.sign({ sub: manager.id, userId: manager.id, role: Role.MANAGER, erId })

    const rep = await prisma.representative.create({
      data: {
        fullName: 'RE Authz',
        cpf: String(40000000000 + suffix).slice(-11),
        phone: `116${String(suffix).slice(-8)}`,
        birthDate: new Date('1990-01-01'),
        reCode: `AUTHZ_${suffix}`,
        passwordHash,
      },
    })
    repToken = jwt.sign({
      sub: rep.id,
      userId: rep.id,
      role: Role.REPRESENTATIVE,
      erId,
      entryChannel: EntryChannel.QR_CODE,
    })
  })

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { erId } })
    await prisma.ticket.deleteMany({ where: { erId } })
    await prisma.operator.deleteMany({ where: { erId } })
    await prisma.eR.deleteMany({ where: { id: erId } })
    await prisma.representative.deleteMany({ where: { reCode: `AUTHZ_${suffix}` } })
    await app.close()
  })

  const post = (path: string, token: string) =>
    request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`)

  it('denies a MANAGER from operator-only ticket/queue endpoints (403)', async () => {
    await post(`/queues/${erId}/call-next`, managerToken).send({ counterId: 'x' }).expect(403)
    await post(`/tickets/${DUMMY}/recall`, managerToken).expect(403)
    await post(`/tickets/${DUMMY}/start-service`, managerToken).expect(403)
    await post(`/tickets/${DUMMY}/finish-service`, managerToken).expect(403)
    await post(`/tickets/${DUMMY}/no-show`, managerToken).expect(403)
    // staff-pause é OPERATOR/ATTENDANT/ADMIN — a gestora NÃO está na lista.
    await post(`/tickets/${DUMMY}/staff-pause`, managerToken).expect(403)
  })

  it('denies an OPERATOR from manager-only ticket endpoints (403)', async () => {
    await post(`/tickets/${DUMMY}/restore`, operatorToken).send({ reason: 'x' }).expect(403)
    await post(`/tickets/${DUMMY}/correct`, operatorToken).send({}).expect(403)
    // cancel é ATTENDANT/MANAGER — a operadora NÃO pode cancelar pela gestão.
    await post(`/tickets/${DUMMY}/cancel`, operatorToken).send({ reason: 'x' }).expect(403)
  })

  it('denies a REPRESENTATIVE from staff endpoints (403)', async () => {
    await post(`/tickets/${DUMMY}/mark-priority`, repToken).expect(403)
    await post(`/tickets/${DUMMY}/unmark-priority`, repToken).expect(403)
    await post(`/tickets/${DUMMY}/staff-pause`, repToken).expect(403)
    await post(`/queues/${erId}/call-next`, repToken).send({ counterId: 'x' }).expect(403)
  })

  it('lets the allowed role reach the handler — 404 for a missing ticket, not 403', async () => {
    // O papel certo passa o RolesGuard e o handler RODA: a senha inexistente vira
    // 404. Afirmar 404 (e não apenas "≠ 403") pega regressões de autenticação (401)
    // ou erro do handler (500), que também satisfariam um "≠ 403".
    const restore = await post(`/tickets/${DUMMY}/restore`, managerToken).send({ reason: 'Teste authz' })
    expect(restore.status).toBe(404)
    const recall = await post(`/tickets/${DUMMY}/recall`, operatorToken)
    expect(recall.status).toBe(404)
    const markPriority = await post(`/tickets/${DUMMY}/mark-priority`, operatorToken)
    expect(markPriority.status).toBe(404)
  })
})
