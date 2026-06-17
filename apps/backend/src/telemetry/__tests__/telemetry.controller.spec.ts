import { Role } from '@prisma/client'
import { TelemetryController } from '../telemetry.controller'
import { TelemetryService } from '../telemetry.service'

const service = {
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

  it('records a ticket display and returns the service result', () => {
    const sentinel = Promise.resolve(undefined)
    service.recordTicketDisplayed.mockReturnValue(sentinel)
    expect(controller.ticketDisplayed('t-1', req)).toBe(sentinel)
    expect(service.recordTicketDisplayed).toHaveBeenCalledWith('t-1', req.user)
  })

  it('records a logout and returns the service result', () => {
    const sentinel = Promise.resolve(undefined)
    service.recordLogout.mockReturnValue(sentinel)
    expect(controller.logout(req)).toBe(sentinel)
    expect(service.recordLogout).toHaveBeenCalledWith(req.user)
  })

  it('records a manual check-in start and returns the service result', () => {
    const sentinel = Promise.resolve(undefined)
    service.recordManualCheckinStarted.mockReturnValue(sentinel)
    expect(controller.manualCheckinStarted(req)).toBe(sentinel)
    expect(service.recordManualCheckinStarted).toHaveBeenCalledWith(req.user)
  })
})
