import { Global, Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { PrismaModule } from '../prisma/prisma.module'
import { ObservabilityController } from './observability.controller'
import { ObservabilityService } from './observability.service'
import { RequestLoggingInterceptor } from './request-logging.interceptor'

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [ObservabilityController],
  providers: [
    ObservabilityService,
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
  ],
  exports: [ObservabilityService],
})
export class ObservabilityModule {}
