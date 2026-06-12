import { Role } from '@prisma/client'
import { AdminController } from '../admin.controller'
import { AdminService } from '../admin.service'

const service = {
  listERs: jest.fn(),
  createER: jest.fn(),
  getER: jest.fn(),
  updateER: jest.fn(),
  createCounter: jest.fn(),
  createStaff: jest.fn(),
}
const req = { user: { userId: 'admin-1', role: Role.ADMIN, erId: undefined } }

describe('AdminController', () => {
  let controller: AdminController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new AdminController(service as unknown as AdminService)
  })

  it('delegates listERs', () => {
    controller.listERs()
    expect(service.listERs).toHaveBeenCalled()
  })

  it('delegates createER', () => {
    const dto = { name: 'ER', qrCodeUrl: 'http://x' }
    controller.createER(dto, req)
    expect(service.createER).toHaveBeenCalledWith(dto, req.user)
  })

  it('delegates getER', () => {
    controller.getER('er-1')
    expect(service.getER).toHaveBeenCalledWith('er-1')
  })

  it('delegates updateER', () => {
    const dto = { name: 'Novo' }
    controller.updateER('er-1', dto, req)
    expect(service.updateER).toHaveBeenCalledWith('er-1', dto, req.user)
  })

  it('delegates createCounter', () => {
    const dto = { number: 2 }
    controller.createCounter('er-1', dto, req)
    expect(service.createCounter).toHaveBeenCalledWith('er-1', dto, req.user)
  })

  it('delegates createStaff', () => {
    const dto = { name: 'X', email: 'x@x.com', password: 'segredo123', role: Role.OPERATOR }
    controller.createStaff('er-1', dto, req)
    expect(service.createStaff).toHaveBeenCalledWith('er-1', dto, req.user)
  })
})
