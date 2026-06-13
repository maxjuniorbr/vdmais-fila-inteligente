import { Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { INTEGRATION_JWT_STRATEGY } from './integration-jwt.strategy'

@Injectable()
export class IntegrationJwtGuard extends AuthGuard(INTEGRATION_JWT_STRATEGY) {}
