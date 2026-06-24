import { ObservabilityService } from '../observability.service'

describe('ObservabilityService', () => {
  let service: ObservabilityService

  beforeEach(() => {
    service = new ObservabilityService()
  })

  it('grows uptime as wall-clock time advances', () => {
    // The service captures its start time in the constructor, so freeze the clock
    // before instantiating to pin the baseline, then advance it deterministically.
    jest.useFakeTimers()
    try {
      jest.setSystemTime(new Date('2026-06-23T00:00:00.000Z'))
      const fixedService = new ObservabilityService()
      expect(fixedService.uptimeSeconds()).toBe(0)

      jest.setSystemTime(new Date('2026-06-23T00:00:05.000Z'))
      expect(fixedService.uptimeSeconds()).toBe(5)
    } finally {
      jest.useRealTimers()
    }
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
    const label = '{method="GET",route="PanelController.getState",status="200"}'
    // Assert the summed values, not just the presence of the metric name: two
    // requests → count 2, durations 0.5 + 1.5 → 2.
    expect(output).toContain(`fila_http_requests_total${label} 2`)
    expect(output).toContain(`fila_http_request_duration_seconds_total${label} 2`)
  })

  it('reports the live in-flight count between start and finish', () => {
    service.requestStarted()
    service.requestStarted()
    service.requestFinished({ method: 'GET', route: 'x', status: 200, durationSeconds: 0.1 })
    expect(service.renderPrometheus()).toContain('fila_http_requests_in_flight 1')
  })

  it('escapes quotes, backslashes and newlines in labels', () => {
    service.requestStarted()
    service.requestFinished({
      method: 'GET',
      route: 'a"b\\c\nd',
      status: 500,
      durationSeconds: 0.1,
    })
    const output = service.renderPrometheus()
    expect(output).toContain(String.raw`route="a\"b\\c\nd"`)
  })

  it('never lets in-flight requests go below zero', () => {
    service.requestFinished({ method: 'GET', route: 'x', status: 200, durationSeconds: 0.1 })
    expect(service.renderPrometheus()).toContain('fila_http_requests_in_flight 0')
  })
})
