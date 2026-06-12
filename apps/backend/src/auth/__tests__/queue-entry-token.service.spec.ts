import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { EntryChannel } from '@prisma/client'
import { QueueEntryTokenService } from '../queue-entry-token.service'

function createService() {
  const config = {
    get: (key: string) => {
      if (key === 'JWT_SECRET') return 'queue-entry-test-secret'
      if (key === 'NODE_ENV') return 'test'
      return undefined
    },
  } as unknown as ConfigService
  return new QueueEntryTokenService(new JwtService(), config)
}

describe('QueueEntryTokenService', () => {
  afterEach(() => jest.useRealTimers())

  it.each([EntryChannel.QR_CODE, EntryChannel.LINK] as const)(
    'issues and verifies a token bound to the ER and %s channel',
    (entryChannel) => {
      const service = createService()
      const access = service.issue('er-1', entryChannel)

      expect(service.verify(access.token, 'er-1', entryChannel)).toMatchObject({
        erId: 'er-1',
        entryChannel,
      })
      expect(new Date(access.expiresAt).getTime()).toBeGreaterThan(Date.now())
    },
  )

  it('rejects a token used for another ER or channel', () => {
    const service = createService()
    const { token } = service.issue('er-1', EntryChannel.QR_CODE)

    expect(() => service.verify(token, 'er-2', EntryChannel.QR_CODE)).toThrow(
      'Acesso à fila inválido ou expirado',
    )
    expect(() => service.verify(token, 'er-1', EntryChannel.LINK)).toThrow(
      'Acesso à fila inválido ou expirado',
    )
  })

  it('rejects an expired token', () => {
    jest.useFakeTimers({ now: new Date('2026-06-12T12:00:00.000Z') })
    const service = createService()
    const { token } = service.issue('er-1', EntryChannel.LINK)

    jest.setSystemTime(new Date('2026-06-13T12:00:01.000Z'))

    expect(() => service.verify(token, 'er-1', EntryChannel.LINK)).toThrow(
      'Acesso à fila inválido ou expirado',
    )
  })
})
