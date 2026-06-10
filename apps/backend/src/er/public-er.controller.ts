import { Controller, Get, Param } from '@nestjs/common'
import { ERService } from './er.service'

@Controller('public/ers')
export class PublicERController {
  constructor(private readonly erService: ERService) {}

  @Get(':id')
  get(@Param('id') id: string) {
    return this.erService.getPublic(id)
  }
}
