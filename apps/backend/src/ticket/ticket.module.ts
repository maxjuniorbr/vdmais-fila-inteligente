import { Module } from '@nestjs/common'
import { TicketController } from './ticket.controller'
import { TicketService } from './ticket.service'
import { PanelModule } from '../panel/panel.module'

@Module({
  imports: [PanelModule],
  controllers: [TicketController],
  providers: [TicketService],
  exports: [TicketService],
})
export class TicketModule {}
