import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Request } from 'express'
import { PanelTokenService } from './panel-token.service'

@Injectable()
export class PanelAccessGuard implements CanActivate {
  constructor(private readonly panelTokens: PanelTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>()
    const erId = request.params?.['erId']
    const allowed = await this.panelTokens.verify(
      typeof erId === 'string' ? erId : '',
      this._extractToken(request),
    )
    if (!allowed) throw new UnauthorizedException('Token do painel inválido')
    return true
  }

  private _extractToken(request: Request): string | undefined {
    const header = request.headers['x-panel-token']
    if (typeof header === 'string' && header.length > 0) return header
    const query = request.query['token']
    return typeof query === 'string' ? query : undefined
  }
}
