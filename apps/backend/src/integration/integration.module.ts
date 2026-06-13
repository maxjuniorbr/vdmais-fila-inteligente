import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { TicketModule } from '../ticket/ticket.module'
import { IntegrationController } from './integration.controller'
import { IntegrationService } from './integration.service'
import { IntegrationJwtStrategy } from './auth/integration-jwt.strategy'
import { ScopesGuard } from './auth/scopes.guard'
import { DevTokenController } from './dev-token/dev-token.controller'
import { DevTokenService } from './dev-token/dev-token.service'

@Module({
  imports: [PassportModule, TicketModule],
  controllers: [IntegrationController, DevTokenController],
  providers: [IntegrationService, IntegrationJwtStrategy, ScopesGuard, DevTokenService],
})
export class IntegrationModule {}
