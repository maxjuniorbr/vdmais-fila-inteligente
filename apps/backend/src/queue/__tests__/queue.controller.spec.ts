import { Role } from '@prisma/client'
import { QueueController } from '../queue.controller'
import { QueueService } from '../queue.service'

const service = { callNext: jest.fn(), getQueueOverview: jest.fn() }
const req = { user: { userId: 'op-1', role: Role.OPERATOR, erId: 'er-1' } }

describe('QueueController', () => {
  let controller: QueueController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new QueueController(service as unknown as QueueService)
  })

  it('calls the next ticket for a counter', () => {
    controller.callNext('er-1', { counterId: 'c-1' }, req)
    expect(service.callNext).toHaveBeenCalledWith('er-1', 'c-1', req.user)
  })

  it('gets the queue overview', () => {
    controller.getOverview('er-1', req)
    expect(service.getQueueOverview).toHaveBeenCalledWith('er-1', req.user)
  })
})
