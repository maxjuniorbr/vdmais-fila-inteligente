export function onlyDigits(value: string): string {
  return value.replaceAll(/\D/g, '')
}

export function normalizeReCode(value: string): string {
  return value.trim().toUpperCase()
}
