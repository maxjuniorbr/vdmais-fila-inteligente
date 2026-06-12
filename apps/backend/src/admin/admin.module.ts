import { Module } from '@nestjs/common'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'
import { AuditLogModule } from '../audit-log/audit-log.module'
import { PanelModule } from '../panel/panel.module'

@Module({
  imports: [AuditLogModule, PanelModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
