import { Role } from '@prisma/client'
import { OperatorController } from '../operator.controller'
import { OperatorService } from '../operator.service'

const service = { getProfile: jest.fn() }
const req = { user: { userId: 'op-1', role: Role.OPERATOR, erId: 'er-1' } }

describe('OperatorController', () => {
  it('delegates getProfile and returns the service result', () => {
    service.getProfile.mockReturnValue({ id: 'op-1', name: 'Eu' })
    const controller = new OperatorController(service as unknown as OperatorService)
    expect(controller.getProfile(req)).toEqual({ id: 'op-1', name: 'Eu' })
    expect(service.getProfile).toHaveBeenCalledWith(req.user)
  })
})
