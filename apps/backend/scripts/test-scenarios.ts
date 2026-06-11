/**
 * Preparador de cenários de teste para o ER Principal (banco local).
 *
 * Uso:  npx ts-node scripts/test-scenarios.ts <cenario>
 *
 * Cenários:
 *   clean              estado neutro (dia fechado, caixas indisponíveis, sem senhas de teste)
 *   1-rollover         sobras do dia anterior (senhas + caixas travados) e isDayOpen=true
 *   2-open-closed      dia fechado, caixas indisponíveis (para testar abrir caixa)
 *   3-orphan           dia aberto hoje; caixa 1 com senha CHAMANDO (operadora "sumiu")
 *   4-close-inservice  dia aberto hoje; caixa 2 com senha EM ATENDIMENTO
 *   5-timeout          dia aberto hoje; caixa 1 com senha CHAMANDO há 20 min (estoura timeout)
 *   6-restore-cancel   dia aberto hoje; 1 senha CANCELADA pré-atendimento + 1 cancelada pós-atendimento
 *   7-double-open      dia aberto hoje, sem sobras (para testar abrir o dia de novo)
 */

import { PrismaClient, CounterState, EntryChannel, TicketState } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { getBusinessDate } from '../src/common/business-date'

const prisma = new PrismaClient()

const ER_ID = 'cmq81bzdj0000qlh22vd6xw9e'
const C = {
  1: 'cmq82hf2w0007qlnoxz0iiluw',
  2: 'cmq82hf2y0009qlnoks1i6q1p',
  3: 'cmq8cvj7t0003qlovoctifgod',
  4: 'cmq8ootze002lql3eje74d63v',
  5: 'cmq8oxo1k0039ql3e4g7k22di',
  6: 'cmq8oxp6m003dql3e8ncxd73l',
  7: 'cmq8oxqmy003hql3e1l4lwhkd',
}
const OP = {
  camila: 'cmq8omqgw0003ql9olmpym09p',
  debora: 'cmq8omqgx0005ql9o326z3buj',
  mariana: 'cmq8omqgu0001ql9ozgc4z68c',
}

const today = getBusinessDate()
const yesterday = getBusinessDate(new Date(Date.now() - 48 * 3600_000))

async function rep(reCode: string, fullName: string, cpf: string, phone: string) {
  const found = await prisma.representative.findFirst({
    where: { OR: [{ reCode }, { cpf }, { phone }] },
  })
  if (found) return found
  return prisma.representative.create({
    data: {
      reCode,
      fullName,
      cpf,
      phone,
      birthDate: new Date('1990-01-01'),
      passwordHash: await bcrypt.hash('senha123', 10),
    },
  })
}

/** Remove senhas/eventos de teste e zera caixas. Não toca em dados reais antigos. */
async function clean() {
  const testReps = await prisma.representative.findMany({
    where: { OR: [{ reCode: { startsWith: 'TEST_' } }, { reCode: { startsWith: 'STALE_' } }] },
    select: { id: true },
  })
  const ids = testReps.map((r) => r.id)
  if (ids.length) {
    await prisma.auditEvent.deleteMany({ where: { representativeId: { in: ids } } })
    await prisma.ticket.deleteMany({ where: { representativeId: { in: ids } } })
  }
  // zera todos os caixas do ER
  await prisma.counter.updateMany({
    where: { erId: ER_ID },
    data: { state: CounterState.UNAVAILABLE, operatorId: null },
  })
}

async function ensureQueue(businessDate: Date, openedHoursAgo = 4) {
  return prisma.queue.upsert({
    where: { erId_businessDate: { erId: ER_ID, businessDate } },
    create: {
      erId: ER_ID,
      businessDate,
      openedAt: new Date(Date.now() - openedHoursAgo * 3600_000),
      nextSequence: 100,
      closedAt: null,
    },
    update: { closedAt: null },
  })
}

async function nextPos(queueId: string) {
  const q = await prisma.queue.update({
    where: { id: queueId },
    data: { nextSequence: { increment: 1 } },
    select: { nextSequence: true },
  })
  return q.nextSequence
}

function code(seq: number) {
  const letter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor((seq - 1) / 999) % 26]
  return `${letter}${String(((seq - 1) % 999) + 1).padStart(3, '0')}`
}

async function makeTicket(opts: {
  queueId: string
  rep: { id: string }
  state: TicketState
  counterId?: string
  operatorId?: string
  calledAt?: Date
  serviceStartedAt?: Date
  cancelledAt?: Date
  cancelReason?: string
  pausedAt?: Date
  pausedSeconds?: number
  channel?: EntryChannel
}) {
  const pos = await nextPos(opts.queueId)
  return prisma.ticket.create({
    data: {
      code: code(pos),
      erId: ER_ID,
      queueId: opts.queueId,
      representativeId: opts.rep.id,
      entryChannel: opts.channel ?? EntryChannel.QR_CODE,
      queuePosition: pos,
      state: opts.state,
      counterId: opts.counterId ?? null,
      operatorId: opts.operatorId ?? null,
      calledAt: opts.calledAt ?? null,
      serviceStartedAt: opts.serviceStartedAt ?? null,
      cancelledAt: opts.cancelledAt ?? null,
      cancelReason: opts.cancelReason ?? null,
      pausedAt: opts.pausedAt ?? null,
      pausedSeconds: opts.pausedSeconds ?? 0,
    },
  })
}

async function setDay(open: boolean) {
  await prisma.eR.update({
    where: { id: ER_ID },
    data: {
      isDayOpen: open,
      dayOpenedAt: open ? new Date() : undefined,
      dayClosedAt: open ? null : new Date(),
    },
  })
}

async function scenarioClean() {
  await clean()
  await setDay(false)
  console.log('CLEAN: dia fechado, caixas indisponíveis, senhas de teste removidas.')
}

async function scenario1Rollover() {
  await clean()
  const q = await ensureQueue(yesterday)
  const [a, b, c, d] = await Promise.all([
    rep('TEST_A', 'Ana Souza', '11144477735', '11991000001'),
    rep('TEST_B', 'Bia Lima', '98765432100', '11991000002'),
    rep('TEST_C', 'Carol Costa', '12345678909', '11991000003'),
    rep('TEST_D', 'Dani Rocha', '11122233396', '11991000004'),
  ])
  await prisma.counter.update({ where: { id: C[1] }, data: { state: CounterState.CALLING, operatorId: OP.camila } })
  await prisma.counter.update({ where: { id: C[2] }, data: { state: CounterState.IN_SERVICE, operatorId: OP.debora } })
  await prisma.counter.update({ where: { id: C[3] }, data: { state: CounterState.ACTIVE, operatorId: OP.mariana } })
  await prisma.counter.update({ where: { id: C[4] }, data: { state: CounterState.ACTIVE, operatorId: null } })
  // calledAt/pausedAt RECENTES de propósito: as senhas estão na fila de ONTEM
  // (businessDate < hoje), mas com horário recente para que os agendadores
  // (cron de chamada / sweep de pausa) NÃO as encerrem antes do teste. O
  // saneamento do openDay age por businessDate, então ainda as encerra.
  await makeTicket({ queueId: q.id, rep: a, state: TicketState.CALLING, counterId: C[1], operatorId: OP.camila, calledAt: new Date() })
  await makeTicket({ queueId: q.id, rep: b, state: TicketState.IN_SERVICE, counterId: C[2], operatorId: OP.debora, calledAt: new Date(), serviceStartedAt: new Date() })
  await makeTicket({ queueId: q.id, rep: c, state: TicketState.WAITING })
  await makeTicket({ queueId: q.id, rep: d, state: TicketState.PAUSED, pausedAt: new Date(), pausedSeconds: 60, channel: EntryChannel.CHECKIN_ASSISTED })
  // isDayOpen = false para a tela mostrar "Abrir operação do dia".
  await setDay(false)
  console.log('1-ROLLOVER pronto: 4 senhas presas de ONTEM (CALLING/IN_SERVICE/WAITING/PAUSED) com horário recente; caixas 1-4 ocupados; isDayOpen=false (tela mostra Abrir operação).')
}

async function resetOpPassword(operatorId: string) {
  await prisma.operator.update({
    where: { id: operatorId },
    data: { passwordHash: await bcrypt.hash('senha123', 10) },
  })
}

async function scenario2OpenClosed() {
  await clean()
  await setDay(false)
  await resetOpPassword(OP.camila)
  console.log('2-OPEN-CLOSED pronto: dia FECHADO, todos os caixas indisponíveis. Senha de Camila redefinida para senha123.')
}

async function scenario3Orphan() {
  await clean()
  const q = await ensureQueue(today)
  const a = await rep('TEST_A', 'Ana Souza', '11144477735', '11991000001')
  await prisma.counter.update({ where: { id: C[1] }, data: { state: CounterState.CALLING, operatorId: OP.camila } })
  await makeTicket({ queueId: q.id, rep: a, state: TicketState.CALLING, counterId: C[1], operatorId: OP.camila, calledAt: new Date() })
  await setDay(true)
  console.log('3-ORPHAN pronto: dia aberto HOJE; Caixa 1 (Camila) CHAMANDO a senha de Ana; operadora "sumiu".')
}

async function scenario4CloseInService() {
  await clean()
  const q = await ensureQueue(today)
  const b = await rep('TEST_B', 'Bia Lima', '98765432100', '11991000002')
  await prisma.counter.update({ where: { id: C[2] }, data: { state: CounterState.IN_SERVICE, operatorId: OP.debora } })
  await makeTicket({ queueId: q.id, rep: b, state: TicketState.IN_SERVICE, counterId: C[2], operatorId: OP.debora, calledAt: new Date(Date.now() - 10 * 60_000), serviceStartedAt: new Date(Date.now() - 5 * 60_000) })
  await setDay(true)
  console.log('4-CLOSE-INSERVICE pronto: dia aberto HOJE; Caixa 2 (Débora) EM ATENDIMENTO da senha de Bia.')
}

async function scenario5Timeout() {
  await clean()
  const q = await ensureQueue(today)
  const a = await rep('TEST_A', 'Ana Souza', '11144477735', '11991000001')
  await prisma.counter.update({ where: { id: C[1] }, data: { state: CounterState.CALLING, operatorId: OP.camila } })
  await makeTicket({ queueId: q.id, rep: a, state: TicketState.CALLING, counterId: C[1], operatorId: OP.camila, calledAt: new Date(Date.now() - 20 * 60_000) })
  await setDay(true)
  console.log('5-TIMEOUT pronto: dia aberto HOJE; Caixa 1 CHAMANDO há 20 min (estoura tolerância de 10 min na próxima varredura).')
}

async function scenario6RestoreCancel() {
  await clean()
  const q = await ensureQueue(today)
  const [c, e] = await Promise.all([
    rep('TEST_C', 'Carol Costa', '12345678909', '11991000003'),
    rep('TEST_E', 'Elaine Dias', '11144477790', '11991000005'),
  ])
  // cancelada ANTES do atendimento → pode restaurar
  await makeTicket({ queueId: q.id, rep: c, state: TicketState.CANCELLED, cancelledAt: new Date(Date.now() - 30 * 60_000), cancelReason: 'cadastro incorreto' })
  // cancelada APÓS início do atendimento → NÃO pode restaurar
  await makeTicket({ queueId: q.id, rep: e, state: TicketState.CANCELLED, cancelledAt: new Date(Date.now() - 20 * 60_000), cancelReason: 'correção operacional', serviceStartedAt: new Date(Date.now() - 40 * 60_000) })
  await setDay(true)
  console.log('6-RESTORE-CANCEL pronto: dia aberto HOJE; Carol CANCELADA pré-atendimento (restaurável); Elaine CANCELADA pós-atendimento (não restaurável).')
}

async function scenario7DoubleOpen() {
  await clean()
  await ensureQueue(today, 1)
  await setDay(true)
  console.log('7-DOUBLE-OPEN pronto: dia já ABERTO hoje, sem sobras. Tentar abrir de novo deve dar conflito.')
}

const scenarios: Record<string, () => Promise<void>> = {
  clean: scenarioClean,
  '1-rollover': scenario1Rollover,
  '2-open-closed': scenario2OpenClosed,
  '3-orphan': scenario3Orphan,
  '4-close-inservice': scenario4CloseInService,
  '5-timeout': scenario5Timeout,
  '6-restore-cancel': scenario6RestoreCancel,
  '7-double-open': scenario7DoubleOpen,
}

async function main() {
  const name = process.argv[2]
  const fn = scenarios[name]
  if (!fn) {
    console.error(`Cenário inválido. Use um de: ${Object.keys(scenarios).join(', ')}`)
    process.exit(1)
  }
  await fn()
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
