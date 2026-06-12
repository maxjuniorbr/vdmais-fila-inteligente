import { Role } from '@prisma/client'
import { ERController } from '../er.controller'
import { PublicERController } from '../public-er.controller'
import { ERService } from '../er.service'

const service = {
  getForStaff: jest.fn(),
  openDay: jest.fn(),
  closeDay: jest.fn(),
  getPublic: jest.fn(),
}
const req = { user: { userId: 'mgr-1', role: Role.MANAGER, erId: 'er-1' } }

describe('ERController', () => {
  let controller: ERController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new ERController(service as unknown as ERService)
  })

  it('gets the ER for staff', () => {
    controller.get('er-1', req)
    expect(service.getForStaff).toHaveBeenCalledWith('er-1', req.user)
  })

  it('opens the day', () => {
    controller.openDay('er-1', req)
    expect(service.openDay).toHaveBeenCalledWith('er-1', req.user)
  })

  it('closes the day', () => {
    controller.closeDay('er-1', req)
    expect(service.closeDay).toHaveBeenCalledWith('er-1', req.user)
  })
})

describe('PublicERController', () => {
  it('returns the public ER state', () => {
    jest.clearAllMocks()
    const controller = new PublicERController(service as unknown as ERService)
    controller.get('er-1')
    expect(service.getPublic).toHaveBeenCalledWith('er-1')
  })
})
