import { Module } from '@nestjs/common'
import { SimulationController } from './simulation.controller'
import { SimulationService } from './simulation.service'
import { TicketModule } from '../ticket/ticket.module'
import { QueueModule } from '../queue/queue.module'
import { CounterModule } from '../counter/counter.module'

/**
 * Módulo isolado da ferramenta interna de simulação. Reaproveita os services de
 * domínio já exportados (TicketService, QueueService, CounterService) e o
 * PrismaService global — sem alterar a regra de negócio do produto.
 */
@Module({
  imports: [TicketModule, QueueModule, CounterModule],
  controllers: [SimulationController],
  providers: [SimulationService],
})
export class SimulationModule {}
