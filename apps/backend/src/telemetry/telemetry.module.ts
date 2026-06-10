import { Module } from '@nestjs/common'
import { AuditLogModule } from '../audit-log/audit-log.module'
import { TelemetryController } from './telemetry.controller'
import { TelemetryService } from './telemetry.service'

@Module({
  imports: [AuditLogModule],
  controllers: [TelemetryController],
  providers: [TelemetryService],
})
export class TelemetryModule {}
