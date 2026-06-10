import { Module } from '@nestjs/common'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'
import { AuditLogModule } from '../audit-log/audit-log.module'

@Module({
  imports: [AuditLogModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
