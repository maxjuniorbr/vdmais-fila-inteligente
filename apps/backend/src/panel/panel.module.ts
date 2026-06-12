import { Module } from '@nestjs/common'
import { PanelGateway } from './panel.gateway'
import { PanelController } from './panel.controller'
import { PanelService } from './panel.service'
import { PanelTokenService } from './panel-token.service'
import { PanelAccessService } from './panel-access.service'
import { PanelAccessGuard } from './panel-access.guard'
import { AuditLogModule } from '../audit-log/audit-log.module'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuditLogModule, AuthModule],
  controllers: [PanelController],
  providers: [
    PanelGateway,
    PanelService,
    PanelTokenService,
    PanelAccessService,
    PanelAccessGuard,
  ],
  exports: [PanelGateway, PanelService, PanelTokenService],
})
export class PanelModule {}
