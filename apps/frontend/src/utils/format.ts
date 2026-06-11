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

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}
