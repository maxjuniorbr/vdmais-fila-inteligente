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

@WebSocketGateway({
  cors: {
    origin: process.env['FRONTEND_URL'] ?? 'http://localhost:5173',
    credentials: false,
  },
})
export class PanelGateway implements OnGatewayDisconnect {
  constructor(private readonly auditLog: AuditLogService) {}

  @WebSocketServer()
  server!: Server

  /**
   * Emit a named event to all clients subscribed to a given ER room.
   * Clients join by calling `joinER` with the erId.
   */
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
  handleJoinER(@MessageBody() body: unknown, @ConnectedSocket() client: Socket) {
    const erId = this._extractErId(body)
    const clientType =
      body && typeof body === 'object' && 'clientType' in body
        ? (body as { clientType?: unknown }).clientType
        : undefined
    if (typeof erId !== 'string' || erId.length < 10 || erId.length > 40) return
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
    if (body && typeof body === 'object' && 'erId' in body) {
      return (body as { erId?: unknown }).erId
    }
    return undefined
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
