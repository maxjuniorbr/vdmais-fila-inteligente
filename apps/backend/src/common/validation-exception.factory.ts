import { BadRequestException } from '@nestjs/common'
import type { ValidationError } from 'class-validator'

const FIELD_LABELS: Record<string, string> = {
  action: 'Ação',
  birthDate: 'Data de nascimento',
  cpf: 'CPF',
  credential: 'CPF ou código de RE',
  email: 'E-mail',
  entryChannel: 'Canal de entrada',
  erId: 'ER',
  fullName: 'Nome completo',
  name: 'Nome',
  number: 'Número do caixa',
  password: 'Senha',
  phone: 'Telefone',
  qrCodeUrl: 'URL do QR Code',
  reason: 'Motivo',
  representativeId: 'Representante',
  reCode: 'Código de RE',
  role: 'Perfil',
}

const CUSTOM_MESSAGE_CONSTRAINTS = new Set(['isCpf', 'isNotFutureDate', 'matches'])

function fieldLabel(property: string): string {
  return FIELD_LABELS[property] ?? property
}

function constraintMessage(constraint: string, originalMessage: string, property: string): string {
  if (CUSTOM_MESSAGE_CONSTRAINTS.has(constraint)) return originalMessage

  const field = fieldLabel(property)
  const messages: Record<string, string> = {
    isDateString: `${field} deve ser uma data válida`,
    isEmail: `${field} deve ser válido`,
    isEnum: `${field} possui uma opção inválida`,
    isIn: `${field} possui uma opção inválida`,
    isInt: `${field} deve ser um número inteiro`,
    isNotEmpty: `${field} é obrigatório`,
    isOptional: `${field} é inválido`,
    isString: `${field} deve ser um texto`,
    isUrl: `${field} deve ser uma URL válida`,
    max: `${field} está acima do máximo permitido`,
    maxLength: `${field} excede o tamanho permitido`,
    min: `${field} está abaixo do mínimo permitido`,
    minLength: `${field} não possui o tamanho mínimo`,
    whitelistValidation: `${field} não é permitido`,
  }

  return messages[constraint] ?? `Valor inválido para ${field}`
}

function errorMessages(error: ValidationError): string[] {
  const ownMessages = Object.entries(error.constraints ?? {}).map(([constraint, message]) =>
    constraintMessage(constraint, message, error.property),
  )
  const childMessages = (error.children ?? []).flatMap(errorMessages)
  return [...ownMessages, ...childMessages]
}

export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  return new BadRequestException(errors.flatMap(errorMessages))
}
