import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Role } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { JwtPayload } from '../auth/jwt.strategy'
import { PanelTokenService } from './panel-token.service'

interface AuthorizeParams {
  erId: string
  clientType: unknown
  panelToken?: string
  staffToken?: string
}

@Injectable()
export class PanelAccessService {
  constructor(
    private readonly panelTokens: PanelTokenService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  authorize(params: AuthorizeParams): Promise<boolean> {
    if (params.clientType === 'panel') {
      return this.panelTokens.verify(params.erId, params.panelToken)
    }
    return this._authorizeStaff(params.erId, params.staffToken)
  }

  private async _authorizeStaff(erId: string, rawToken: string | undefined): Promise<boolean> {
    if (!rawToken) return false

    let payload: JwtPayload
    try {
      payload = this.jwt.verify<JwtPayload>(rawToken)
    } catch {
      return false
    }

    if (payload.role !== Role.ADMIN && payload.erId !== erId) return false

    const operator = await this.prisma.operator.findUnique({
      where: { id: payload.userId ?? payload.sub },
      select: { sessionVersion: true },
    })
    return !!operator && operator.sessionVersion === (payload.sv ?? 0)
  }
}
