import { Module } from '@nestjs/common'
import { TicketController } from './ticket.controller'
import { TicketService } from './ticket.service'
import { TicketTimeoutService } from './ticket-timeout.service'
import { PanelModule } from '../panel/panel.module'

@Module({
  imports: [PanelModule],
  controllers: [TicketController],
  providers: [TicketService, TicketTimeoutService],
  exports: [TicketService, TicketTimeoutService],
})
export class TicketModule {}
