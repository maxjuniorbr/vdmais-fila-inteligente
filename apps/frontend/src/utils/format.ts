export function formatDate(isoString: string): string {
  const date = new Date(isoString)
  const day   = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year  = date.getFullYear()
  return `${day}/${month}/${year}`
}

export function formatTime(isoString: string): string {
  const date    = new Date(isoString)
  const hours   = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}h${minutes}`
}

export function formatTimeWithSeconds(isoString: string): string {
  const date    = new Date(isoString)
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${formatTime(isoString)}:${seconds}`
}

export function formatDuration(seconds: number): string {
  // Clock skew between client and server can make a freshly-started elapsed time
  // momentarily negative; clamp to zero (and floor fractions) so the display never
  // shows "-1m -30s" or a fractional second count.
  const total = Math.max(0, Math.floor(seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}m ${s}s`
}
