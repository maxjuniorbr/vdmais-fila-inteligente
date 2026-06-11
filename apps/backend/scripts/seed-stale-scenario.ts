/**
 * Cria o cenário de débito operacional do dia anterior no ER Principal.
 *
 * Situação: operação de ontem não foi encerrada. As seguintes senhas ficaram
 * presas na fila de ontem e os caixas correspondentes estão travados:
 *
 *  Caixa 1 (Camila)   → senha CHAMANDO  (ticket state = CALLING)
 *  Caixa 2 (Débora)   → senha EM ATENDIMENTO (ticket state = IN_SERVICE)
 *  Caixa 3 (Mariana)  → orphan: caixa ACTIVE + operatorId, mas SEM senha ativa
 *  Caixas 4 e 5 (sem operadora) → estado ACTIVE (foram abertos e nunca fechados)
 *
 *  Fila de ontem:
 *   A) CALLING   – vinculada ao Caixa 1
 *   B) IN_SERVICE – vinculada ao Caixa 2
 *   C) WAITING   – aguardando (sem caixa)
 *   D) PAUSED    – pausada pela RE antes de sair
 *
 * O ER está com isDayOpen = true e a fila de hoje também existe (abertura
 * não foi possível por causa deste estado).
 */

import { PrismaClient, CounterState, EntryChannel, TicketState } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

const ER_ID = 'cmq81bzdj0000qlh22vd6xw9e'

// caixas e operadoras já existentes no banco
const COUNTER_1 = 'cmq82hf2w0007qlnoxz0iiluw'   // number 1
const COUNTER_2 = 'cmq82hf2y0009qlnoks1i6q1p'   // number 2
const COUNTER_3 = 'cmq8cvj7t0003qlovoctifgod'   // number 3
const COUNTER_4 = 'cmq8ootze002lql3eje74d63v'   // number 4
const COUNTER_5 = 'cmq8oxo1k0039ql3e4g7k22di'   // number 5

const OPERATOR_1 = 'cmq8omqgw0003ql9olmpym09p'  // Camila (caixa 1)
const OPERATOR_2 = 'cmq8omqgx0005ql9o326z3buj'  // Débora  (caixa 2)
const OPERATOR_3 = 'cmq8omqgu0001ql9ozgc4z68c'  // Mariana (caixa 3)

const yesterday = new Date()
yesterday.setDate(yesterday.getDate() - 1)
// businessDate: meia-noite UTC de ontem
const businessDateYesterday = new Date(
  Date.UTC(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()),
)

async function main() {
  console.log('Iniciando criação do cenário de débito...')

  // ── 1. Upsert da fila de ontem (pode já existir) ─────────────────────────
  const staleQueue = await prisma.queue.upsert({
    where: { erId_businessDate: { erId: ER_ID, businessDate: businessDateYesterday } },
    create: {
      erId: ER_ID,
      businessDate: businessDateYesterday,
      openedAt: new Date(businessDateYesterday.getTime() + 8 * 3600_000), // 08:00 de ontem
      nextSequence: 4,
      closedAt: null,
    },
    update: { closedAt: null },
  })
  console.log(`Fila de ontem: ${staleQueue.id} (${businessDateYesterday.toISOString().slice(0, 10)})`)

  // ── 2. Criar representantes para as senhas ────────────────────────────────
  async function upsertRep(reCode: string, fullName: string, cpf: string, phone: string) {
    const existing = await prisma.representative.findUnique({ where: { reCode } })
    if (existing) return existing
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

  const [repA, repB, repC, repD] = await Promise.all([
    upsertRep('STALE_A', 'Ana Souza',    '11144477735', '11991000001'),
    upsertRep('STALE_B', 'Bia Lima',     '98765432100', '11991000002'),
    upsertRep('STALE_C', 'Carol Costa',  '12345678909', '11991000003'),
    upsertRep('STALE_D', 'Dani Rocha',   '11122233396', '11991000004'),
  ])
  console.log('Representantes criadas/encontradas.')

  // ── 3. Limpar senhas de cenário anterior (idempotência) ───────────────────
  await prisma.ticket.deleteMany({
    where: {
      erId: ER_ID,
      queueId: staleQueue.id,
      representativeId: { in: [repA.id, repB.id, repC.id, repD.id] },
    },
  })

  // ── 4. Ajustar estado dos caixas ──────────────────────────────────────────
  await Promise.all([
    prisma.counter.update({ where: { id: COUNTER_1 }, data: { state: CounterState.CALLING,    operatorId: OPERATOR_1 } }),
    prisma.counter.update({ where: { id: COUNTER_2 }, data: { state: CounterState.IN_SERVICE, operatorId: OPERATOR_2 } }),
    prisma.counter.update({ where: { id: COUNTER_3 }, data: { state: CounterState.ACTIVE,     operatorId: OPERATOR_3 } }), // órfão
    prisma.counter.update({ where: { id: COUNTER_4 }, data: { state: CounterState.ACTIVE,     operatorId: null } }),        // fantasma
    prisma.counter.update({ where: { id: COUNTER_5 }, data: { state: CounterState.ACTIVE,     operatorId: null } }),        // fantasma
  ])
  console.log('Estados dos caixas ajustados.')

  // ── 5. Criar senhas travadas de ontem ─────────────────────────────────────
  const calledAt  = new Date(businessDateYesterday.getTime() + 15 * 3600_000) // 15:00 de ontem
  const startedAt = new Date(businessDateYesterday.getTime() + 15 * 3600_000 + 5 * 60_000)

  const [ticketA, ticketB, ticketC, ticketD] = await Promise.all([
    // A — CALLING (caixa 1, Camila)
    prisma.ticket.create({
      data: {
        code: 'B021',
        erId: ER_ID,
        queueId: staleQueue.id,
        representativeId: repA.id,
        entryChannel: EntryChannel.QR_CODE,
        queuePosition: 21,
        state: TicketState.CALLING,
        counterId: COUNTER_1,
        operatorId: OPERATOR_1,
        calledAt,
      },
    }),
    // B — IN_SERVICE (caixa 2, Débora)
    prisma.ticket.create({
      data: {
        code: 'B022',
        erId: ER_ID,
        queueId: staleQueue.id,
        representativeId: repB.id,
        entryChannel: EntryChannel.LINK,
        queuePosition: 22,
        state: TicketState.IN_SERVICE,
        counterId: COUNTER_2,
        operatorId: OPERATOR_2,
        calledAt,
        serviceStartedAt: startedAt,
      },
    }),
    // C — WAITING (sem caixa)
    prisma.ticket.create({
      data: {
        code: 'B023',
        erId: ER_ID,
        queueId: staleQueue.id,
        representativeId: repC.id,
        entryChannel: EntryChannel.QR_CODE,
        queuePosition: 23,
        state: TicketState.WAITING,
      },
    }),
    // D — PAUSED (pausada pela RE)
    prisma.ticket.create({
      data: {
        code: 'B024',
        erId: ER_ID,
        queueId: staleQueue.id,
        representativeId: repD.id,
        entryChannel: EntryChannel.CHECKIN_ASSISTED,
        queuePosition: 24,
        state: TicketState.PAUSED,
        pausedAt: new Date(businessDateYesterday.getTime() + 14 * 3600_000),
        pausedSeconds: 3600,
      },
    }),
  ])

  // ── 6. Marcar ER como isDayOpen = true (deixou de ontem) ──────────────────
  await prisma.eR.update({
    where: { id: ER_ID },
    data: { isDayOpen: true, dayOpenedAt: new Date(businessDateYesterday.getTime() + 8 * 3600_000) },
  })

  console.log('\nCenário criado com sucesso!\n')
  console.log('═════════════════════════════════════════════════')
  console.log('SENHAS DE ONTEM (fila travada):')
  console.log(`  B021 [CALLING]    → ${repA.fullName}  – Caixa 1 (Camila)`)
  console.log(`  B022 [IN_SERVICE] → ${repB.fullName}   – Caixa 2 (Débora)`)
  console.log(`  B023 [WAITING]    → ${repC.fullName}  – sem caixa`)
  console.log(`  B024 [PAUSED]     → ${repD.fullName}    – pausada`)
  console.log('\nCAIXAS TRAVADOS:')
  console.log('  Caixa 1  – CALLING    – Camila Assunção')
  console.log('  Caixa 2  – IN_SERVICE – Débora Monteiro')
  console.log('  Caixa 3  – ACTIVE (órfão, sem senha ativa) – Mariana Figueiredo')
  console.log('  Caixa 4  – ACTIVE (fantasma, sem operadora)')
  console.log('  Caixa 5  – ACTIVE (fantasma, sem operadora)')
  console.log('═════════════════════════════════════════════════')
  console.log('\nER isDayOpen = true, fila de ontem aberta.')
  console.log('Execute "Abrir operação do dia" para acionar o saneamento automático.\n')

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
