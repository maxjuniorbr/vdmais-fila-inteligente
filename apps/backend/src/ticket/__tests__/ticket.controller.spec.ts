import { Role } from '@prisma/client'
import { TicketController } from '../ticket.controller'
import { TicketService } from '../ticket.service'

const service = {
  create: jest.fn(),
  getMyActiveTicket: jest.fn(),
  getMyTicketStatus: jest.fn(),
  cancel: jest.fn(),
  restore: jest.fn(),
  recall: jest.fn(),
  correct: jest.fn(),
  startService: jest.fn(),
  finishService: jest.fn(),
  noShow: jest.fn(),
  pauseTicket: jest.fn(),
  resumeTicket: jest.fn(),
  selfCancel: jest.fn(),
  setTicketPriority: jest.fn(),
}
const req = { user: { userId: 're-1', role: Role.REPRESENTATIVE, erId: 'er-1' } }

describe('TicketController', () => {
  let controller: TicketController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new TicketController(service as unknown as TicketService)
  })

  it('creates a ticket', () => {
    const dto = { erId: 'er-1', entryChannel: 'QR_CODE' } as never
    controller.create(dto, req)
    expect(service.create).toHaveBeenCalledWith(req.user, dto)
  })

  it('gets the active ticket', () => {
    controller.getMyActive('er-1', req)
    expect(service.getMyActiveTicket).toHaveBeenCalledWith('re-1', 'er-1')
  })

  it('gets the ticket status', () => {
    controller.getMyStatus('er-1', req)
    expect(service.getMyTicketStatus).toHaveBeenCalledWith('re-1', 'er-1')
  })

  it('cancels a ticket', () => {
    controller.cancel('t-1', { reason: 'dup' }, req)
    expect(service.cancel).toHaveBeenCalledWith('t-1', 'dup', req.user)
  })

  it('restores a ticket', () => {
    controller.restore('t-1', { reason: 'voltou' }, req)
    expect(service.restore).toHaveBeenCalledWith('t-1', 'voltou', req.user)
  })

  it('recalls a ticket', () => {
    controller.recall('t-1', req)
    expect(service.recall).toHaveBeenCalledWith('t-1', req.user)
  })

  it('corrects a ticket', () => {
    const dto = { action: 'FINISH', reason: 'x' } as never
    controller.correct('t-1', dto, req)
    expect(service.correct).toHaveBeenCalledWith('t-1', dto, req.user)
  })

  it('starts a service', () => {
    controller.startService('t-1', req)
    expect(service.startService).toHaveBeenCalledWith('t-1', req.user)
  })

  it('finishes a service', () => {
    controller.finishService('t-1', req)
    expect(service.finishService).toHaveBeenCalledWith('t-1', req.user)
  })

  it('marks a no-show', () => {
    controller.noShow('t-1', req)
    expect(service.noShow).toHaveBeenCalledWith('t-1', req.user)
  })

  it('pauses a ticket', () => {
    controller.pause('t-1', req)
    expect(service.pauseTicket).toHaveBeenCalledWith('t-1', 're-1')
  })

  it('resumes a ticket', () => {
    controller.resume('t-1', req)
    expect(service.resumeTicket).toHaveBeenCalledWith('t-1', 're-1')
  })

  it('self-cancels a ticket', () => {
    controller.selfCancel('t-1', req)
    expect(service.selfCancel).toHaveBeenCalledWith('t-1', 're-1')
  })

  it('marks a ticket as preferential', () => {
    controller.markPriority('t-1', req)
    expect(service.setTicketPriority).toHaveBeenCalledWith('t-1', true, req.user)
  })

  it('unmarks a ticket as preferential', () => {
    controller.unmarkPriority('t-1', req)
    expect(service.setTicketPriority).toHaveBeenCalledWith('t-1', false, req.user)
  })
})
