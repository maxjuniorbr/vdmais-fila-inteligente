import { Role } from '@prisma/client'
import { MetricsController } from '../metrics.controller'
import { MetricsService } from '../metrics.service'

const service = { getDailyMetrics: jest.fn() }
const req = { user: { userId: 'mgr-1', role: Role.MANAGER, erId: 'er-1' } }

describe('MetricsController', () => {
  it('delegates daily metrics and returns the service result', async () => {
    service.getDailyMetrics.mockResolvedValue({ total: 5 })
    const controller = new MetricsController(service as unknown as MetricsService)
    await expect(controller.getDaily('er-1', req)).resolves.toEqual({ total: 5 })
    expect(service.getDailyMetrics).toHaveBeenCalledWith('er-1', req.user)
  })
})
