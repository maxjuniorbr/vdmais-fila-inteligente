import { Injectable } from '@nestjs/common'
import { createHash, randomBytes } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { timingSafeStringEqual } from '../common/timing-safe-equal'

const TOKEN_BYTES = 32

@Injectable()
export class PanelTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async rotate(erId: string): Promise<string> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url')
    await this.prisma.eR.update({
      where: { id: erId },
      data: { panelTokenHash: this._hash(token) },
    })
    return token
  }

  async revoke(erId: string): Promise<void> {
    await this.prisma.eR.update({
      where: { id: erId },
      data: { panelTokenHash: null },
    })
  }

  async verify(erId: string, token: string | undefined): Promise<boolean> {
    if (!erId || !token) return false
    const er = await this.prisma.eR.findUnique({
      where: { id: erId },
      select: { panelTokenHash: true },
    })
    if (!er?.panelTokenHash) return false
    return timingSafeStringEqual(er.panelTokenHash, this._hash(token))
  }

  private _hash(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }
}
