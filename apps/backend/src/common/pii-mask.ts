// Masks personally identifiable identifiers before they leave the API.
// Staff only need the last digits to visually confirm a representative; the
// full value never reaches the browser.

export function maskCpf(cpf: string): string {
  return `***.***.${cpf.slice(-3)}-**`
}

export function maskPhone(phone: string): string {
  return `(**) *****-${phone.slice(-4)}`
}
