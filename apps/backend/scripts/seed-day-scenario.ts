/**
 * Reinicia a base LOCAL e cria um cenário realista de "um dia no ER".
 *
 * Uso:  npx ts-node scripts/seed-day-scenario.ts
 *
 * O que faz (apenas em DATABASE_URL local):
 *  - Limpa eventos de auditoria, senhas, filas e representantes.
 *  - Remove todas as contas de equipe, exceto admin@gb.com.br (preservado/criado).
 *  - Mantém o único ER e garante 5 caixas.
 *  - Cria 5 operadoras vinculadas ao ER (senha Teste@123).
 *  - Cria 20 representantes (senha Teste@123); 2 NÃO comparecem (sem senha no dia).
 *  - Gera a jornada do dia (senhas + eventos de auditoria) para alimentar fila,
 *    operação, painel e as métricas da Gestão (distribuição do dia).
 */
import 'dotenv/config'
import { PrismaClient, CounterState, EntryChannel, Role, TicketState } from '@prisma/client'
import type { Counter, Operator, Representative } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { getBusinessDate, getBusinessDayRange } from '../src/common/business-date'

const prisma = new PrismaClient()

const ADMIN_EMAIL = 'admin@gb.com.br'
const PASSWORD = 'Teste@123'
const BCRYPT_ROUNDS = 12

const OPERATOR_NAMES = [
  'Camila Assunção',
  'Débora Monteiro',
  'Mariana Figueiredo',
  'Renata Alves',
  'Patrícia Gomes',
]

const REPRESENTATIVE_NAMES = [
  'Ana Souza',
  'Bianca Lima',
  'Carla Costa',
  'Daniela Rocha',
  'Elaine Dias',
  'Fernanda Melo',
  'Gabriela Pinto',
  'Helena Castro',
  'Isabela Nunes',
  'Juliana Prado',
  'Karina Teixeira',
  'Larissa Moraes',
  'Marta Ribeiro',
  'Natália Campos',
  'Olívia Barros',
  'Paula Fonseca',
  'Quézia Lopes',
  'Renata Vieira',
  'Sabrina Tavares',
  'Tatiane Cardoso',
]

const CHANNELS: EntryChannel[] = [
  EntryChannel.QR_CODE,
  EntryChannel.LINK,
  EntryChannel.CHECKIN_ASSISTED,
]

/** Gera um CPF válido e determinístico a partir de uma sequência. */
function generateCpf(seq: number): string {
  const base = String(100_000_000 + seq).slice(-9).split('').map(Number)
  const checkDigit = (digits: number[]) => {
    const factorStart = digits.length + 1
    const sum = digits.reduce((acc, digit, index) => acc + digit * (factorStart - index), 0)
    const remainder = 11 - (sum % 11)
    return remainder >= 10 ? 0 : remainder
  }
  const d1 = checkDigit(base)
  const d2 = checkDigit([...base, d1])
  return [...base, d1, d2].join('')
}

async function main() {
  const url = process.env.DATABASE_URL ?? ''
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    throw new Error('Recusado: DATABASE_URL não aponta para localhost. Abortado por segurança.')
  }

  const ers = await prisma.eR.findMany({ orderBy: { createdAt: 'asc' } })
  if (ers.length === 0) {
    throw new Error('Nenhum ER encontrado no banco local. Crie um ER antes de rodar o cenário.')
  }
  const er = ers[0]
  if (ers.length > 1) {
    console.warn(`Aviso: ${ers.length} ERs encontrados. Usando o primeiro: "${er.name}".`)
  }

  const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS)

  // ── Limpeza (preserva ER, caixas e admin@gb.com.br) ─────────────────────────
  await prisma.auditEvent.deleteMany({})
  await prisma.ticket.deleteMany({})
  await prisma.queue.deleteMany({})
  await prisma.representative.deleteMany({})
  await prisma.counter.updateMany({
    data: { state: CounterState.UNAVAILABLE, operatorId: null },
  })
  await prisma.operator.deleteMany({ where: { email: { not: ADMIN_EMAIL } } })

  // ── Admin ───────────────────────────────────────────────────────────────────
  const existingAdmin = await prisma.operator.findUnique({ where: { email: ADMIN_EMAIL } })
  if (existingAdmin) {
    console.log(`Admin preservado: ${ADMIN_EMAIL}`)
  } else {
    await prisma.operator.create({
      data: { name: 'Administrador', email: ADMIN_EMAIL, passwordHash, role: Role.ADMIN },
    })
    console.log(`Admin ${ADMIN_EMAIL} não existia; criado com senha ${PASSWORD}.`)
  }

  // ── Garante 5 caixas no ER ──────────────────────────────────────────────────
  const counters: Counter[] = []
  for (let number = 1; number <= 5; number += 1) {
    const counter = await prisma.counter.upsert({
      where: { erId_number: { erId: er.id, number } },
      create: { erId: er.id, number, state: CounterState.UNAVAILABLE },
      update: { state: CounterState.UNAVAILABLE, operatorId: null },
    })
    counters.push(counter)
  }

  // ── 5 operadoras vinculadas ao ER ───────────────────────────────────────────
  const operators: Operator[] = []
  for (let index = 0; index < OPERATOR_NAMES.length; index += 1) {
    const operator = await prisma.operator.create({
      data: {
        name: OPERATOR_NAMES[index],
        email: `operadora${index + 1}@gb.com.br`,
        passwordHash,
        role: Role.OPERATOR,
        erId: er.id,
      },
    })
    operators.push(operator)
  }

  // ── 20 representantes (senha Teste@123) ─────────────────────────────────────
  const representatives: Representative[] = []
  for (let index = 0; index < REPRESENTATIVE_NAMES.length; index += 1) {
    const representative = await prisma.representative.create({
      data: {
        fullName: REPRESENTATIVE_NAMES[index],
        cpf: generateCpf(index + 1),
        phone: `119${String(90_000_000 + index)}`,
        birthDate: new Date(Date.UTC(1980 + (index % 25), index % 12, (index % 27) + 1)),
        reCode: `RE${String(index + 1).padStart(4, '0')}`,
        passwordHash,
      },
    })
    representatives.push(representative)
  }

  // ── Fila do dia ─────────────────────────────────────────────────────────────
  const businessDate = getBusinessDate()
  const { start } = getBusinessDayRange()
  const atHour = (hour: number, minute = 0) =>
    new Date(start.getTime() + (hour * 60 + minute) * 60_000)

  const queue = await prisma.queue.create({
    data: { erId: er.id, businessDate, openedAt: atHour(8), nextSequence: 0 },
  })

  let position = 0
  function ticketCode(seq: number): string {
    const letter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor((seq - 1) / 999) % 26]
    return `${letter}${String(((seq - 1) % 999) + 1).padStart(3, '0')}`
  }

  interface Event {
    type: string
    at: Date
    operatorId?: string
    counterId?: string
  }

  async function addTicket(params: {
    repIndex: number
    channel: EntryChannel
    state: TicketState
    counterId?: string
    operatorId?: string
    createdAt: Date
    calledAt?: Date
    serviceStartedAt?: Date
    serviceFinishedAt?: Date
    noShowAt?: Date
    cancelledAt?: Date
    cancelReason?: string
    events: Event[]
  }) {
    position += 1
    const rep = representatives[params.repIndex]
    const ticket = await prisma.ticket.create({
      data: {
        code: ticketCode(position),
        erId: er.id,
        queueId: queue.id,
        representativeId: rep.id,
        entryChannel: params.channel,
        queuePosition: position,
        state: params.state,
        counterId: params.counterId ?? null,
        operatorId: params.operatorId ?? null,
        calledAt: params.calledAt ?? null,
        serviceStartedAt: params.serviceStartedAt ?? null,
        serviceFinishedAt: params.serviceFinishedAt ?? null,
        noShowAt: params.noShowAt ?? null,
        cancelledAt: params.cancelledAt ?? null,
        cancelReason: params.cancelReason ?? null,
        createdAt: params.createdAt,
      },
    })

    for (const event of params.events) {
      await prisma.auditEvent.create({
        data: {
          erId: er.id,
          ticketId: ticket.id,
          representativeId: rep.id,
          operatorId: event.operatorId ?? null,
          eventType: event.type,
          metadata: event.counterId ? { counterId: event.counterId } : undefined,
          createdAt: event.at,
        },
      })
    }
  }

  const channelFor = (index: number) => CHANNELS[index % CHANNELS.length]

  // 11 atendimentos finalizados ao longo do dia (alimenta volume/serviço por hora).
  const finishedPlan: { op: number; hour: number }[] = [
    { op: 0, hour: 9 },
    { op: 1, hour: 9 },
    { op: 2, hour: 10 },
    { op: 3, hour: 10 },
    { op: 4, hour: 11 },
    { op: 0, hour: 12 },
    { op: 1, hour: 13 },
    { op: 2, hour: 14 },
    { op: 3, hour: 14 },
    { op: 0, hour: 15 },
    { op: 1, hour: 16 },
  ]

  let repCursor = 0
  for (let i = 0; i < finishedPlan.length; i += 1) {
    const { op, hour } = finishedPlan[i]
    const operator = operators[op]
    const counter = counters[op]
    const created = atHour(hour, 0)
    const called = atHour(hour, 5)
    const started = atHour(hour, 8)
    const finished = atHour(hour, 25)
    await addTicket({
      repIndex: repCursor++,
      channel: channelFor(i),
      state: TicketState.FINISHED,
      counterId: counter.id,
      operatorId: operator.id,
      createdAt: created,
      calledAt: called,
      serviceStartedAt: started,
      serviceFinishedAt: finished,
      events: [
        { type: 'ticket_created', at: created },
        { type: 'ticket_called', at: called, operatorId: operator.id, counterId: counter.id },
        { type: 'service_started', at: started, operatorId: operator.id, counterId: counter.id },
        { type: 'service_finished', at: finished, operatorId: operator.id, counterId: counter.id },
      ],
    })
  }

  // 2 em atendimento agora (caixas 1 e 2).
  for (let i = 0; i < 2; i += 1) {
    const operator = operators[i]
    const counter = counters[i]
    const created = atHour(16, 10 + i * 5)
    const called = atHour(16, 30 + i * 5)
    const started = atHour(16, 40 + i * 5)
    await addTicket({
      repIndex: repCursor++,
      channel: channelFor(i + 1),
      state: TicketState.IN_SERVICE,
      counterId: counter.id,
      operatorId: operator.id,
      createdAt: created,
      calledAt: called,
      serviceStartedAt: started,
      events: [
        { type: 'ticket_created', at: created },
        { type: 'ticket_called', at: called, operatorId: operator.id, counterId: counter.id },
        { type: 'service_started', at: started, operatorId: operator.id, counterId: counter.id },
      ],
    })
  }

  // 1 sendo chamada agora (caixa 3).
  {
    const operator = operators[2]
    const counter = counters[2]
    const created = atHour(16, 50)
    const called = atHour(17, 5)
    await addTicket({
      repIndex: repCursor++,
      channel: EntryChannel.CHECKIN_ASSISTED,
      state: TicketState.CALLING,
      counterId: counter.id,
      operatorId: operator.id,
      createdAt: created,
      calledAt: called,
      events: [
        { type: 'ticket_created', at: created },
        { type: 'ticket_called', at: called, operatorId: operator.id, counterId: counter.id },
      ],
    })
  }

  // 2 aguardando na fila.
  for (let i = 0; i < 2; i += 1) {
    const created = atHour(17, i * 10)
    await addTicket({
      repIndex: repCursor++,
      channel: channelFor(i),
      state: TicketState.WAITING,
      createdAt: created,
      events: [{ type: 'ticket_created', at: created }],
    })
  }

  // 1 não compareceu (chamada e não apareceu).
  {
    const operator = operators[3]
    const counter = counters[3]
    const created = atHour(11, 0)
    const called = atHour(11, 10)
    const noShow = atHour(11, 25)
    await addTicket({
      repIndex: repCursor++,
      channel: EntryChannel.LINK,
      state: TicketState.NO_SHOW,
      createdAt: created,
      calledAt: called,
      noShowAt: noShow,
      events: [
        { type: 'ticket_created', at: created },
        { type: 'ticket_called', at: called, operatorId: operator.id, counterId: counter.id },
        { type: 'ticket_no_show', at: noShow, operatorId: operator.id, counterId: counter.id },
      ],
    })
  }

  // 1 cancelada antes do atendimento (restaurável).
  {
    const created = atHour(10, 0)
    const cancelled = atHour(10, 15)
    await addTicket({
      repIndex: repCursor++,
      channel: EntryChannel.QR_CODE,
      state: TicketState.CANCELLED,
      createdAt: created,
      cancelledAt: cancelled,
      cancelReason: 'Cadastro incorreto',
      events: [
        { type: 'ticket_created', at: created },
        { type: 'ticket_cancelled', at: cancelled },
      ],
    })
  }

  // ── Alinha o contador da fila ao total de senhas criadas ────────────────────
  // (evita colisão de queuePosition quando uma nova RE entrar pelo app).
  await prisma.queue.update({ where: { id: queue.id }, data: { nextSequence: position } })

  // ── Pausas de caixa (alimenta "pausa por caixa") ────────────────────────────
  await prisma.auditEvent.createMany({
    data: [
      // Caixa 4: pausa resolvida (14:00 → 14:15).
      {
        erId: er.id,
        eventType: 'counter_paused',
        metadata: { counterId: counters[3].id },
        createdAt: atHour(14, 0),
      },
      {
        erId: er.id,
        eventType: 'counter_resumed',
        metadata: { counterId: counters[3].id },
        createdAt: atHour(14, 15),
      },
      // Caixa 5: pausa em aberto agora (desde 16:50).
      {
        erId: er.id,
        eventType: 'counter_paused',
        metadata: { counterId: counters[4].id },
        createdAt: atHour(16, 50),
      },
    ],
  })

  // ── Estados atuais dos caixas (grid de Caixas na Gestão) ────────────────────
  const counterStates = [
    CounterState.IN_SERVICE, // caixa 1
    CounterState.IN_SERVICE, // caixa 2
    CounterState.CALLING, // caixa 3
    CounterState.ACTIVE, // caixa 4
    CounterState.PAUSED, // caixa 5
  ]
  for (let i = 0; i < 5; i += 1) {
    await prisma.counter.update({
      where: { id: counters[i].id },
      data: { state: counterStates[i], operatorId: operators[i].id },
    })
  }

  // ── Abre o dia ──────────────────────────────────────────────────────────────
  await prisma.eR.update({
    where: { id: er.id },
    data: { isDayOpen: true, dayOpenedAt: atHour(8), dayClosedAt: null },
  })

  console.log('\n════════════════════════════════════════════════════')
  console.log(`Cenário criado no ER "${er.name}".`)
  console.log(`Senha de todas as novas contas/representantes: ${PASSWORD}`)
  console.log('Operadoras: operadora1..operadora5@gb.com.br')
  console.log('Representantes: RE0001..RE0020 (RE0019 e RE0020 NÃO compareceram).')
  console.log('Senhas do dia: 11 finalizadas, 2 em atendimento, 1 chamando, 2 aguardando, 1 não compareceu, 1 cancelada.')
  console.log('Caixas: 1 e 2 em atendimento, 3 chamando, 4 ativo, 5 pausado.')
  console.log('════════════════════════════════════════════════════\n')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
