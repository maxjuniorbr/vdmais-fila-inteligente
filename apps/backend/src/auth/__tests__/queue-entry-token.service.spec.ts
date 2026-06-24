import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { EntryChannel } from '@prisma/client'
import { QueueEntryTokenService } from '../queue-entry-token.service'

function createService(secret = 'queue-entry-test-secret', env: Record<string, string> = {}) {
  const config = {
    get: (key: string) => {
      if (key === 'JWT_SECRET') return secret
      if (key === 'NODE_ENV') return 'test'
      return env[key]
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

  it.each([EntryChannel.QR_CODE, EntryChannel.LINK] as const)(
    'falls back to a 24h exp for the %s channel when the env is unset',
    (entryChannel) => {
      jest.useFakeTimers({ now: new Date('2026-06-12T12:00:00.000Z') })
      const service = createService()
      const { token } = service.issue('er-1', entryChannel)

      const verified = service.verify(token, 'er-1', entryChannel)

      expect(verified.exp).toBe(Math.floor(Date.now() / 1000) + 24 * 60 * 60)
    },
  )

  it('derives the TTL env key from the channel and honors an override', () => {
    jest.useFakeTimers({ now: new Date('2026-06-12T12:00:00.000Z') })
    const service = createService('queue-entry-test-secret', {
      QUEUE_ENTRY_QR_CODE_TTL_SECONDS: '3600',
    })

    const { token } = service.issue('er-1', EntryChannel.QR_CODE)

    expect(service.verify(token, 'er-1', EntryChannel.QR_CODE).exp).toBe(
      Math.floor(Date.now() / 1000) + 3600,
    )
  })

  it.each(['not-a-number', '0x10', '1e3', '12.5', '-5', '0', ''])(
    'falls back to 24h when the env value %p is not a positive decimal',
    (value) => {
      jest.useFakeTimers({ now: new Date('2026-06-12T12:00:00.000Z') })
      const service = createService('queue-entry-test-secret', {
        QUEUE_ENTRY_LINK_TTL_SECONDS: value,
      })

      const { token } = service.issue('er-1', EntryChannel.LINK)

      expect(service.verify(token, 'er-1', EntryChannel.LINK).exp).toBe(
        Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      )
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

  it('rejects a token signed under a different JWT secret', () => {
    const issuer = createService('secret-a')
    const { token } = issuer.issue('er-1', EntryChannel.QR_CODE)
    // A different JWT_SECRET must derive a different signing key, so the token
    // fails verification — guards against a constant/derivation-less secret.
    const verifier = createService('secret-b')

    expect(() => verifier.verify(token, 'er-1', EntryChannel.QR_CODE)).toThrow(
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
