import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { PanelService } from './panel.service'
import { PanelAccessGuard } from './panel-access.guard'

@Controller('panel')
export class PanelController {
  constructor(private readonly panelService: PanelService) {}

  @Get(':erId/state')
  @UseGuards(PanelAccessGuard)
  getState(@Param('erId') erId: string) {
    return this.panelService.getState(erId)
  }
}
