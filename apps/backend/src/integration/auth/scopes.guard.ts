import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { SCOPES_KEY } from './scopes.decorator'

@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!required || required.length === 0) {
      throw new ForbiddenException({ code: 'INSUFFICIENT_SCOPE', message: 'Escopo não declarado' })
    }

    const { user } = context.switchToHttp().getRequest()
    const granted: string[] = user?.scopes ?? []
    const ok = required.every((scope) => granted.includes(scope))
    if (!ok) {
      throw new ForbiddenException({ code: 'INSUFFICIENT_SCOPE', message: 'Escopo insuficiente' })
    }
    return true
  }
}
