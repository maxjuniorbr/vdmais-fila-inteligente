import { registerDecorator, ValidationOptions } from 'class-validator'

// Best-effort blocklist for the self-declared guest name. Whole-word matching on a
// normalized (lowercased, accent-stripped) token keeps real surnames that merely
// contain a substring (e.g. "Cunha", "Assis") from being rejected. Not exhaustive
// by nature — it stops the obvious jokes/slurs, not every possible variation.
const BLOCKED_TERMS = new Set([
  'caralho',
  'porra',
  'merda',
  'buceta',
  'boceta',
  'cu',
  'cuzao',
  'bosta',
  'puta',
  'putaria',
  'piroca',
  'xoxota',
  'punheta',
  'foder',
  'foda',
  'fdp',
  'arrombado',
  'arrombada',
  'corno',
  'viado',
  'veado',
  'boiola',
  'retardado',
  'retardada',
  'otario',
  'otaria',
  'babaca',
  'escroto',
  'escrota',
  'vagabundo',
  'vagabunda',
  'safado',
  'safada',
])

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function isCleanName(value: string): boolean {
  if (value.trim().length === 0) return false
  const tokens = normalize(value)
    .split(/[^a-z]+/)
    .filter(Boolean)
  return (
    tokens.some((token) => /[a-z]/.test(token)) && !tokens.some((token) => BLOCKED_TERMS.has(token))
  )
}

export function IsCleanName(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isCleanName',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && isCleanName(value)
        },
        defaultMessage() {
          return 'Informe um nome válido'
        },
      },
    })
  }
}
