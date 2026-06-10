import { registerDecorator, ValidationOptions } from 'class-validator'

function hasValidCheckDigit(cpf: string, length: number): boolean {
  const sum = cpf
    .slice(0, length)
    .split('')
    .reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0)
  const remainder = (sum * 10) % 11
  const expected = remainder === 10 ? 0 : remainder
  return expected === Number(cpf[length])
}

export function isValidCpf(value: string): boolean {
  const cpf = value.replace(/\D/g, '')
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false
  return hasValidCheckDigit(cpf, 9) && hasValidCheckDigit(cpf, 10)
}

export function IsCpf(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isCpf',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && isValidCpf(value)
        },
        defaultMessage() {
          return 'CPF inválido'
        },
      },
    })
  }
}
