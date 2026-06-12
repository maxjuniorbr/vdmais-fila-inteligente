import { Controller, Get, Headers, Param, Query } from '@nestjs/common'
import { EntryChannel } from '@prisma/client'
import { ERService } from './er.service'
import { QueueEntryTokenService } from '../auth/queue-entry-token.service'

@Controller('public/ers')
export class PublicERController {
  constructor(
    private readonly erService: ERService,
    private readonly queueEntryTokens: QueueEntryTokenService,
  ) {}

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Headers('x-entry-token') token?: string,
    @Query('source') source?: string,
  ) {
    const entryChannel = source === 'link' ? EntryChannel.LINK : EntryChannel.QR_CODE
    if (token) this.queueEntryTokens.verify(token, id, entryChannel)
    const er = await this.erService.getPublic(id)
    return { ...er, entryChannel }
  }
}
