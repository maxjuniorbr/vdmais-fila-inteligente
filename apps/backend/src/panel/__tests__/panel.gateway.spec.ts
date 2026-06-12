import { AuditLogService } from '../../audit-log/audit-log.service'
import { PanelGateway } from '../panel.gateway'

const auditLog = {
  log: jest.fn().mockResolvedValue(undefined),
  logIfERExists: jest.fn().mockResolvedValue(undefined),
}

function makeClient() {
  return {
    id: 'socket-1',
    join: jest.fn(),
    data: {} as Record<string, unknown>,
  }
}

describe('PanelGateway', () => {
  let gateway: PanelGateway
  let emit: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    gateway = new PanelGateway(auditLog as unknown as AuditLogService)
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

  it('joins the ER room for a valid panel client', () => {
    const client = makeClient()
    gateway.handleJoinER({ erId: 'er-1234567890', clientType: 'panel' }, client as never)
    expect(client.join).toHaveBeenCalledWith('er:er-1234567890')
    expect(client.data.panelER).toBe('er-1234567890')
    expect(auditLog.logIfERExists).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'panel_connected' }),
    )
  })

  it('accepts a plain string body without auditing a panel connection', () => {
    const client = makeClient()
    gateway.handleJoinER('er-1234567890', client as never)
    expect(client.join).toHaveBeenCalledWith('er:er-1234567890')
    expect(auditLog.logIfERExists).not.toHaveBeenCalled()
  })

  it('ignores an invalid erId', () => {
    const client = makeClient()
    gateway.handleJoinER({ erId: 'short' }, client as never)
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
