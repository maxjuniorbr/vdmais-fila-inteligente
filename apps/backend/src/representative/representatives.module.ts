import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { RepresentativeController } from '../auth/representative.controller'

@Module({
  imports: [AuthModule],
  controllers: [RepresentativeController],
})
export class RepresentativesModule {}
