import { IntegrationController } from '../integration.controller'
import { IntegrationService } from '../integration.service'
import { IntegrationPrincipal } from '../auth/integration-jwt.strategy'
import { IDEMPOTENCY_KEY_MAX_LENGTH } from '../integration.constants'

const principal: IntegrationPrincipal = { type: 'integration', client: 'erp', scopes: [] }

describe('IntegrationController', () => {
  const integration = { startService: jest.fn(), finishService: jest.fn() }
  let controller: IntegrationController

  beforeEach(() => {
    jest.resetAllMocks()
    controller = new IntegrationController(integration as unknown as IntegrationService)
  })

  it('delegates iniciar to the service', async () => {
    integration.startService.mockResolvedValue({ ticketId: 't1' })
    const result = await controller.iniciar({ reCode: 'RE1' }, undefined, { user: principal })
    expect(integration.startService).toHaveBeenCalledWith({ reCode: 'RE1' }, principal)
    expect(result).toEqual({ ticketId: 't1' })
  })

  it('delegates encerrar to the service', async () => {
    integration.finishService.mockResolvedValue({ ticketId: 't1' })
    const result = await controller.encerrar({ cpf: '123' }, undefined, { user: principal })
    expect(integration.finishService).toHaveBeenCalledWith({ cpf: '123' }, principal)
    expect(result).toEqual({ ticketId: 't1' })
  })

  it('uses the Idempotency-Key header when the body omits idempotencyKey', async () => {
    integration.startService.mockResolvedValue({ ticketId: 't1' })
    await controller.iniciar({ reCode: 'RE1' }, 'idem-header', { user: principal })
    expect(integration.startService).toHaveBeenCalledWith(
      { reCode: 'RE1', idempotencyKey: 'idem-header' },
      principal,
    )
  })

  it('truncates an oversized Idempotency-Key header to the body field limit', async () => {
    integration.startService.mockResolvedValue({ ticketId: 't1' })
    const oversized = 'k'.repeat(IDEMPOTENCY_KEY_MAX_LENGTH + 50)
    await controller.iniciar({ reCode: 'RE1' }, oversized, { user: principal })
    expect(integration.startService).toHaveBeenCalledWith(
      { reCode: 'RE1', idempotencyKey: 'k'.repeat(IDEMPOTENCY_KEY_MAX_LENGTH) },
      principal,
    )
  })

  it('prefers the body idempotencyKey over the header', async () => {
    integration.finishService.mockResolvedValue({ ticketId: 't1' })
    await controller.encerrar({ cpf: '123', idempotencyKey: 'from-body' }, 'from-header', {
      user: principal,
    })
    expect(integration.finishService).toHaveBeenCalledWith(
      { cpf: '123', idempotencyKey: 'from-body' },
      principal,
    )
  })
})
