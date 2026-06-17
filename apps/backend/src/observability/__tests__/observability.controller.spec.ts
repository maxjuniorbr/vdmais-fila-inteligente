import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ObservabilityController } from '../observability.controller'
import { ObservabilityService } from '../observability.service'

const prisma = { $queryRaw: jest.fn() }
const observability = {
  uptimeSeconds: jest.fn(() => 42),
  renderPrometheus: jest.fn(() => 'metrics-output'),
}

function makeResponse() {
  return { type: jest.fn() }
}

describe('ObservabilityController', () => {
  let controller: ObservabilityController
  const originalToken = process.env.OBSERVABILITY_TOKEN

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new ObservabilityController(
      prisma as unknown as PrismaService,
      observability as unknown as ObservabilityService,
    )
    delete process.env.OBSERVABILITY_TOKEN
  })

  afterAll(() => {
    if (originalToken === undefined) delete process.env.OBSERVABILITY_TOKEN
    else process.env.OBSERVABILITY_TOKEN = originalToken
  })

  it('reports liveness with uptime', () => {
    expect(controller.live()).toEqual({ status: 'ok', uptimeSeconds: 42 })
  })

  it('reports readiness when the database responds', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }])
    await expect(controller.ready()).resolves.toEqual({ status: 'ready' })
  })

  it('fails readiness when the database is down', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('down'))
    await expect(controller.ready()).rejects.toThrow(ServiceUnavailableException)
  })

  it('rejects metrics when no token is configured', () => {
    const response = makeResponse()
    expect(() => controller.metrics(undefined, response as never)).toThrow(UnauthorizedException)
  })

  it('rejects metrics when the Authorization header is missing but a token is configured', () => {
    process.env.OBSERVABILITY_TOKEN = 'secret'
    const response = makeResponse()
    expect(() => controller.metrics(undefined, response as never)).toThrow(UnauthorizedException)
  })

  it('rejects metrics with an invalid token', () => {
    process.env.OBSERVABILITY_TOKEN = 'secret'
    const response = makeResponse()
    expect(() => controller.metrics('Bearer wrong', response as never)).toThrow(
      UnauthorizedException,
    )
  })

  it('renders metrics with a valid token', () => {
    process.env.OBSERVABILITY_TOKEN = 'secret'
    const response = makeResponse()
    const result = controller.metrics('Bearer secret', response as never)
    expect(response.type).toHaveBeenCalledWith('text/plain; version=0.0.4')
    expect(result).toBe('metrics-output')
  })
})
