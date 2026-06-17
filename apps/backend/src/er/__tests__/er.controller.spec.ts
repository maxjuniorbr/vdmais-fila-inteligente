import { Role } from '@prisma/client'
import { UnauthorizedException } from '@nestjs/common'
import { ERController } from '../er.controller'
import { PublicERController } from '../public-er.controller'
import { ERService } from '../er.service'
import { QueueEntryTokenService } from '../../auth/queue-entry-token.service'

const service = {
  getForStaff: jest.fn(),
  openDay: jest.fn(),
  closeDay: jest.fn(),
  getPublic: jest.fn(),
}
const req = { user: { userId: 'mgr-1', role: Role.MANAGER, erId: 'er-1' } }
const queueEntryTokens = { verify: jest.fn() }

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
  it('returns the public ER state', async () => {
    jest.clearAllMocks()
    service.getPublic.mockResolvedValue({ id: 'er-1', name: 'ER Centro' })
    const controller = new PublicERController(
      service as unknown as ERService,
      queueEntryTokens as unknown as QueueEntryTokenService,
    )
    const result = controller.get('er-1', 'entry-token', 'link')
    expect(service.getPublic).toHaveBeenCalledWith('er-1')
    expect(queueEntryTokens.verify).toHaveBeenCalledWith('entry-token', 'er-1', 'LINK')
    await expect(result).resolves.toMatchObject({ id: 'er-1', entryChannel: 'LINK' })
  })

  it('defaults to the QR_CODE channel when no source is provided', async () => {
    jest.clearAllMocks()
    service.getPublic.mockResolvedValue({ id: 'er-1', name: 'ER Centro' })
    const controller = new PublicERController(
      service as unknown as ERService,
      queueEntryTokens as unknown as QueueEntryTokenService,
    )
    const result = controller.get('er-1', 'entry-token')
    expect(queueEntryTokens.verify).toHaveBeenCalledWith('entry-token', 'er-1', 'QR_CODE')
    await expect(result).resolves.toMatchObject({ entryChannel: 'QR_CODE' })
  })

  it('rejects public ER access without a signed token', async () => {
    jest.clearAllMocks()
    queueEntryTokens.verify.mockImplementationOnce(() => {
      throw new UnauthorizedException('Acesso à fila inválido ou expirado')
    })
    const controller = new PublicERController(
      service as unknown as ERService,
      queueEntryTokens as unknown as QueueEntryTokenService,
    )

    await expect(controller.get('er-1', undefined as never)).rejects.toThrow(
      UnauthorizedException,
    )
    expect(service.getPublic).not.toHaveBeenCalled()
  })
})
