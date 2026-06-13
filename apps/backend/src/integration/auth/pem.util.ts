export function normalizePem(value?: string): string | undefined {
  const pem = value?.trim()
  if (!pem) return undefined
  return pem.includes(String.raw`\n`) ? pem.replaceAll(String.raw`\n`, '\n') : pem
}
