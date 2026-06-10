import { Module } from '@nestjs/common'
import { PanelGateway } from './panel.gateway'
import { PanelController } from './panel.controller'
import { PanelService } from './panel.service'
import { AuditLogModule } from '../audit-log/audit-log.module'

@Module({
  imports: [AuditLogModule],
  controllers: [PanelController],
  providers: [PanelGateway, PanelService],
  exports: [PanelGateway, PanelService],
})
export class PanelModule {}
