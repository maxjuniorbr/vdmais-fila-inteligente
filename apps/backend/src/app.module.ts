import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Operational endpoints need room for polling and WebSocket fallbacks.
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
  ],
  providers: [
    // Apply throttle globally; individual controllers can override with @Throttle()
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
