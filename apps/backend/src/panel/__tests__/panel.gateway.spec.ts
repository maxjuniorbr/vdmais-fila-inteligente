import { AuditLogService } from '../../audit-log/audit-log.service'
import { PanelAccessService } from '../panel-access.service'
import { PanelGateway } from '../panel.gateway'

const auditLog = {
  log: jest.fn().mockResolvedValue(undefined),
  logIfERExists: jest.fn().mockResolvedValue(undefined),
}
const access = { authorize: jest.fn() }

function makeClient(authToken?: string) {
  return {
    id: 'socket-1',
    join: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    handshake: { auth: { token: authToken } },
    data: {} as Record<string, unknown>,
  }
}

describe('PanelGateway', () => {
  let gateway: PanelGateway
  let emit: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    access.authorize.mockResolvedValue(true)
    gateway = new PanelGateway(
      auditLog as unknown as AuditLogService,
      access as unknown as PanelAccessService,
    )
    emit = jest.fn()
    gateway.server = { to: jest.fn(() => ({ emit })) } as never
  })

  it('emits an event plus panel.updated and audits the change', () => {
    gateway.emitToER('er-1', 'ticket.called', { code: 'A001' })
    expect(gateway.server.to).toHaveBeenCalledWith('er:er-1')
    expect(emit).toHaveBeenCalledWith('ticket.called', { code: 'A001' })
    expect(emit).toHaveBeenCalledWith('panel.updated', {
      event: 'ticket.called',
      payload: { code: 'A001' },
    })
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'panel_updated' }),
    )
  })

  it('joins an authorized panel client with its display token', async () => {
    const client = makeClient()
    await gateway.handleJoinER(
      { erId: 'er-1234567890', clientType: 'panel', token: 'display-token' },
      client as never,
    )
    expect(access.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        erId: 'er-1234567890',
        clientType: 'panel',
        panelToken: 'display-token',
      }),
    )
    expect(client.join).toHaveBeenCalledWith('er:er-1234567890')
    expect(client.data.panelER).toBe('er-1234567890')
    expect(auditLog.logIfERExists).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'panel_connected' }),
    )
  })

  it('joins an authorized staff client using the handshake token without auditing a panel connection', async () => {
    const client = makeClient('staff-jwt')
    await gateway.handleJoinER(
      { erId: 'er-1234567890', clientType: 'dashboard' },
      client as never,
    )
    expect(access.authorize).toHaveBeenCalledWith(
      expect.objectContaining({ staffToken: 'staff-jwt' }),
    )
    expect(client.join).toHaveBeenCalledWith('er:er-1234567890')
    expect(auditLog.logIfERExists).not.toHaveBeenCalled()
  })

  it('denies and never joins when authorization fails', async () => {
    access.authorize.mockResolvedValue(false)
    const client = makeClient()
    await gateway.handleJoinER(
      { erId: 'er-1234567890', clientType: 'panel', token: 'wrong' },
      client as never,
    )
    expect(client.join).not.toHaveBeenCalled()
    expect(client.emit).toHaveBeenCalledWith('joinER.denied', { erId: 'er-1234567890' })
    // The socket must be dropped so it cannot linger retrying joinER.
    expect(client.disconnect).toHaveBeenCalled()
  })

  it('ignores an invalid erId without checking authorization', async () => {
    const client = makeClient()
    await gateway.handleJoinER({ erId: 'short' }, client as never)
    expect(access.authorize).not.toHaveBeenCalled()
    expect(client.join).not.toHaveBeenCalled()
  })

  it('audits a disconnect for a panel client', () => {
    const client = makeClient()
    client.data.panelER = 'er-1234567890'
    gateway.handleDisconnect(client as never)
    expect(auditLog.logIfERExists).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'panel_disconnected' }),
    )
  })

  it('ignores a disconnect without a panel room', () => {
    const client = makeClient()
    gateway.handleDisconnect(client as never)
    expect(auditLog.logIfERExists).not.toHaveBeenCalled()
  })
})
