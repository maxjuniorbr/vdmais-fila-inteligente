import { EntryChannel } from '@prisma/client'
import { SimulationController } from './simulation.controller'
import { SimulationService } from './simulation.service'

const service = {
  listErs: jest.fn(),
  getState: jest.fn(),
  listOperators: jest.fn(),
  listCounters: jest.fn(),
  listRepresentatives: jest.fn(),
  openCounters: jest.fn(),
  closeCounter: jest.fn(),
  callNextOnCounter: jest.fn(),
  addExistingToQueue: jest.fn(),
  pauseTicket: jest.fn(),
  resumeTicket: jest.fn(),
  cancelTicket: jest.fn(),
  startTicket: jest.fn(),
  finishTicket: jest.fn(),
  noShowTicket: jest.fn(),
}

describe('SimulationController', () => {
  let controller: SimulationController

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new SimulationController(service as unknown as SimulationService)
  })

  it('lists ERs', () => {
    controller.listErs()
    expect(service.listErs).toHaveBeenCalled()
  })

  it('gets state for an ER', () => {
    controller.getState('er-1')
    expect(service.getState).toHaveBeenCalledWith('er-1')
  })

  it('lists operators for an ER', () => {
    controller.listOperators('er-1')
    expect(service.listOperators).toHaveBeenCalledWith('er-1')
  })

  it('lists counters for an ER', () => {
    controller.listCounters('er-1')
    expect(service.listCounters).toHaveBeenCalledWith('er-1')
  })

  it('lists representatives for an ER', () => {
    controller.listRepresentatives('er-1')
    expect(service.listRepresentatives).toHaveBeenCalledWith('er-1')
  })

  it('opens counters for an ER', () => {
    controller.openCounters({ erId: 'er-1', counterIds: ['c-1', 'c-2'] })
    expect(service.openCounters).toHaveBeenCalledWith('er-1', ['c-1', 'c-2'])
  })

  it('closes a counter', () => {
    controller.closeCounter({ erId: 'er-1', counterId: 'c-1' })
    expect(service.closeCounter).toHaveBeenCalledWith('er-1', 'c-1')
  })

  it('calls next ticket on a counter', () => {
    controller.callNext({ counterId: 'c-1' })
    expect(service.callNextOnCounter).toHaveBeenCalledWith('c-1')
  })

  it('adds existing representatives to the queue', () => {
    controller.addExisting({ erId: 'er-1', representativeIds: ['re-1'], channel: EntryChannel.QR_CODE })
    expect(service.addExistingToQueue).toHaveBeenCalledWith('er-1', ['re-1'], EntryChannel.QR_CODE)
  })

  it('pauses a ticket', () => {
    controller.pauseTicket({ ticketId: 't-1' })
    expect(service.pauseTicket).toHaveBeenCalledWith('t-1')
  })

  it('resumes a ticket', () => {
    controller.resumeTicket({ ticketId: 't-1' })
    expect(service.resumeTicket).toHaveBeenCalledWith('t-1')
  })

  it('cancels a ticket', () => {
    controller.cancelTicket({ ticketId: 't-1' })
    expect(service.cancelTicket).toHaveBeenCalledWith('t-1')
  })

  it('starts attendance for a ticket', () => {
    controller.startTicket({ ticketId: 't-1' })
    expect(service.startTicket).toHaveBeenCalledWith('t-1')
  })

  it('finishes attendance for a ticket', () => {
    controller.finishTicket({ ticketId: 't-1' })
    expect(service.finishTicket).toHaveBeenCalledWith('t-1')
  })

  it('registers no-show for a ticket', () => {
    controller.noShowTicket({ ticketId: 't-1' })
    expect(service.noShowTicket).toHaveBeenCalledWith('t-1')
  })
})
