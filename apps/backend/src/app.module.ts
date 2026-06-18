import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { ThrottlerModule } from '@nestjs/throttler'
import { APP_GUARD } from '@nestjs/core'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { ERModule } from './er/er.module'
import { TicketModule } from './ticket/ticket.module'
import { CounterModule } from './counter/counter.module'
import { QueueModule } from './queue/queue.module'
import { PanelModule } from './panel/panel.module'
import { AuditLogModule } from './audit-log/audit-log.module'
import { MetricsModule } from './metrics/metrics.module'
import { OperatorModule } from './operator/operator.module'
import { RepresentativesModule } from './representative/representatives.module'
import { TelemetryModule } from './telemetry/telemetry.module'
import { ObservabilityModule } from './observability/observability.module'
import { AdminModule } from './admin/admin.module'
import { IntegrationModule } from './integration/integration.module'
import { SimulationModule } from './simulation/simulation.module'
import { ContextualThrottlerGuard } from './common/guards/contextual-throttler.guard'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
    PrismaModule,
    AuthModule,
    ERModule,
    TicketModule,
    CounterModule,
    QueueModule,
    PanelModule,
    AuditLogModule,
    MetricsModule,
    OperatorModule,
    RepresentativesModule,
    TelemetryModule,
    ObservabilityModule,
    AdminModule,
    IntegrationModule,
    SimulationModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ContextualThrottlerGuard },
  ],
})
export class AppModule {}
