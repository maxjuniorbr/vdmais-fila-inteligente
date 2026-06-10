import { Controller, Get, Param } from '@nestjs/common'
import { PanelService } from './panel.service'

@Controller('panel')
export class PanelController {
  constructor(private readonly panelService: PanelService) {}

  @Get(':erId/state')
  getState(@Param('erId') erId: string) {
    return this.panelService.getState(erId)
  }
}
