import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayDisconnect,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { AuditLogService } from '../audit-log/audit-log.service'
import { PanelAccessService } from './panel-access.service'

@WebSocketGateway({
  cors: {
    origin: process.env['FRONTEND_URL'] ?? 'http://localhost:5173',
    credentials: false,
  },
})
export class PanelGateway implements OnGatewayDisconnect {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly access: PanelAccessService,
  ) {}

  @WebSocketServer()
  server!: Server

  emitToER(erId: string, event: string, payload: unknown) {
    const room = this.server.to(`er:${erId}`)
    room.emit(event, payload)
    room.emit('panel.updated', { event, payload })
    void this.auditLog
      .log({
        eventType: 'panel_updated',
        erId,
        metadata: { event },
      })
      .catch(() => undefined)
  }

  @SubscribeMessage('joinER')
  async handleJoinER(@MessageBody() body: unknown, @ConnectedSocket() client: Socket) {
    const erId = this._extractErId(body)
    if (typeof erId !== 'string' || erId.length < 10 || erId.length > 40) return

    const clientType = this._readField(body, 'clientType')
    const authorized = await this.access.authorize({
      erId,
      clientType,
      panelToken: this._asString(this._readField(body, 'token')),
      staffToken: this._asString(client.handshake?.auth?.['token']),
    })
    if (!authorized) {
      client.emit('joinER.denied', { erId })
      return
    }

    client.join(`er:${erId}`)
    if (clientType === 'panel') {
      client.data.panelER = erId
      void this.auditLog
        .logIfERExists({
          eventType: 'panel_connected',
          erId,
          metadata: { socketId: client.id },
        })
        .catch(() => undefined)
    }
  }

  private _extractErId(body: unknown): unknown {
    if (typeof body === 'string') return body
    return this._readField(body, 'erId')
  }

  private _readField(body: unknown, field: string): unknown {
    if (body && typeof body === 'object' && field in body) {
      return (body as Record<string, unknown>)[field]
    }
    return undefined
  }

  private _asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined
  }

  handleDisconnect(client: Socket) {
    const erId = client.data.panelER
    if (typeof erId !== 'string') return
    void this.auditLog
      .logIfERExists({
        eventType: 'panel_disconnected',
        erId,
        metadata: { socketId: client.id },
      })
      .catch(() => undefined)
  }
}
