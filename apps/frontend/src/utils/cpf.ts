export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

// Progressive CPF mask applied as the person types (000.000.000-00). Reformats from
// the raw digits every keystroke so it also cleans pasted/edited values.
export function formatCpfInput(value: string): string {
  const d = onlyDigits(value).slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export function cpfCaretPosition(formattedValue: string, digitsBeforeCaret: number): number {
  if (digitsBeforeCaret <= 0) return 0

  let digitsSeen = 0
  for (let index = 0; index < formattedValue.length; index += 1) {
    if (/\d/.test(formattedValue[index])) {
      digitsSeen += 1
      if (digitsSeen === digitsBeforeCaret) return index + 1
    }
  }
  return formattedValue.length
}

function hasValidCheckDigit(cpf: string, length: number): boolean {
  const sum = cpf
    .slice(0, length)
    .split('')
    .reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0)
  const remainder = (sum * 10) % 11
  const expected = remainder === 10 ? 0 : remainder
  return expected === Number(cpf[length])
}

// Mirrors the backend IsCpf validator: 11 digits, not all-equal, valid check digits.
// The check digit makes junk (111…, random sequences) fail deterministically.
export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value)
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false
  return hasValidCheckDigit(cpf, 9) && hasValidCheckDigit(cpf, 10)
}
