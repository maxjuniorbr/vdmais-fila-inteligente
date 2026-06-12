import { AuthController } from '../auth.controller'
import { AuthService } from '../auth.service'

const service = { register: jest.fn(), login: jest.fn(), staffLogin: jest.fn() }

describe('AuthController', () => {
  let controller: AuthController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new AuthController(service as unknown as AuthService)
  })

  it('delegates register', () => {
    const dto = { fullName: 'A' } as never
    controller.register(dto)
    expect(service.register).toHaveBeenCalledWith(dto)
  })

  it('delegates login', () => {
    const dto = { credential: 'RE0001', password: 'x' } as never
    controller.login(dto)
    expect(service.login).toHaveBeenCalledWith(dto)
  })

  it('delegates staffLogin', () => {
    const dto = { email: 'op@x.com', password: 'x' } as never
    controller.staffLogin(dto)
    expect(service.staffLogin).toHaveBeenCalledWith(dto)
  })
})
