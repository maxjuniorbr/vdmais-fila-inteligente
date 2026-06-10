import { Module } from '@nestjs/common'
import { CounterController } from './counter.controller'
import { CounterService } from './counter.service'
import { PanelModule } from '../panel/panel.module'

@Module({
  imports: [PanelModule],
  controllers: [CounterController],
  providers: [CounterService],
  exports: [CounterService],
})
export class CounterModule {}
