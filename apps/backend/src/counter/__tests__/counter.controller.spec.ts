import { Role } from '@prisma/client'
import { CounterController } from '../counter.controller'
import { CounterService } from '../counter.service'

const service = {
  listForER: jest.fn(),
  openCounter: jest.fn(),
  pauseCounter: jest.fn(),
  resumeCounter: jest.fn(),
  closeCounter: jest.fn(),
  forceReleaseCounter: jest.fn(),
}
const req = { user: { userId: 'op-1', role: Role.OPERATOR, erId: 'er-1' } }

describe('CounterController', () => {
  let controller: CounterController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new CounterController(service as unknown as CounterService)
  })

  it('lists counters for the ER', () => {
    controller.list(req)
    expect(service.listForER).toHaveBeenCalledWith(req.user)
  })

  it('opens a counter', () => {
    controller.open('c-1', req)
    expect(service.openCounter).toHaveBeenCalledWith('c-1', req.user)
  })

  it('pauses a counter with a reason', () => {
    controller.pause('c-1', { reason: 'intervalo' }, req)
    expect(service.pauseCounter).toHaveBeenCalledWith('c-1', req.user, 'intervalo', undefined)
  })

  it('forwards the detail when pausing with "outro"', () => {
    controller.pause('c-1', { reason: 'outro', detail: 'reunião rápida' }, req)
    expect(service.pauseCounter).toHaveBeenCalledWith('c-1', req.user, 'outro', 'reunião rápida')
  })

  it('resumes a counter', () => {
    controller.resume('c-1', req)
    expect(service.resumeCounter).toHaveBeenCalledWith('c-1', req.user)
  })

  it('closes a counter', () => {
    controller.close('c-1', req)
    expect(service.closeCounter).toHaveBeenCalledWith('c-1', req.user)
  })

  it('force-releases a counter', () => {
    controller.forceRelease('c-1', req)
    expect(service.forceReleaseCounter).toHaveBeenCalledWith('c-1', req.user)
  })
})
