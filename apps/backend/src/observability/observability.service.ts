import { Injectable } from '@nestjs/common'

interface RequestResult {
  method: string
  route: string
  status: number
  durationSeconds: number
}

@Injectable()
export class ObservabilityService {
  private readonly startedAt = Date.now()
  private readonly requestTotals = new Map<string, number>()
  private readonly durationTotals = new Map<string, number>()
  private inFlight = 0

  requestStarted() {
    this.inFlight += 1
  }

  requestFinished(result: RequestResult) {
    this.inFlight = Math.max(0, this.inFlight - 1)
    const label = this._label(result.method, result.route, result.status)
    this.requestTotals.set(label, (this.requestTotals.get(label) ?? 0) + 1)
    this.durationTotals.set(label, (this.durationTotals.get(label) ?? 0) + result.durationSeconds)
  }

  uptimeSeconds() {
    return Math.floor((Date.now() - this.startedAt) / 1000)
  }

  renderPrometheus() {
    const lines = [
      '# HELP fila_process_uptime_seconds Process uptime.',
      '# TYPE fila_process_uptime_seconds gauge',
      `fila_process_uptime_seconds ${this.uptimeSeconds()}`,
      '# HELP fila_http_requests_in_flight Current HTTP requests.',
      '# TYPE fila_http_requests_in_flight gauge',
      `fila_http_requests_in_flight ${this.inFlight}`,
      '# HELP fila_http_requests_total Total HTTP requests.',
      '# TYPE fila_http_requests_total counter',
    ]

    this.requestTotals.forEach((total, label) => {
      lines.push(`fila_http_requests_total${label} ${total}`)
    })
    lines.push(
      '# HELP fila_http_request_duration_seconds_total Accumulated HTTP request duration.',
      '# TYPE fila_http_request_duration_seconds_total counter',
    )
    this.durationTotals.forEach((total, label) => {
      lines.push(`fila_http_request_duration_seconds_total${label} ${total}`)
    })
    return `${lines.join('\n')}\n`
  }

  private _label(method: string, route: string, status: number) {
    return `{method="${this._escape(method)}",route="${this._escape(route)}",status="${status}"}`
  }

  private _escape(value: string) {
    return value
      .replaceAll('\\', String.raw`\\`)
      .replaceAll('"', String.raw`\"`)
      .replaceAll('\n', String.raw`\n`)
  }
}
