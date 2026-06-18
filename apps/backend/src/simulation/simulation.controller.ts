import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { SimulationGuard } from './simulation.guard'
import { SimulationService } from './simulation.service'
import {
  AddRepresentativesDto,
  CloseCounterDto,
  CounterActionDto,
  OpenCountersDto,
  TicketActionDto,
} from './dto/simulation.dto'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'

/**
 * Console de simulação operacional (ferramenta interna). Protegido em camadas:
 * SimulationGuard bloqueia produção / banco remoto, e apenas uma sessão ADMIN
 * autenticada (JWT) pode acessar. Não deve ser exposto fora de desenvolvimento.
 */
@Controller('simulation')
@UseGuards(SimulationGuard, JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class SimulationController {
  constructor(private readonly simulation: SimulationService) {}

  @Get('ers')
  listErs() {
    return this.simulation.listErs()
  }

  @Get('state')
  getState(@Query('erId') erId: string) {
    return this.simulation.getState(erId)
  }

  @Get('operators')
  listOperators(@Query('erId') erId: string) {
    return this.simulation.listOperators(erId)
  }

  @Get('counters')
  listCounters(@Query('erId') erId: string) {
    return this.simulation.listCounters(erId)
  }

  @Get('representatives')
  listRepresentatives(@Query('erId') erId: string) {
    return this.simulation.listRepresentatives(erId)
  }

  @Post('counters/open')
  openCounters(@Body() dto: OpenCountersDto) {
    return this.simulation.openCounters(dto.erId, dto.counterIds)
  }

  @Post('counters/close')
  closeCounter(@Body() dto: CloseCounterDto) {
    return this.simulation.closeCounter(dto.erId, dto.counterId)
  }

  @Post('counters/call-next')
  callNext(@Body() dto: CounterActionDto) {
    return this.simulation.callNextOnCounter(dto.counterId)
  }

  @Post('queue/add-existing')
  addExisting(@Body() dto: AddRepresentativesDto) {
    return this.simulation.addExistingToQueue(dto.erId, dto.representativeIds, dto.channel)
  }

  @Post('queue/pause')
  pauseTicket(@Body() dto: TicketActionDto) {
    return this.simulation.pauseTicket(dto.ticketId)
  }

  @Post('queue/resume')
  resumeTicket(@Body() dto: TicketActionDto) {
    return this.simulation.resumeTicket(dto.ticketId)
  }

  @Post('queue/cancel')
  cancelTicket(@Body() dto: TicketActionDto) {
    return this.simulation.cancelTicket(dto.ticketId)
  }

  @Post('attendance/start')
  startTicket(@Body() dto: TicketActionDto) {
    return this.simulation.startTicket(dto.ticketId)
  }

  @Post('attendance/finish')
  finishTicket(@Body() dto: TicketActionDto) {
    return this.simulation.finishTicket(dto.ticketId)
  }

  @Post('attendance/no-show')
  noShowTicket(@Body() dto: TicketActionDto) {
    return this.simulation.noShowTicket(dto.ticketId)
  }
}
