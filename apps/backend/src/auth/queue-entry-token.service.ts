import { createHmac } from 'node:crypto'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { EntryChannel } from '@prisma/client'
import { getJwtSecret } from './jwt.config'

const TOKEN_KIND = 'queue-entry'
const TOKEN_AUDIENCE = 'queue-entry'
const TOKEN_ISSUER = 'vdmais-fila-inteligente'
const QR_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60
const LINK_TOKEN_TTL_SECONDS = 24 * 60 * 60
const PUBLIC_ENTRY_CHANNELS: readonly EntryChannel[] = [
  EntryChannel.QR_CODE,
  EntryChannel.LINK,
]

type PublicEntryChannel = (typeof EntryChannel)['QR_CODE' | 'LINK']

interface QueueEntryTokenPayload {
  kind: typeof TOKEN_KIND
  erId: string
  entryChannel: PublicEntryChannel
}

export interface QueueEntryAccess {
  token: string
  expiresAt: string
}

@Injectable()
export class QueueEntryTokenService {
  private readonly signingSecret: Buffer

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.signingSecret = createHmac('sha256', getJwtSecret(config))
      .update('queue-entry-token-v1')
      .digest()
  }

  issue(erId: string, entryChannel: PublicEntryChannel): QueueEntryAccess {
    const ttlSeconds =
      entryChannel === EntryChannel.QR_CODE ? QR_TOKEN_TTL_SECONDS : LINK_TOKEN_TTL_SECONDS
    const token = this.jwt.sign(
      { kind: TOKEN_KIND, erId, entryChannel } satisfies QueueEntryTokenPayload,
      {
        secret: this.signingSecret,
        audience: TOKEN_AUDIENCE,
        issuer: TOKEN_ISSUER,
        subject: erId,
        expiresIn: ttlSeconds,
      },
    )
    return {
      token,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    }
  }

  verify(
    token: string,
    expectedErId: string,
    expectedChannel?: EntryChannel,
  ): QueueEntryTokenPayload {
    try {
      const payload = this.jwt.verify<QueueEntryTokenPayload>(token, {
        secret: this.signingSecret,
        audience: TOKEN_AUDIENCE,
        issuer: TOKEN_ISSUER,
        subject: expectedErId,
      })
      if (
        payload.kind !== TOKEN_KIND ||
        payload.erId !== expectedErId ||
        !PUBLIC_ENTRY_CHANNELS.includes(payload.entryChannel) ||
        (expectedChannel !== undefined && payload.entryChannel !== expectedChannel)
      ) {
        throw new Error('invalid queue entry token')
      }
      return payload
    } catch {
      throw new UnauthorizedException('Acesso à fila inválido ou expirado')
    }
  }
}
