import { createHmac } from 'node:crypto'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { EntryChannel } from '@prisma/client'
import { getJwtSecret } from './jwt.config'

const TOKEN_KIND = 'queue-entry'
const TOKEN_AUDIENCE = 'queue-entry'
const TOKEN_ISSUER = 'vdmais-fila-inteligente'
const PUBLIC_ENTRY_CHANNELS: ReadonlySet<EntryChannel> = new Set([
  EntryChannel.QR_CODE,
  EntryChannel.LINK,
])

type PublicEntryChannel = (typeof EntryChannel)['QR_CODE' | 'LINK']

// Per-channel entry-token TTL: overridable via env, falling back to 24h. The key
// is derived from the EntryChannel value — QUEUE_ENTRY_QR_CODE_TTL_SECONDS and
// QUEUE_ENTRY_LINK_TTL_SECONDS — so it stays 1:1 with the channel enum.
const DEFAULT_ENTRY_TTL_SECONDS = 24 * 60 * 60

function ttlEnvKey(entryChannel: PublicEntryChannel): string {
  return `QUEUE_ENTRY_${entryChannel}_TTL_SECONDS`
}

function readTtlSeconds(config: ConfigService, entryChannel: PublicEntryChannel): number {
  const raw = config.get<string>(ttlEnvKey(entryChannel))?.trim()
  // Strict positive decimal only — reject hex/scientific/float (e.g. "0x10", "1e3")
  // so a typo falls back to the default instead of a surprising magnitude.
  if (raw && /^\d+$/.test(raw) && Number(raw) > 0) {
    return Number(raw)
  }
  return DEFAULT_ENTRY_TTL_SECONDS
}

interface QueueEntryTokenPayload {
  kind: typeof TOKEN_KIND
  erId: string
  entryChannel: PublicEntryChannel
}

// verify() also surfaces the token's own `exp` (JWT claim, seconds since epoch) so
// the session can be bounded to the entry channel's validity.
export type VerifiedQueueEntry = QueueEntryTokenPayload & { exp: number }

export interface QueueEntryAccess {
  token: string
  expiresAt: string
}

@Injectable()
export class QueueEntryTokenService {
  private readonly signingSecret: Buffer
  private readonly ttlSecondsByChannel: Record<PublicEntryChannel, number>

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.signingSecret = createHmac('sha256', getJwtSecret(config))
      .update('queue-entry-token-v1')
      .digest()
    this.ttlSecondsByChannel = {
      [EntryChannel.QR_CODE]: readTtlSeconds(config, EntryChannel.QR_CODE),
      [EntryChannel.LINK]: readTtlSeconds(config, EntryChannel.LINK),
    }
  }

  issue(erId: string, entryChannel: PublicEntryChannel): QueueEntryAccess {
    const ttlSeconds = this.ttlSecondsByChannel[entryChannel]
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
  ): VerifiedQueueEntry {
    try {
      const payload = this.jwt.verify<VerifiedQueueEntry>(token, {
        secret: this.signingSecret,
        audience: TOKEN_AUDIENCE,
        issuer: TOKEN_ISSUER,
        subject: expectedErId,
      })
      if (
        payload.kind !== TOKEN_KIND ||
        payload.erId !== expectedErId ||
        !PUBLIC_ENTRY_CHANNELS.has(payload.entryChannel) ||
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
