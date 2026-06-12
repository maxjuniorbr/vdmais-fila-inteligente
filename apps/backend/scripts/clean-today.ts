/**
 * Limpa o histórico de atendimento (senhas, filas e eventos de auditoria) e
 * zera os caixas, mantendo as personas (contas de equipe e representantes).
 *
 * Uso: npx ts-node scripts/clean-today.ts  (apenas em DATABASE_URL local)
 */
import 'dotenv/config'
import { PrismaClient, CounterState } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const url = process.env.DATABASE_URL ?? ''
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    throw new Error('Recusado: DATABASE_URL não aponta para localhost.')
  }

  const audit = await prisma.auditEvent.deleteMany({})
  const tickets = await prisma.ticket.deleteMany({})
  const queues = await prisma.queue.deleteMany({})
  const counters = await prisma.counter.updateMany({
    data: { state: CounterState.UNAVAILABLE, operatorId: null },
  })
  const ers = await prisma.eR.updateMany({ data: { isDayOpen: false, dayClosedAt: new Date() } })

  const operators = await prisma.operator.count()
  const representatives = await prisma.representative.count()

  console.log(`Removidos -> auditEvents: ${audit.count} | senhas: ${tickets.count} | filas: ${queues.count}`)
  console.log(`Caixas zerados: ${counters.count} | ERs encerrados: ${ers.count}`)
  console.log(`Mantidos -> contas: ${operators} | representantes: ${representatives}`)
}

main()
  .catch((error) => {
    console.error('ERRO:', error.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
