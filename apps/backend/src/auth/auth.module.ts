import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtStrategy } from './jwt.strategy'
import { getJwtExpiresInSeconds, getJwtSecret } from './jwt.config'
import { AuditLogModule } from '../audit-log/audit-log.module'
import { QueueEntryTokenService } from './queue-entry-token.service'
import { LoginThrottleService } from './login-throttle.service'

@Module({
  imports: [
    PassportModule,
    AuditLogModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: getJwtSecret(config),
        signOptions: { expiresIn: getJwtExpiresInSeconds(config) },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, QueueEntryTokenService, LoginThrottleService],
  exports: [JwtModule, AuthService, QueueEntryTokenService],
})
export class AuthModule {}
