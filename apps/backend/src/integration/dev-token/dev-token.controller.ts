import { Body, Controller, Get, HttpCode, NotFoundException, Post } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { DevTokenRequestDto } from './dev-token.dto'
import { DevTokenService } from './dev-token.service'

@ApiExcludeController()
@Controller('integration')
export class DevTokenController {
  constructor(private readonly devToken: DevTokenService) {}

  @Post('oauth/token')
  @HttpCode(200)
  issue(@Body() body: DevTokenRequestDto) {
    return this.devToken.issue(body)
  }

  @Get('.well-known/jwks.json')
  jwks() {
    const jwk = this.devToken.isEnabled() ? this.devToken.publicJwk() : null
    if (!jwk) throw new NotFoundException()
    return { keys: [jwk] }
  }
}
