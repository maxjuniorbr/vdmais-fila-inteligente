import { Module } from '@nestjs/common'
import { QueueController } from './queue.controller'
import { QueueService } from './queue.service'
import { PanelModule } from '../panel/panel.module'

@Module({
  imports: [PanelModule],
  controllers: [QueueController],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
