import { ForbiddenException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CounterState, TicketState, EntryChannel, Prisma, Role } from '@prisma/client'
import { AuthenticatedUser } from '../common/authenticated-user'
import { getBusinessDate, getBusinessDayRange, getBusinessHour } from '../common/business-date'

interface DailyAuditEvent {
  eventType: string
  ticketId: string | null
  operatorId: string | null
  metadata: Prisma.JsonValue | null
  createdAt: Date
  ticket: { entryChannel: EntryChannel } | null
  operator: { id: string; name: string } | null
}

const NO_SHOW_EVENTS = new Set(['ticket_no_show', 'ticket_marked_no_show', 'ticket_auto_no_show'])
const FINISH_EVENTS = new Set(['service_finished', 'service_force_finished'])

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDailyMetrics(erId: string, user: AuthenticatedUser) {
    if (user.role !== Role.MANAGER && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Somente gestoras podem acessar as métricas diárias')
    }
    if (user.role !== Role.ADMIN && (!user.erId || user.erId !== erId)) {
      throw new ForbiddenException('Não é possível acessar métricas de outro ER')
    }

    const businessDate = getBusinessDate()
    const { start, end } = getBusinessDayRange()
    const [tickets, events, counters, openServices] = await Promise.all([
      this.prisma.ticket.findMany({
        where: { erId, queue: { businessDate } },
        select: {
          id: true,
          state: true,
          createdAt: true,
          pausedSeconds: true,
          entryChannel: true,
          cancelReason: true,
          calledAt: true,
          serviceStartedAt: true,
          serviceFinishedAt: true,
          noShowAt: true,
          cancelledAt: true,
          queueId: true,
          counterId: true,
          operatorId: true,
          representativeId: true,
          code: true,
          queuePosition: true,
          checkinAttendantId: true,
          erId: true,
        },
      }),
      this.prisma.auditEvent.findMany({
        where: {
          erId,
          createdAt: { gte: start, lt: end },
          eventType: {
            in: [
              'ticket_created',
              'ticket_restored',
              'ticket_force_closed',
              'ticket_called',
              'service_started',
              'service_finished',
              'service_force_finished',
              'ticket_cancelled',
              'ticket_no_show',
              'ticket_marked_no_show',
              'ticket_auto_no_show',
              'duplicate_ticket_blocked',
              'counter_paused',
              'counter_resumed',
            ],
          },
        },
        orderBy: { createdAt: 'asc' },
        include: {
          ticket: { select: { entryChannel: true } },
          operator: { select: { id: true, name: true } },
        },
      }),
      this.prisma.counter.findMany({ where: { erId } }),
      this.prisma.ticket.count({ where: { erId, state: TicketState.IN_SERVICE } }),
    ])

    const waiting = tickets.filter((t) => t.state === TicketState.WAITING)
    const paused = tickets.filter((t) => t.state === TicketState.PAUSED)
    const dailyEvents = events as DailyAuditEvent[]
    const createdEvents = dailyEvents.filter((event) => event.eventType === 'ticket_created')
    const finishedEvents = dailyEvents.filter((event) => FINISH_EVENTS.has(event.eventType))
    const cancelledEvents = dailyEvents.filter((event) => event.eventType === 'ticket_cancelled')
    const noShowEvents = dailyEvents.filter((event) => NO_SHOW_EVENTS.has(event.eventType))
    const restoredEvents = dailyEvents.filter((event) => event.eventType === 'ticket_restored')
    const forceClosedEvents = dailyEvents.filter(
      (event) => event.eventType === 'ticket_force_closed',
    )
    const startedEvents = dailyEvents.filter((event) => event.eventType === 'service_started')
    const calledEvents = dailyEvents.filter((event) => event.eventType === 'ticket_called')
    const duplicateEvents = dailyEvents.filter(
      (event) => event.eventType === 'duplicate_ticket_blocked',
    )

    const { waitSamples, serviceSamples, callToStartSamples, waitingSince } =
      this._calculateDurations(dailyEvents, tickets)
    const waitDurations = waitSamples.map((sample) => sample.duration)
    const serviceDurations = serviceSamples.map((sample) => sample.duration)
    const avgWaitMs = this._average(waitDurations)
    const avgServiceMs = this._average(serviceDurations)

    const now = Date.now()
    const maxCurrentWaitMs = waiting.reduce(
      (maximum, ticket) =>
        Math.max(maximum, now - (waitingSince.get(ticket.id) ?? ticket.createdAt).getTime()),
      0,
    )

    const volumeByHour: Record<number, number> = {}
    finishedEvents.forEach((event) => {
      const hour = getBusinessHour(event.createdAt)
      volumeByHour[hour] = (volumeByHour[hour] ?? 0) + 1
    })
    const waitSecondsByHour = this._averageSamplesByHour(waitSamples)

    const byChannel = this._emptyChannels()
    createdEvents.forEach((event) => {
      if (event.ticket) byChannel[event.ticket.entryChannel] += 1
    })
    const cancelledByChannel = this._countEventsByChannel(cancelledEvents)
    const noShowByChannel = this._countEventsByChannel(noShowEvents)

    const activeStates = new Set<CounterState>([
      CounterState.ACTIVE,
      CounterState.CALLING,
      CounterState.IN_SERVICE,
    ])
    const activeCounters = counters.filter((counter) => activeStates.has(counter.state))
    const pausedCounters = counters.filter((counter) => counter.state === CounterState.PAUSED)
    const counterNames = new Map(counters.map((counter) => [counter.id, `Caixa ${counter.number}`]))
    const serviceByCounter = this._countByMetadata(finishedEvents, 'counterId', counterNames)
    const serviceByOperator = this._countByOperator(finishedEvents)
    const callsByOperator = this._countByOperator(calledEvents)
    const pauseSecondsByCounter = this._calculatePauseSeconds(
      dailyEvents,
      counterNames,
      Math.min(Date.now(), end.getTime()),
    )
    const peakVolume = Math.max(0, ...Object.values(volumeByHour))
    const peakHours = Object.entries(volumeByHour)
      .filter(([, total]) => total === peakVolume && total > 0)
      .map(([hour]) => Number(hour))

    return {
      totalCreated: createdEvents.length,
      totalWaiting: waiting.length,
      totalPaused: paused.length,
      totalStarted: startedEvents.length,
      totalFinished: finishedEvents.length,
      totalCancelled: cancelledEvents.length,
      totalNoShow: noShowEvents.length,
      totalRestored: restoredEvents.length,
      totalForceClosed: forceClosedEvents.length,
      duplicateAttempts: duplicateEvents.length,
      openServices,
      avgWaitSeconds: Math.round(avgWaitMs / 1000),
      medianWaitSeconds: Math.round(this._median(waitDurations) / 1000),
      avgServiceSeconds: Math.round(avgServiceMs / 1000),
      medianServiceSeconds: Math.round(this._median(serviceDurations) / 1000),
      avgCallToStartSeconds: Math.round(
        this._average(callToStartSamples.map((sample) => sample.duration)) / 1000,
      ),
      maxCurrentWaitSeconds: Math.round(maxCurrentWaitMs / 1000),
      waitSecondsByHour,
      volumeByHour,
      peakHours,
      byChannel,
      cancelledByChannel,
      noShowByChannel,
      serviceByCounter,
      serviceByOperator,
      callsByOperator,
      pauseSecondsByCounter,
      activeCounters: activeCounters.length,
      pausedCounters: pausedCounters.length,
    }
  }

  private _calculateDurations(
    events: DailyAuditEvent[],
    tickets: Array<{ id: string; pausedSeconds: number }> = [],
  ) {
    const pausedSecondsMap = new Map(tickets.map((t) => [t.id, t.pausedSeconds]))
    const waitingSince = new Map<string, Date>()
    const calledAt = new Map<string, Date>()
    const serviceStartedAt = new Map<string, Date>()
    // Uma senha que foi pausada em atendimento e reatendida tem mais de um
    // `service_started`. A espera só conta no PRIMEIRO atendimento — senão a
    // segunda amostra mediria desde a criação original (espera inflada/duplicada).
    const waitCounted = new Set<string>()
    const waitSamples: Array<{ duration: number; at: Date }> = []
    const serviceSamples: Array<{ duration: number; at: Date }> = []
    const callToStartSamples: Array<{ duration: number; at: Date }> = []

    events.forEach((event) => {
      if (!event.ticketId) return

      if (event.eventType === 'ticket_created' || event.eventType === 'ticket_restored') {
        waitingSince.set(event.ticketId, event.createdAt)
      } else if (event.eventType === 'ticket_called') {
        calledAt.set(event.ticketId, event.createdAt)
      } else if (event.eventType === 'service_started') {
        const startedWaitingAt = waitingSince.get(event.ticketId)
        if (startedWaitingAt && !waitCounted.has(event.ticketId)) {
          waitCounted.add(event.ticketId)
          const pausedMs = (pausedSecondsMap.get(event.ticketId) ?? 0) * 1000
          const rawDuration = event.createdAt.getTime() - startedWaitingAt.getTime()
          waitSamples.push({
            duration: Math.max(0, rawDuration - pausedMs),
            at: event.createdAt,
          })
        }
        const called = calledAt.get(event.ticketId)
        if (called) {
          callToStartSamples.push({
            duration: event.createdAt.getTime() - called.getTime(),
            at: event.createdAt,
          })
        }
        serviceStartedAt.set(event.ticketId, event.createdAt)
      } else if (FINISH_EVENTS.has(event.eventType)) {
        const startedServiceAt = serviceStartedAt.get(event.ticketId)
        if (startedServiceAt) {
          serviceSamples.push({
            duration: event.createdAt.getTime() - startedServiceAt.getTime(),
            at: event.createdAt,
          })
        }
      }
    })

    return {
      waitSamples,
      serviceSamples,
      callToStartSamples,
      waitingSince,
    }
  }

  private _average(values: number[]): number {
    return values.length === 0
      ? 0
      : values.reduce((total, value) => total + value, 0) / values.length
  }

  private _median(values: number[]): number {
    if (values.length === 0) return 0
    const sorted = [...values].sort((left, right) => left - right)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
  }

  private _averageSamplesByHour(
    samples: Array<{ duration: number; at: Date }>,
  ): Record<number, number> {
    const values = new Map<number, number[]>()
    samples.forEach((sample) => {
      const hour = getBusinessHour(sample.at)
      values.set(hour, [...(values.get(hour) ?? []), sample.duration])
    })
    return Object.fromEntries(
      [...values.entries()].map(([hour, durations]) => [
        hour,
        Math.round(this._average(durations) / 1000),
      ]),
    )
  }

  private _countByMetadata(
    events: DailyAuditEvent[],
    property: string,
    labels: Map<string, string>,
  ): Record<string, number> {
    const totals: Record<string, number> = {}
    events.forEach((event) => {
      const value = this._metadataString(event.metadata, property)
      if (!value) return
      const label = labels.get(value) ?? value
      totals[label] = (totals[label] ?? 0) + 1
    })
    return totals
  }

  private _countByOperator(events: DailyAuditEvent[]): Record<string, number> {
    const totals: Record<string, number> = {}
    events.forEach((event) => {
      const label = event.operator?.name ?? event.operatorId
      if (!label) return
      totals[label] = (totals[label] ?? 0) + 1
    })
    return totals
  }

  private _calculatePauseSeconds(
    events: DailyAuditEvent[],
    counterNames: Map<string, string>,
    rangeEnd: number,
  ): Record<string, number> {
    const pausedAt = new Map<string, number>()
    const totals = new Map<string, number>()

    events.forEach((event) => {
      if (event.eventType !== 'counter_paused' && event.eventType !== 'counter_resumed') {
        return
      }
      const counterId = this._metadataString(event.metadata, 'counterId')
      if (!counterId) return
      if (event.eventType === 'counter_paused') {
        pausedAt.set(counterId, event.createdAt.getTime())
        return
      }
      const start = pausedAt.get(counterId)
      if (start === undefined) return
      totals.set(counterId, (totals.get(counterId) ?? 0) + event.createdAt.getTime() - start)
      pausedAt.delete(counterId)
    })

    pausedAt.forEach((start, counterId) => {
      totals.set(counterId, (totals.get(counterId) ?? 0) + Math.max(0, rangeEnd - start))
    })

    return Object.fromEntries(
      [...totals.entries()].map(([counterId, milliseconds]) => [
        counterNames.get(counterId) ?? counterId,
        Math.round(milliseconds / 1000),
      ]),
    )
  }

  private _metadataString(metadata: Prisma.JsonValue | null, property: string): string | null {
    if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') return null
    const value = metadata[property]
    return typeof value === 'string' ? value : null
  }

  private _emptyChannels(): Record<EntryChannel, number> {
    return Object.values(EntryChannel).reduce(
      (totals, channel) => ({ ...totals, [channel]: 0 }),
      {} as Record<EntryChannel, number>,
    )
  }

  private _countEventsByChannel(events: DailyAuditEvent[]): Record<EntryChannel, number> {
    const totals = this._emptyChannels()
    events.forEach((event) => {
      if (event.ticket) totals[event.ticket.entryChannel] += 1
    })
    return totals
  }
}
