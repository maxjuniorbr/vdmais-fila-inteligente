import { ObservabilityService } from '../observability.service'

describe('ObservabilityService', () => {
  let service: ObservabilityService

  beforeEach(() => {
    service = new ObservabilityService()
  })

  it('tracks uptime in seconds', () => {
    expect(service.uptimeSeconds()).toBeGreaterThanOrEqual(0)
  })

  it('accumulates request totals and durations into Prometheus output', () => {
    service.requestStarted()
    service.requestFinished({
      method: 'GET',
      route: 'PanelController.getState',
      status: 200,
      durationSeconds: 0.5,
    })
    service.requestFinished({
      method: 'GET',
      route: 'PanelController.getState',
      status: 200,
      durationSeconds: 1.5,
    })

    const output = service.renderPrometheus()
    expect(output).toContain('fila_http_requests_total')
    expect(output).toContain('route="PanelController.getState"')
    expect(output).toContain('fila_http_request_duration_seconds_total')
    expect(output).toContain('fila_http_requests_in_flight 0')
  })

  it('escapes special characters in labels', () => {
    service.requestStarted()
    service.requestFinished({
      method: 'GET',
      route: 'route"with\\quotes',
      status: 500,
      durationSeconds: 0.1,
    })
    const output = service.renderPrometheus()
    expect(output).toContain(String.raw`\"`)
  })

  it('never lets in-flight requests go below zero', () => {
    service.requestFinished({ method: 'GET', route: 'x', status: 200, durationSeconds: 0.1 })
    expect(service.renderPrometheus()).toContain('fila_http_requests_in_flight 0')
  })
})
