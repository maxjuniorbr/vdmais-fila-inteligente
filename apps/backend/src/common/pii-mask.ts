// Masks personally identifiable identifiers before they leave the API.
// Staff only need the last digits to visually confirm a representative; the
// full value never reaches the browser.

export function maskCpf(cpf: string): string {
  // Defense in depth: a malformed/short value must never leak in full. Stored
  // CPFs are normalized to 11 digits, so valid input keeps the documented
  // `***.***.NNN-**` shape; only anomalous data falls back to a full mask.
  if (cpf.length < 3) return '***.***.***-**'
  return `***.***.${cpf.slice(-3)}-**`
}

export function maskPhone(phone: string): string {
  if (phone.length < 4) return '(**) *****-****'
  return `(**) *****-${phone.slice(-4)}`
}
