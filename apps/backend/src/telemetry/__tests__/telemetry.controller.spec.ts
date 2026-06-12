import { Role } from '@prisma/client'
import { TelemetryController } from '../telemetry.controller'
import { TelemetryService } from '../telemetry.service'

const service = {
  recordQueueEntryStarted: jest.fn(),
  recordPanelCallDisplayed: jest.fn(),
  recordTicketDisplayed: jest.fn(),
  recordLogout: jest.fn(),
  recordManualCheckinStarted: jest.fn(),
}
const req = { user: { userId: 're-1', role: Role.REPRESENTATIVE, erId: 'er-1' } }

describe('TelemetryController', () => {
  let controller: TelemetryController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new TelemetryController(service as unknown as TelemetryService)
  })

  it('records a queue entry', () => {
    controller.queueEntry('er-1')
    expect(service.recordQueueEntryStarted).toHaveBeenCalledWith('er-1')
  })

  it('records a panel display', () => {
    controller.panelDisplayed()
    expect(service.recordPanelCallDisplayed).toHaveBeenCalledWith()
  })

  it('records a ticket display', () => {
    controller.ticketDisplayed('t-1', req)
    expect(service.recordTicketDisplayed).toHaveBeenCalledWith('t-1', req.user)
  })

  it('records a logout', () => {
    controller.logout(req)
    expect(service.recordLogout).toHaveBeenCalledWith(req.user)
  })

  it('records a manual check-in start', () => {
    controller.manualCheckinStarted(req)
    expect(service.recordManualCheckinStarted).toHaveBeenCalledWith(req.user)
  })
})
