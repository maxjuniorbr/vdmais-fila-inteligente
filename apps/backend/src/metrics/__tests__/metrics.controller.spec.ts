import { Role } from '@prisma/client'
import { MetricsController } from '../metrics.controller'
import { MetricsService } from '../metrics.service'

const service = { getDailyMetrics: jest.fn() }
const req = { user: { userId: 'mgr-1', role: Role.MANAGER, erId: 'er-1' } }

describe('MetricsController', () => {
  it('delegates daily metrics', () => {
    const controller = new MetricsController(service as unknown as MetricsService)
    controller.getDaily('er-1', req)
    expect(service.getDailyMetrics).toHaveBeenCalledWith('er-1', req.user)
  })
})
