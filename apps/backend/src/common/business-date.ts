const BUSINESS_TIME_ZONE = 'America/Sao_Paulo'

function getBusinessDateParts(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  }
}

function getTimeZoneOffsetMs(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  const representedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  )
  return representedAsUtc - date.getTime()
}

function localMidnightToUtc(year: number, month: number, day: number): Date {
  const localAsUtc = Date.UTC(year, month - 1, day)
  let result = localAsUtc

  // A second pass handles dates around timezone offset transitions.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    result = localAsUtc - getTimeZoneOffsetMs(new Date(result))
  }
  return new Date(result)
}

export function getBusinessDate(now = new Date()): Date {
  const { year, month, day } = getBusinessDateParts(now)
  return new Date(Date.UTC(year, month - 1, day))
}

export function getBusinessDayRange(now = new Date()): { start: Date; end: Date } {
  const { year, month, day } = getBusinessDateParts(now)
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1))

  return {
    start: localMidnightToUtc(year, month, day),
    end: localMidnightToUtc(
      nextDay.getUTCFullYear(),
      nextDay.getUTCMonth() + 1,
      nextDay.getUTCDate(),
    ),
  }
}

export function getBusinessHour(date: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: BUSINESS_TIME_ZONE,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(date),
  )
}
