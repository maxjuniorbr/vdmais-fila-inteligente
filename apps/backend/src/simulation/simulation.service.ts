import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { CounterState, EntryChannel, Role, TicketState } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { TicketService } from '../ticket/ticket.service'
import { QueueService } from '../queue/queue.service'
import { CounterService } from '../counter/counter.service'
import { AuthenticatedUser } from '../common/authenticated-user'

// Estados em que uma RE já possui senha ativa e não pode receber outra no mesmo
// ER (espelha a regra de TicketService.create / da constraint parcial do banco).
const ACTIVE_STATES: TicketState[] = [
  TicketState.WAITING,
  TicketState.CALLING,
  TicketState.IN_SERVICE,
  TicketState.PAUSED,
]

/**
 * Orquestra as regras REAIS do produto para acelerar testes e demonstrações.
 * O simulador NÃO cria cadastros: assume operadoras, caixas e REs já existentes
 * (criados pelo fluxo normal) e apenas compõe os services de domínio, montando
 * o AuthenticatedUser correspondente para cada ação.
 */
@Injectable()
export class SimulationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketService: TicketService,
    private readonly queueService: QueueService,
    private readonly counterService: CounterService,
  ) {}

  private operatorUser(erId: string, operatorId: string): AuthenticatedUser {
    return { userId: operatorId, role: Role.OPERATOR, erId }
  }

  private representativeUser(erId: string, reId: string, entryChannel: EntryChannel): AuthenticatedUser {
    return { userId: reId, role: Role.REPRESENTATIVE, erId, entryChannel }
  }

  private managerUser(erId: string): AuthenticatedUser {
    return { userId: `sim-manager-${erId}`, role: Role.MANAGER, erId }
  }

  listErs() {
    return this.prisma.eR.findMany({
      select: { id: true, name: true, isDayOpen: true },
      orderBy: { name: 'asc' },
    })
  }

  getState(erId: string) {
    return this.queueService.getQueueOverview(erId, this.managerUser(erId))
  }

  async listOperators(erId: string) {
    const operators = await this.prisma.operator.findMany({
      where: { erId, role: Role.OPERATOR },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        counter: { select: { number: true, state: true } },
      },
    })
    return operators.map((operator) => ({
      id: operator.id,
      name: operator.name,
      email: operator.email,
      hasOpenCounter: Boolean(operator.counter),
      counterNumber: operator.counter?.number ?? null,
    }))
  }

  async listCounters(erId: string) {
    const counters = await this.prisma.counter.findMany({
      where: { erId },
      orderBy: { number: 'asc' },
      select: {
        id: true,
        number: true,
        state: true,
        operator: { select: { id: true, name: true } },
      },
    })
    return counters.map((counter) => ({
      ...counter,
      isFree: counter.state === CounterState.UNAVAILABLE,
    }))
  }

  // Lista de REs do ER para o bloco de fila: inclui (a) quem já tem senha ativa
  // NESTE ER — com o estado/ações da persona — e (b) quem está livre em qualquer
  // ER (disponível para entrar). Quem está ativo em OUTRO ER não aparece, para
  // não misturar ERs. Cada RE traz sua senha ativa deste ER (id/code/estado).
  async listRepresentatives(erId: string) {
    const reps = await this.prisma.representative.findMany({
      where: {
        OR: [
          { tickets: { some: { erId, state: { in: ACTIVE_STATES } } } },
          { tickets: { none: { state: { in: ACTIVE_STATES } } } },
        ],
      },
      select: {
        id: true,
        fullName: true,
        reCode: true,
        tickets: {
          where: { erId, state: { in: ACTIVE_STATES } },
          select: { id: true, code: true, state: true },
          take: 1,
        },
      },
      orderBy: { reCode: 'asc' },
      take: 200,
    })
    return reps.map((rep) => ({
      id: rep.id,
      fullName: rep.fullName,
      reCode: rep.reCode,
      ticket: rep.tickets[0] ?? null,
    }))
  }

  /**
   * Abre os caixas selecionados auto-pareando cada um com uma operadora livre
   * (sem caixa aberto). Cada abertura passa por CounterService.openCounter, que
   * valida dia aberto, vincula a operadora e respeita 1 operadora por caixa.
   */
  async openCounters(erId: string, counterIds: string[]) {
    // Deduplica para não tentar abrir o mesmo caixa duas vezes (a 2ª tentativa
    // falharia com "já está aberto" e consumiria/devolveria uma operadora à toa).
    const uniqueIds = [...new Set(counterIds)]
    const [freePool, ownCounters] = await Promise.all([
      this.prisma.operator.findMany({
        where: { erId, role: Role.OPERATOR, counter: { is: null } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      // Conjunto dos caixas que de fato pertencem a este ER, para não tentar
      // abrir (e não consumir operadora com) um caixa de outro ER. Espelha a
      // guarda cross-ER que closeCounter já faz.
      this.prisma.counter.findMany({ where: { id: { in: uniqueIds }, erId }, select: { id: true } }),
    ])
    const validIds = new Set(ownCounters.map((counter) => counter.id))

    const results: Array<{
      counterId: string
      opened: boolean
      counterNumber?: number
      operator?: { id: string; name: string }
      reason?: string
    }> = []

    for (const counterId of uniqueIds) {
      if (!validIds.has(counterId)) {
        results.push({ counterId, opened: false, reason: 'Caixa não encontrado neste ER' })
        continue
      }
      const operator = freePool.shift()
      if (!operator) {
        results.push({ counterId, opened: false, reason: 'Sem operadora livre disponível' })
        continue
      }
      try {
        const counter = await this.counterService.openCounter(counterId, this.operatorUser(erId, operator.id))
        results.push({
          counterId,
          opened: true,
          counterNumber: counter.number,
          operator: { id: operator.id, name: operator.name },
        })
      } catch (error) {
        // Abertura falhou: devolve a operadora ao pool para o próximo caixa.
        freePool.unshift(operator)
        results.push({ counterId, opened: false, reason: this.messageOf(error) })
      }
    }

    return {
      opened: results.filter((result) => result.opened).length,
      skipped: results.filter((result) => !result.opened).length,
      results,
    }
  }

  /**
   * Fecha um caixa pela regra real (CounterService.closeCounter), usando a
   * operadora que o abriu. Se houver senha em aberto, a regra recusa o fechamento.
   */
  async closeCounter(erId: string, counterId: string) {
    const counter = await this.prisma.counter.findUnique({ where: { id: counterId } })
    if (counter?.erId !== erId) throw new NotFoundException('Caixa não encontrado neste ER')
    if (!counter.operatorId) throw new BadRequestException('O caixa não está aberto')
    return this.counterService.closeCounter(counterId, this.operatorUser(erId, counter.operatorId))
  }

  /**
   * Inclui REs existentes na fila usando TicketService.create (regra real).
   * REs que já têm senha ativa são ignoradas (a regra bloqueia duplicidade).
   */
  async addExistingToQueue(erId: string, representativeIds: string[], channel?: EntryChannel) {
    const entryChannel = channel ?? EntryChannel.QR_CODE
    // A inclusão direta entra como a própria RE (self-entry), que só aceita
    // QR_CODE ou LINK. CHECKIN_ASSISTED exige uma atendente e seria recusado
    // para todas as REs — falha cedo e claro em vez de "ignorar" cada uma.
    if (entryChannel === EntryChannel.CHECKIN_ASSISTED) {
      throw new BadRequestException('Canal inválido para inclusão direta: use QR_CODE ou LINK')
    }
    const results: Array<{ representativeId: string; included: boolean; code?: string; reason?: string }> = []

    for (const reId of representativeIds) {
      try {
        const ticket = await this.ticketService.create(this.representativeUser(erId, reId, entryChannel), {
          erId,
          entryChannel,
        })
        results.push({ representativeId: reId, included: true, code: ticket.code })
      } catch (error) {
        const reason = error instanceof ConflictException ? 'Já possui senha ativa' : this.messageOf(error)
        results.push({ representativeId: reId, included: false, reason })
      }
    }

    return {
      included: results.filter((result) => result.included).length,
      ignored: results.filter((result) => !result.included).length,
      results,
    }
  }

  /** "Não estou pronta": WAITING → PAUSED. */
  async pauseTicket(ticketId: string) {
    return this.ticketService.pauseTicket(ticketId, await this.ticketRepresentative(ticketId))
  }

  /** "Estou pronta": PAUSED → WAITING (volta para o fim da fila). */
  async resumeTicket(ticketId: string) {
    return this.ticketService.resumeTicket(ticketId, await this.ticketRepresentative(ticketId))
  }

  /** "Sair da fila": WAITING/PAUSED → CANCELLED (desistência da representante). */
  async cancelTicket(ticketId: string) {
    return this.ticketService.selfCancel(ticketId, await this.ticketRepresentative(ticketId))
  }

  private async ticketRepresentative(ticketId: string): Promise<string> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { representativeId: true },
    })
    if (!ticket) throw new NotFoundException('Senha não encontrada')
    return ticket.representativeId
  }

  /** Inicia o atendimento de uma senha chamada (CALLING → IN_SERVICE). */
  async startTicket(ticketId: string) {
    const { erId, operatorId } = await this.ticketOperator(ticketId)
    return this.ticketService.startService(ticketId, this.operatorUser(erId, operatorId))
  }

  /** Encerra o atendimento de uma senha em andamento (IN_SERVICE → FINISHED). */
  async finishTicket(ticketId: string) {
    const { erId, operatorId } = await this.ticketOperator(ticketId)
    return this.ticketService.finishService(ticketId, this.operatorUser(erId, operatorId))
  }

  /** Registra não comparecimento de uma senha chamada (CALLING → NO_SHOW). */
  async noShowTicket(ticketId: string) {
    const { erId, operatorId } = await this.ticketOperator(ticketId)
    return this.ticketService.noShow(ticketId, this.operatorUser(erId, operatorId))
  }

  private async ticketOperator(ticketId: string): Promise<{ erId: string; operatorId: string }> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { erId: true, operatorId: true },
    })
    if (!ticket) throw new NotFoundException('Senha não encontrada')
    if (!ticket.operatorId) throw new BadRequestException('A senha não tem operadora atribuída')
    return { erId: ticket.erId, operatorId: ticket.operatorId }
  }

  /**
   * Chama a próxima senha da fila em um caixa ativo específico, via callNext real
   * (WAITING → CALLING). A ordem segue a regra de produção: preferenciais primeiro
   * (isPriority DESC), depois por chegada (queuePosition ASC). É a ação "Chamar
   * próxima" da linha do caixa.
   */
  async callNextOnCounter(counterId: string) {
    const counter = await this.prisma.counter.findUnique({
      where: { id: counterId },
      select: { erId: true, operatorId: true },
    })
    if (!counter) throw new NotFoundException('Caixa não encontrado')
    if (!counter.operatorId) throw new BadRequestException('O caixa não está aberto')
    return this.queueService.callNext(counter.erId, counterId, this.operatorUser(counter.erId, counter.operatorId))
  }

  private messageOf(error: unknown): string {
    if (error instanceof Error) return error.message
    return 'Não foi possível concluir a ação'
  }
}
