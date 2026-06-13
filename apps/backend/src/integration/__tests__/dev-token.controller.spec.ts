import { NotFoundException } from '@nestjs/common'
import { DevTokenController } from '../dev-token/dev-token.controller'
import { DevTokenService } from '../dev-token/dev-token.service'

describe('DevTokenController', () => {
  const devToken = { issue: jest.fn(), isEnabled: jest.fn(), publicJwk: jest.fn() }
  let controller: DevTokenController

  beforeEach(() => {
    jest.resetAllMocks()
    controller = new DevTokenController(devToken as unknown as DevTokenService)
  })

  it('delegates token issuance', () => {
    devToken.issue.mockReturnValue({ access_token: 't' })
    const result = controller.issue({
      grant_type: 'client_credentials',
      client_id: 'a',
      client_secret: 'b',
    })
    expect(result).toEqual({ access_token: 't' })
  })

  it('serves the JWKS when enabled', () => {
    devToken.isEnabled.mockReturnValue(true)
    devToken.publicJwk.mockReturnValue({ kty: 'RSA' })
    expect(controller.jwks()).toEqual({ keys: [{ kty: 'RSA' }] })
  })

  it('hides the JWKS (404) when disabled', () => {
    devToken.isEnabled.mockReturnValue(false)
    expect(() => controller.jwks()).toThrow(NotFoundException)
  })

  it('returns 404 when no public key is configured', () => {
    devToken.isEnabled.mockReturnValue(true)
    devToken.publicJwk.mockReturnValue(null)
    expect(() => controller.jwks()).toThrow(NotFoundException)
  })
})
