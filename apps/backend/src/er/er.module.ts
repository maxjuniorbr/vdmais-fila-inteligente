import { Module } from '@nestjs/common'
import { ERController } from './er.controller'
import { ERService } from './er.service'
import { PanelModule } from '../panel/panel.module'
import { PublicERController } from './public-er.controller'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule, PanelModule],
  controllers: [ERController, PublicERController],
  providers: [ERService],
  exports: [ERService],
})
export class ERModule {}
