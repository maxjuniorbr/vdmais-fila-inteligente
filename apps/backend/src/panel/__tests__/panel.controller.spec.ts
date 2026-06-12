import { PanelController } from '../panel.controller'
import { PanelService } from '../panel.service'

const service = { getState: jest.fn() }

describe('PanelController', () => {
  it('delegates getState', () => {
    const controller = new PanelController(service as unknown as PanelService)
    controller.getState('er-1')
    expect(service.getState).toHaveBeenCalledWith('er-1')
  })
})
